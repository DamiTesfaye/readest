import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryFileSystem } from '@/__tests__/helpers/memoryFileSystem';
import {
  RECONCILE_DELAY_MS,
  useBookLocator,
  useMapReconcile,
} from '@/app/reader/components/mindmap/useMapReconcile';
import { HlcGenerator } from '@/libs/crdt';
import type { BookDoc, TOCItem } from '@/libs/document';
import { createMindmapClock } from '@/services/mindmap/file/clock';
import { createMapFile } from '@/services/mindmap/file/createMapFile';
import type { BookLocator } from '@/services/mindmap/generate/anchors';
import { saveMapFile } from '@/services/mindmap/persist/mapFile';
import {
  type MapSession,
  __resetMapSessionsForTests,
  openMapSession,
} from '@/services/mindmap/persist/session';
import { DEFAULT_MAP_META, type MapSource } from '@/services/mindmap/schema/types';
import { type CanvasController, createCanvasController } from '@/services/mindmap/tools/controller';
import { useBookDataStore } from '@/store/bookDataStore';
import { setBookProgress } from '@/store/readerProgressStore';
import type { Book, BookNote, BookProgress } from '@/types/book';
import { eventDispatcher } from '@/utils/event';

const BOOK_KEY = 'bookhash-1';

const section = (id: string, index: number) => ({
  id,
  cfi: `epubcfi(/6/${(index + 1) * 2})`,
  size: 1000,
  linear: 'yes',
  createDocument: async () => document,
});

const chapter = (href: string, label: string): TOCItem =>
  ({ id: 0, href, label, index: 0 }) as TOCItem;

const bookDoc = (toc: TOCItem[]): BookDoc =>
  ({
    metadata: { title: 'Emma', author: '', language: 'en' },
    rendition: {},
    dir: 'ltr',
    toc,
    sections: toc.map((item, index) => section(item.href, index)),
    splitTOCHref: (href: string) => href.split('#'),
    getCover: async () => null,
  }) as BookDoc;

const note: BookNote = {
  id: 'n1',
  type: 'annotation',
  cfi: 'epubcfi(/6/4!/4/2/1:0)',
  text: 'A highlighted line',
  note: '',
  createdAt: 1,
  updatedAt: 1,
};

const setBook = (doc: BookDoc, booknotes: BookNote[] = []): void =>
  useBookDataStore.setState({
    booksData: {
      bookhash: {
        id: 'bookhash',
        book: { hash: 'bookhash', title: 'Emma', format: 'EPUB' } as Book,
        file: null,
        config: { booknotes, updatedAt: 1 },
        bookDoc: doc,
        isFixedLayout: false,
      },
    },
  });

let session: MapSession;
let controller: CanvasController;

const openMap = async (source: MapSource): Promise<void> => {
  const fs = new MemoryFileSystem();
  const clock = createMindmapClock(new HlcGenerator('device-1'), 'device-1');
  await saveMapFile(fs, 'bookhash', createMapFile({ ...DEFAULT_MAP_META, source }, 'm1', clock));
  const result = await openMapSession(fs, 'bookhash', 'm1', clock);
  if (result.status !== 'open') throw new Error('expected an open session');
  session = result.session;
  controller = createCanvasController({ store: session.store, camera: session.meta().camera });
};

const render = (source: MapSource, locatorOverride?: BookLocator) =>
  renderHook(() => {
    const locator = useBookLocator(BOOK_KEY);
    useMapReconcile({
      bookKey: BOOK_KEY,
      session,
      controller,
      locator: locatorOverride ?? locator,
      source,
    });
  });

const genKeys = (): string[] =>
  session.store
    .all()
    .filter((record) => record.deleted === null)
    .map((record) => record.genKey ?? '')
    .sort();

const settle = () => new Promise((resolve) => setTimeout(resolve, RECONCILE_DELAY_MS + 150));

beforeEach(async () => {
  setBook(bookDoc([chapter('a', 'One'), chapter('b', 'Two')]));
  setBookProgress(BOOK_KEY, null);
  await openMap('generated');
});

afterEach(async () => {
  cleanup();
  controller.dispose();
  await session.close();
  __resetMapSessionsForTests();
  vi.restoreAllMocks();
});

describe('useMapReconcile', () => {
  it('fills a generated map on open', async () => {
    render('generated');
    await waitFor(() => expect(genKeys()).toEqual(['toc:a', 'toc:b']));
  });

  it('fits the view once when it fills an empty map', async () => {
    const fitView = vi.spyOn(controller, 'fitView');
    render('generated');
    await waitFor(() => expect(fitView).toHaveBeenCalledWith(false));
    act(() => {
      useBookDataStore.getState().updateBooknotes(BOOK_KEY, [note]);
    });
    await waitFor(() => expect(genKeys()).toContain('note:n1'));
    await settle();
    expect(fitView).toHaveBeenCalledTimes(1);
  });

  it('reconciles again when booknotes change through updateBooknotes', async () => {
    render('generated');
    await waitFor(() => expect(genKeys()).toHaveLength(2));
    act(() => {
      useBookDataStore.getState().updateBooknotes(BOOK_KEY, [note]);
    });
    await waitFor(() => expect(genKeys()).toContain('note:n1'));
    expect(genKeys()).toContain('link:note:n1');
  });

  it('reconciles again when the TOC changes after a re-import', async () => {
    render('generated');
    await waitFor(() => expect(genKeys()).toHaveLength(2));
    act(() => setBook(bookDoc([chapter('a', 'One'), chapter('c', 'Three')])));
    await waitFor(() => expect(genKeys()).toEqual(['toc:a', 'toc:c']));
  });

  it('never reconciles because reading progress moved', async () => {
    render('generated');
    await waitFor(() => expect(genKeys()).toHaveLength(2));
    const listener = vi.fn();
    session.store.listen(listener);
    act(() => setBookProgress(BOOK_KEY, { fraction: 0.9 } as BookProgress));
    await settle();
    expect(listener).not.toHaveBeenCalled();
  });

  it('never reconciles a blank map', async () => {
    render('blank');
    await settle();
    expect(session.store.all()).toEqual([]);
  });

  it('shows a toast and leaves the map untouched when generation fails', async () => {
    const dispatch = vi.spyOn(eventDispatcher, 'dispatch');
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const broken: BookLocator = {
      locateToc: () => {
        throw new Error('broken book');
      },
      locateCfi: () => null,
    };
    render('generated', broken);
    await waitFor(() =>
      expect(dispatch).toHaveBeenCalledWith('toast', {
        type: 'error',
        message: 'Could not generate the mind map',
      }),
    );
    expect(session.store.all()).toEqual([]);
  });
});
