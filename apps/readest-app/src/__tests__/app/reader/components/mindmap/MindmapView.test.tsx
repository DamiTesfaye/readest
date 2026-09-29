import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { type ReactNode, StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryFileSystem } from '@/__tests__/helpers/memoryFileSystem';
import { HlcGenerator } from '@/libs/crdt';
import { createMindmapClock } from '@/services/mindmap/file/clock';
import { MINDMAP_BASE_DIR, mapFilePath } from '@/services/mindmap/persist/mapFile';
import {
  __resetMindmapStoreForTests,
  useMindmapStore,
} from '@/services/mindmap/persist/mindmapStore';
import {
  __resetMindmapTrashForTests,
  listTrashedMaps,
} from '@/services/mindmap/persist/mindmapTrash';
import { __resetMapSessionsForTests, getOpenMapSession } from '@/services/mindmap/persist/session';
import { createNodeRecord } from '@/services/mindmap/records/defaults';
import { DEFAULT_MAP_META, type MapSource } from '@/services/mindmap/schema/types';
import { getOpenCanvasController } from '@/services/mindmap/tools/controllerRegistry';
import { decodeMeta } from '@/services/mindmap/schema/validate';
import { useMindmapViewStore } from '@/store/mindmapViewStore';
import { setBookProgress } from '@/store/readerProgressStore';
import type { BookDoc } from '@/libs/document';
import type { BookProgress } from '@/types/book';
import type { AppService } from '@/types/system';
import { eventDispatcher } from '@/utils/event';
import { memoryAppService } from './memoryAppService';

const h = vi.hoisted(() => ({
  appService: null as AppService | null,
  goTo: vi.fn(),
  goToFraction: vi.fn(),
  resolvedIndex: 3 as number | undefined,
  sections: 5,
  bookDoc: null as BookDoc | null,
  isEink: false,
  wide: false,
  dark: false,
  reducedMotion: false,
  uiAnimations: undefined as boolean | undefined,
  bookKeys: ['bookhash-1'] as string[],
  safeAreaInsets: null as { top: number; right: number; bottom: number; left: number } | null,
  systemUIVisible: false,
  statusBarHeight: 24,
  publishReplicaDelete: vi.fn(async (..._args: unknown[]) => true),
}));

vi.mock('@/components/Dialog', () => ({
  default: ({
    isOpen,
    title,
    children,
  }: {
    isOpen: boolean;
    title: string;
    children: ReactNode;
  }) =>
    isOpen ? (
      <div role='dialog' aria-label={title}>
        {children}
      </div>
    ) : null,
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/context/EnvContext', () => ({ useEnv: () => ({ appService: h.appService }) }));
vi.mock('@/services/environment', () => ({
  default: { getAppService: async () => h.appService },
}));
vi.mock('@/utils/access', () => ({
  getAccessToken: async () => null,
  getUserProfilePlan: () => 'free',
}));
vi.mock('@/services/sync/replicaPublish', () => ({ publishReplicaDelete: h.publishReplicaDelete }));
vi.mock('@/store/bookDataStore', () => {
  const state = {
    getBookData: () => ({
      book: { hash: 'bookhash', title: 'Emma', format: 'EPUB', metadata: { subject: 'Fiction' } },
      bookDoc: h.bookDoc,
      config: { booknotes: [] },
    }),
  };
  return {
    useBookDataStore: Object.assign(<T,>(select: (s: typeof state) => T) => select(state), {
      getState: () => state,
    }),
  };
});
vi.mock('@/store/readerStore', () => {
  const state = {
    getView: () => ({
      goTo: h.goTo,
      goToFraction: h.goToFraction,
      resolveNavigation: () =>
        h.resolvedIndex === undefined ? undefined : { index: h.resolvedIndex },
      book: { sections: Array.from({ length: h.sections }) },
    }),
    getViewSettings: () => ({ isEink: h.isEink }),
    getProgress: () => ({ fraction: 0.25, pageinfo: { current: 11, total: 200 } }),
    get bookKeys() {
      return h.bookKeys;
    },
  };
  return { useReaderStore: Object.assign(() => state, { getState: () => state }) };
});
vi.mock('@/store/themeStore', () => {
  const state = () => ({
    isDarkMode: h.dark,
    safeAreaInsets: h.safeAreaInsets,
    systemUIVisible: h.systemUIVisible,
    statusBarHeight: h.statusBarHeight,
  });
  return {
    useThemeStore: <T,>(select?: (s: ReturnType<typeof state>) => T) =>
      select ? select(state()) : state(),
  };
});
vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: <T,>(
    select: (s: {
      settings: { replicaDeviceId: string; uiAnimationsEnabled: boolean | undefined };
    }) => T,
  ) => select({ settings: { replicaDeviceId: 'device-1', uiAnimationsEnabled: h.uiAnimations } }),
}));

