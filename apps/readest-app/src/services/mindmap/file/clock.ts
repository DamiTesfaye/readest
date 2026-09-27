import { hlcMax, hlcParse } from '@/libs/crdt';
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
