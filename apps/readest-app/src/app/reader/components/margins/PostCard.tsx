import { useCallback, useState } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { type PostView, publicApi } from '@/services/margins/public/api';
import { sharePost } from '@/services/margins/public/share';
import { eventDispatcher } from '@/utils/event';
import { EnvelopeView, isEnvelope } from './MarginCard';
import ReportDialog from './ReportDialog';

interface PostCardProps {
  post: PostView;
  signedIn: boolean;
  onViewInPlace?(post: PostView): void;
  onMuted?(handle: string): void;
  actions?: React.ReactNode;
}

const PostCard: React.FC<PostCardProps> = ({ post, signedIn, onViewInPlace, onMuted, actions }) => {
  const _ = useTranslation();
  const [reporting, setReporting] = useState(false);
  const assetSource = useCallback((ref: string) => publicApi.postAssetUrl(post.id, ref), [post.id]);
  const button = 'btn btn-ghost btn-xs';
  const fail = () => console.error('Margins: post action failed');

  const share = async () => {
    if ((await sharePost(post.id)) === 'copied')
      eventDispatcher.dispatch('toast', { message: _('Link copied'), type: 'info' });
  };

  const mute = async () => {
    await publicApi.mute(post.author.handle);
    onMuted?.(post.author.handle);
  };

  return (
    <article className='flex flex-col gap-2 rounded-lg p-3' aria-label={`@${post.author.handle}`}>
      <header className='flex items-baseline gap-2 text-xs'>
        <span className='font-semibold'>{post.author.displayName}</span>
        <span className='text-base-content/60'>{`@${post.author.handle}`}</span>
      </header>
      {isEnvelope(post.payload) ? (
        <EnvelopeView envelope={post.payload} quote={post.quote} assetSource={assetSource} />
      ) : (
        <p className='line-clamp-3 font-serif text-xs leading-relaxed'>{post.quote}</p>
      )}
      <div className='flex flex-wrap items-center gap-1'>
        {actions}
        {onViewInPlace && (
          <button type='button' className={button} onClick={() => onViewInPlace(post)}>
            {_('View in place')}
          </button>
        )}
        <button type='button' className={button} onClick={() => void share().catch(fail)}>
          {_('Share')}
        </button>
        <button type='button' className={button} onClick={() => setReporting(true)}>
          {_('Report')}
        </button>
        {signedIn && !post.mine && (
          <button type='button' className={button} onClick={() => void mute().catch(fail)}>
            {_('Mute @{{handle}}', { handle: post.author.handle })}
          </button>
        )}
      </div>
      {reporting && <ReportDialog postId={post.id} onClose={() => setReporting(false)} />}
    </article>
  );
};

export default PostCard;
