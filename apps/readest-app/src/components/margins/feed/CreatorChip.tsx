import type { PostView } from '@/services/margins/public/api';
import FollowButton from './FollowButton';

export interface CreatorChipProps {
  post: PostView;
  signedIn: boolean;
}

const CreatorChip = ({ post, signedIn }: CreatorChipProps) => (
  <div className='flex items-center gap-2'>
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
    {!post.mine && (
      <FollowButton
        handle={post.author.handle}
        postId={post.id}
        following={post.following}
        signedIn={signedIn}
      />
    )}
  </div>
);

export default CreatorChip;
