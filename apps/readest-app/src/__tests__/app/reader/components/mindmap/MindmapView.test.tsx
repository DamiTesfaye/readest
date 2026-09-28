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
import { __resetMapSessionsForTests, getOpenMapSession } from '@/services/mindmap/persist/session';
import { createNodeRecord } from '@/services/mindmap/records/defaults';
import { DEFAULT_MAP_META } from '@/services/mindmap/schema/types';
import { decodeMeta } from '@/services/mindmap/schema/validate';
import { useMindmapViewStore } from '@/store/mindmapViewStore';
import type { AppService } from '@/types/system';
import { memoryAppService } from './memoryAppService';

const h = vi.hoisted(() => ({
  appService: null as AppService | null,
  goTo: vi.fn(),
  isEink: false,
  wide: false,
  dark: false,
  reducedMotion: false,
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
vi.mock('@/store/bookDataStore', () => {
  const state = { getBookData: () => ({ book: { hash: 'bookhash', title: 'Emma' } }) };
  return {
    useBookDataStore: Object.assign(<T,>(select: (s: typeof state) => T) => select(state), {
      getState: () => state,
    }),
  };
});
vi.mock('@/store/readerStore', () => {
  const state = {
    getView: () => ({ goTo: h.goTo }),
    getViewSettings: () => ({ isEink: h.isEink }),
    getProgress: () => ({ fraction: 0.25, pageinfo: { current: 11, total: 200 } }),
  };
  return { useReaderStore: Object.assign(() => state, { getState: () => state }) };
});
vi.mock('@/store/themeStore', () => ({
  useThemeStore: <T,>(select?: (s: { isDarkMode: boolean }) => T) =>
    select ? select({ isDarkMode: h.dark }) : { isDarkMode: h.dark },
}));
vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: <T,>(select: (s: { settings: { replicaDeviceId: string } }) => T) =>
    select({ settings: { replicaDeviceId: 'device-1' } }),
}));

const { default: MindmapView } = await import('@/app/reader/components/mindmap/MindmapView');

HTMLElement.prototype.setPointerCapture = vi.fn();
HTMLElement.prototype.releasePointerCapture = vi.fn();
HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);

let fs: MemoryFileSystem;
const BOOK_KEY = 'bookhash-1';

const createMap = async (title: string): Promise<string> => {
  await useMindmapStore.getState().hydrate(fs);
  const clock = createMindmapClock(new HlcGenerator('device-0'), 'device-0');
  const file = await useMindmapStore
    .getState()
    .createMap('bookhash', { ...DEFAULT_MAP_META, title, source: 'blank' }, clock);
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
  h.goTo.mockReset();
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

  it('jumps to the book, closing the full-screen map', async () => {
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
    fireEvent.pointerDown(canvas, {
      clientX: 5,
      clientY: 5,
      pointerId: 2,
      pointerType: 'mouse',
      button: 0,
      detail: 1,
    });
    fireEvent.pointerUp(canvas, {
      clientX: 5,
      clientY: 5,
      pointerId: 2,
      pointerType: 'mouse',
      button: 0,
      detail: 1,
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Jump to book' }));
    expect(h.goTo).toHaveBeenCalledWith('epubcfi(/6/8)');
    expect(useMindmapViewStore.getState().mapId).toBeNull();
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

  it('offers deletion when the map file cannot be read', async () => {
    const mapId = await createMap('Broken');
    await fs.writeFile(mapFilePath('bookhash', mapId), MINDMAP_BASE_DIR, 'not json');
    await fs.writeFile(`${mapFilePath('bookhash', mapId)}.bak`, MINDMAP_BASE_DIR, 'not json');
    useMindmapViewStore.getState().showMap(BOOK_KEY, mapId);
    render(<MindmapView />);
    expect(await screen.findByText('This map could not be opened')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Delete map' })).toBeTruthy();
  });
});
