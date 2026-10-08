import { hlcCompare, hlcMax, hlcPack, hlcParse } from '@/libs/crdt';
import type { Hlc } from '@/types/replica';
import type { MapFile } from '@/services/mindmap/schema/types';

export interface HlcLike {
  next(): Hlc;
  observe(remote: Hlc): void;
}

export interface HlcClock extends HlcLike {
  deviceId: string;
}

const MAX_CLOCK_LEAD_MS = 24 * 60 * 60 * 1000;
const MAX_PHYSICAL_MS = 0xfffffffffffff;
const MAX_COUNTER = 0xffffffff;

const successorOf = (existing: Hlc, deviceId: string): Hlc | null => {
  const { physicalMs, counter } = hlcParse(existing);
  if (counter < MAX_COUNTER) return hlcPack(physicalMs, counter + 1, deviceId);
  if (physicalMs < MAX_PHYSICAL_MS) return hlcPack(physicalMs + 1, 0, deviceId);
  return null;
};

export const stampAbove = (clock: HlcClock, existing: Hlc | undefined): Hlc => {
  const next = clock.next();
  if (!existing || hlcCompare(next, existing) > 0) return next;
  return successorOf(existing, clock.deviceId) ?? next;
};

export const createMindmapClock = (hlc: HlcLike, deviceId: string): HlcClock => ({
  next: () => hlc.next(),
  observe: (remote) => hlc.observe(remote),
  deviceId,
});

export const observeFileClock = (clock: HlcLike, file: MapFile, now = Date.now()): void => {
  let newest: Hlc | null = null;
  for (const fields of [file.meta, ...Object.values(file.records)]) {
    for (const { t } of Object.values(fields)) {
      if (hlcParse(t).physicalMs <= now + MAX_CLOCK_LEAD_MS) newest = hlcMax(newest, t);
    }
  }
  if (newest) clock.observe(newest);
};
