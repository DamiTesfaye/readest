import { describe, expect, it } from 'vitest';
import { GRID_SIZE, snapBox, snapPoint, snapToGrid } from '@/services/mindmap/snap/snap';

const box = (x: number, y: number, w = 50, h = 50) => ({ x, y, w, h });

describe('snapBox', () => {
  it('snaps an edge onto a neighbour edge within 8 screen px and draws a guide', () => {
    const result = snapBox(box(105, 203), [box(0, 0, 100, 100)], 1, true);
    expect(result.x).toBe(100);
    expect(result.guides).toContainEqual({ x1: 100, y1: 0, x2: 100, y2: 253 });
  });

  it('prefers an object snap over the grid', () => {
    const result = snapBox(box(203, 3), [box(0, 3, 197, 40)], 1, true);
    expect(result.x).toBe(197);
    expect(result.y).toBe(3);
  });

  it('falls back to the 16 unit grid when nothing is close', () => {
    const result = snapBox(box(141, 169), [], 1, true);
    expect(result).toEqual({ x: 144, y: 176, guides: [] });
    expect(GRID_SIZE).toBe(16);
  });

  it('scales the threshold with zoom so it stays 8 screen px', () => {
    const neighbours = [box(0, 0, 100, 100)];
    expect(snapBox(box(106, 500), neighbours, 1, true).x).toBe(100);
    expect(snapBox(box(106, 500), neighbours, 2, true).x).toBe(112);
    expect(snapBox(box(115, 500), neighbours, 0.5, true).x).toBe(100);
  });

  it('matches an equal gap in the same row', () => {
    const row = [box(0, 0, 100, 50), box(140, 0, 100, 50)];
    const result = snapBox(box(283, 0, 100, 50), row, 1, true);
    expect(result.x).toBe(280);
    expect(result.guides).toContainEqual({ x1: 240, y1: 25, x2: 280, y2: 25 });
  });

  it('matches an equal gap before the first record of the row', () => {
    const row = [box(200, 0, 100, 50), box(340, 0, 100, 50)];
    expect(snapBox(box(63, 0, 100, 50), row, 1, true).x).toBe(60);
  });

  it('returns the box unchanged when snapping is disabled', () => {
    expect(snapBox(box(105, 203), [box(0, 0, 100, 100)], 1, false)).toEqual({
      x: 105,
      y: 203,
      guides: [],
    });
  });
});

describe('grid helpers', () => {
  it('rounds to the nearest grid line', () => {
    expect(snapToGrid(7)).toBe(0);
    expect(snapToGrid(9)).toBe(16);
    expect(snapToGrid(-9)).toBe(-16);
    expect(snapPoint({ x: 23, y: 41 })).toEqual({ x: 16, y: 48 });
  });
});
