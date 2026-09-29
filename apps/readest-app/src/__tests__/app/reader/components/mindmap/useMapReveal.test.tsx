import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MemoryFileSystem } from '@/__tests__/helpers/memoryFileSystem';
import { useMapReveal } from '@/app/reader/components/mindmap/useMapReveal';
import { HlcGenerator } from '@/libs/crdt';
import type { BookDoc, TOCItem } from '@/libs/document';
import type { BookLocator } from '@/services/mindmap/generate/anchors';
import { createMindmapClock } from '@/services/mindmap/file/clock';
import { createMapFile } from '@/services/mindmap/file/createMapFile';
import { saveMapFile } from '@/services/mindmap/persist/mapFile';
import {
  type MapSession,
  __resetMapSessionsForTests,
  openMapSession,
} from '@/services/mindmap/persist/session';
import { createNodeRecord } from '@/services/mindmap/records/defaults';
import { DEFAULT_MAP_META } from '@/services/mindmap/schema/types';
import { type CanvasController, createCanvasController } from '@/services/mindmap/tools/controller';
import { useBookDataStore } from '@/store/bookDataStore';
import { useMindmapViewStore } from '@/store/mindmapViewStore';
import { setBookProgress } from '@/store/readerProgressStore';
import type { Book, BookProgress } from '@/types/book';

const BOOK_KEY = 'bookhash-1';

const generated = (id: string, revealAt: number) => ({
  ...createNodeRecord({ id, index: 'a1', x: 0, y: 0, label: id }),
  origin: 'generated' as const,
  genKey: `toc:${id}`,
  revealAt,
});

let session: MapSession;
let controller: CanvasController;

const setBook = (subject: string, toc: TOCItem[] | null = null): void =>
  useBookDataStore.setState({
    booksData: {
      bookhash: {
        id: 'bookhash',
        book: { hash: 'bookhash', title: 'Emma', format: 'EPUB', metadata: { subject } } as Book,
        file: null,
        config: null,
        bookDoc: toc ? ({ toc } as BookDoc) : null,
        isFixedLayout: false,
      },
    },
  });

const render = (animate: boolean, locator: BookLocator | null = null) =>
  renderHook(() =>
    useMapReveal({
      bookKey: BOOK_KEY,
      session,
      controller,
      meta: session.meta(),
      locator,
      animate,
    }),
  );

beforeEach(async () => {
  setBook('Fiction');
  setBookProgress(BOOK_KEY, { fraction: 0.5 } as BookProgress);
  useMindmapViewStore.setState({ reveal: null, announcement: '', announcementId: 0 });
  const fs = new MemoryFileSystem();
  const clock = createMindmapClock(new HlcGenerator('device-1'), 'device-1');
  const meta = { ...DEFAULT_MAP_META, source: 'generated' as const, lastSeenProgress: 0.2 };
  await saveMapFile(fs, 'bookhash', createMapFile(meta, 'm1', clock));
  const result = await openMapSession(fs, 'bookhash', 'm1', clock);
  if (result.status !== 'open') throw new Error('expected an open session');
  session = result.session;
  session.store.applyGenerated({
    added: [generated('seen', 0.1), generated('fresh', 0.3), generated('ahead', 0.8)],
    changed: [],
    discarded: [],
  });
  controller = createCanvasController({ store: session.store, camera: session.meta().camera });
});

afterEach(async () => {
  cleanup();
  controller.dispose();
  await session.close();
  __resetMapSessionsForTests();
});

describe('useMapReveal', () => {
  it('holds new records back for the first frame so they pop in', async () => {
    const { result } = render(true);
    expect(result.current.ready).toBe(true);
    expect(controller.isShown('seen')).toBe(true);
    expect(controller.isShown('fresh')).toBe(false);
    expect(controller.isShown('ahead')).toBe(false);
    await waitFor(() => expect(controller.isShown('fresh')).toBe(true));
    expect(controller.isShown('ahead')).toBe(false);
    expect(useMindmapViewStore.getState().announcement).toBe('1 new nodes revealed');
  });

  it('shows new records at once without animation and feeds the reveal chip', async () => {
    const { result } = render(false);
    expect(controller.isShown('fresh')).toBe(true);
    expect(result.current.clusters.map((cluster) => cluster.count)).toEqual([1]);
    await waitFor(() =>
      expect(useMindmapViewStore.getState().reveal).toEqual({
        chapter: null,
        revealed: 2,
        total: 3,
        newCount: 1,
      }),
    );
  });

  it('writes lastSeenProgress once the reader has passed a reveal point', async () => {
    render(false);
    await waitFor(() => expect(session.meta().lastSeenProgress).toBe(0.5));
  });

  it('leaves lastSeenProgress alone when nothing new was revealed', async () => {
    setBookProgress(BOOK_KEY, { fraction: 0.25 } as BookProgress);
    render(false);
    await waitFor(() => expect(useMindmapViewStore.getState().reveal).not.toBeNull());
    expect(session.meta().lastSeenProgress).toBe(0.2);
  });

  it('shows the whole book for non-fiction without a reveal chip', async () => {
    setBook('History');
    const { result } = render(false);
    expect(controller.isShown('ahead')).toBe(true);
    expect(result.current.clusters).toEqual([]);
    await waitFor(() => expect(useMindmapViewStore.getState().reveal).toBeNull());
  });

  it('numbers chapters by leaf TOC entries, skipping part containers', async () => {
    const progressByHref: Record<string, number> = {
      part1: 0.0,
      p1c1: 0.1,
      p1c2: 0.2,
      part2: 0.5,
      p2c1: 0.6,
    };
    const leaf = (href: string, label: string): TOCItem => ({ id: 0, href, label, index: 0 });
    const toc: TOCItem[] = [
      {
        id: 0,
        href: 'part1',
        label: 'Part One',
        index: 0,
        subitems: [leaf('p1c1', 'Chapter 1'), leaf('p1c2', 'Chapter 2')],
      },
      {
        id: 0,
        href: 'part2',
        label: 'Part Two',
        index: 0,
        subitems: [leaf('p2c1', 'Chapter 3')],
      },
    ];
    setBook('Fiction', toc);
    const locator: BookLocator = {
      locateToc: (item) => {
        const progress = progressByHref[item.href];
        return progress === undefined ? null : { cfi: '', section: 0, progress };
      },
      locateCfi: () => null,
    };
    setBookProgress(BOOK_KEY, { fraction: 0.6 } as BookProgress);
    const { result } = render(false, locator);
    expect(result.current.chapterStarts).toEqual([0.1, 0.2, 0.6]);
    await waitFor(() =>
      expect(useMindmapViewStore.getState().reveal).toMatchObject({ chapter: 3 }),
    );
  });
});

describe('useMapReveal reading position', () => {
  it('reveals against the start of the visible range, not the end of the spread', async () => {
    const locator: BookLocator = {
      locateToc: () => null,
      locateCfi: (cfi) =>
        cfi.startsWith('epubcfi(/6/4') ? { cfi, section: 1, progress: 0.1 } : null,
    };
    setBookProgress(BOOK_KEY, {
      fraction: 0.35,
      location: 'epubcfi(/6/4!/4/20,/1:0,/3:5)',
    } as BookProgress);
    render(false, locator);
    expect(controller.isShown('seen')).toBe(true);
    expect(controller.isShown('fresh')).toBe(false);
    await waitFor(() =>
      expect(useMindmapViewStore.getState().reveal).toMatchObject({ revealed: 1 }),
    );
    expect(session.meta().lastSeenProgress).toBe(0.2);
  });
});
