import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryFileSystem } from '@/__tests__/helpers/memoryFileSystem';
import { HlcGenerator } from '@/libs/crdt';
import { createMindmapClock } from '@/services/mindmap/file/clock';
import { MINDMAP_BASE_DIR, mapFilePath } from '@/services/mindmap/persist/mapFile';
import {
  __resetMindmapStoreForTests,
  useMindmapStore,
} from '@/services/mindmap/persist/mindmapStore';
import { decodeMeta } from '@/services/mindmap/schema/validate';
import { useMindmapViewStore } from '@/store/mindmapViewStore';
import type { AppService } from '@/types/system';
import { memoryAppService } from './memoryAppService';

const h = vi.hoisted(() => ({
  appService: null as AppService | null,
  token: null as string | null,
  tokenReady: Promise.resolve(),
  plan: 'free',
  push: vi.fn(),
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
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: h.push }) }));
vi.mock('@/context/EnvContext', () => ({ useEnv: () => ({ appService: h.appService }) }));
vi.mock('@/utils/access', () => ({
  getAccessToken: async () => {
    await h.tokenReady;
    return h.token;
  },
  getUserProfilePlan: () => h.plan,
}));
vi.mock('@/store/bookDataStore', () => {
  const state = { getBookData: () => ({ book: { hash: 'bookhash', title: 'Emma' } }) };
  return {
    useBookDataStore: Object.assign(<T,>(select: (s: typeof state) => T) => select(state), {
      getState: () => state,
    }),
  };
});
vi.mock('@/store/readerStore', () => ({
  useReaderStore: { getState: () => ({ getProgress: () => ({ fraction: 0.4 }) }) },
}));
vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: <T,>(select: (s: { settings: { replicaDeviceId: string } }) => T) =>
    select({ settings: { replicaDeviceId: 'device-1' } }),
}));

const { default: NewMapSheet } = await import('@/app/reader/components/mindmap/NewMapSheet');

let fs: MemoryFileSystem;

beforeEach(() => {
  fs = new MemoryFileSystem();
  h.appService = memoryAppService(fs);
  h.token = null;
  h.tokenReady = Promise.resolve();
  h.plan = 'free';
  __resetMindmapStoreForTests();
  useMindmapViewStore.getState().showSheet('bookhash-1');
});

afterEach(() => {
  cleanup();
  useMindmapViewStore.getState().close();
});

const createExisting = async (count: number) => {
  await useMindmapStore.getState().hydrate(fs);
  const clock = createMindmapClock(new HlcGenerator('device-0'), 'device-0');
  for (let i = 0; i < count; i += 1) {
    await useMindmapStore.getState().createMap(
      'bookhash',
      {
        title: `Map ${i}`,
        intent: 'adaptive',
        spoiler: 'adaptive',
        style: 'sticker',
        camera: { x: 0, y: 0, z: 1 },
        lastSeenProgress: 0,
        source: 'blank',
      },
      clock,
    );
  }
};

describe('NewMapSheet', () => {
  it('writes the first map file with the chosen options and opens it', async () => {
    render(<NewMapSheet bookKey='bookhash-1' />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), {
      target: { value: 'Characters' },
    });
    fireEvent.click(screen.getByRole('radio', { name: 'Blank canvas' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Style' }), {
      target: { value: 'paper' },
    });
    fireEvent.change(screen.getByRole('combobox', { name: 'Intent' }), {
      target: { value: 'story' },
    });
    const create = screen.getByRole('button', { name: 'Create map' }) as HTMLButtonElement;
    await waitFor(() => expect(create.disabled).toBe(false));
    await act(async () => {
      fireEvent.click(create);
    });
    await waitFor(() => expect(useMindmapViewStore.getState().mapId).not.toBeNull());
    const { mapId, sheetOpen, bookKey } = useMindmapViewStore.getState();
    expect(sheetOpen).toBe(false);
    expect(bookKey).toBe('bookhash-1');
    const text = await fs.readFile(mapFilePath('bookhash', mapId!), MINDMAP_BASE_DIR);
    const meta = decodeMeta(JSON.parse(text).meta);
    expect(meta).toMatchObject({
      title: 'Characters',
      source: 'blank',
      style: 'paper',
      intent: 'story',
      spoiler: 'adaptive',
      lastSeenProgress: 0.4,
    });
  });

  it('shows the existing upsell instead of the form at the free limit', async () => {
    await createExisting(3);
    render(<NewMapSheet bookKey='bookhash-1' />);
    expect(await screen.findByTestId('mm-map-limit')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Upgrade to Readest Premium' }));
    expect(h.push).toHaveBeenCalledWith('/user');
    expect(useMindmapStore.getState().entriesForBook('bookhash')).toHaveLength(3);
  });

  it('lets paid plans create past the free limit', async () => {
    await createExisting(3);
    h.token = 'token';
    h.plan = 'plus';
    render(<NewMapSheet bookKey='bookhash-1' />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create map' })).toBeTruthy());
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Create map' }));
    });
    await waitFor(() =>
      expect(useMindmapStore.getState().entriesForBook('bookhash')).toHaveLength(4),
    );
  });

  it('keeps Create disabled until the plan is known', async () => {
    let release = (): void => undefined;
    h.tokenReady = new Promise<void>((resolve) => {
      release = resolve;
    });
    render(<NewMapSheet bookKey='bookhash-1' />);
    const create = screen.getByRole('button', { name: 'Create map' }) as HTMLButtonElement;
    expect(create.disabled).toBe(true);
    await act(async () => release());
    await waitFor(() => expect(create.disabled).toBe(false));
  });

  it('closes without creating anything on cancel', () => {
    render(<NewMapSheet bookKey='bookhash-1' />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(useMindmapViewStore.getState().sheetOpen).toBe(false);
    expect(useMindmapViewStore.getState().bookKey).toBeNull();
  });
});
