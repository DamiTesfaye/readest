import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PostView } from '@/services/margins/public/api';
import { packScene } from '@/services/margins/replay/scene';
import type { Scene } from '@/services/margins/replay/types';
import { eventDispatcher } from '@/utils/event';

const h = vi.hoisted(() => ({
  postAsset: vi.fn(),
  postAssetUrl: vi.fn(async () => 'blob:cover'),
  mute: vi.fn(async () => {}),
  ownerPassage: vi.fn(async () => null as string | null),
  follow: vi.fn(async () => {}),
  block: vi.fn(async () => {}),
  hideBook: vi.fn(async () => {}),
  toast: vi.fn(),
}));
vi.mock('@/services/margins/public/social', () => ({
  socialApi: { follow: h.follow, block: h.block, hideBook: h.hideBook },
}));

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (s: string, opts?: Record<string, string | number>) =>
    opts ? s.replace(/\{\{(\w+)\}\}/g, (_m, key) => String(opts[key] ?? '')) : s,
}));
vi.mock('@/context/EnvContext', () => {
  const env = { envConfig: {}, appService: {} };
  return { useEnv: () => env };
});
vi.mock('@/store/libraryStore', () => {
  const state = { library: [{ hash: 'h1' }] };
  const useLibraryStore = (sel: (s: typeof state) => unknown) => sel(state);
  return { useLibraryStore };
});
vi.mock('@/services/margins/store', () => ({ openMarginsStore: async () => ({}) }));
vi.mock('@/services/margins/marginsClient', () => ({ getMarginsCore: () => ({}) }));
vi.mock('@/services/margins/replay/material', async (orig) => ({
  ...(await orig<typeof import('@/services/margins/replay/material')>()),
  ownerPassage: h.ownerPassage,
}));
vi.mock('@/services/margins/public/api', async (orig) => ({
  ...(await orig<typeof import('@/services/margins/public/api')>()),
  publicApi: { postAsset: h.postAsset, postAssetUrl: h.postAssetUrl, mute: h.mute },
}));
vi.mock('@/components/margins/feed/ReplayPlayer', () => ({
  default: (p: { material: { kind: string }; coverUrl: string | null; citation: string }) => (
    <div data-testid='player' data-material={p.material.kind} data-cover={p.coverUrl}>
      {p.citation}
    </div>
  ),
}));

vi.mock('@/components/margins/feed/GetBookSheet', () => ({
  default: (p: { onTap(): void }) => (
    <div role='dialog' aria-label='Get this book'>
      <button type='button' onClick={p.onTap}>
        Open at this page
      </button>
    </div>
  ),
}));
vi.mock('@/components/margins/feed/ProfileSheet', () => ({
  default: (p: { handle: string; onClose(): void }) => (
    <div role='dialog' aria-label={`profile ${p.handle}`}>
      <button type='button' onClick={p.onClose}>
        Close profile
      </button>
    </div>
  ),
}));

import FeedCard from '@/components/margins/feed/FeedCard';

const scene: Scene = {
  v: 1,
  page: { w: 20, h: 30, columns: 1, gutter: 0, font: 'serif', size: 1 },
  lines: [{ y: 1, base: 0.8, boxes: [[0, 2, 1]] }],
  passage: { start: 0, end: 4, boxes: [0, 1] },
  seed: 1,
  step_hz: 120,
  events: [],
  checkpoints: [],
  sfx: [],
  cover_step: 0,
};

let n = 0;
const post = (o: Partial<PostView> = {}): PostView =>
  ({
    id: `pst${++n}`,
    author: { handle: 'reader_1', displayName: 'Reader One' },
    textId: 'txt1',
    quote: 'a quiet passage',
    display: 'quote',
    citation: { percent: 12 },
    book: { title: 'Meditations', author: 'Marcus Aurelius', workId: null, capped: true },
    payload: { v: 1, ground: 'paper', quote: { frame: {}, size: 'm' }, elements: [] },
    sceneAsset: null,
    coverAsset: null,
    mine: false,
    ...o,
  }) as PostView;

const handlers = () => ({
  onUnmute: vi.fn(),
  onMute: vi.fn(),
  onHidden: vi.fn(),
  onOpenBook: vi.fn(),
  onEngage: vi.fn(),
});

const show = async (p: PostView, o: { signedIn?: boolean; muted?: boolean } = {}) => {
  const on = handlers();
  render(
    <FeedCard
      post={p}
      active
      muted={o.muted ?? true}
      reduced={false}
      signedIn={o.signedIn ?? true}
      {...on}
    />,
  );
  await act(async () => {});
  return on;
};

const follows = (a: Element, b: Element) =>
  !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

beforeEach(() => {
  vi.clearAllMocks();
  h.postAsset.mockResolvedValue(new Blob([packScene(scene) as Uint8Array<ArrayBuffer>]));
});
afterEach(cleanup);

