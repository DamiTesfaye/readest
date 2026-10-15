import { useState } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { PublicApiError } from '@/services/margins/public/api';
import { socialApi } from '@/services/margins/public/social';
import { eventDispatcher } from '@/utils/event';

export interface FollowButtonProps {
  handle: string;
  postId?: string;
  following: boolean;
  signedIn: boolean;
  onFollowed?(): void;
}

export const askToSignIn = (message: string) =>
  eventDispatcher.dispatch('toast', { type: 'info', message, timeout: 2500 });

const FollowButton = ({ handle, postId, following, signedIn, onFollowed }: FollowButtonProps) => {
  const _ = useTranslation();
  const [on, setOn] = useState(following);
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);

  const toggle = async () => {
    if (!signedIn) return askToSignIn(_('Sign in to follow creators'));
    setBusy(true);
    try {
      if (on) {
        await socialApi.unfollow(handle);
        setOn(false);
      } else {
        await socialApi.follow(handle, postId);
        setOn(true);
        onFollowed?.();
      }
    } catch (error) {
      if (error instanceof PublicApiError && error.code === 'blocked') setBlocked(true);
      else console.error('Margins: follow failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type='button'
      className={`btn btn-xs ${on ? 'btn-ghost' : 'btn-primary'}`}
      aria-pressed={on}
      disabled={busy || blocked}
      onClick={() => void toggle()}
    >
      {on ? _('Following') : _('Follow')}
    </button>
  );
};

export default FollowButton;
