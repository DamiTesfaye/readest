import { describe, expect, it } from 'vitest';
import { createRecorder } from '@/services/margins/replay/recorder';
import { EV } from '@/services/margins/replay/scene';

describe('recorder', () => {
  it('stamps events on the 120 Hz clock and rounds to 0.01', () => {
    const r = createRecorder(1000);
    r.push(1000 + 25, EV.DOWN, [1.234, 2.345]);
    expect(r.events()).toEqual([[3, EV.DOWN, 1.23, 2.35]]);
  });

  it('keeps one move per step', () => {
    const r = createRecorder(0);
    r.push(1, EV.MOVE, [1, 1]);
    r.push(2, EV.MOVE, [2, 2]);
    expect(r.events()).toEqual([[0, EV.MOVE, 2, 2]]);
  });

  it('never stamps an event before the one above it', () => {
    const r = createRecorder(0);
    r.push(100, EV.DOWN, [0, 0]);
    r.push(50, EV.UP, []);
    expect(r.events().map(([step]) => step)).toEqual([12, 12]);
  });

  it('truncates at 60 seconds', () => {
    const r = createRecorder(0);
    r.push(59_990, EV.UP, []);
    r.push(60_010, EV.UP, []);
    expect(r.events()).toHaveLength(1);
    expect(r.truncated(61_000)).toBe(true);
  });

  it('is not truncated inside the first minute', () => {
    const r = createRecorder(0);
    r.push(10, EV.UP, []);
    expect(r.truncated(30_000)).toBe(false);
  });

  it('stops at 20,000 events', () => {
    const r = createRecorder(0);
    for (let i = 0; i < 20_001; i++) r.push(i * 2, EV.UP, []);
    expect(r.events()).toHaveLength(20_000);
    expect(r.truncated(0)).toBe(true);
  });
});
