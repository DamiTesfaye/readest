import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PublicApiError } from '@/services/margins/public/api';

const h = vi.hoisted(() => ({
  follow: vi.fn(async () => {}),
  unfollow: vi.fn(async () => {}),
  dispatch: vi.fn(),
}));

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (s: string) => s,
}));
vi.mock('@/services/margins/public/social', () => ({
  socialApi: { follow: h.follow, unfollow: h.unfollow },
}));
vi.mock('@/utils/event', () => ({ eventDispatcher: { dispatch: h.dispatch } }));

import FollowButton from '@/components/margins/feed/FollowButton';

const press = async (name: string) => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
  });
};

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe('FollowButton', () => {
  it('follows with the card post, then reads Following', async () => {
    const onFollowed = vi.fn();
    render(
      <FollowButton
        handle='creator_b'
        postId='pst_1'
        following={false}
        signedIn
        onFollowed={onFollowed}
      />,
    );
    await press('Follow');
    expect(h.follow).toHaveBeenCalledWith('creator_b', 'pst_1');
    expect(onFollowed).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Following' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    await press('Following');
    expect(h.unfollow).toHaveBeenCalledWith('creator_b');
    expect(screen.getByRole('button', { name: 'Follow' })).toBeTruthy();
    expect(onFollowed).toHaveBeenCalledTimes(1);
  });

  it('disables itself with no message across a block', async () => {
    h.follow.mockRejectedValueOnce(new PublicApiError(403, 'blocked', null, null));
    render(<FollowButton handle='creator_b' following={false} signedIn />);
    await press('Follow');
    const button = screen.getByRole('button', { name: 'Follow' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(h.dispatch).not.toHaveBeenCalled();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('asks a signed-out reader to sign in instead of following', async () => {
    render(<FollowButton handle='creator_b' following={false} signedIn={false} />);
    await press('Follow');
    expect(h.follow).not.toHaveBeenCalled();
    expect(h.dispatch).toHaveBeenCalledWith(
      'toast',
      expect.objectContaining({ message: 'Sign in to follow creators' }),
    );
  });
});
