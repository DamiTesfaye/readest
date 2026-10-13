import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PostView } from '@/services/margins/public/api';

const h = vi.hoisted(() => ({ passages: vi.fn() }));

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (s: string, opts?: Record<string, string | number>) =>
    opts ? s.replace(/\{\{(\w+)\}\}/g, (_m, key) => String(opts[key] ?? '')) : s,
}));
vi.mock('@/services/ampleread/auth/session', () => ({ getSession: async () => null }));
vi.mock('@/services/margins/public/api', async (orig) => ({
  ...(await orig<typeof import('@/services/margins/public/api')>()),
  publicApi: { passages: h.passages },
}));
vi.mock('@/app/reader/components/margins/PostCard', () => ({
  default: ({ post, onViewInPlace }: { post: PostView; onViewInPlace?: (p: PostView) => void }) => (
    <article>
      {post.quote}
      <button type='button' onClick={() => onViewInPlace?.(post)}>
        View in place
      </button>
    </article>
  ),
}));

import PassageSheet from '@/app/reader/components/margins/PassageSheet';

const post = (id: string) => ({ id, quote: `take ${id}`, author: { handle: id } }) as PostView;
const passage = { textId: 'txt1', section: 3, sectionLen: 900, start: 10, end: 40 };

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe('PassageSheet', () => {
  it('titles the feed, lists posts, loads more and views one in place', async () => {
    h.passages
      .mockResolvedValueOnce({ posts: [post('a'), post('b')], nextCursor: 'c1' })
      .mockResolvedValueOnce({ posts: [post('c')], nextCursor: null });
    const onViewInPlace = vi.fn();
    const onClose = vi.fn();
    render(<PassageSheet {...passage} onClose={onClose} onViewInPlace={onViewInPlace} />);
    await act(async () => {});
    expect(h.passages).toHaveBeenCalledWith('txt1', 3, 900, 10, 40, undefined);
    screen.getByRole('dialog', { name: '2 takes on this passage' });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Load more' })));
    expect(h.passages).toHaveBeenLastCalledWith('txt1', 3, 900, 10, 40, 'c1');
    screen.getByText('take c');
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
    fireEvent.click(screen.getAllByRole('button', { name: 'View in place' })[1]!);
    expect(onViewInPlace).toHaveBeenCalledWith(expect.objectContaining({ id: 'b' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onViewInPlace).toHaveBeenLastCalledWith(null);
    expect(onClose).toHaveBeenCalled();
  });
});
