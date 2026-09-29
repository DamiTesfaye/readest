import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { MemoryFileSystem } from '@/__tests__/helpers/memoryFileSystem';
import type { AppService } from '@/types/system';

const h = vi.hoisted(() => ({
  service: null as AppService | null,
  watch: vi.fn(),
  unwatch: vi.fn(),
  push: vi.fn(async () => {}),
}));

vi.mock('@/context/EnvContext', () => ({ useEnv: () => ({ appService: h.service }) }));
vi.mock('@/services/mindmap/sync/lifecycle', () => ({
  watchMindmapSession: (...args: unknown[]) => {
    h.watch(...args);
    return h.unwatch;
  },
  pushMindmap: h.push,
}));

import { HlcGenerator } from '@/libs/crdt';
import { useMindmapSession } from '@/app/reader/components/mindmap/useMindmapSession';
import { createMindmapClock } from '@/services/mindmap/file/clock';
import { createMapFile } from '@/services/mindmap/file/createMapFile';
import { saveMap } from '@/services/mindmap/persist/maps';
import { __resetMapSessionsForTests } from '@/services/mindmap/persist/session';
import { DEFAULT_MAP_META } from '@/services/mindmap/schema/types';
import { useSettingsStore } from '@/store/settingsStore';
import type { SystemSettings } from '@/types/settings';

const BOOK = 'book1';
const MAP = 'map1';

beforeEach(async () => {
  const fs = new MemoryFileSystem();
  h.service = {
    exists: fs.exists.bind(fs),
    readFile: fs.readFile.bind(fs),
    writeFile: fs.writeFile.bind(fs),
    copyFile: fs.copyFile.bind(fs),
    createDir: fs.createDir.bind(fs),
    readDirectory: fs.readDir.bind(fs),
    deleteDir: fs.removeDir.bind(fs),
    deleteFile: fs.removeFile.bind(fs),
  } as unknown as AppService;
  useSettingsStore.setState({ settings: { replicaDeviceId: 'dev-a' } as SystemSettings });
  const clock = createMindmapClock(new HlcGenerator('dev-a'), 'dev-a');
  await saveMap(fs, BOOK, createMapFile({ ...DEFAULT_MAP_META, title: 'Map' }, MAP, clock));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  __resetMapSessionsForTests();
});

describe('useMindmapSession sync wiring', () => {
  it('watches the open map for saves and pushes it once it is closed', async () => {
    const { result, unmount } = renderHook(() => useMindmapSession(BOOK, MAP));
    await waitFor(() => expect(result.current.status).toBe('open'));
    const state = result.current;
    if (state.status !== 'open') throw new Error('expected an open session');
    expect(h.watch).toHaveBeenCalledWith(state.session, MAP);
    expect(h.push).not.toHaveBeenCalled();
    unmount();
    await waitFor(() => expect(h.push).toHaveBeenCalledWith(MAP));
    expect(h.unwatch).toHaveBeenCalledOnce();
  });
});
