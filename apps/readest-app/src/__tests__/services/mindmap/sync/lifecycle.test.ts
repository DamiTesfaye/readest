import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryFileSystem } from '@/__tests__/helpers/memoryFileSystem';
import type { MindmapPusher } from '@/services/mindmap/sync/push';

const h = vi.hoisted(() => ({
  pusher: null as MindmapPusher | null,
  fs: null as MemoryFileSystem | null,
}));

vi.mock('@/services/mindmap/sync/runtime', () => ({
  getMindmapSync: async () => ({ pusher: h.pusher, fs: h.fs }),
}));

import { HlcGenerator } from '@/libs/crdt';
import { createMindmapClock } from '@/services/mindmap/file/clock';
import { readMapFile } from '@/services/mindmap/persist/mapFile';
import {
  __resetMindmapStoreForTests,
  useMindmapStore,
} from '@/services/mindmap/persist/mindmapStore';
import { __resetMapSessionsForTests, openMapSession } from '@/services/mindmap/persist/session';
import { DEFAULT_MAP_META } from '@/services/mindmap/schema/types';
import {
  __resetMindmapLifecycleForTests,
  flushMindmapSync,
  installMindmapLifecycle,
  pushMindmap,
  watchMindmapSession,
} from '@/services/mindmap/sync/lifecycle';

const BOOK = 'book1';
const clock = createMindmapClock(new HlcGenerator('dev-a'), 'dev-a');

const pusherSpy = () => ({
  schedule: vi.fn(),
  pushNow: vi.fn(async () => 'queued' as const),
  committed: vi.fn(async () => {}),
  flushAll: vi.fn(async () => {}),
  idle: vi.fn(async () => {}),
  unpushed: vi.fn(() => []),
  dispose: vi.fn(),
});

let pusher: ReturnType<typeof pusherSpy>;

const openMap = async (title = 'Characters') => {
  const { mapId } = await useMindmapStore
    .getState()
    .createMap(BOOK, { ...DEFAULT_MAP_META, title }, clock);
  const opened = await openMapSession(h.fs!, BOOK, mapId, clock);
  if (opened.status !== 'open') throw new Error('expected an open session');
  return { mapId, session: opened.session };
};

const setVisibility = (state: DocumentVisibilityState): void => {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(state);
  document.dispatchEvent(new Event('visibilitychange'));
};

beforeEach(async () => {
  h.fs = new MemoryFileSystem();
  pusher = pusherSpy();
  h.pusher = pusher;
  await useMindmapStore.getState().hydrate(h.fs);
});

afterEach(() => {
  vi.restoreAllMocks();
  __resetMindmapLifecycleForTests();
  __resetMapSessionsForTests();
  __resetMindmapStoreForTests();
});

describe('mindmap sync lifecycle', () => {
  it('schedules a push after every save of a watched map and keeps the entry name current', async () => {
    const { mapId, session } = await openMap();
    watchMindmapSession(session, mapId);
    session.updateMeta({ title: 'Renamed' });
    await session.flush();
    await vi.waitFor(() => expect(pusher.schedule).toHaveBeenCalledWith(mapId));
    expect(useMindmapStore.getState().getEntry(mapId)!.name).toBe('Renamed');
  });

  it('stops scheduling pushes once unwatched', async () => {
    const { mapId, session } = await openMap();
    const unwatch = watchMindmapSession(session, mapId);
    unwatch();
    session.updateMeta({ title: 'Renamed' });
    await session.flush();
    expect(pusher.schedule).not.toHaveBeenCalled();
  });

  it('pushes a map right away when asked, as on map close', async () => {
    await pushMindmap('map1');
    expect(pusher.pushNow).toHaveBeenCalledWith('map1');
  });

  it('saves every open map and pushes every scheduled map on flush', async () => {
    const { mapId, session } = await openMap();
    session.updateMeta({ title: 'Not saved yet' });
    await flushMindmapSync();
    const saved = await readMapFile(h.fs!, BOOK, mapId);
    expect(saved!.file.meta['title']!.v).toBe('Not saved yet');
    expect(pusher.flushAll).toHaveBeenCalledOnce();
  });

  it('never rejects when flushing fails', async () => {
    pusher.flushAll.mockRejectedValue(new Error('offline'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(flushMindmapSync()).resolves.toBeUndefined();
  });

  it('flushes when the app goes to the background, and only then', async () => {
    installMindmapLifecycle();
    installMindmapLifecycle();
    setVisibility('visible');
    await Promise.resolve();
    expect(pusher.flushAll).not.toHaveBeenCalled();
    setVisibility('hidden');
    await vi.waitFor(() => expect(pusher.flushAll).toHaveBeenCalledOnce());
  });
});
