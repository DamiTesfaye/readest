import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MyPost, PostView, QuoteBudget } from '@/services/margins/public/api';
import type { LayerRow } from '@/services/margins/store';
import type { Anchor } from '@/services/margins/types';

const h = vi.hoisted(() => ({
  layers: [] as unknown[],
  profile: vi.fn(),
  budget: vi.fn(),
  publish: vi.fn(),
  republish: vi.fn(),
  publishSpan: vi.fn(),
  renderCard: vi.fn(async () => new Blob(['png'], { type: 'image/png' })),
  uploadCard: vi.fn(async () => 'ast_card'),
  syncMargins: vi.fn(async () => {}),
  dispatch: vi.fn(),
}));

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (s: string, opts?: Record<string, string | number>) =>
    opts ? s.replace(/\{\{(\w+)\}\}/g, (_m, key) => String(opts[key] ?? '')) : s,
}));
vi.mock('@/context/EnvContext', () => {
  const env = { envConfig: {}, appService: {} };
  return { useEnv: () => env };
});
vi.mock('@/services/ampleread/auth/session', () => ({
  getSession: async () => ({ me: { id: 'u1' } }),
}));
vi.mock('@/services/margins/store', () => ({
  openMarginsStore: async () => ({
    allLayers: async () => h.layers,
    getText: async () => ({ title: 'Meditations' }),
  }),
}));
vi.mock('@/services/margins/sync', () => ({ syncMargins: h.syncMargins }));
vi.mock('@/services/margins/assets', () => ({ assetUrl: async () => null }));
vi.mock('@/services/margins/public/publishSpan', () => ({ publishSpan: h.publishSpan }));
vi.mock('@/services/margins/public/card', () => ({
  renderCard: h.renderCard,
  uploadCard: h.uploadCard,
}));
vi.mock('@/services/margins/public/api', async (orig) => ({
  ...(await orig<typeof import('@/services/margins/public/api')>()),
  publicApi: {
    profile: h.profile,
    budget: h.budget,
    publish: h.publish,
    republish: h.republish,
    saveProfile: vi.fn(),
  },
}));
vi.mock('@/utils/event', () => ({ eventDispatcher: { dispatch: h.dispatch } }));

import PublishSheet, { MARGINS_SHORTEN_EVENT } from '@/app/reader/components/margins/PublishSheet';
import { PublicApiError } from '@/services/margins/public/api';

const row = (o: Partial<LayerRow> = {}): LayerRow => ({
  id: 'lay1',
  fileHash: 'h1',
  textId: 'txt1',
  anchor: { textId: 'txt1', quote: { exact: 'a quiet passage' } } as unknown as Anchor,
  kind: 'clip',
  payload: { v: 1, ground: 'ink', quote: { frame: {}, size: 'm' }, elements: [] },
  rev: 4,
  deleted: false,
  ...o,
});

const span = { section: 2, start: 10, end: 30, sectionLen: 900 };
const budget = (o: Partial<QuoteBudget> = {}): QuoteBudget => ({
  capped: true,
  covered: [],
  sectionLimit: 150,
  sectionCovered: 100,
  textLimit: 1000,
  textCovered: 0,
  ...o,
});
const post = { id: 'pst1' } as PostView;
const existing = { id: 'pst9', layerId: 'lay1', layerRev: 3 } as MyPost;

const open = async (r = row(), o: { existing?: MyPost | null } = {}) => {
  const onClose = vi.fn();
  const onPublished = vi.fn();
  render(
    <PublishSheet
      row={r}
      existing={o.existing ?? null}
      onClose={onClose}
      onPublished={onPublished}
    />,
  );
  await act(async () => {});
  return { onClose, onPublished };
};

const publishButton = () => screen.getByRole('button', { name: /^(Publish|Republish)$/ });
const clickPublish = async () => {
  await act(async () => fireEvent.click(publishButton()));
};

beforeEach(() => {
  vi.clearAllMocks();
  h.layers = [row()];
  h.profile.mockResolvedValue({ handle: 'reader_1', displayName: 'R', handleChangedAt: '' });
  h.budget.mockResolvedValue(budget());
  h.publishSpan.mockResolvedValue(span);
  h.publish.mockResolvedValue(post);
  h.republish.mockResolvedValue(post);
});

afterEach(cleanup);

