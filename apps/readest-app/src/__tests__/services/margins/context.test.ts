import { describe, expect, it, vi } from 'vitest';
import { NodeDatabaseService } from '@/services/database/nodeDatabaseService';
import { migrate } from '@/services/database/migrate';
import { getMigrations } from '@/services/database/migrations';
import { MarginsStore } from '@/services/margins/store';
import type { BookDoc } from '@/libs/document';
import type { Book } from '@/types/book';
import type { FoliateView } from '@/types/view';

vi.mock('@/services/margins/marginsClient', () => ({ getMarginsCore: () => ({}) }));

import { marginsContext, refreshCapped } from '@/services/margins/context';
import { saveLink } from '@/services/margins/sync';

const fakeView = (docs: Document[]) =>
  ({
    getCFI: vi.fn(() => 'epubcfi(/6/2!/4)'),
    renderer: { getContents: () => docs.map((doc, i) => ({ doc, index: i + 3 })) },
  }) as unknown as FoliateView;

describe('margins context', () => {
  it('keeps one context per open book and refreshes its cap in place', async () => {
    const db = await NodeDatabaseService.open(':memory:');
    await migrate(db, getMigrations('margins'));
    const store = MarginsStore.from(db);
    const book = { hash: 'ctx-hash' } as Book;
    const bookDoc = { sections: [] } as unknown as BookDoc;
    const doc = document.implementation.createHTMLDocument('s');
    const view = fakeView([doc]);
    const ctx = marginsContext({ view, book, bookDoc, store });
    expect(marginsContext({ view, book, bookDoc, store })).toBe(ctx);
    expect(marginsContext({ view: fakeView([]), book, bookDoc, store })).not.toBe(ctx);
    expect(ctx.capped).toBe(true);
    expect(ctx.liveDoc(3)).toBe(doc);
    expect(ctx.liveDoc(4)).toBeNull();
    expect(ctx.getCFI(3, doc.createRange())).toBe('epubcfi(/6/2!/4)');

    await saveLink(store, 'ctx-hash', 'txt_pd', 'en', 'txt_pd');
    await store.putText({
      textId: 'txt_pd',
      familyId: 'txt_pd',
      capped: false,
      language: 'en',
      title: null,
      author: null,
      fetchedAt: 1,
    });
    expect(await refreshCapped(ctx, store)).toBe(false);
    expect(ctx.capped).toBe(false);
  });
});
