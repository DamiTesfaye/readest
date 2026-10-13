import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { MemoryFileSystem } from '@/__tests__/helpers/memoryFileSystem';
import MindmapView from '@/app/reader/components/mindmap/MindmapView';
import { HlcGenerator } from '@/libs/crdt';
import { createMindmapClock } from '@/services/mindmap/file/clock';
import { resolveMapEntry } from '@/services/mindmap/entry';
import { mapFilePath } from '@/services/mindmap/persist/mapFile';
import { mindmapFsFromAppService } from '@/services/mindmap/persist/mindmapFs';
import {
  __resetMindmapStoreForTests,
  useMindmapStore,
} from '@/services/mindmap/persist/mindmapStore';
import {
  __resetMapSessionsForTests,
  getOpenMapSession,
  openMapSession,
} from '@/services/mindmap/persist/session';
import {
  createLinkRecord,
  createNodeRecord,
  createStickyRecord,
} from '@/services/mindmap/records/defaults';
import { DEFAULT_MAP_META, type MapRecord } from '@/services/mindmap/schema/types';
import { useMindmapViewStore } from '@/store/mindmapViewStore';
import type { AppService } from '@/types/system';
import { eventDispatcher } from '@/utils/event';
import { memoryAppService } from './memoryAppService';
import '@/styles/globals.css';

const BOOK_KEY = 'bookhash-key1';
const BOOK_HASH = 'bookhash';

const h = vi.hoisted(() => ({ appService: null as AppService | null }));

vi.mock('@/hooks/useTranslation', () => {
  const translate = (value: string, options?: Record<string, string | number>) =>
    value.replace(/{{(\w+)}}/g, (_, name: string) => String(options?.[name] ?? ''));
  return { useTranslation: () => translate };
});
vi.mock('@/context/EnvContext', () => ({ useEnv: () => ({ appService: h.appService }) }));
vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: <T,>(select: (s: { settings: { replicaDeviceId?: string } }) => T) =>
    select({ settings: { replicaDeviceId: 'device-1' } }),
}));
vi.mock('@/store/bookDataStore', () => {
  const state = {
    getBookData: () => ({ book: { hash: 'bookhash', title: 'Pride and Prejudice' } }),
  };
  const hook = <T,>(select: (s: typeof state) => T) => select(state);
  hook.getState = () => state;
  return { useBookDataStore: hook };
});
vi.mock('@/store/readerStore', () => {
  const state = {
    bookKeys: ['bookhash-key1'],
    getView: () => null,
    getViewSettings: () => ({ isEink: false }),
    getProgress: () => ({ fraction: 0.1, pageinfo: { current: 3 } }),
  };
  const hook = <T,>(select?: (s: typeof state) => T) => (select ? select(state) : state);
  hook.getState = () => state;
  return { useReaderStore: hook };
});
vi.mock('@/store/themeStore', () => {
  const state = {
    isDarkMode: false,
    safeAreaInsets: { top: 0, bottom: 0, left: 0, right: 0 },
    systemUIVisible: false,
    statusBarHeight: 0,
  };
  const hook = <T,>(select?: (s: typeof state) => T) => (select ? select(state) : state);
  hook.getState = () => state;
  return { useThemeStore: hook };
});
vi.mock('@/services/mindmap/entry', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/mindmap/entry')>()),
  currentUserPlan: async () => 'free',
}));

let fs: MemoryFileSystem;
let toasts: { type: string; message: string }[];
const onToast = (event: CustomEvent) => {
  toasts.push(event.detail as { type: string; message: string });
};

const seedClock = () => createMindmapClock(new HlcGenerator('seed'), 'seed');

const seedMap = async (title: string, records: MapRecord[]): Promise<string> => {
  const mfs = mindmapFsFromAppService(h.appService!);
  await useMindmapStore.getState().hydrate(mfs);
  const clock = seedClock();
  const file = await useMindmapStore
    .getState()
    .createMap(BOOK_HASH, { ...DEFAULT_MAP_META, title, camera: { x: 20, y: 20, z: 1 } }, clock);
  const opened = await openMapSession(mfs, BOOK_HASH, file.mapId, clock);
  if (opened.status !== 'open') throw new Error('seed failed');
  opened.session.store.put(records);
  await opened.session.close();
  return file.mapId;
};

