import { describe, expect, it, vi } from 'vitest';
import { createPlayer } from '@/services/margins/replay/player';
import { EV, TOOL } from '@/services/margins/replay/scene';
import type { ReplayCtor, Scene } from '@/services/margins/replay/types';

const scene: Scene = {
  v: 1,
  page: { w: 20, h: 30, columns: 1, gutter: 0, font: 'SourceSerif4-Regular', size: 1 },
  lines: [
    {
      y: 0,
      base: 1,
      boxes: [
        [0, 2, 1.4],
        [3, 2, 1.4],
        [6, 2, 1.4],
      ],
    },
  ],
  passage: { start: 0, end: 5, boxes: [0, 3] },
  seed: 7,
  step_hz: 120,
  events: [],
  checkpoints: [
    [600, 6000, [600]],
    [1200, 12000, [1200]],
    [1800, 18000, [1800]],
  ],
  sfx: [],
  cover_step: 0,
};

const fakeReplay = (o: { end?: number; bad?: number[] } = {}) => {
  const log = {
    made: 0,
    freed: 0,
    steps: [] as number[],
    hashAt: [] as number[],
    snaps: [] as number[][],
    pushes: [] as [number, number[]][],
  };
  class Fake {
    t = 0;
    constructor() {
      log.made++;
    }
    step(n: number) {
      log.steps.push(n);
      this.t += n;
      return this.t;
    }
    run_to(s: number) {
      this.t = Math.max(this.t, s);
    }
    now() {
      return this.t;
    }
    end() {
      return o.end ?? 1300;
    }
    hash() {
      log.hashAt.push(this.t);
      return o.bad?.includes(this.t) ? 1 : this.t * 10;
    }
    poses_q() {
      return Int32Array.from([this.t]);
    }
    snap(q: Int32Array) {
      log.snaps.push(Array.from(q));
      return true;
    }
    boxes() {
      return Float32Array.from([0, 1, 1, 0, 1, 3, 1, 1, 0, 1, 6, 1, 1, 0, 1]);
    }
    shapes_json() {
      return '[]';
    }
    shape_rev() {
      return 0;
    }
    push(kind: number, args: Float64Array) {
      log.pushes.push([kind, Array.from(args)]);
      return true;
    }
    take_sounds() {
      return new Uint32Array(0);
    }
    free() {
      log.freed++;
    }
  }
  return { Replay: Fake as unknown as ReplayCtor, log };
};

const STEP_MS = 1000 / 120;

const harness = (o: { end?: number; bad?: number[]; reduced?: boolean } = {}) => {
  const { Replay, log } = fakeReplay(o);
  let now = 0;
  let cb: FrameRequestCallback | null = null;
  const events = { onDrift: vi.fn(), onEnd: vi.fn(), onTurn: vi.fn(), onRestart: vi.fn() };
  const canvas = {
    width: 1080,
    height: 1920,
    getContext: () => null,
  } as unknown as HTMLCanvasElement;
  const player = createPlayer({
    canvas,
    scene,
    Replay,
    material: { kind: 'ghost' },
    color: '#000',
    font: 'serif',
    reduced: o.reduced,
    clock: () => now,
    raf: (f) => {
      cb = f;
      return 1;
    },
    caf: () => {
      cb = null;
    },
    ...events,
  });
  const tick = (ms: number) => {
    now += ms;
    const f = cb;
    cb = null;
    f?.(now);
  };
  const run = (steps: number, perTick: number) => {
    for (let k = 0; k < Math.ceil(steps / perTick); k++) tick(perTick * STEP_MS);
  };
  const stepped = () => log.steps.reduce((n, s) => n + s, 0);
  return { player, log, tick, run, stepped, events };
};

describe('replay player', () => {
  it('steps at 120 Hz', () => {
    const h = harness();
    h.player.start();
    h.tick(100);
    expect(h.stepped()).toBe(12);
  });

  it('checks every checkpoint at its exact step with a 7-step tick', () => {
    const h = harness({ end: 2000 });
    h.player.start();
    h.run(1900, 7);
    expect(h.log.hashAt).toEqual([600, 1200, 1800]);
  });

  it('snaps on a hash mismatch and reports the drift', () => {
    const h = harness();
    h.player.start();
    h.run(700, 7);
    expect(h.log.snaps).toEqual([]);
    const bad = harness({ bad: [600] });
    bad.player.start();
    bad.run(700, 7);
    expect(bad.log.snaps).toEqual([[600]]);
    expect(bad.events.onDrift).toHaveBeenCalledWith(600);
    expect(bad.player.drifts).toBe(1);
    expect(bad.player.mode).toBe('live');
  });

  it('interpolates after the second drift and never steps again', () => {
    const h = harness({ end: 5000, bad: [600, 1200] });
    h.player.start();
    h.run(1300, 7);
    expect(h.player.mode).toBe('interpolated');
    const calls = h.log.steps.length;
    h.run(300, 7);
    expect(h.log.steps.length).toBe(calls);
    expect(h.log.snaps.at(-1)![0]).toBeGreaterThan(1200);
  });

  it('ends once and keeps stepping without checkpoint checks', () => {
    const h = harness({ end: 1300, reduced: true });
    h.player.start();
    h.run(2000, 12);
    expect(h.events.onEnd).toHaveBeenCalledTimes(1);
    expect(h.player.ended).toBe(true);
    expect(h.log.hashAt).toEqual([600, 1200]);
    expect(h.stepped()).toBeGreaterThan(1800);
  });

  it('turns a tap after the end into live input', () => {
    const h = harness({ end: 12 });
    h.player.start();
    h.run(24, 12);
    h.player.pointer('down', 540, 960);
    h.player.pointer('down', 4 * 54, 150 + 54 * 0.8);
    expect(h.log.pushes).toEqual([
      [EV.DOWN, [10, 15]],
      [EV.TOOL, [TOOL.DETACH, 1, 2]],
    ]);
    expect(h.events.onTurn).toHaveBeenCalledTimes(1);
    const before = h.stepped();
    h.tick(100);
    expect(h.stepped()).toBeGreaterThan(before);
  });

  it('ignores pointer input before the end', () => {
    const h = harness();
    h.player.start();
    h.player.pointer('down', 540, 960);
    expect(h.log.pushes).toEqual([]);
  });

  it('pauses and resumes from the same step', () => {
    const h = harness();
    h.player.start();
    h.tick(100);
    h.player.pause();
    h.tick(1000);
    expect(h.stepped()).toBe(12);
    h.player.start();
    h.tick(100);
    expect(h.stepped()).toBe(24);
  });

  it('loops when idle after the end, except under reduced motion', () => {
    const h = harness({ end: 12 });
    h.player.start();
    h.run(24, 12);
    h.tick(3100);
    h.tick(10);
    expect(h.log.made).toBe(2);
    expect(h.events.onRestart).toHaveBeenCalledTimes(1);
    const r = harness({ end: 12, reduced: true });
    r.player.start();
    r.run(24, 12);
    r.tick(3100);
    r.tick(10);
    expect(r.log.made).toBe(1);
  });

  it('restart frees the old replay and starts a new one at step 0', () => {
    const h = harness();
    h.player.start();
    h.tick(100);
    h.player.restart();
    expect(h.log.freed).toBe(1);
    expect(h.log.made).toBe(2);
    h.tick(100);
    expect(h.stepped()).toBe(24);
    h.player.destroy();
    expect(h.log.freed).toBe(2);
  });
});
