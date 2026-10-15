import { useCallback, useEffect, useState } from 'react';
import { isEnvelope, MarginArt } from '@/app/reader/components/margins/MarginCard';
import ReportDialog from '@/app/reader/components/margins/ReportDialog';
import { CitationLine } from '@/components/margins/CitationLine';
import { useEnv } from '@/context/EnvContext';
import { useTranslation } from '@/hooks/useTranslation';
import { getMarginsCore } from '@/services/margins/marginsClient';
import { type PostView, publicApi } from '@/services/margins/public/api';
import { formatCitation } from '@/services/margins/public/citation';
import { type EngagementKind, sceneOf } from '@/services/margins/public/feedApi';
import { sharePost } from '@/services/margins/public/share';
import { socialApi } from '@/services/margins/public/social';
import { chooseMaterial, type Material, ownerPassage } from '@/services/margins/replay/material';
import type { Sfx } from '@/services/margins/replay/sfx';
import type { Scene } from '@/services/margins/replay/types';
import { openMarginsStore } from '@/services/margins/store';
import { useLibraryStore } from '@/store/libraryStore';
import { eventDispatcher } from '@/utils/event';
import BlockSheet from './BlockSheet';
import CreatorChip from './CreatorChip';
import { askToSignIn } from './FollowButton';
import GetBookSheet from './GetBookSheet';
import ReplayPlayer from './ReplayPlayer';

export interface FeedCardProps {
  post: PostView;
  active: boolean;
  muted: boolean;
  sfx?: Sfx | null;
  reduced: boolean;
  signedIn: boolean;
  onUnmute(): void;
  onMute(): void;
  onHidden(post: PostView, by: 'creator' | 'book'): void;
  onOpenBook(post: PostView): void;
  onEngage(post: PostView, kind: EngagementKind): void;
}

type Replay = { scene: Scene | null; material: Material; coverUrl: string | null };

const BUTTON = 'btn btn-ghost btn-xs';

const playAlt = (payload: unknown): string => {
  const elements = (payload as { elements?: { kind?: string; alt?: unknown }[] } | null)?.elements;
  const alt = elements?.find((e) => e?.kind === 'play')?.alt;
  return typeof alt === 'string' ? alt : '';
};

const FeedCard = ({
  post,
  active,
  muted,
  sfx = null,
  reduced,
  signedIn,
  onUnmute,
  onMute,
  onHidden,
  onOpenBook,
  onEngage,
}: FeedCardProps) => {
  const _ = useTranslation();
  const { appService } = useEnv();
  const library = useLibraryStore((s) => s.library);
  const [replay, setReplay] = useState<Replay | null>(null);
  const [more, setMore] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [getting, setGetting] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const assetSource = useCallback((ref: string) => publicApi.postAssetUrl(post.id, ref), [post.id]);
  const fail = () => console.error('Margins: feed action failed');

  useEffect(() => {
    if (!post.sceneAsset) return;
    let live = true;
    const ownerFor = async () =>
      signedIn && appService
        ? ownerPassage({
            post,
            store: await openMarginsStore(appService),
            core: getMarginsCore(),
            libraryHashes: library.filter((b) => !b.deletedAt).map((b) => b.hash),
          })
        : null;
    (async () => {
      const [scene, coverUrl] = await Promise.all([
        sceneOf(post),
        post.coverAsset ? publicApi.postAssetUrl(post.id, post.coverAsset).catch(() => null) : null,
      ]);
      const owner = scene ? await ownerFor().catch(() => null) : null;
      const material: Material = scene
        ? chooseMaterial({ scene, display: post.display, quote: post.quote, owner })
        : { kind: 'ghost' };
      if (live) setReplay({ scene, material, coverUrl });
    })();
    return () => {
      live = false;
    };
  }, [post, signedIn, appService, library]);

  const share = async () => {
    if ((await sharePost(post.id)) === 'copied')
      eventDispatcher.dispatch('toast', { message: _('Link copied'), type: 'info' });
  };

  const mute = async () => {
    await publicApi.mute(post.author.handle);
    setMore(false);
    onHidden(post, 'creator');
  };

  const signedOut = () => askToSignIn(_('Sign in to block or hide Margins'));

  const startBlock = () => {
    if (!signedIn) {
      signedOut();
      return;
    }
    setMore(false);
    setBlocking(true);
  };

  const hideBook = async () => {
    if (!signedIn) {
      signedOut();
      return;
    }
    await socialApi.hideBook(post.textId);
    setMore(false);
    onHidden(post, 'book');
  };

  return (
    <div className='flex h-full flex-col gap-3 p-4'>
      <CreatorChip post={post} signedIn={signedIn} />
      <div className='flex min-h-0 flex-1 items-center justify-center overflow-hidden'>
        {post.sceneAsset
          ? replay && (
              <ReplayPlayer
                postId={post.id}
                scene={replay.scene}
                coverUrl={replay.coverUrl}
                citation={formatCitation(post.citation, post.book)}
                alt={playAlt(post.payload)}
                material={replay.material}
                reduced={reduced}
                active={active}
                onEngage={(kind) => onEngage(post, kind)}
                sfx={muted ? null : sfx}
              />
            )
          : isEnvelope(post.payload) && (
              <MarginArt
                envelope={post.payload}
                quote={post.display === 'quote' ? (post.quote ?? '') : ''}
                assetSource={assetSource}
              />
            )}
      </div>
      <div className='flex flex-wrap items-center gap-2'>
        <button type='button' className={`${BUTTON} h-auto`} onClick={() => onOpenBook(post)}>
          <CitationLine citation={post.citation} book={post.book} />
        </button>
        <button type='button' className={BUTTON} onClick={() => setGetting(true)}>
          {_('Get this book')}
        </button>
      </div>
      <div className='flex flex-wrap items-center gap-1'>
        <button type='button' className={BUTTON} onClick={muted ? onUnmute : onMute}>
          {muted ? _('Unmute') : _('Mute')}
        </button>
        <button type='button' className={BUTTON} onClick={() => void share().catch(fail)}>
          {_('Share')}
        </button>
        <button type='button' className={BUTTON} onClick={() => setReporting(true)}>
          {_('Report')}
        </button>
        <button
          type='button'
          className={BUTTON}
          aria-expanded={more}
          onClick={() => setMore((m) => !m)}
        >
          {_('More')}
        </button>
      </div>
      {more && (
        <div className='bg-base-200 flex flex-col items-start gap-1 rounded-lg p-2'>
          {signedIn && !post.mine && (
            <button type='button' className={BUTTON} onClick={() => void mute().catch(fail)}>
              {_('Mute @{{handle}}', { handle: post.author.handle })}
            </button>
          )}
          {!post.mine && (
            <button type='button' className={BUTTON} onClick={startBlock}>
              {_('Block @{{handle}}', { handle: post.author.handle })}
            </button>
          )}
          <button type='button' className={BUTTON} onClick={() => void hideBook().catch(fail)}>
            {_('Hide this book')}
          </button>
        </div>
      )}
      {blocking && (
        <BlockSheet
          handle={post.author.handle}
          onBlocked={() => onHidden(post, 'creator')}
          onClose={() => setBlocking(false)}
        />
      )}
      {getting && (
        <GetBookSheet
          post={post}
          onClose={() => setGetting(false)}
          onTap={() => onEngage(post, 'get_book')}
        />
      )}
      {reporting && <ReportDialog postId={post.id} onClose={() => setReporting(false)} />}
    </div>
  );
};

export default FeedCard;
