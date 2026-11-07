import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PostView } from '@/services/margins/public/api';

const h = vi.hoisted(() => ({ post: vi.fn(), navigateToLibrary: vi.fn(), card: vi.fn() }));

vi.mock('@/hooks/useTranslation', () => ({ useTranslation: () => (s: string) => s }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock('@/utils/nav', () => ({ navigateToLibrary: h.navigateToLibrary }));
vi.mock('@/services/margins/public/api', () => ({ publicApi: { post: h.post } }));
vi.mock('@/app/reader/components/margins/PostCard', () => ({
  default: (props: { post: PostView }) => {
    h.card(props);
    return <article>{props.post.quote}</article>;
  },
}));

import { MarginLanding } from '@/app/m/MarginLanding';

const post = { id: 'pst_1', status: 'live', quote: 'Be one.', author: { handle: 'r' } };

beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const show = async (postId: string | null = 'pst_1') => {
  render(<MarginLanding postId={postId} />);
  await act(async () => {});
};

describe('MarginLanding', () => {
  it('shows the post read-only and links into the app', async () => {
    h.post.mockResolvedValue(post);
    await show();
    expect(h.post).toHaveBeenCalledWith('pst_1');
    screen.getByText('Be one.');
    const props = h.card.mock.calls.at(-1)![0];
    expect(props).toMatchObject({ post, signedIn: false });
    expect(props.onViewInPlace).toBeUndefined();
    expect(props.actions).toBeUndefined();
    const open = screen.getByRole('link', { name: 'Open in AmpleRead' });
    expect(open.getAttribute('href')).toBe('ampleread://m/pst_1');
  });

  it('falls back to the web library when the page stays visible', async () => {
    h.post.mockResolvedValue(post);
    await show();
    vi.useFakeTimers();
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    const open = screen.getByRole('link', { name: 'Open in AmpleRead' });
    open.addEventListener('click', (e) => e.preventDefault());
    fireEvent.click(open);
    vi.advanceTimersByTime(1499);
    expect(h.navigateToLibrary).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(h.navigateToLibrary).toHaveBeenCalledWith(expect.anything(), 'post=pst_1');
  });

  it('stays put when the app took over', async () => {
    h.post.mockResolvedValue(post);
    await show();
    vi.useFakeTimers();
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    const open = screen.getByRole('link', { name: 'Open in AmpleRead' });
    open.addEventListener('click', (e) => e.preventDefault());
    fireEvent.click(open);
    vi.advanceTimersByTime(2000);
    expect(h.navigateToLibrary).not.toHaveBeenCalled();
  });

  it('shows Under review for a hidden post', async () => {
    h.post.mockResolvedValue({ id: 'pst_1', status: 'hidden' });
    await show();
    screen.getByText('Under review');
    expect(h.card).not.toHaveBeenCalled();
  });

  it('shows the gone copy for a gone post and a missing id', async () => {
    h.post.mockResolvedValue({ id: 'pst_1', status: 'gone' });
    await show();
    screen.getByText('This Margin is no longer available');
    cleanup();
    await show(null);
    screen.getByText('This Margin is no longer available');
    expect(h.post).toHaveBeenCalledTimes(1);
  });
});