describe('FeedCard', () => {
  it('stacks the creator chip, the player, the citation and the action rail', async () => {
    await show(post({ sceneAsset: 'ast_s', coverAsset: 'ast_c', display: 'shape' }));
    const chip = screen.getByText('@reader_1');
    screen.getByText('Reader One');
    const player = screen.getByTestId('player');
    const citation = screen.getByRole('button', { name: /Meditations/ });
    const share = screen.getByRole('button', { name: 'Share' });
    screen.getByRole('button', { name: 'Report' });
    screen.getByRole('button', { name: 'More' });
    expect(follows(chip, player) && follows(player, citation) && follows(citation, share)).toBe(
      true,
    );
    expect(player.dataset['cover']).toBe('blob:cover');
    expect(h.postAsset).toHaveBeenCalledWith(expect.stringMatching(/^pst/), 'ast_s');
  });

  it('follows from the chip with the card post, and offers no Follow on your own post', async () => {
    const p = post({ following: false });
    await show(p);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Follow' })));
    expect(h.follow).toHaveBeenCalledWith('reader_1', p.id);
    screen.getByRole('button', { name: 'Following' });
    cleanup();
    await show(post({ mine: true }));
    expect(screen.queryByRole('button', { name: 'Follow' })).toBeNull();
  });

  it('opens the creator profile from the chip', async () => {
    await show(post());
    fireEvent.click(screen.getByRole('button', { name: /Reader One/ }));
    screen.getByRole('dialog', { name: 'profile reader_1' });
    fireEvent.click(screen.getByRole('button', { name: 'Close profile' }));
    expect(screen.queryByRole('dialog', { name: 'profile reader_1' })).toBeNull();
  });

  it('keeps Mute in More for signed-in viewers', async () => {
    const p = post();
    const on = await show(p);
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Mute @reader_1' })));
    expect(h.mute).toHaveBeenCalledWith('reader_1');
    expect(on.onHidden).toHaveBeenCalledWith(p, 'creator');
    cleanup();
    await show(post(), { signedIn: false });
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    expect(screen.queryByRole('button', { name: /^Mute @/ })).toBeNull();
  });

  it('blocks the creator from More after a confirm', async () => {
    const p = post();
    const on = await show(p);
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    fireEvent.click(screen.getByRole('button', { name: 'Block @reader_1' }));
    screen.getByText("Block @reader_1? You won't see each other's Margins.");
    expect(h.block).not.toHaveBeenCalled();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Block' })));
    expect(h.block).toHaveBeenCalledWith('reader_1');
    expect(on.onHidden).toHaveBeenCalledWith(p, 'creator');
  });

  it('hides the book from More', async () => {
    const p = post();
    const on = await show(p);
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Hide this book' })));
    expect(h.hideBook).toHaveBeenCalledWith('txt1');
    expect(on.onHidden).toHaveBeenCalledWith(p, 'book');
  });

  it('asks a signed-out viewer to sign in instead of blocking or hiding', async () => {
    eventDispatcher.on('toast', h.toast);
    const on = await show(post(), { signedIn: false });
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    fireEvent.click(screen.getByRole('button', { name: 'Block @reader_1' }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Hide this book' })));
    eventDispatcher.off('toast', h.toast);
    expect(screen.queryByText(/You won't see each other's Margins/)).toBeNull();
    expect(h.block).not.toHaveBeenCalled();
    expect(h.hideBook).not.toHaveBeenCalled();
    expect(on.onHidden).not.toHaveBeenCalled();
    expect(h.toast).toHaveBeenCalledTimes(2);
    expect(h.toast.mock.calls[0]![0].detail).toMatchObject({
      message: 'Sign in to block or hide Margins',
    });
  });

  it('offers no Block or Hide on your own post', async () => {
    await show(post({ mine: true }));
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    expect(screen.queryByRole('button', { name: /^Block/ })).toBeNull();
    screen.getByRole('button', { name: 'Hide this book' });
  });

  it('shows the art and the quote for a quote post with no scene', async () => {
    await show(post());
    screen.getByText('a quiet passage');
    expect(screen.queryByTestId('player')).toBeNull();
  });

  it.each([
    'shape',
    'art',
  ] as const)('shows the art and the citation, never the quote, for a %s post with no scene', async (display) => {
    await show(post({ display, quote: null }));
    expect(screen.queryByText('a quiet passage')).toBeNull();
    screen.getByRole('button', { name: /Meditations · Marcus Aurelius · 12%/ });
  });

  it('opens This Book from the citation chip', async () => {
    const p = post();
    const on = await show(p);
    fireEvent.click(screen.getByRole('button', { name: /Meditations/ }));
    expect(on.onOpenBook).toHaveBeenCalledWith(p);
  });

  it('opens Get this book from the book chip and counts each tap', async () => {
    const p = post();
    const on = await show(p);
    fireEvent.click(screen.getByRole('button', { name: 'Get this book' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open at this page' }));
    expect(on.onEngage).toHaveBeenCalledWith(p, 'get_book');
  });

  it('unmutes and mutes the feed', async () => {
    let on = await show(post());
    fireEvent.click(screen.getByRole('button', { name: 'Unmute' }));
    expect(on.onUnmute).toHaveBeenCalled();
    cleanup();
    on = await show(post(), { muted: false });
    fireEvent.click(screen.getByRole('button', { name: 'Mute' }));
    expect(on.onMute).toHaveBeenCalled();
  });

  it("plays the reader's own words when their library holds the book", async () => {
    h.ownerPassage.mockResolvedValue('quiet');
    await show(post({ sceneAsset: 'ast_s', display: 'shape', quote: null }));
    expect(screen.getByTestId('player').dataset['material']).toBe('owner');
    expect(h.ownerPassage).toHaveBeenCalledWith(expect.objectContaining({ libraryHashes: ['h1'] }));
    cleanup();
    h.ownerPassage.mockClear();
    await show(post({ sceneAsset: 'ast_s', display: 'shape', quote: null }), { signedIn: false });
    expect(screen.getByTestId('player').dataset['material']).toBe('ghost');
    expect(h.ownerPassage).not.toHaveBeenCalled();
  });
});
