import { useState } from 'react';
import type { PostView } from '@/services/margins/public/api';
import FollowButton from './FollowButton';
import ProfileSheet from './ProfileSheet';

export interface CreatorChipProps {
  post: PostView;
  signedIn: boolean;
}

const CreatorChip = ({ post, signedIn }: CreatorChipProps) => {
  const [profile, setProfile] = useState(false);
  return (
    <div className='flex items-center gap-2'>
      <button
        type='button'
        className='flex items-center gap-2 text-start'
        onClick={() => setProfile(true)}
      >
        <span
          aria-hidden='true'
          className='bg-base-300 flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold uppercase'
        >
          {[...(post.author.displayName || post.author.handle)][0]}
        </span>
        <span className='flex flex-col leading-tight'>
          <span className='text-sm font-semibold'>{post.author.displayName}</span>
          <span className='text-base-content/60 text-xs'>{`@${post.author.handle}`}</span>
        </span>
      </button>
      {!post.mine && (
        <FollowButton
          handle={post.author.handle}
          postId={post.id}
          following={post.following}
          signedIn={signedIn}
        />
      )}
      {profile && <ProfileSheet handle={post.author.handle} onClose={() => setProfile(false)} />}
    </div>
  );
};

export default CreatorChip;
