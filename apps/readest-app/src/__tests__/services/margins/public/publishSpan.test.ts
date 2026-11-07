import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MarginsStore, LayerRow } from '@/services/margins/store';
import type { Anchor, Resolution } from '@/services/margins/types';

const core = vi.hoisted(() => ({
  loadBook: vi.fn(async () => {}),
  resolve: vi.fn(),
  canonicalSection: vi.fn(async () => ({ text: 'aé𝔄b', runs: [] })),
}));

vi.mock('@/services/margins/marginsClient', () => ({ getMarginsCore: () => core }));

import { publishSpan } from '@/services/margins/public/publishSpan';

const map = [{ runs: ['aé𝔄b'], breaks: [], skip: false }];
const anchor = { kind: 'span', quote: { exact: '𝔄' } } as unknown as Anchor;
const row = (fileHash: string) => ({ id: 'lyr_1', fileHash, anchor }) as LayerRow;
const storeWith = (sections: typeof map | null) =>
  ({ getTextMap: vi.fn(async () => sections) }) as unknown as MarginsStore;
const placed: Resolution = {
  result: 'placed',
  section: 1,
  start: 3,
  end: 7,
  step: 1,
  confidence: 1,
};

beforeEach(() => vi.clearAllMocks());

describe('publishSpan', () => {
  it('loads the book from its text map and converts the span to scalars', async () => {
    core.resolve.mockResolvedValue(placed);
    expect(await publishSpan(storeWith(map), row('h1'))).toEqual({
      section: 1,
      start: 2,
      end: 3,
      sectionLen: 4,
    });
    expect(core.loadBook).toHaveBeenCalledWith('h1', map);
    expect(core.resolve).toHaveBeenCalledWith('h1', anchor, null, false);
    expect(core.canonicalSection).toHaveBeenCalledWith('h1', 1);
  });

  it('loads a book once', async () => {
    core.resolve.mockResolvedValue(placed);
    await publishSpan(storeWith(map), row('h2'));
    await publishSpan(storeWith(map), row('h2'));
    expect(core.loadBook).toHaveBeenCalledTimes(1);
  });

  it('is null when the anchor does not place', async () => {
    core.resolve.mockResolvedValue({ result: 'detached', reason: 'gone' });
    expect(await publishSpan(storeWith(map), row('h3'))).toBeNull();
  });

  it('is null without a text map', async () => {
    expect(await publishSpan(storeWith(null), row('h4'))).toBeNull();
    expect(core.loadBook).not.toHaveBeenCalled();
    expect(core.resolve).not.toHaveBeenCalled();
  });
});
