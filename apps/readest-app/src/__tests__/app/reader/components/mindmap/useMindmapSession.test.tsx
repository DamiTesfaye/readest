import { cleanup, render, renderHook, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryFileSystem } from '@/__tests__/helpers/memoryFileSystem';
import { HlcGenerator } from '@/libs/crdt';
import { createMindmapClock } from '@/services/mindmap/file/clock';
import { mapFilePath } from '@/services/mindmap/persist/mapFile';
import {
  __resetMindmapStoreForTests,
  useMindmapStore,
} from '@/services/mindmap/persist/mindmapStore';
import { __resetMapSessionsForTests, getOpenMapSession } from '@/services/mindmap/persist/session';
import { DEFAULT_MAP_META } from '@/services/mindmap/schema/types';
import type { AppService } from '@/types/system';
import {
  type SessionState,
  useMindmapSession,
} from '@/app/reader/components/mindmap/useMindmapSession';
import { memoryAppService } from './memoryAppService';

const h = vi.hoisted(() => ({ appService: null as AppService | null, deviceId: 'device-1' }));
vi.mock('@/context/EnvContext', () => ({ useEnv: () => ({ appService: h.appService }) }));
vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: <T,>(select: (s: { settings: { replicaDeviceId?: string } }) => T) =>
    select({ settings: { replicaDeviceId: h.deviceId || undefined } }),
}));

let fs: MemoryFileSystem;

const createMap = async (title: string): Promise<string> => {
  await useMindmapStore.getState().hydrate(fs);
  const clock = createMindmapClock(new HlcGenerator('device-0'), 'device-0');
  return (
    await useMindmapStore.getState().createMap('bookhash', { ...DEFAULT_MAP_META, title }, clock)
  ).mapId;
};

const Probe = ({ mapId, onState }: { mapId: string; onState: (state: SessionState) => void }) => {
  onState(useMindmapSession('bookhash', mapId));
  return null;
};

beforeEach(() => {
  fs = new MemoryFileSystem();
  h.appService = memoryAppService(fs);
  h.deviceId = 'device-1';
  __resetMindmapStoreForTests();
});

afterEach(() => {
  cleanup();
  __resetMapSessionsForTests();
});

describe('useMindmapSession', () => {
  it('opens the map through plan 1 and closes it on unmount', async () => {
    const mapId = await createMap('One');
    const { result, unmount } = renderHook(() => useMindmapSession('bookhash', mapId));
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('open'));
    expect(getOpenMapSession(mapId)).toBeDefined();
    unmount();
    await waitFor(() => expect(getOpenMapSession(mapId)).toBeUndefined());
  });

  it('survives the StrictMode double mount with one open session', async () => {
    const mapId = await createMap('Strict');
    const states: SessionState[] = [];
    const view = render(
      <StrictMode>
        <Probe mapId={mapId} onState={(state) => states.push(state)} />
      </StrictMode>,
    );
    await waitFor(() => expect(states[states.length - 1]!.status).toBe('open'));
    const last = states[states.length - 1]!;
    expect(last.status === 'open' && getOpenMapSession(mapId) === last.session).toBe(true);
    expect(states.some((state) => state.status === 'already-open')).toBe(false);
    view.unmount();
    await waitFor(() => expect(getOpenMapSession(mapId)).toBeUndefined());
  });

  it('closes the previous map before opening the next one', async () => {
    const first = await createMap('First');
    const second = await createMap('Second');
    const { result, rerender } = renderHook(({ mapId }) => useMindmapSession('bookhash', mapId), {
      initialProps: { mapId: first },
    });
    await waitFor(() => expect(result.current.status).toBe('open'));
    rerender({ mapId: second });
    await waitFor(() => expect(getOpenMapSession(second)).toBeDefined());
    await waitFor(() => expect(getOpenMapSession(first)).toBeUndefined());
  });

  it('reports an unreadable map', async () => {
    const { result } = renderHook(() => useMindmapSession('bookhash', 'missing'));
    await waitFor(() => expect(result.current.status).toBe('unreadable'));
  });

  it('forgets the synced version of a map it cannot read so the next pull fetches it again', async () => {
    const mapId = await createMap('Broken');
    useMindmapStore.getState().setSyncedMd5(mapId, 'a'.repeat(32));
    const path = mapFilePath('bookhash', mapId);
    await fs.writeFile(path, 'Books', '{');
    await fs.removeFile(`${path}.bak`, 'Books');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { result } = renderHook(() => useMindmapSession('bookhash', mapId));
    await waitFor(() => expect(result.current.status).toBe('unreadable'));
    await waitFor(() => expect(useMindmapStore.getState().getEntry(mapId)!.syncedMd5).toBeNull());
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('cannot be read'), { mapId });
  });

  it('keeps the synced version of a map it can read', async () => {
    const mapId = await createMap('Fine');
    useMindmapStore.getState().setSyncedMd5(mapId, 'a'.repeat(32));
    const { result } = renderHook(() => useMindmapSession('bookhash', mapId));
    await waitFor(() => expect(result.current.status).toBe('open'));
    expect(useMindmapStore.getState().getEntry(mapId)!.syncedMd5).toBe('a'.repeat(32));
  });

  it('waits for the device id before opening', async () => {
    h.deviceId = '';
    const mapId = await createMap('Waiting');
    const { result } = renderHook(() => useMindmapSession('bookhash', mapId));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(result.current.status).toBe('loading');
    expect(getOpenMapSession(mapId)).toBeUndefined();
  });
});