const fileKey = (mapId: string) => `Books:${mapFilePath(BOOK_HASH, mapId)}`;

const bumpSchema = (mapId: string): void => {
  const json = JSON.parse(fs.files.get(fileKey(mapId))!) as { schemaVersion: number };
  json.schemaVersion = 99;
  fs.files.set(fileKey(mapId), JSON.stringify(json));
};

const records = (): MapRecord[] => [
  createNodeRecord({ id: 'a', index: 'a1', x: 100, y: 100, w: 160, h: 64, label: 'Alpha' }),
  createNodeRecord({ id: 'b', index: 'a2', x: 400, y: 100, w: 160, h: 64, label: 'Beta' }),
  createStickyRecord({ id: 's', index: 'a3', x: 100, y: 300, w: 160, h: 120, text: 'Sticky' }),
  createLinkRecord({ id: 'l', index: 'a4', fromId: 'a', toId: 'b' }),
];

const pointer = (type: string, x: number, y: number, extra: PointerEventInit = {}) =>
  new PointerEvent(type, {
    clientX: x,
    clientY: y,
    pointerId: 1,
    pointerType: 'mouse',
    button: 0,
    buttons: type === 'pointerup' ? 0 : 1,
    bubbles: true,
    cancelable: true,
    ...extra,
  });

const centerOf = (id: string) => {
  const rect = screen.getByTestId(`mm-record-${id}`).getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
};

const openView = async (mapId: string, strict = false) => {
  act(() => useMindmapViewStore.setState({ bookKey: BOOK_KEY, mapId, sheetOpen: false }));
  const tree = <MindmapView />;
  render(strict ? <StrictMode>{tree}</StrictMode> : tree);
  await waitFor(() => expect(screen.getByTestId('mindmap-canvas')).toBeTruthy(), {
    timeout: 5000,
  });
  await waitFor(() => expect(screen.getByTestId('mm-record-a')).toBeTruthy());
};

beforeEach(async () => {
  await page.viewport(1280, 900);
  fs = new MemoryFileSystem();
  h.appService = memoryAppService(fs);
  __resetMindmapStoreForTests();
  __resetMapSessionsForTests();
  toasts = [];
  eventDispatcher.on('toast', onToast);
  useMindmapViewStore.setState({
    bookKey: null,
    mapId: null,
    sheetOpen: false,
    layout: 'fullscreen',
  });
});

afterEach(() => {
  cleanup();
  eventDispatcher.off('toast', onToast);
  vi.restoreAllMocks();
});

describe('saving', () => {
  it('tells the user once when saves keep failing, including the final flush on close', async () => {
    const mapId = await seedMap('Failing', records());
    await openView(mapId);
    const path = mapFilePath(BOOK_HASH, mapId);
    const service = h.appService!;
    const write = service.writeFile.bind(service);
    vi.spyOn(service, 'writeFile').mockImplementation(async (p, base, content) => {
      if (p === path) throw new Error('disk full');
      return write(p, base, content);
    });
    const canvas = screen.getByTestId('mindmap-canvas');
    const a = centerOf('a');
    canvas.dispatchEvent(pointer('pointerdown', a.x, a.y));
    canvas.dispatchEvent(pointer('pointerup', a.x, a.y));
    canvas.focus();
    await userEvent.keyboard('{Alt>}{ArrowRight}{/Alt}');
    await waitFor(() => expect(toasts.filter((t) => t.type === 'error')).toHaveLength(1));
    await userEvent.keyboard('{Alt>}{ArrowRight}{/Alt}');
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(toasts.filter((t) => t.type === 'error')).toHaveLength(1);
    expect(toasts[0]!.message).toBe('Could not save the mind map');
    toasts = [];
    await userEvent.keyboard('{Delete}');
    await userEvent.click(screen.getByRole('button', { name: /Back to page/ }));
    await waitFor(() => expect(getOpenMapSession(mapId)).toBeUndefined());
    expect(toasts.filter((t) => t.type === 'error')).toHaveLength(1);
  });
});

