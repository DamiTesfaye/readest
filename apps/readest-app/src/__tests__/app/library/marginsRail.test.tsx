import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LayerRow } from '@/services/margins/store';
import type { Anchor } from '@/services/margins/types';

const h = vi.hoisted(() => ({
  rows: [] as LayerRow[],
  session: null as unknown,
  library: [] as { hash: string; title: string }[],
  listeners: new Set<() => void>(),
}));

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (s: string, opts?: Record<string, string | number>) =>
    opts ? s.replace(/\{\{(\w+)\}\}/g, (_m, key) => String(opts[key] ?? '')) : s,
}));
vi.mock('@/context/EnvContext', () => {
  const env = { appService: {} };
  return { useEnv: () => env };
});
vi.mock('@/services/ampleread/auth/session', () => ({ getSession: async () => h.session }));
vi.mock('@/services/margins/store', () => ({
  openMarginsStore: async () => ({
    allLayers: async () => h.rows,
    getText: async (id: string) => (id === 'txt_m' ? { title: 'Meditations' } : null),
    fileForText: async () => null,
  }),
}));
vi.mock('@/services/margins/margins', () => ({
  hiddenMargins: () => new Set(),
  onMarginsChanged: (l: () => void) => {
    h.listeners.add(l);
    return () => h.listeners.delete(l);
  },
}));
vi.mock('@/services/margins/public/flag', () => ({ useMarginsPublic: () => false }));
vi.mock('next/navigation', () => ({ useRouter: () => ({}) }));
vi.mock('@/store/libraryStore', () => {
  const useLibraryStore = (sel: (s: { library: typeof h.library }) => unknown) =>
    sel({ library: h.library });
  return { useLibraryStore };
});

import { MarginsRail, RAIL_LIMIT } from '@/app/library/components/MarginsRail';

const row = (id: string, createdAt: number, o: Partial<LayerRow> = {}): LayerRow => ({
  id,
  fileHash: 'alice',
  textId: null,
  anchor: { quote: { exact: `quote ${id}` } } as unknown as Anchor,
  kind: 'note',
  payload: {},
  rev: 1,
  deleted: false,
  createdAt,
  ...o,
});

const renderRail = async () => {
  const props = { onSeeAll: vi.fn(), onOpenMargin: vi.fn() };
  render(<MarginsRail {...props} />);
  await act(async () => {});
  return props;
};

beforeEach(() => {
  h.rows = [];
  h.session = { me: { id: 'u1' } };
  h.library = [{ hash: 'alice', title: 'Alice in Wonderland' }];
  h.listeners.clear();
});

afterEach(cleanup);

describe('MarginsRail', () => {
  it('is an aside named Your Margins with that heading', async () => {
    await renderRail();
    const aside = screen.getByRole('complementary', { name: 'Your Margins' });
    within(aside).getByRole('heading', { name: 'Your Margins' });
  });

  it('lists at most eight, newest first, with title, quote and lead kind', async () => {
    h.rows = Array.from({ length: 10 }, (_, i) => row(`m${i}`, 100 - i));
    expect(RAIL_LIMIT).toBe(8);
    await renderRail();
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(8);
    within(items[0]!).getByText('Alice in Wonderland');
    within(items[0]!).getByText('quote m0');
    within(items[0]!).getByText('Note');
  });

  it('opens a Margin, and disables one whose book is not in the library', async () => {
    h.rows = [
      row('here', 2),
      row('away', 1, {
        fileHash: 'other',
        textId: 'txt_m',
        anchor: { quote: { head: 'Begin', tail: 'end', len: 900, spanHash: 'x' } } as never,
      }),
    ];
    const props = await renderRail();
    fireEvent.click(screen.getByRole('button', { name: /quote here/ }));
    expect(props.onOpenMargin).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'here' }),
      'alice',
    );
    const away = screen.getByRole('button', { name: /Begin … end/ });
    expect(away.getAttribute('aria-disabled')).toBe('true');
    within(away).getByText('Meditations');
    screen.getByText('Add this book to your library to see the full passage.');
    fireEvent.click(away);
    expect(props.onOpenMargin).toHaveBeenCalledTimes(1);
  });

  it('shows See all only when there are Margins', async () => {
    const empty = await renderRail();
    expect(screen.queryByRole('button', { name: 'See all' })).toBeNull();
    screen.getByText('Your Margins show up here. Select a passage in a book and choose Margin.');
    expect(empty.onSeeAll).not.toHaveBeenCalled();
    cleanup();
    h.rows = [row('m', 1)];
    const props = await renderRail();
    fireEvent.click(screen.getByRole('button', { name: 'See all' }));
    expect(props.onSeeAll).toHaveBeenCalledTimes(1);
  });

  it('shows the sign-in foot card only when signed out', async () => {
    await renderRail();
    expect(screen.queryByText('Sign in to keep your Margins on all your devices.')).toBeNull();
    cleanup();
    h.session = null;
    await renderRail();
    screen.getByText('Sign in to keep your Margins on all your devices.');
  });

  it('re-reads when Margins change', async () => {
    h.rows = [row('old', 1)];
    await renderRail();
    h.rows = [row('new', 2), row('old', 1)];
    await act(async () => {
      for (const l of h.listeners) l();
    });
    expect(within(screen.getAllByRole('listitem')[0]!).getByText('quote new')).toBeTruthy();
  });
});
