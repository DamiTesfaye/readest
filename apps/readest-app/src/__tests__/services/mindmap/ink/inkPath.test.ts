import { describe, expect, it } from 'vitest';
import { encodeInkStroke } from '@/services/mindmap/ink/ink';
import { inkRecordPath, strokePath } from '@/services/mindmap/ink/inkPath';

describe('ink paths', () => {
  it('returns an empty path for no points', () => {
    expect(strokePath([], 4, false)).toBe('');
    expect(inkRecordPath({ points: '', size: 4, pen: false })).toBe('');
  });

  it('builds a closed perfect-freehand outline around the stroke', () => {
    const path = strokePath(
      [
        [0, 0, 0.5],
        [50, 0, 0.5],
        [100, 0, 0.5],
      ],
      8,
      false,
    );
    expect(path.startsWith('M')).toBe(true);
    expect(path.endsWith('Z')).toBe(true);
    const numbers = path.match(/-?\d+(\.\d+)?/g)!.map(Number);
    expect(Math.max(...numbers)).toBeGreaterThan(95);
    expect(Math.min(...numbers)).toBeLessThan(0);
  });

  it('makes pen pressure change the outline', () => {
    const light = strokePath(
      [
        [0, 0, 0.1],
        [40, 0, 0.1],
        [80, 0, 0.1],
      ],
      8,
      true,
    );
    const heavy = strokePath(
      [
        [0, 0, 1],
        [40, 0, 1],
        [80, 0, 1],
      ],
      8,
      true,
    );
    expect(light).not.toBe(heavy);
  });

  it('caches the path of an encoded record', () => {
    const [segment] = encodeInkStroke([
      [0, 0, 0.5],
      [30, 40, 0.5],
    ]);
    const record = { points: segment!.points, size: 4, pen: false };
    expect(inkRecordPath(record)).toBe(inkRecordPath({ ...record }));
    expect(inkRecordPath(record).length).toBeGreaterThan(0);
  });
});