describe('PublishSheet', () => {
  it('opens the handle sheet first without a profile', async () => {
    h.profile.mockResolvedValue(null);
    await open();
    screen.getByLabelText('Handle');
    expect(screen.queryByRole('button', { name: 'Publish' })).toBeNull();
  });

  it('publishes only after the outbox drains', async () => {
    h.layers = [row({ rev: 5 })];
    await open(row({ rev: null }));
    expect(h.syncMargins).toHaveBeenCalled();
    await clickPublish();
    expect(h.publish).toHaveBeenCalledWith(expect.objectContaining({ layerRev: 5 }));
  });

  it('publishes the synced rev when an edit is still queued', async () => {
    h.layers = [row({ rev: 6 })];
    await open(row({ rev: 4 }));
    expect(h.syncMargins).toHaveBeenCalled();
    await clickPublish();
    expect(h.publish).toHaveBeenCalledWith(expect.objectContaining({ layerRev: 6 }));
  });

  it('asks to sync when the Margin still has no rev', async () => {
    h.layers = [row({ rev: null })];
    await open(row({ rev: null }));
    screen.getByText('Sync this Margin before publishing.');
    expect(publishButton()).toHaveProperty('disabled', true);
  });

  it('counts the allowance left on the chapter, then on the book', async () => {
    await open();
    screen.getByText('30 characters left on this chapter');
    cleanup();
    h.budget.mockResolvedValue(budget({ textCovered: 960 }));
    await open();
    screen.getByText('20 characters left on this book');
  });

  it('refuses a passage over the limit and offers Shorten the Clip', async () => {
    h.budget.mockResolvedValue(budget({ textCovered: 990 }));
    const { onClose } = await open();
    expect(screen.getByText('0 characters left on this book').className).toContain('text-error');
    screen.getByText(
      "This passage would go over the book's public quote limit. Choose a shorter or already-quoted passage.",
    );
    expect(publishButton()).toHaveProperty('disabled', true);
    fireEvent.click(screen.getByRole('button', { name: 'Shorten the Clip' }));
    expect(onClose).toHaveBeenCalled();
    expect(h.dispatch).toHaveBeenCalledWith(MARGINS_SHORTEN_EVENT, { layerId: 'lay1' });
  });

  it('refuses a long quote on a capped Text', async () => {
    const anchor = { textId: 'txt1', quote: { head: 'a', tail: 'b', len: 900 } };
    h.layers = [row({ anchor: anchor as unknown as Anchor })];
    await open(row({ anchor: anchor as unknown as Anchor }));
    screen.getByText('Public Margins quote at most 300 characters. Shorten the Clip.');
    screen.getByRole('button', { name: 'Shorten the Clip' });
    expect(screen.queryByText(/characters left/)).toBeNull();
    expect(publishButton()).toHaveProperty('disabled', true);
  });

  it.each([
    ['excerpt_too_long', 422, 'Public Margins quote at most 300 characters. Shorten the Clip.'],
    ['invalid_anchor', 422, "This Margin's passage changed. Open the book and save it again."],
    ['publish_limit', 429, "You've reached today's publishing limit."],
  ])('shows the copy for %s', async (code, status, copy) => {
    h.publish.mockRejectedValue(new PublicApiError(status, code, null, null));
    await open();
    await clickPublish();
    screen.getByText(copy);
  });

  it('shows how long publishing is suspended', async () => {
    h.publish.mockRejectedValue(
      new PublicApiError(403, 'publishing_suspended', { until: null }, null),
    );
    await open();
    await clickPublish();
    screen.getByText('Publishing is suspended on this account permanently.');
    cleanup();
    const until = '2026-11-01T00:00:00Z';
    h.publish.mockRejectedValue(new PublicApiError(403, 'publishing_suspended', { until }, null));
    await open();
    await clickPublish();
    screen.getByText(
      `Publishing is suspended on this account until ${new Date(until).toLocaleDateString()}.`,
    );
  });

  it('republishes against the existing post', async () => {
    await open(row(), { existing });
    expect(h.budget).toHaveBeenCalledWith('txt1', 2, 900, 'pst9');
    await clickPublish();
    expect(h.republish).toHaveBeenCalledWith('pst9', expect.objectContaining({ layerId: 'lay1' }));
  });

  it('refreshes the counter when the crowd cap fills, without retrying', async () => {
    h.publish.mockRejectedValue(
      new PublicApiError(409, 'crowd_cap_reached', { textRemaining: 5, sectionRemaining: 0 }, null),
    );
    await open();
    h.budget.mockResolvedValue(budget({ sectionCovered: 150 }));
    await clickPublish();
    expect(h.budget).toHaveBeenCalledTimes(2);
    expect(h.publish).toHaveBeenCalledTimes(1);
    screen.getByText('0 characters left on this chapter');
    expect(publishButton()).toHaveProperty('disabled', true);
  });

  it('syncs on post_stale and offers Publish again', async () => {
    h.publish.mockRejectedValueOnce(new PublicApiError(409, 'post_stale', null, null));
    h.layers = [row({ rev: 7 })];
    await open();
    await clickPublish();
    expect(h.syncMargins).toHaveBeenCalled();
    expect(publishButton()).toHaveProperty('disabled', false);
    await clickPublish();
    expect(h.publish).toHaveBeenLastCalledWith(expect.objectContaining({ layerRev: 7 }));
    expect(h.renderCard).toHaveBeenCalledTimes(1);
    expect(h.uploadCard).toHaveBeenCalledTimes(1);
  });

  it('renders and uploads the card once, then publishes the scalar span', async () => {
    const { onClose, onPublished } = await open();
    await clickPublish();
    expect(h.renderCard).toHaveBeenCalledWith(
      expect.objectContaining({
        quote: 'a quiet passage',
        handle: 'reader_1',
        bookTitle: 'Meditations',
        ground: 'ink',
        art: [],
      }),
    );
    expect(h.uploadCard).toHaveBeenCalledTimes(1);
    expect(h.publish).toHaveBeenCalledWith({
      layerId: 'lay1',
      layerRev: 4,
      cardAsset: 'ast_card',
      ...span,
    });
    expect(onPublished).toHaveBeenCalledWith(post);
    expect(onClose).toHaveBeenCalled();
  });

  it('shows no counter on an uncapped Text', async () => {
    h.budget.mockResolvedValue({ capped: false });
    await open();
    expect(screen.queryByText(/characters left/)).toBeNull();
    expect(publishButton()).toHaveProperty('disabled', false);
  });

  it('asks to open the book without a publish span', async () => {
    h.publishSpan.mockResolvedValue(null);
    await open();
    screen.getByText('Open this book to publish this Margin.');
    expect(publishButton()).toHaveProperty('disabled', true);
  });
});
