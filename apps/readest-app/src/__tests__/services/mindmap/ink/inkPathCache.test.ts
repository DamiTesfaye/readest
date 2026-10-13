import { getStroke } from 'perfect-freehand';
import { describe, expect, it, vi } from 'vitest';
import { encodeInkStroke } from '@/services/mindmap/ink/ink';
import { INK_PATH_CACHE_LIMIT, inkRecordPath } from '@/services/mindmap/ink/inkPath';

vi.mock('perfect-freehand', async (importOriginal) => {
  const actual = await importOriginal<typeof import('perfect-freehand')>();
  return { getStroke: vi.fn(actual.getStroke) };
});

const stroke = (n: number) => {
  const [segment] = encodeInkStroke([
    [0, 0, 0.5],
    [n, 10, 0.5],
  ]);
  return { points: segment!.points, size: 4, pen: false };
};

describe('ink path cache', () => {
  it('keeps a recently drawn path when it is full instead of dropping every path', () => {
    const kept = stroke(1);
    inkRecordPath(kept);
    for (let n = 2; n < INK_PATH_CACHE_LIMIT; n += 1) inkRecordPath(stroke(n));
    inkRecordPath(kept);
    for (let n = 0; n < 3; n += 1) inkRecordPath(stroke(INK_PATH_CACHE_LIMIT + n));
    const calls = vi.mocked(getStroke).mock.calls.length;
    inkRecordPath(kept);
    expect(vi.mocked(getStroke).mock.calls.length).toBe(calls);
    inkRecordPath(stroke(2));
    expect(vi.mocked(getStroke).mock.calls.length).toBe(calls + 1);
  });
});
