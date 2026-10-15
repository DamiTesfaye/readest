import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PostView } from '@/services/margins/public/api';
import type { MarginsStore, TextLink } from '@/services/margins/store';

const h = vi.hoisted(() => ({ familyCache: new Map<string, string>() }));

vi.mock('@/services/margins/sync', () => ({ familyCache: h.familyCache }));

import {
  openTargetFor,
  ownedHashes,
  rememberPendingOpen,
  takePendingOpen,
} from '@/services/margins/public/openPost';

const post = (o: Partial<PostView> = {}, book: Partial<PostView['book']> = {}) =>
  ({
    id: 'pst1',
    textId: 'txtB',
    book: { title: 'Alice', author: null, workId: null, capped: true, ...book },
    ...o,
  }) as PostView;

const storeWith = (links: Record<string, Partial<TextLink>>, textIds: string[] = []) =>
  ({
    getTextLink: async (hash: string) => (links[hash] as TextLink) ?? null,
    getText: async () => null,
    allTextIds: async () => textIds,
  }) as unknown as MarginsStore;

beforeEach(() => {
  h.familyCache.clear();
  localStorage.clear();
});

describe('Open in book', () => {
  it('opens a library book linked to the same text or to its family', async () => {
    const same = storeWith({ h1: { textId: 'txtB' } });
    expect(await openTargetFor(post(), same, ['h0', 'h1'])).toEqual({
      kind: 'library',
      bookHash: 'h1',
    });
    h.familyCache.set('txtB', 'famA');
    const family = storeWith({ h2: { textId: 'txtC', familyId: 'famA' } });
    expect(await openTargetFor(post(), family, ['h2'])).toEqual({
      kind: 'library',
      bookHash: 'h2',
    });
  });

  it('offers the download only for an uncapped catalogue work', async () => {
    const empty = storeWith({});
    expect(await openTargetFor(post({}, { workId: 'wrk1', capped: false }), empty, [])).toEqual({
      kind: 'download',
      workId: 'wrk1',
    });
    expect(await openTargetFor(post({}, { workId: 'wrk1', capped: true }), empty, [])).toEqual({
      kind: 'yourCopy',
    });
    expect(await openTargetFor(post(), empty, [])).toEqual({ kind: 'yourCopy' });
  });

  it('hashes owned texts like the backend and sends at most 500', async () => {
    const one = storeWith({}, ['txt_00000000000000000000000000000001']);
    expect(await ownedHashes(one, 'ab')).toEqual(['d54f7abe42a7']);
    const many = storeWith(
      {},
      Array.from({ length: 600 }, (_, i) => `txt_${i}`),
    );
    expect(await ownedHashes(many, 'ab')).toHaveLength(500);
  });

  it('remembers a pending open until the book with that text opens', () => {
    rememberPendingOpen(post());
    expect(takePendingOpen('txtZ')).toBeNull();
    expect(takePendingOpen('txtB')).toBe('pst1');
    expect(takePendingOpen('txtB')).toBeNull();
  });
});
