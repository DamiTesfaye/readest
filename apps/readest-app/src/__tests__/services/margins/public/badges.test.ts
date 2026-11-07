import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MarginsCore } from '@/services/margins/marginsClient';

const h = vi.hoisted(() => ({ counts: vi.fn() }));

vi.mock('@/services/margins/public/api', () => ({ publicApi: { counts: h.counts } }));

import { loadClusters, parsePostsKey } from '@/services/margins/public/badges';

const core = {
  canonicalSection: async () => ({ text: 'aé𝔄b', runs: [] }),
} as unknown as MarginsCore;

beforeEach(() => {
  vi.useFakeTimers();
  h.counts.mockReset();
});
afterEach(() => vi.useRealTimers());

describe('post badges', () => {
  it('asks for counts with the section length and converts scalars to bytes', async () => {
    h.counts.mockResolvedValue([{ start: 1, end: 3, count: 2 }]);
    const clusters = await loadClusters({ textId: 'txt1', fileHash: 'b1' }, core, 0);
    expect(h.counts).toHaveBeenCalledWith('txt1', 0, 4);
    expect(clusters).toEqual([{ start: 1, end: 7, count: 2, key: 'margins-posts:0:1:3' }]);
  });

  it('draws no badge when the section length differs', async () => {
    h.counts.mockResolvedValue([]);
    expect(await loadClusters({ textId: 'txt2', fileHash: 'b2' }, core, 0)).toEqual([]);
    expect(h.counts).toHaveBeenCalledWith('txt2', 0, 4);
  });

  it('memoises counts for 60 s per text and section', async () => {
    h.counts.mockResolvedValue([]);
    const src = { textId: 'txt3', fileHash: 'b3' };
    await loadClusters(src, core, 1);
    await loadClusters(src, core, 1);
    expect(h.counts).toHaveBeenCalledTimes(1);
    await loadClusters(src, core, 2);
    expect(h.counts).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(60_001);
    await loadClusters(src, core, 1);
    expect(h.counts).toHaveBeenCalledTimes(3);
  });

  it('does not keep a failed request', async () => {
    h.counts.mockRejectedValueOnce(new Error('offline')).mockResolvedValue([]);
    const src = { textId: 'txt4', fileHash: 'b4' };
    await expect(loadClusters(src, core, 0)).rejects.toThrow();
    expect(await loadClusters(src, core, 0)).toEqual([]);
  });

  it('parses a posts key', () => {
    expect(parsePostsKey('margins-posts:3:10:40')).toEqual({ section: 3, start: 10, end: 40 });
    expect(parsePostsKey('margins:abc')).toBeNull();
    expect(parsePostsKey('margins-posts:3:x:40')).toBeNull();
  });
});
