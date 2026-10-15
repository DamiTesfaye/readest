import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PostView } from '@/services/margins/public/api';
import { eventDispatcher } from '@/utils/event';

const h = vi.hoisted(() => ({
  postAssetUrl: vi.fn(async () => 'blob:art'),
  mute: vi.fn(async () => {}),
  report: vi.fn(async () => {}),
  sharePost: vi.fn(async () => 'copied'),
}));

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (s: string, opts?: Record<string, string | number>) =>
    opts ? s.replace(/\{\{(\w+)\}\}/g, (_m, key) => String(opts[key] ?? '')) : s,
}));
vi.mock('@/context/EnvContext', () => {
  const env = { envConfig: {}, appService: {} };
  return { useEnv: () => env };
});
vi.mock('@/services/margins/public/api', async (orig) => ({
  ...(await orig<typeof import('@/services/margins/public/api')>()),
  publicApi: { postAssetUrl: h.postAssetUrl, mute: h.mute, report: h.report },
}));
vi.mock('@/services/margins/public/share', () => ({ sharePost: h.sharePost }));

import PostCard from '@/app/reader/components/margins/PostCard';

const frame = { x: 0.5, y: 0.5, w: 0.5, r: 0 };
const samplePost = (o: Partial<PostView> = {}): PostView =>
  ({
    id: 'pst1',
    layerId: null,
    author: { handle: 'reader_1', displayName: 'A Reader' },
    textId: 'txt1',
    version: 1,
    section: 2,
    sectionLen: 900,
    start: 10,
    end: 30,
    quote: 'Down the rabbit hole',
    anchor: { textId: 'txt1', quote: { exact: 'Down the rabbit hole' } },
    payload: {
      v: 1,
      ground: 'paper',
      quote: { frame, size: 'm' },
      elements: [
        { id: 'e1', kind: 'artwork', asset: 'ast_art', alt: 'A rabbit', source: 'upload', frame },
        { id: 'e2', kind: 'play', alt: 'The rabbit runs off', shapes: [], frame },
      ],
    },
    cardUrl: null,
    language: 'en',
    status: 'live',
    book: { title: 'Alice', author: null, workId: null, capped: false },
    mine: false,
    createdAt: '2026-10-13T00:00:00Z',
    updatedAt: '2026-10-13T00:00:00Z',
    ...o,
  }) as PostView;

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe('PostCard', () => {
  it('shows the author, the quote and the payload with art from the post', async () => {
    render(<PostCard post={samplePost()} signedIn />);
    await act(async () => {});
    screen.getByText('@reader_1');
    screen.getByText('A Reader');
    screen.getByText('Down the rabbit hole');
    expect(h.postAssetUrl).toHaveBeenCalledWith('pst1', 'ast_art');
    expect(screen.getByAltText('A rabbit').getAttribute('src')).toBe('blob:art');
    screen.getByText('Play');
    expect(screen.queryByRole('button', { name: 'Play' })).toBeNull();
  });

  it('views the post in place', () => {
    const onViewInPlace = vi.fn();
    const post = samplePost();
    render(<PostCard post={post} signedIn onViewInPlace={onViewInPlace} />);
    fireEvent.click(screen.getByRole('button', { name: 'View in place' }));
    expect(onViewInPlace).toHaveBeenCalledWith(post);
  });

  it('shares and says the link was copied', async () => {
    const toast = vi.fn();
    eventDispatcher.on('toast', toast);
    render(<PostCard post={samplePost()} signedIn />);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Share' })));
    expect(h.sharePost).toHaveBeenCalledWith('pst1');
    expect(toast.mock.calls[0]![0].detail).toMatchObject({ message: 'Link copied' });
    eventDispatcher.off('toast', toast);
  });

  it('opens the report dialog', () => {
    render(<PostCard post={samplePost()} signedIn />);
    fireEvent.click(screen.getByRole('button', { name: 'Report' }));
    screen.getByRole('dialog', { name: 'Report this Margin' });
  });

  it('mutes the author when signed in, and offers no Mute signed out', async () => {
    const onMuted = vi.fn();
    render(<PostCard post={samplePost()} signedIn onMuted={onMuted} />);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Mute @reader_1' })));
    expect(h.mute).toHaveBeenCalledWith('reader_1');
    expect(onMuted).toHaveBeenCalledWith('reader_1');
    cleanup();
    render(<PostCard post={samplePost()} signedIn={false} />);
    expect(screen.queryByRole('button', { name: /Mute/ })).toBeNull();
  });
});
