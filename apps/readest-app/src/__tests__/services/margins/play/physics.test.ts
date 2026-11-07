import { describe, expect, it } from 'vitest';
import { createWorld, detachBodies, removeBodies, step } from '@/services/margins/play/physics';

const glyphs = Array.from({ length: 12 }, (_, i) => ({
  canon: i * 2,
  len: 1,
  x: 20 + i * 9,
  y: 100,
  w: 8,
  h: 16,
}));
const settle = (seed: number) => {
  let w = detachBodies(createWorld(400, 600, seed), glyphs, false);
  for (let i = 0; i < 600; i++) w = step(w);
  return w;
};

describe('physics', () => {
  it('is deterministic for a seed and every body rests on the floor', () => {
    const a = settle(7);
    expect(settle(7).bodies).toEqual(a.bodies);
    expect(a.bodies.every((b) => b.rest && b.y + b.h / 2 <= 600)).toBe(true);
    expect(settle(8).bodies).not.toEqual(a.bodies);
  });

  it('reduced motion settles at once without flight', () => {
    expect(detachBodies(createWorld(400, 600, 1), glyphs, true).bodies.every((b) => b.rest)).toBe(
      true,
    );
  });

  it('merges past 600 bodies', () => {
    const many = Array.from({ length: 700 }, (_, i) => ({
      canon: i,
      len: 1,
      x: i % 380,
      y: 50,
      w: 4,
      h: 16,
    }));
    expect(detachBodies(createWorld(400, 600, 1), many, false).bodies.length).toBeLessThanOrEqual(
      600,
    );
  });

  it('removes bodies and rebuilds the floor from the rest', () => {
    const w = removeBodies(settle(7), new Set(glyphs.map((g) => g.canon)));
    expect(w.bodies).toEqual([]);
    expect([...w.floor].every((f) => f === 600)).toBe(true);
  });
});
