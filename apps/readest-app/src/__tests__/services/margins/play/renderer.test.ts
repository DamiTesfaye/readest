import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGlyphCache } from '@/services/margins/play/renderer';

describe('glyph cache', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('keeps at most max paths, evicts the least recently used and skips empty outlines', () => {
    vi.stubGlobal(
      'Path2D',
      class {
        constructor(public d: string) {}
      },
    );
    const outline = vi.fn((face: number, gid: number) => (gid === 0 ? '' : `M${face} ${gid}`));
    const cache = createGlyphCache(outline, 2);
    cache.get(1, 1);
    cache.get(1, 2);
    cache.get(1, 1);
    cache.get(1, 3);
    expect(cache.size).toBe(2);
    cache.get(1, 1);
    expect(outline).toHaveBeenCalledTimes(3);
    cache.get(1, 2);
    expect(outline).toHaveBeenCalledTimes(4);
    expect(cache.get(1, 0)).toBeNull();
  });
});