const { default: MindmapView } = await import('@/app/reader/components/mindmap/MindmapView');

HTMLElement.prototype.setPointerCapture = vi.fn();
HTMLElement.prototype.releasePointerCapture = vi.fn();
HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);

let fs: MemoryFileSystem;
const BOOK_KEY = 'bookhash-1';

const createMap = async (title: string, source: MapSource = 'blank'): Promise<string> => {
  await useMindmapStore.getState().hydrate(fs);
  const clock = createMindmapClock(new HlcGenerator('device-0'), 'device-0');
  const file = await useMindmapStore
    .getState()
    .createMap('bookhash', { ...DEFAULT_MAP_META, title, source }, clock);
  return file.mapId;
};

const readMeta = async (mapId: string) =>
  decodeMeta(JSON.parse(await fs.readFile(mapFilePath('bookhash', mapId), MINDMAP_BASE_DIR)).meta);

const readRecords = async (mapId: string): Promise<Record<string, unknown>> =>
  JSON.parse(await fs.readFile(mapFilePath('bookhash', mapId), MINDMAP_BASE_DIR)).records;

const openCanvas = async () => screen.findByTestId('mindmap-canvas', {}, { timeout: 3000 });

beforeEach(() => {
  fs = new MemoryFileSystem();
  h.appService = memoryAppService(fs);
  h.isEink = false;
  h.wide = false;
  h.dark = false;
  h.reducedMotion = false;
  h.uiAnimations = undefined;
  h.bookKeys = [BOOK_KEY];
  h.safeAreaInsets = null;
  h.systemUIVisible = false;
  h.statusBarHeight = 24;
  h.goTo.mockReset();
  h.goToFraction.mockReset();
  h.resolvedIndex = 3;
  h.sections = 5;
  h.bookDoc = null;
  setBookProgress(BOOK_KEY, null);
  window.matchMedia = ((query: string) => ({
    matches: query.includes('min-width: 1024px')
      ? h.wide
      : query.includes('prefers-reduced-motion')
        ? h.reducedMotion
        : false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
  __resetMindmapStoreForTests();
  __resetMindmapTrashForTests();
  h.publishReplicaDelete.mockClear();
  useMindmapViewStore.setState({ layout: 'fullscreen', dockWidth: '40%' });
  useMindmapViewStore.getState().close();
});

afterEach(async () => {
  cleanup();
  await new Promise((resolve) => setTimeout(resolve, 0));
  __resetMapSessionsForTests();
});

describe('opening the mind map', () => {
  it('shows the new-map sheet when the book has no map yet', async () => {
    render(<MindmapView />);
    await act(() => useMindmapViewStore.getState().openEntry(BOOK_KEY));
    expect(await screen.findByRole('dialog', { name: 'New mind map' })).toBeTruthy();
  });

  it('opens the most recently edited map, full screen and focused', async () => {
    await createMap('Older');
    const newest = await createMap('Newest');
    render(<MindmapView />);
    await act(() => useMindmapViewStore.getState().openEntry(BOOK_KEY));
    const canvas = await openCanvas();
    expect(useMindmapViewStore.getState().mapId).toBe(newest);
    expect(screen.getByTestId('mm-view').dataset['layout']).toBe('fullscreen');
    expect(document.activeElement).toBe(canvas);
    await waitFor(() => expect(screen.getByTestId('mm-map-count').textContent).toBe('2/3'));
    expect(screen.getByRole('button', { name: /Back to page 12/ })).toBeTruthy();
  });
});

const pointer = (target: Element, type: 'pointerDown' | 'pointerUp', x: number, y: number) =>
  fireEvent[type](target, {
    clientX: x,
    clientY: y,
    pointerId: 1,
    pointerType: 'mouse',
    button: 0,
    detail: 1,
  });

describe('closing with the book', () => {
  it('closes the view when its book is no longer open in the reader', async () => {
    const mapId = await createMap('Closing');
    useMindmapViewStore.getState().showMap(BOOK_KEY, mapId);
    const view = render(<MindmapView />);
    await openCanvas();
    h.bookKeys = [];
    view.rerender(<MindmapView />);
    await waitFor(() => expect(useMindmapViewStore.getState().bookKey).toBeNull());
  });

  it('does not close on the StrictMode double mount even though bookKeys briefly re-evaluates', async () => {
    const mapId = await createMap('Stays');
    useMindmapViewStore.getState().showMap(BOOK_KEY, mapId);
    render(
      <StrictMode>
        <MindmapView />
      </StrictMode>,
    );
    await openCanvas();
    expect(useMindmapViewStore.getState().bookKey).toBe(BOOK_KEY);
  });
});

describe('an open map', () => {
  it('survives the StrictMode double mount with one live session and a live spatial index', async () => {
    const mapId = await createMap('Strict');
    useMindmapViewStore.getState().showMap(BOOK_KEY, mapId);
    render(
      <StrictMode>
        <MindmapView />
      </StrictMode>,
    );
    const canvas = await openCanvas();
    expect(screen.queryByTestId('mm-error')).toBeNull();
    expect(getOpenMapSession(mapId)).toBeDefined();
    fireEvent.keyDown(canvas, { key: 'n' });
    pointer(canvas, 'pointerDown', 100, 100);
    pointer(canvas, 'pointerUp', 100, 100);
    fireEvent.keyDown(screen.getByTestId('mm-label-editor'), { key: 'Escape' });
    pointer(canvas, 'pointerDown', 600, 500);
    pointer(canvas, 'pointerUp', 600, 500);
    expect(screen.queryByRole('combobox', { name: 'Node kind' })).toBeNull();
    pointer(canvas, 'pointerDown', 100, 100);
    pointer(canvas, 'pointerUp', 100, 100);
    expect(screen.getByRole('combobox', { name: 'Node kind' })).toBeTruthy();
  });

  it('follows the reader theme and skips pop-in under reduced motion', async () => {
    h.dark = true;
    h.reducedMotion = true;
    const mapId = await createMap('Calm');
    useMindmapViewStore.getState().showMap(BOOK_KEY, mapId);
    render(<MindmapView />);
    const canvas = await openCanvas();
    expect(canvas.dataset['mmMode']).toBe('dark');
    act(() => {
      getOpenMapSession(mapId)!.store.put([
        createNodeRecord({ id: 'fresh', index: 'a1', label: 'Fresh' }),
      ]);
    });
    expect(screen.getByTestId('mm-record-fresh').innerHTML).not.toContain('animate-');
  });

  it('skips pop-in when UI animations are turned off in settings', async () => {
    h.uiAnimations = false;
    const mapId = await createMap('Still');
    useMindmapViewStore.getState().showMap(BOOK_KEY, mapId);
    render(<MindmapView />);
    await openCanvas();
    act(() => {
      getOpenMapSession(mapId)!.store.put([
        createNodeRecord({ id: 'fresh', index: 'a1', label: 'Fresh' }),
      ]);
    });
    expect(screen.getByTestId('mm-record-fresh').innerHTML).not.toContain('animate-');
  });

  it('saves edits through the plan 1 session and closes the session on unmount', async () => {
    const mapId = await createMap('Characters');
    useMindmapViewStore.getState().showMap(BOOK_KEY, mapId);
    const view = render(<MindmapView />);
    const canvas = await openCanvas();
    fireEvent.keyDown(canvas, { key: 'n' });
    fireEvent.pointerDown(canvas, {
      clientX: 200,
      clientY: 200,
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      detail: 1,
    });
    fireEvent.pointerUp(canvas, {
      clientX: 200,
      clientY: 200,
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      detail: 1,
    });
    const session = getOpenMapSession(mapId)!;
    const created = session.store.all().find((record) => record.type === 'node')!;
    await waitFor(async () => expect(Object.keys(await readRecords(mapId))).toContain(created.id), {
      timeout: 3000,
    });
    act(() => {
      session.store.update(created.id, { x: 480 });
    });
    view.unmount();
    await waitFor(() => expect(getOpenMapSession(mapId)).toBeUndefined());
    const saved = (await readRecords(mapId))[created.id] as Record<string, { v: unknown }>;
    expect(saved['x']!.v).toBe(480);
  });

  it('persists the opening fit and later camera moves to the map meta', async () => {
    const width = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1000);
    const height = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(700);
    const mapId = await createMap('Camera');
    useMindmapViewStore.getState().showMap(BOOK_KEY, mapId);
    const view = render(<MindmapView />);
    const canvas = await openCanvas();
    canvas.dispatchEvent(
      new WheelEvent('wheel', { deltaX: 40, deltaY: 30, bubbles: true, cancelable: true }),
    );
    view.unmount();
    width.mockRestore();
    height.mockRestore();
    await waitFor(
      async () => expect((await readMeta(mapId)).camera).toEqual({ x: 460, y: 320, z: 1 }),
      {
        timeout: 3000,
      },
    );
  });

  it('switches style through the session and forces Ink & margin on e-ink', async () => {
    const mapId = await createMap('Styles');
    useMindmapViewStore.getState().showMap(BOOK_KEY, mapId);
    render(<MindmapView />);
    const canvas = await openCanvas();
    fireEvent.change(screen.getByRole('combobox', { name: 'Map style' }), {
      target: { value: 'paper' },
    });
    await waitFor(() => expect(canvas.dataset['mmStyle']).toBe('paper'));
    expect(getOpenMapSession(mapId)!.meta().style).toBe('paper');
    cleanup();
    h.isEink = true;
    render(<MindmapView />);
    const einkCanvas = await openCanvas();
    expect(einkCanvas.dataset['mmStyle']).toBe('ink');
    expect(einkCanvas.dataset['mmMode']).toBe('eink');
  });

  it('docks beside the book on wide screens with a resizable split', async () => {
    h.wide = true;
    const mapId = await createMap('Docked');
    useMindmapViewStore.setState({ layout: 'docked' });
    useMindmapViewStore.getState().showMap(BOOK_KEY, mapId);
    render(<MindmapView />);
    const canvas = await openCanvas();
    const panel = screen.getByTestId('mm-view');
    expect(panel.dataset['layout']).toBe('docked');
    expect(panel.style.width).toBe('40%');
    expect(screen.getByRole('slider', { name: 'Resize mind map' })).toBeTruthy();
    expect(document.activeElement).not.toBe(canvas);
    fireEvent.click(screen.getByRole('button', { name: 'Full screen' }));
    expect(screen.getByTestId('mm-view').dataset['layout']).toBe('fullscreen');
  });

  it('stays full screen on narrow screens even when docking was chosen', async () => {
    const mapId = await createMap('Narrow');
    useMindmapViewStore.setState({ layout: 'docked' });
    useMindmapViewStore.getState().showMap(BOOK_KEY, mapId);
    render(<MindmapView />);
    await openCanvas();
    expect(screen.getByTestId('mm-view').dataset['layout']).toBe('fullscreen');
    expect(screen.queryByRole('button', { name: 'Dock beside book' })).toBeNull();
  });

  const selectAnchoredQuote = async (): Promise<string> => {
    const mapId = await createMap('Anchors');
    useMindmapViewStore.getState().showMap(BOOK_KEY, mapId);
    render(<MindmapView />);
    await openCanvas();
    const anchor = { cfi: 'epubcfi(/6/8)', section: 3, progress: 0.3 };
    act(() => {
      const session = getOpenMapSession(mapId)!;
      session.store.put([
        { ...createNodeRecord({ id: 'q', index: 'a1', label: 'Quote' }), anchor },
      ]);
    });
    const canvas = screen.getByTestId('mindmap-canvas');
    pointer(canvas, 'pointerDown', 5, 5);
    pointer(canvas, 'pointerUp', 5, 5);
    return mapId;
  };

  it('jumps to the book, closing the full-screen map', async () => {
    await selectAnchoredQuote();
    fireEvent.click(await screen.findByRole('button', { name: 'Jump to book' }));
    expect(h.goTo).toHaveBeenCalledWith('epubcfi(/6/8)');
    expect(useMindmapViewStore.getState().mapId).toBeNull();
  });

  it('falls back to the section progress when the cfi no longer resolves', async () => {
    h.resolvedIndex = undefined;
    await selectAnchoredQuote();
    fireEvent.click(await screen.findByRole('button', { name: 'Jump to book' }));
    expect(h.goTo).not.toHaveBeenCalled();
    expect(h.goToFraction).toHaveBeenCalledWith(0.3);
  });

  it('disables Jump to book when neither the cfi nor its section resolve', async () => {
    h.resolvedIndex = undefined;
    h.sections = 2;
    await selectAnchoredQuote();
    const jump = (await screen.findByRole('button', { name: 'Jump to book' })) as HTMLButtonElement;
    expect(jump.disabled).toBe(true);
  });

  it('deletes the map after confirmation and closes the view', async () => {
    const mapId = await createMap('Doomed');
    useMindmapViewStore.getState().showMap(BOOK_KEY, mapId);
    render(<MindmapView />);
    await openCanvas();
    fireEvent.click(screen.getByRole('button', { name: 'Map options' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete map' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Tap again to delete this map' }));
    await waitFor(() => expect(useMindmapViewStore.getState().mapId).toBeNull());
    expect(useMindmapStore.getState().getEntry(mapId)).toBeUndefined();
    expect(h.publishReplicaDelete).toHaveBeenCalledWith('mindmap', mapId);
  });

  it('reports no save error and no remote delete after deleting the open map', async () => {
    const mapId = await createMap('Doomed');
    useMindmapViewStore.getState().showMap(BOOK_KEY, mapId);
    const messages: string[] = [];
    const onToast = (event: CustomEvent): void => {
      messages.push((event.detail as { message: string }).message);
    };
    eventDispatcher.on('toast', onToast);
    render(<MindmapView />);
    await openCanvas();
    fireEvent.click(screen.getByRole('button', { name: 'Map options' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete map' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Tap again to delete this map' }));
    await waitFor(() => expect(useMindmapViewStore.getState().mapId).toBeNull());
    await new Promise((resolve) => setTimeout(resolve, 50));
    eventDispatcher.off('toast', onToast);
    expect(messages).toEqual([]);
  });

  it('switches to the next map when another device deletes the open one', async () => {
    const next = await createMap('Next');
    const mapId = await createMap('Deleted elsewhere');
    useMindmapViewStore.getState().showMap(BOOK_KEY, mapId);
    const messages: string[] = [];
    const onToast = (event: CustomEvent): void => {
      messages.push((event.detail as { message: string }).message);
    };
    eventDispatcher.on('toast', onToast);
    render(<MindmapView />);
    await openCanvas();
    act(() => useMindmapStore.getState().softDeleteByContentId(mapId));
    await waitFor(() => expect(useMindmapViewStore.getState().mapId).toBe(next));
    await waitFor(() => expect(getOpenMapSession(next)).toBeDefined());
    eventDispatcher.off('toast', onToast);
    expect(messages).toEqual(['This map was deleted on another device']);
  });

  it('registers its controller for the open map, StrictMode safe, until it closes', async () => {
    const mapId = await createMap('Registered');
    useMindmapViewStore.getState().showMap(BOOK_KEY, mapId);
    render(
      <StrictMode>
        <MindmapView />
      </StrictMode>,
    );
    await openCanvas();
    const controller = getOpenCanvasController(mapId);
    expect(controller?.store).toBe(getOpenMapSession(mapId)!.store);
    act(() => useMindmapViewStore.getState().close());
    await waitFor(() => expect(getOpenCanvasController(mapId)).toBeUndefined());
  });

  it('forwards export and reset position handlers with the open map id', async () => {
    const mapId = await createMap('Handlers');
    const onExport = vi.fn();
    const onResetPosition = vi.fn();
    useMindmapViewStore.getState().showMap(BOOK_KEY, mapId);
    render(<MindmapView onExport={onExport} onResetPosition={onResetPosition} />);
    await openCanvas();
    fireEvent.click(screen.getByRole('button', { name: 'Map options' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Export JSON Canvas' }));
    expect(onExport).toHaveBeenCalledWith(mapId);
    act(() => {
      getOpenMapSession(mapId)!.store.put([
        { ...createNodeRecord({ id: 'g', index: 'a1', label: 'Gen' }), origin: 'generated' },
      ]);
    });
    const canvas = screen.getByTestId('mindmap-canvas');
    pointer(canvas, 'pointerDown', 5, 5);
    pointer(canvas, 'pointerUp', 5, 5);
    fireEvent.click(await screen.findByRole('button', { name: 'More actions' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Reset position' }));
    expect(onResetPosition).toHaveBeenCalledWith(mapId, 'g');
  });

  it('refreshes the switcher and count when maps arrive or go away without a local save', async () => {
    const mapId = await createMap('Open');
    useMindmapViewStore.getState().showMap(BOOK_KEY, mapId);
    render(<MindmapView />);
    await openCanvas();
    await waitFor(() => expect(screen.getByTestId('mm-map-count').textContent).toBe('1/3'));
    const pulled = await createMap('Pulled');
    await waitFor(() => expect(screen.getByTestId('mm-map-count').textContent).toBe('2/3'));
    expect(screen.getByRole('option', { name: 'Pulled' })).toBeTruthy();
    await act(() => useMindmapStore.getState().moveToTrash(pulled));
    await waitFor(() => expect(screen.getByTestId('mm-map-count').textContent).toBe('1/3'));
    expect(screen.queryByRole('option', { name: 'Pulled' })).toBeNull();
  });

  it('stacks the new-map sheet above the full-screen map', async () => {
    const mapId = await createMap('Behind');
    useMindmapViewStore.getState().showMap(BOOK_KEY, mapId);
    render(<MindmapView />);
    await openCanvas();
    act(() => useMindmapViewStore.getState().showSheet(BOOK_KEY));
    const sheet = await screen.findByRole('dialog', { name: 'New mind map' });
    expect(screen.getByTestId('mm-view').contains(sheet)).toBe(false);
    expect(sheet.closest('.z-\\[120\\]')).not.toBeNull();
  });

  it('offers to delete a map whose file cannot be read from this device only', async () => {
    const mapId = await createMap('Broken');
    await fs.writeFile(mapFilePath('bookhash', mapId), MINDMAP_BASE_DIR, 'not json');
    await fs.writeFile(`${mapFilePath('bookhash', mapId)}.bak`, MINDMAP_BASE_DIR, 'not json');
    useMindmapViewStore.getState().showMap(BOOK_KEY, mapId);
    render(<MindmapView />);
    expect(await screen.findByText('This map could not be opened')).toBeTruthy();
    expect(
      screen.getByText('If this map was synced, its copy returns after the app restarts.'),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Delete from this device' }));
    expect(await fs.exists(mapFilePath('bookhash', mapId), MINDMAP_BASE_DIR)).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Tap again to delete from this device' }));
    await waitFor(() => expect(useMindmapViewStore.getState().mapId).toBeNull());
    expect(await fs.exists(mapFilePath('bookhash', mapId), MINDMAP_BASE_DIR)).toBe(false);
    expect(h.publishReplicaDelete).not.toHaveBeenCalled();
    expect(await listTrashedMaps(fs)).toEqual([{ bookHash: 'bookhash', mapId, tombstone: false }]);
  });

  it('exports the raw file of a map that cannot be read', async () => {
    const mapId = await createMap('Broken');
    await fs.writeFile(mapFilePath('bookhash', mapId), MINDMAP_BASE_DIR, '{"half written');
    await fs.removeFile(`${mapFilePath('bookhash', mapId)}.bak`, MINDMAP_BASE_DIR);
    const saveFile = vi.fn(async () => true);
    h.appService = { ...memoryAppService(fs), saveFile } as unknown as AppService;
    useMindmapViewStore.getState().showMap(BOOK_KEY, mapId);
    render(<MindmapView />);
    fireEvent.click(await screen.findByRole('button', { name: 'Export raw file' }));
    await waitFor(() =>
      expect(saveFile).toHaveBeenCalledWith('Broken.json', '{"half written', {
        mimeType: 'application/json',
      }),
    );
  });

  it('tells the user when the raw file cannot be exported', async () => {
    const mapId = await createMap('Gone');
    await fs.writeFile(mapFilePath('bookhash', mapId), MINDMAP_BASE_DIR, 'not json');
    await fs.writeFile(`${mapFilePath('bookhash', mapId)}.bak`, MINDMAP_BASE_DIR, 'not json');
    const saveFile = vi.fn(async () => {
      throw new Error('disk full');
    });
    h.appService = { ...memoryAppService(fs), saveFile } as unknown as AppService;
    const toasts: { type: string }[] = [];
    const onToast = (event: CustomEvent) => {
      toasts.push(event.detail as { type: string });
    };
    eventDispatcher.on('toast', onToast);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    useMindmapViewStore.getState().showMap(BOOK_KEY, mapId);
    render(<MindmapView />);
    fireEvent.click(await screen.findByRole('button', { name: 'Export raw file' }));
    await waitFor(() => expect(toasts.map((t) => t.type)).toEqual(['error']));
    eventDispatcher.off('toast', onToast);
  });

  it('tells the user when deleting an unreadable map fails', async () => {
    const mapId = await createMap('Stuck');
    await fs.writeFile(mapFilePath('bookhash', mapId), MINDMAP_BASE_DIR, 'not json');
    await fs.writeFile(`${mapFilePath('bookhash', mapId)}.bak`, MINDMAP_BASE_DIR, 'not json');
    const toasts: { type: string }[] = [];
    const onToast = (event: CustomEvent) => {
      toasts.push(event.detail as { type: string });
    };
    eventDispatcher.on('toast', onToast);
    const copy = vi.spyOn(fs, 'copyFile').mockRejectedValue(new Error('locked'));
    useMindmapViewStore.getState().showMap(BOOK_KEY, mapId);
    render(<MindmapView />);
    fireEvent.click(await screen.findByRole('button', { name: 'Delete from this device' }));
    fireEvent.click(screen.getByRole('button', { name: 'Tap again to delete from this device' }));
    await waitFor(() => expect(toasts.map((t) => t.type)).toEqual(['error']));
    eventDispatcher.off('toast', onToast);
    copy.mockRestore();
    expect(useMindmapViewStore.getState().mapId).toBe(mapId);
  });

  it('pads the top bar and lifts the bottom chrome for the system UI in full screen', async () => {
    h.safeAreaInsets = { top: 40, right: 0, bottom: 20, left: 0 };
    h.systemUIVisible = true;
    h.statusBarHeight = 24;
    const mapId = await createMap('Insets');
    useMindmapViewStore.getState().showMap(BOOK_KEY, mapId);
    render(<MindmapView />);
    await openCanvas();
    expect(screen.getByTestId('mm-top-bar').style.marginTop).toBe('40px');
    expect(screen.getByRole('toolbar', { name: 'Tools' }).style.bottom).toBe('calc(20px + 1rem)');
    expect(screen.getByRole('button', { name: 'Fit to screen' }).parentElement!.style.bottom).toBe(
      'calc(20px + 1rem)',
    );
  });

  it('clears the status bar but not the bottom inset while docked', async () => {
    h.wide = true;
    h.safeAreaInsets = { top: 40, right: 0, bottom: 20, left: 0 };
    h.systemUIVisible = true;
    h.statusBarHeight = 24;
    const mapId = await createMap('Docked insets');
    useMindmapViewStore.setState({ layout: 'docked' });
    useMindmapViewStore.getState().showMap(BOOK_KEY, mapId);
    render(<MindmapView />);
    await openCanvas();
    expect(screen.getByTestId('mm-top-bar').style.marginTop).toBe('40px');
    expect(screen.getByRole('toolbar', { name: 'Tools' }).style.bottom).toBe('calc(0px + 1rem)');
  });
});

const section = (id: string) => ({
  id,
  cfi: `epubcfi(/6/${id.length * 2})`,
  size: 1000,
  linear: 'yes',
  createDocument: async () => document,
});

const threeChapterBook = (): BookDoc =>
  ({
    metadata: { title: 'Emma', author: '', language: 'en', subject: 'Fiction' },
    rendition: {},
    dir: 'ltr',
    toc: [
      { id: 1, label: 'Chapter One', href: 'a', index: 0 },
      { id: 2, label: 'Chapter Two', href: 'bb', index: 0 },
      { id: 3, label: 'Chapter Three', href: 'ccc', index: 0 },
    ],
    sections: [section('a'), section('bb'), section('ccc')],
    splitTOCHref: (href: string) => href.split('#'),
    getCover: async () => null,
  }) as BookDoc;

describe('a generated map', () => {
  it('fills from the book on open and reveals only what the reader has reached', async () => {
    h.bookDoc = threeChapterBook();
    setBookProgress(BOOK_KEY, { fraction: 0.4 } as BookProgress);
    const mapId = await createMap('Generated', 'generated');
    useMindmapViewStore.getState().showMap(BOOK_KEY, mapId);
    render(<MindmapView />);
    await openCanvas();
    await screen.findByRole('button', { name: /^Chapter Two, Chapter/ }, { timeout: 3000 });
    expect(screen.queryByRole('button', { name: /^Chapter Three/ })).toBeNull();
    expect(screen.getByTestId('mm-fog-cluster').textContent).toBe(
      'Keep reading to reveal 1 more nodes',
    );
    const chip = screen.getByTestId('mm-reveal-chip');
    expect(chip.textContent).toContain('Revealed to ch. 2');
    expect(chip.textContent).toContain('2 of 3');
    expect(chip.textContent).toContain('1 new');
    await waitFor(() => expect(getOpenMapSession(mapId)!.meta().lastSeenProgress).toBe(0.4));
    expect(useMindmapViewStore.getState().announcement).toBe('1 new nodes revealed');
  });

  it('leaves a blank map empty', async () => {
    h.bookDoc = threeChapterBook();
    const mapId = await createMap('Blank');
    useMindmapViewStore.getState().showMap(BOOK_KEY, mapId);
    render(<MindmapView />);
    await openCanvas();
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(getOpenMapSession(mapId)!.store.all()).toEqual([]);
    expect(screen.queryByTestId('mm-reveal-chip')).toBeNull();
  });
});
