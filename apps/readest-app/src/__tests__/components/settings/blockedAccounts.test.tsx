import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  on: true,
  blocks: vi.fn(),
  unblock: vi.fn(async () => {}),
  hiddenBooks: vi.fn(),
  unhideBook: vi.fn(async () => {}),
}));

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (s: string, opts?: Record<string, string | number>) =>
    opts ? s.replace(/\{\{(\w+)\}\}/g, (_m, key) => String(opts[key] ?? '')) : s,
}));
vi.mock('@/services/margins/public/flag', () => ({ useMarginsPublic: () => h.on }));
vi.mock('@/services/margins/public/social', () => ({
  socialApi: {
    blocks: h.blocks,
    unblock: h.unblock,
    hiddenBooks: h.hiddenBooks,
    unhideBook: h.unhideBook,
  },
}));

import BlockedAccounts from '@/components/settings/integrations/BlockedAccounts';

const show = async () => {
  render(<BlockedAccounts />);
  await act(async () => {});
};

beforeEach(() => {
  vi.clearAllMocks();
  h.on = true;
  h.blocks.mockResolvedValue([
    { handle: 'creator_b', displayName: 'Creator B' },
    { handle: 'creator_c', displayName: 'Creator C' },
  ]);
  h.hiddenBooks.mockResolvedValue([
    { textId: 'txt_1', title: 'Meditations' },
    { textId: 'txt_2', title: null },
  ]);
});
afterEach(cleanup);

describe('BlockedAccounts', () => {
  it('lists blocked accounts and unblocks one', async () => {
    await show();
    const list = within(screen.getByRole('list', { name: 'Blocked accounts' }));
    list.getByText('@creator_b');
    list.getByText('Creator C');
    await act(async () =>
      fireEvent.click(list.getByRole('button', { name: 'Unblock @creator_b' })),
    );
    expect(h.unblock).toHaveBeenCalledWith('creator_b');
    expect(list.queryByText('@creator_b')).toBeNull();
    list.getByText('@creator_c');
  });

  it("says you haven't blocked anyone", async () => {
    h.blocks.mockResolvedValue([]);
    await show();
    screen.getByText("You haven't blocked anyone");
  });

  it('lists hidden books below and shows one again', async () => {
    await show();
    const blocked = screen.getByRole('list', { name: 'Blocked accounts' });
    const hidden = screen.getByRole('list', { name: 'Hidden books' });
    expect(blocked.compareDocumentPosition(hidden) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const rows = within(hidden);
    rows.getByText('Meditations');
    rows.getByText('Untitled book');
    await act(async () => fireEvent.click(rows.getAllByRole('button', { name: 'Show again' })[0]!));
    expect(h.unhideBook).toHaveBeenCalledWith('txt_1');
    expect(rows.queryByText('Meditations')).toBeNull();
  });

  it('keeps a row and says so when the change fails', async () => {
    h.unblock.mockRejectedValueOnce(new Error('offline'));
    await show();
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Unblock @creator_b' })),
    );
    screen.getByText('@creator_b');
    screen.getByRole('alert');
  });

  it('shows nothing while the flag is off', async () => {
    h.on = false;
    await show();
    expect(screen.queryByRole('list')).toBeNull();
    expect(h.blocks).not.toHaveBeenCalled();
  });
});
