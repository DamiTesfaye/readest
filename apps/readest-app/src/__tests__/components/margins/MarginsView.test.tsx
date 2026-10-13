import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LayerRow } from '@/services/margins/store';
import type { Anchor } from '@/services/margins/types';

const h = vi.hoisted(() => ({
  rows: [] as LayerRow[],
  session: null as unknown,
  library: [] as { hash: string; title: string; coverImageUrl?: string }[],
  scheduleDelete: vi.fn(() => ({ undo: vi.fn(), flush: vi.fn() })),
  flag: false,
}));

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (s: string, opts?: Record<string, string | number>) =>
    opts ? s.replace(/\{\{(\w+)\}\}/g, (_m, key) => String(opts[key] ?? '')) : s,
}));
vi.mock('@/hooks/useTranslator', () => ({ useTranslator: () => ({ translate: vi.fn() }) }));
vi.mock('@/context/EnvContext', () => {
  const env = { appService: {} };
  return { useEnv: () => env };
});
vi.mock('@/services/ampleread/auth/session', () => ({ getSession: async () => h.session }));
vi.mock('@/services/margins/store', () => ({
  openMarginsStore: async () => ({
    allLayers: async () => h.rows,
    getText: async (id: string) =>
      id === 'txt_m1' || id === 'txt_m2'
        ? { title: 'Meditations', familyId: 'fam_m', capped: false }
        : null,
    fileForText: async () => null,
    getAsset: async () => null,
    assetByRemote: async () => null,
  }),
}));
vi.mock('@/services/margins/margins', () => ({
  hiddenMargins: () => new Set(),
  onMarginsChanged: () => () => {},
  scheduleDelete: h.scheduleDelete,
  editMargin: vi.fn(),
}));
vi.mock('@/store/libraryStore', () => {
  const useLibraryStore = (sel: (s: { library: typeof h.library }) => unknown) =>
    sel({ library: h.library });
  return { useLibraryStore };
});

vi.mock('@/services/margins/public/flag', () => ({ useMarginsPublic: () => h.flag }));
vi.mock('@/services/margins/public/api', async (orig) => ({
  ...(await orig<typeof import('@/services/margins/public/api')>()),
  publicApi: { myPosts: async () => [] },
}));

import MarginsView from '@/app/library/components/MarginsView';
import { MARGINS_PUBLISH_EVENT } from '@/app/reader/components/margins/PublishSheet';
import { eventDispatcher } from '@/utils/event';

const row = (id: string, createdAt: number, o: Partial<LayerRow> = {}): LayerRow => ({
  id,
  fileHash: 'alice',
  textId: null,
  anchor: { quote: { exact: `quote ${id}` } } as unknown as Anchor,
  kind: 'note',
  payload: { v: 1, ground: 'paper', quote: { frame: {}, size: 'm' }, elements: [] },
  rev: 1,
  deleted: false,
  createdAt,
  ...o,
});

const renderView = async () => {
  const onOpenMargin = vi.fn();
  render(<MarginsView onOpenMargin={onOpenMargin} />);
  await act(async () => {});
  return { onOpenMargin };
};

beforeEach(() => {
  h.rows = [
    row('a2', 5),
    row('m1', 4, { fileHash: 'med-se', textId: 'txt_m1' }),
    row('a1', 3),
    row('m2', 2, { fileHash: 'med-pg', textId: 'txt_m2' }),
  ];
  h.session = { me: { id: 'u1' } };
  h.library = [{ hash: 'alice', title: 'Alice in Wonderland', coverImageUrl: 'blob:alice' }];
  h.flag = false;
  vi.clearAllMocks();
});

afterEach(cleanup);

describe('MarginsView', () => {
  it('groups Margins by family, newest first, with the title, cover and count', async () => {
    await renderView();
    const groups = screen.getAllByRole('region');
    expect(groups.map((g) => g.getAttribute('aria-label'))).toEqual([
      'Alice in Wonderland',
      'Meditations',
    ]);
    within(groups[0]!).getByText('2 Margins');
    expect(groups[0]!.querySelector('img')?.getAttribute('src')).toBe('blob:alice');
    const quotes = within(groups[0]!)
      .getAllByRole('listitem')
      .map((li) => li.textContent?.match(/quote (a\d)/)?.[1]);
    expect(quotes).toEqual(['a2', 'a1']);
    within(groups[1]!).getByText('2 Margins');
  });

  it('opens a Margin in its book, or disables it when the book is not here', async () => {
    const { onOpenMargin } = await renderView();
    const alice = screen.getAllByRole('region')[0]!;
    fireEvent.click(within(alice).getAllByRole('button', { name: 'Open in book' })[0]!);
    expect(onOpenMargin).toHaveBeenCalledWith(expect.objectContaining({ id: 'a2' }), 'alice');
    const med = screen.getAllByRole('region')[1]!;
    const open = within(med).getAllByRole<HTMLButtonElement>('button', { name: 'Open in book' });
    expect(open.every((b) => b.disabled)).toBe(true);
    expect(
      within(med).getAllByText('Add this book to your library to see the full passage.'),
    ).toHaveLength(2);
  });

  it('opens Compose from Edit and deletes through scheduleDelete', async () => {
    await renderView();
    const alice = screen.getAllByRole('region')[0]!;
    await act(async () =>
      fireEvent.click(within(alice).getAllByRole('button', { name: 'Edit' })[0]!),
    );
    screen.getByRole('dialog', { name: 'Compose Margin' });
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    await act(async () =>
      fireEvent.click(within(alice).getAllByRole('button', { name: 'Delete' })[0]!),
    );
    expect(h.scheduleDelete).toHaveBeenCalledWith(expect.anything(), 'a2');
  });

  it('shows the banner when signed out', async () => {
    h.session = null;
    await renderView();
    screen.getByText('Sign in to keep your Margins on all your devices.');
  });

  it('offers Publish on each Margin only while the flag is on', async () => {
    await renderView();
    expect(screen.queryByRole('button', { name: 'Publish' })).toBeNull();
    cleanup();
    h.flag = true;
    const spy = vi.spyOn(eventDispatcher, 'dispatch');
    await renderView();
    const alice = screen.getAllByRole('region')[0]!;
    fireEvent.click(within(alice).getAllByRole('button', { name: 'Publish' })[0]!);
    expect(spy).toHaveBeenCalledWith(MARGINS_PUBLISH_EVENT, { layerId: 'a2' });
    spy.mockRestore();
  });
});