describe('opening notices', () => {
  it('shows the read-only and restored toasts once per session under StrictMode', async () => {
    const mapId = await seedMap('Strict', records());
    bumpSchema(mapId);
    const key = fileKey(mapId);
    fs.files.set(`${key}.bak`, fs.files.get(key)!);
    fs.files.set(key, '{corrupt');
    await openView(mapId, true);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(toasts.map((t) => t.type).sort()).toEqual(['info', 'warning']);
  });
});

describe('leaving the page', () => {
  const savedFile = (mapId: string) =>
    JSON.parse(fs.files.get(fileKey(mapId))!) as {
      meta: { camera: { v: { x: number } } };
      records: Record<string, { x: { v: number } }>;
    };

  it('saves a pending edit and camera move at once when the page is hidden', async () => {
    const mapId = await seedMap('Leaving', records());
    await openView(mapId);
    await new Promise((resolve) => setTimeout(resolve, 700));
    const before = savedFile(mapId);
    const canvas = screen.getByTestId('mindmap-canvas');
    const a = centerOf('a');
    canvas.dispatchEvent(pointer('pointerdown', a.x, a.y));
    canvas.dispatchEvent(pointer('pointerup', a.x, a.y));
    canvas.focus();
    await userEvent.keyboard('{Alt>}{ArrowRight}{/Alt}');
    canvas.dispatchEvent(
      new WheelEvent('wheel', { deltaX: 80, deltaY: 0, bubbles: true, cancelable: true }),
    );
    window.dispatchEvent(new PageTransitionEvent('pagehide'));
    await new Promise((resolve) => setTimeout(resolve, 100));
    const after = savedFile(mapId);
    expect(after.records['a']!.x.v).toBeGreaterThan(before.records['a']!.x.v);
    expect(after.meta.camera.v.x).not.toBe(before.meta.camera.v.x);
  });

  it('saves a pending edit when the tab goes to the background', async () => {
    const mapId = await seedMap('Hidden', records());
    await openView(mapId);
    await new Promise((resolve) => setTimeout(resolve, 700));
    const before = savedFile(mapId);
    const canvas = screen.getByTestId('mindmap-canvas');
    const a = centerOf('a');
    canvas.dispatchEvent(pointer('pointerdown', a.x, a.y));
    canvas.dispatchEvent(pointer('pointerup', a.x, a.y));
    canvas.focus();
    await userEvent.keyboard('{Alt>}{ArrowDown}{/Alt}');
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    try {
      document.dispatchEvent(new Event('visibilitychange'));
    } finally {
      Reflect.deleteProperty(document, 'visibilityState');
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(savedFile(mapId).records['a']).not.toEqual(before.records['a']);
  });
});

describe('a map that cannot be opened', () => {
  it('keeps the switcher so the other maps stay reachable', async () => {
    const older = await seedMap('Healthy', records());
    await new Promise((resolve) => setTimeout(resolve, 20));
    const broken = await seedMap('Broken', records());
    fs.files.set(fileKey(broken), '{corrupt');
    fs.files.delete(`${fileKey(broken)}.bak`);
    const target = await resolveMapEntry(mindmapFsFromAppService(h.appService!), BOOK_HASH);
    expect(target).toEqual({ kind: 'map', mapId: broken });
    act(() => useMindmapViewStore.getState().showMap(BOOK_KEY, broken));
    render(<MindmapView />);
    await waitFor(() => expect(screen.getByTestId('mm-error')).toBeTruthy());
    const switcher = screen.getByRole('combobox', { name: 'Mind map' });
    await waitFor(() => expect(screen.getByRole('option', { name: 'Healthy' })).toBeTruthy());
    await userEvent.selectOptions(switcher, older);
    await waitFor(() => expect(screen.getByTestId('mm-record-a')).toBeTruthy());
    expect(useMindmapViewStore.getState().mapId).toBe(older);
  });
});
