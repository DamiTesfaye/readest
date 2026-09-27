import type { Hlc } from '@/types/replica';

export interface HlcLike {
  next(): Hlc;
  observe(remote: Hlc): void;
}

export interface HlcClock extends HlcLike {
  deviceId: string;
}

export const createMindmapClock = (hlc: HlcLike, deviceId: string): HlcClock => ({
  next: () => hlc.next(),
  observe: (remote) => hlc.observe(remote),
  deviceId,
});
