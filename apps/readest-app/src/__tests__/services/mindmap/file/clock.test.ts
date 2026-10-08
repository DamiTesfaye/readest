import { describe, expect, it, vi } from 'vitest';
import { HlcGenerator, hlcPack, hlcParse } from '@/libs/crdt';
import type { Hlc } from '@/types/replica';
import { createMindmapClock, stampAbove } from '@/services/mindmap/file/clock';

const NOW = 1_700_000_000_000;
const YEAR_MS = 365 * 24 * 3600 * 1000;
const MAX_PHYSICAL_MS = 0xfffffffffffff;
const MAX_COUNTER = 0xffffffff;

const fixedClock = (deviceId: string) => {
  const hlc = new HlcGenerator(deviceId, () => NOW);
  return { hlc, clock: createMindmapClock(hlc, deviceId) };
};

describe('createMindmapClock', () => {
  it('delegates next and observe and exposes the device id', () => {
    const next = vi.fn(() => 'hlc-1' as Hlc);
    const observe = vi.fn();
    const clock = createMindmapClock({ next, observe }, 'device-1');
    expect(clock.deviceId).toBe('device-1');
    expect(clock.next()).toBe('hlc-1');
    clock.observe('hlc-2' as Hlc);
    expect(observe).toHaveBeenCalledWith('hlc-2');
  });
});

describe('stampAbove', () => {
  it('returns the next clock when there is no current envelope', () => {
    const { clock } = fixedClock('device-1');
    expect(stampAbove(clock, undefined)).toBe(hlcPack(NOW, 0, 'device-1'));
  });

  it('returns the next clock when the current envelope is in the past', () => {
    const { clock } = fixedClock('device-1');
    const past = hlcPack(NOW - 5_000, 7, 'device-9');
    expect(stampAbove(clock, past)).toBe(hlcPack(NOW, 0, 'device-1'));
  });

  it('stamps just above a far-future envelope without moving the global clock', () => {
    const { hlc, clock } = fixedClock('device-1');
    const future = hlcPack(NOW + YEAR_MS, 4, 'device-x');
    const stamp = stampAbove(clock, future);
    expect(stamp).toBe(hlcPack(NOW + YEAR_MS, 5, 'device-1'));
    expect(stamp > future).toBe(true);
    expect(hlc.serialize()).toEqual({ physicalMs: NOW, counter: 0 });
  });

  it('stamps above an envelope that has the same time and counter as the next clock', () => {
    const { clock } = fixedClock('device-a');
    const same = hlcPack(NOW, 0, 'device-z');
    const stamp = stampAbove(clock, same);
    expect(stamp > same).toBe(true);
    expect(hlcParse(stamp).deviceId).toBe('device-a');
  });

  it('carries a full counter into the physical time', () => {
    const { clock } = fixedClock('device-1');
    const future = hlcPack(NOW + YEAR_MS, MAX_COUNTER, 'device-x');
    expect(stampAbove(clock, future)).toBe(hlcPack(NOW + YEAR_MS + 1, 0, 'device-1'));
  });

  it('falls back to the next clock when no higher clock can be written', () => {
    const { clock } = fixedClock('device-1');
    const top = hlcPack(MAX_PHYSICAL_MS, MAX_COUNTER, 'device-x');
    expect(stampAbove(clock, top)).toBe(hlcPack(NOW, 0, 'device-1'));
  });

  it('gives two devices distinct stamps above the same far-future envelope', () => {
    const future = hlcPack(NOW + YEAR_MS, 0, 'device-x');
    const a = stampAbove(fixedClock('device-a').clock, future);
    const b = stampAbove(fixedClock('device-b').clock, future);
    expect(a).not.toBe(b);
    expect(a > future && b > future).toBe(true);
  });
});
