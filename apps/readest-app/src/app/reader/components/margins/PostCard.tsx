import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useEnv } from '@/context/EnvContext';
import { CitationLine } from '@/components/margins/CitationLine';
import { useTranslation } from '@/hooks/useTranslation';
import { canDownloadEdition, getWorkDetail } from '@/services/ampleread';
import { getSession } from '@/services/ampleread/auth/session';
import { downloadEdition } from '@/services/ampleread/download';
import { type PostLookup, type PostView, publicApi } from '@/services/margins/public/api';
import {
  type OpenTarget,
  openTargetFor,
  rememberPendingOpen,
  requestPostOpen,
} from '@/services/margins/public/openPost';
import { sharePost } from '@/services/margins/public/share';
import { openMarginsStore } from '@/services/margins/store';
import { useLibraryStore } from '@/store/libraryStore';
import { eventDispatcher } from '@/utils/event';
import { navigateToReader } from '@/utils/nav';
import { SHEET_CLASS } from './HandleSheet';
import { isEnvelope, MarginArt } from './MarginCard';
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
        <MarginArt envelope={post.payload} quote={post.quote ?? ''} assetSource={assetSource} />
      ) : (
        <p className='line-clamp-3 font-serif text-xs leading-relaxed'>
          {post.quote ?? <CitationLine citation={post.citation} book={post.book} />}
        </p>
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

export const OpenInBook = ({ post }: { post: PostView }) => {
  const _ = useTranslation();
  const { appService } = useEnv();
  const router = useRouter();
  const library = useLibraryStore((s) => s.library);
  const [target, setTarget] = useState<OpenTarget | null>(null);
  const fail = () => console.error('Margins: open in book failed');

  const go = (bookHash: string) => {
    requestPostOpen(bookHash, post);
    navigateToReader(router, [bookHash]);
  };

  const open = async () => {
    if (!appService) return;
    const hashes = library.filter((b) => !b.deletedAt).map((b) => b.hash);
    const found = await openTargetFor(post, await openMarginsStore(appService), hashes);
    if (found.kind === 'library') return go(found.bookHash);
    if (found.kind === 'yourCopy') rememberPendingOpen(post);
    setTarget(found);
  };

  const getBook = async (workId: string) => {
    if (!appService) return;
    const edition = (await getWorkDetail(workId)).editions.find(canDownloadEdition);
    const book = edition ? await downloadEdition({ appService, workId, edition }) : null;
    if (book) go(book.hash);
  };

  return (
    <>
      <button
        type='button'
        className='btn btn-ghost btn-xs'
        onClick={() => void open().catch(fail)}
      >
        {_('Open in book')}
      </button>
      {target?.kind === 'yourCopy' && (
        <p role='status' className='text-base-content/70 w-full text-xs'>
          {_('Open this book from your library to see this Margin in place.')}
        </p>
      )}
      {target?.kind === 'download' && (
        <button
          type='button'
          className='btn btn-primary btn-xs'
          onClick={() => void getBook(target.workId).catch(fail)}
        >
          {_('Get this book')}
        </button>
      )}
    </>
  );
};

export const PostSheet = ({ postId, onClose }: { postId: string; onClose(): void }) => {
  const _ = useTranslation();
  const [lookup, setLookup] = useState<PostLookup | null>(null);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    let live = true;
    void getSession().then((s) => live && setSignedIn(!!s));
    publicApi
      .post(postId)
      .then((p) => live && setLookup(p))
      .catch(() => console.error('Margins: post read failed'));
    return () => {
      live = false;
    };
  }, [postId]);

  return (
    <div role='dialog' aria-label={_('Margin')} className={SHEET_CLASS}>
      <div className='flex justify-end'>
        <button type='button' className='btn btn-ghost btn-xs' onClick={onClose}>
          {_('Close')}
        </button>
      </div>
      {lookup?.status === 'gone' && (
        <p className='text-sm'>{_('This Margin is no longer available')}</p>
      )}
      {lookup?.status === 'hidden' && <p className='text-sm'>{_('Under review')}</p>}
      {lookup && 'author' in lookup && (
        <PostCard post={lookup} signedIn={signedIn} actions={<OpenInBook post={lookup} />} />
      )}
    </div>
  );
};

export default PostCard;
