import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryFileSystem } from '@/__tests__/helpers/memoryFileSystem';
import { HlcGenerator } from '@/libs/crdt';
import { createMindmapClock } from '@/services/mindmap/file/clock';
import { createMapFile } from '@/services/mindmap/file/createMapFile';
import { saveMapFile } from '@/services/mindmap/persist/mapFile';
import {
  type MapSession,
  __resetMapSessionsForTests,
  openMapSession,
} from '@/services/mindmap/persist/session';
import { createLinkRecord, createNodeRecord } from '@/services/mindmap/records/defaults';
import { DEFAULT_MAP_META, type NodeRecord } from '@/services/mindmap/schema/types';
import { type CanvasController, createCanvasController } from '@/services/mindmap/tools/controller';
import { registerCanvasController } from '@/services/mindmap/tools/controllerRegistry';
import { useBookDataStore } from '@/store/bookDataStore';
import { useMindmapViewStore } from '@/store/mindmapViewStore';
import type { Book } from '@/types/book';
import { eventDispatcher } from '@/utils/event';

const h = vi.hoisted(() => ({ saveFile: vi.fn() }));

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({ appService: { saveFile: h.saveFile } }),
}));

const { useMindmapActions } = await import('@/app/reader/components/mindmap/useMindmapActions');

const BOOK_KEY = 'bookhash-1';
const MAP = 'm1';

let session: MapSession;
let controller: CanvasController;
let unregister: () => void;

beforeEach(async () => {
  h.saveFile.mockReset();
  h.saveFile.mockResolvedValue(true);
  useBookDataStore.setState({
    booksData: {
      bookhash: {
        id: 'bookhash',
        book: { hash: 'bookhash', title: 'Emma', format: 'EPUB' } as Book,
        file: null,
        config: null,
        bookDoc: null,
        isFixedLayout: false,
      },
    },
  });
  useMindmapViewStore.setState({ bookKey: BOOK_KEY, mapId: MAP });
  const fs = new MemoryFileSystem();
  const clock = createMindmapClock(new HlcGenerator('device-1'), 'device-1');
  const meta = { ...DEFAULT_MAP_META, title: 'Emma map', source: 'generated' as const };
  await saveMapFile(fs, 'bookhash', createMapFile(meta, MAP, clock));
  const result = await openMapSession(fs, 'bookhash', MAP, clock);
  if (result.status !== 'open') throw new Error('expected an open session');
  session = result.session;
  const chapter: NodeRecord = {
    ...createNodeRecord({ id: 'chapter', index: 'a1', x: 0, y: 0, label: 'Chapter One' }),
    origin: 'generated',
    genKey: 'toc:a',
  };
  const quote: NodeRecord = {
    ...createNodeRecord({ id: 'quote', index: 'a2', x: 3000, y: 3000, label: 'Quote' }),
    kind: 'quote',
    origin: 'generated',
    genKey: 'note:1',
    touched: ['x', 'y'],
  };
  session.store.applyGenerated({
    added: [
      chapter,
      quote,
      createLinkRecord({ id: 'link', index: 'a3', fromId: 'chapter', toId: 'quote' }),
    ],
    changed: [],
    discarded: [],
  });
  controller = createCanvasController({ store: session.store, camera: session.meta().camera });
  unregister = registerCanvasController(MAP, controller);
});

afterEach(async () => {
  cleanup();
  unregister();
  controller.dispose();
  await session.close();
  __resetMapSessionsForTests();
  vi.restoreAllMocks();
});

describe('useMindmapActions', () => {
  it('resets a generated record next to its chapter and clears its touched position', () => {
    const { result } = renderHook(() => useMindmapActions());
    result.current.onResetPosition(MAP, 'quote');
    const quote = session.store.get('quote') as NodeRecord;
    expect(Math.hypot(quote.x, quote.y)).toBeLessThan(400);
    expect(quote.x % 16).toBe(0);
    expect(quote.touched).toEqual([]);
    expect(controller.history.canUndo()).toBe(true);
  });

  it('exports the records the reader can see as a JSON Canvas file', async () => {
    const dispatch = vi.spyOn(eventDispatcher, 'dispatch');
    controller.visible.set((record) => record.id !== 'quote');
    const { result } = renderHook(() => useMindmapActions());
    result.current.onExport(MAP);
    await waitFor(() => expect(h.saveFile).toHaveBeenCalled());
    const [filename, content, options] = h.saveFile.mock.calls[0]!;
    expect(filename).toBe('Emma map.canvas');
    expect(options).toEqual({ mimeType: 'application/json' });
    const canvas = JSON.parse(content as string);
    expect(canvas.nodes.map((node: { id: string }) => node.id)).toEqual(['chapter']);
    expect(canvas.edges).toEqual([]);
    await waitFor(() =>
      expect(dispatch).toHaveBeenCalledWith('toast', {
        type: 'info',
        message: 'Exported successfully',
      }),
    );
  });

  it('does not export when there is no open canvas controller', async () => {
    unregister();
    const { result } = renderHook(() => useMindmapActions());
    result.current.onExport(MAP);
    await Promise.resolve();
    expect(h.saveFile).not.toHaveBeenCalled();
  });

  it('tells the reader when the export fails', async () => {
    const dispatch = vi.spyOn(eventDispatcher, 'dispatch');
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    h.saveFile.mockRejectedValue(new Error('disk full'));
    const { result } = renderHook(() => useMindmapActions());
    result.current.onExport(MAP);
    await waitFor(() =>
      expect(dispatch).toHaveBeenCalledWith('toast', {
        type: 'error',
        message: 'Could not export the mind map',
      }),
    );
  });
});
