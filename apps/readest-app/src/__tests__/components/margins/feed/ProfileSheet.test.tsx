import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PostView } from '@/services/margins/public/api';
import type { UserProfile } from '@/services/margins/public/social';

const h = vi.hoisted(() => ({
  profile: vi.fn(),
  profilePosts: vi.fn(),
  block: vi.fn(async () => {}),
  follow: vi.fn(async () => {}),
  postAssetUrl: vi.fn(async (_id: string, ref: string) => `blob:${ref}`),
  session: { me: { id: 'u1' } } as unknown,
  feed: vi.fn(),
}));

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (s: string, opts?: Record<string, string | number>) =>
    opts ? s.replace(/\{\{(\w+)\}\}/g, (_m, key) => String(opts[key] ?? '')) : s,
}));
vi.mock('@/services/ampleread/auth/session', () => ({ getSession: async () => h.session }));
vi.mock('@/services/margins/public/social', () => ({
  socialApi: {
    profile: h.profile,
    profilePosts: h.profilePosts,
    block: h.block,
    follow: h.follow,
  },
}));
vi.mock('@/services/margins/public/api', async (orig) => ({
  ...(await orig<typeof import('@/services/margins/public/api')>()),
  publicApi: { postAssetUrl: h.postAssetUrl },
}));
vi.mock('@/components/margins/feed/FeedView', () => ({
  default: (p: { source: unknown }) => {
    h.feed(p.source);
    return <div role='feed' />;
  },
}));

import ProfileSheet from '@/components/margins/feed/ProfileSheet';

const profile = (o: Partial<UserProfile> = {}): UserProfile => ({
  handle: 'creator_b',
  displayName: 'Creator B',
  followers: 12,
  following: 3,
  followed: false,
  mine: false,
  ...o,
});

const post = (id: string, o: Partial<PostView> = {}) =>
  ({
    id,
    author: { handle: 'creator_b', displayName: 'Creator B' },
    citation: { percent: 4 },
    book: { title: 'Meditations', author: null },
    coverAsset: `ast_c_${id}`,
    cardUrl: null,
    ...o,
  }) as unknown as PostView;

const show = async () => {
  const onClose = vi.fn();
  render(<ProfileSheet handle='creator_b' onClose={onClose} />);
  await act(async () => {});
  return onClose;
};

beforeEach(() => {
  vi.clearAllMocks();
  h.session = { me: { id: 'u1' } };
  h.profile.mockResolvedValue(profile());
  h.profilePosts.mockResolvedValue({
    posts: [post('p1'), post('p2', { coverAsset: null, cardUrl: 'https://cdn.test/c2.jpg' })],
    nextCursor: null,
  });
});
afterEach(cleanup);

describe('ProfileSheet', () => {
  it('shows the name, the initial, the counts and a grid of cover frames', async () => {
    await show();
    screen.getByText('Creator B');
    screen.getByText('@creator_b');
    screen.getByText('C');
    screen.getByText('12 followers · 3 following');
    const covers = screen.getAllByRole('img');
    expect(covers.map((i) => i.getAttribute('src'))).toEqual([
      'blob:ast_c_p1',
      'https://cdn.test/c2.jpg',
    ]);
    expect(h.postAssetUrl).toHaveBeenCalledWith('p1', 'ast_c_p1');
    expect(screen.queryByText(/followers:/)).toBeNull();
    expect(screen.queryByRole('list', { name: /followers/i })).toBeNull();
  });

  it('follows from the profile', async () => {
    await show();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Follow' })));
    expect(h.follow).toHaveBeenCalledWith('creator_b', undefined);
  });

  it('blocks from More after a confirm, then shows the profile as unavailable', async () => {
    await show();
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    fireEvent.click(screen.getByRole('button', { name: 'Block @creator_b' }));
    screen.getByText("Block @creator_b? You won't see each other's Margins.");
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Block' })));
    expect(h.block).toHaveBeenCalledWith('creator_b');
    screen.getByText("This profile isn't available");
    expect(screen.queryAllByRole('img')).toHaveLength(0);
  });

  it('says No Margins yet for a profile with no posts', async () => {
    h.profilePosts.mockResolvedValue({ posts: [], nextCursor: null });
    await show();
    screen.getByText('No Margins yet');
  });

  it("opens the profile's posts in a feed from a cover", async () => {
    await show();
    fireEvent.click(screen.getAllByRole('button', { name: /Meditations/ })[0]!);
    screen.getByRole('feed');
    expect(h.feed).toHaveBeenCalledWith({ kind: 'profile', handle: 'creator_b' });
  });

  it('shows a blocked profile as unavailable, with no posts', async () => {
    h.profile.mockResolvedValue('blocked');
    await show();
    screen.getByText("This profile isn't available");
    expect(screen.queryByRole('button', { name: 'Follow' })).toBeNull();
  });

  it('works signed out, and has no Follow on your own profile', async () => {
    h.session = null;
    await show();
    screen.getByText('12 followers · 3 following');
    expect(screen.getAllByRole('img')).toHaveLength(2);
    cleanup();
    h.profile.mockResolvedValue(profile({ mine: true }));
    await show();
    expect(screen.queryByRole('button', { name: 'Follow' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'More' })).toBeNull();
  });

  it('closes', async () => {
    const onClose = await show();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });
});
