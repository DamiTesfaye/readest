import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useEnv } from '@/context/EnvContext';
import { useTranslation } from '@/hooks/useTranslation';
import { getSession } from '@/services/ampleread/auth/session';
import type { PostView } from '@/services/margins/public/api';
import {
  bookFeedParams,
  type EngagementKind,
  type FeedSource,
  fetchFeedPage,
  preloadPost,
} from '@/services/margins/public/feedApi';
import { engagement } from '@/services/margins/public/engagement';
import { socialApi } from '@/services/margins/public/social';
import { familyCache } from '@/services/margins/sync';
import { prefersReducedMotion } from '@/utils/animation';
import { eventDispatcher } from '@/utils/event';
import { navigateToLibrary } from '@/utils/nav';
import FeedCard from './FeedCard';
import FeedTabs, { type FeedTab } from './FeedTabs';

export interface FeedViewProps {
  source: FeedSource;
}

const PAGE_AHEAD = 2;
const PRELOAD = 2;
const ACTIVE_RATIO = 0.6;
const WHEEL_MIN = 50;
const WHEEL_MS = 400;
const NEXT_KEYS = ['ArrowDown', 'PageDown'];
const PREV_KEYS = ['ArrowUp', 'PageUp'];

const noEngagement = () => {};

const countEngagement = (post: PostView, kind: EngagementKind) => engagement.count(post.id, kind);

const familyOf = (post: PostView) => familyCache.get(post.textId) ?? post.textId;

interface FeedProps {
  source: FeedSource;
  shown: boolean;
  onForYou?(): void;
}

const Feed = ({ source, shown, onForYou }: FeedProps) => {
  const _ = useTranslation();
  const router = useRouter();
  const { appService } = useEnv();
  const [all, setPosts] = useState<PostView[] | null>(null);
  const [dropped, setDropped] = useState<ReadonlySet<string>>(new Set());
  const posts = all?.filter((p) => !dropped.has(p.id)) ?? null;
  const [cursor, setCursor] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const [muted, setMuted] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  const [reduced] = useState(prefersReducedMotion);
  const feedRef = useRef<HTMLDivElement>(null);
  const cards = useRef<(HTMLElement | null)[]>([]);
  const loading = useRef(false);
  const lastWheel = useRef(0);
  const key = JSON.stringify(source);
  const current = useRef(key);
  current.current = key;
  const fail = () => console.error('Margins: feed read failed');

  useEffect(() => {
    let live = true;
    setPosts(null);
    setDropped(new Set());
    setCursor(null);
    setActive(0);
    (async () => {
      const session = await getSession();
      if (!live) return;
      setSignedIn(!!session);
      if (source.kind === 'following' && !session) return setPosts([]);
      const page = await fetchFeedPage(source, undefined, { appService });
      if (!live) return;
      setPosts(page.posts);
      setCursor(page.nextCursor);
    })().catch(fail);
    return () => {
      live = false;
    };
  }, [key, appService]);

  useEffect(
    () => () => {
      void engagement.flush();
    },
    [],
  );

  useEffect(() => {
    if (!posts || !cursor || loading.current || active < posts.length - PAGE_AHEAD) return;
    loading.current = true;
    fetchFeedPage(source, cursor, { appService })
      .then((page) => {
        if (current.current !== key) return;
        setPosts((prev) => [...(prev ?? []), ...page.posts]);
        setCursor(page.nextCursor);
      })
      .catch(fail)
      .finally(() => {
        loading.current = false;
      });
  }, [active, all, dropped, cursor]);

  useEffect(() => {
    posts?.slice(active + 1, active + 1 + PRELOAD).forEach(preloadPost);
  }, [active, all, dropped]);

  useEffect(() => {
    if (!posts || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.intersectionRatio >= ACTIVE_RATIO)
            setActive(Number((e.target as HTMLElement).dataset['index']));
        }
      },
      { root: feedRef.current, threshold: ACTIVE_RATIO },
    );
    for (const card of cards.current) if (card) io.observe(card);
    return () => io.disconnect();
  }, [all, dropped]);

  const go = (i: number) => {
    if (!posts || i < 0 || i >= posts.length) return;
    setActive(i);
    cards.current[i]?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = NEXT_KEYS.includes(e.key) ? 1 : PREV_KEYS.includes(e.key) ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    go(active + step);
  };

  const onWheel = (e: React.WheelEvent) => {
    const now = Date.now();
    const quiet = now - lastWheel.current >= WHEEL_MS;
    lastWheel.current = now;
    if (quiet && Math.abs(e.deltaY) > WHEEL_MIN) go(active + Math.sign(e.deltaY));
  };

  const openBook = (post: PostView) => navigateToLibrary(router, bookFeedParams(post.textId));

  const drop = (ids: string[]) => setDropped((prev) => new Set([...prev, ...ids]));

  const undrop = (ids: string[]) =>
    setDropped((prev) => new Set([...prev].filter((id) => !ids.includes(id))));

  const hide = (post: PostView, by: 'creator' | 'book') => {
    const matches = (p: PostView) =>
      by === 'creator' ? p.author.handle === post.author.handle : familyOf(p) === familyOf(post);
    const ids = (all ?? []).filter(matches).map((p) => p.id);
    drop(ids);
    if (by === 'creator') return;
    eventDispatcher.dispatch('toast', {
      type: 'info',
      message: _('Book hidden'),
      action: {
        label: _('Undo'),
        onClick: () =>
          void socialApi
            .unhideBook(post.textId)
            .then(() => undrop(ids))
            .catch(() => console.error('Margins: undo hide failed')),
      },
    });
  };

  const empty = {
    'for-you': _('No Margins yet'),
    following: _('Follow creators from any card to see their Margins here'),
    book: _('No Margins on this book yet'),
    profile: _('No Margins yet'),
  }[source.kind];

  return (
    <div
      ref={feedRef}
      role='feed'
      aria-label={_('Margins')}
      aria-busy={posts === null}
      tabIndex={0}
      className='h-full snap-y snap-mandatory overflow-y-auto outline-none'
      onKeyDown={onKeyDown}
      onWheel={onWheel}
    >
      {posts?.length === 0 && (
        <div className='text-base-content/60 flex h-full flex-col items-center justify-center gap-2 p-6 text-sm'>
          <p>
            {source.kind === 'following' && !signedIn ? _('Sign in to follow creators') : empty}
          </p>
          {source.kind === 'following' && signedIn && onForYou && (
            <button type='button' className='btn btn-ghost btn-sm' onClick={onForYou}>
              {_('Go to For You')}
            </button>
          )}
        </div>
      )}
      {posts?.map((post, i) => (
        <article
          key={post.id}
          ref={(el) => {
            cards.current[i] = el;
          }}
          data-index={i}
          aria-posinset={i + 1}
          aria-setsize={cursor ? -1 : posts.length}
          aria-current={i === active || undefined}
          className='mx-auto h-full max-w-xl snap-start'
        >
          <FeedCard
            post={post}
            active={shown && i === active}
            muted={muted}
            reduced={reduced}
            signedIn={signedIn}
            onUnmute={() => setMuted(false)}
            onMute={() => setMuted(true)}
            onHidden={hide}
            onOpenBook={openBook}
            onEngage={signedIn ? countEngagement : noEngagement}
          />
        </article>
      ))}
    </div>
  );
};

const tabSource = (tab: FeedTab, source: FeedSource): FeedSource =>
  tab === source.kind ? source : ({ kind: tab } as FeedSource);

const Tabbed = ({ source }: FeedViewProps) => {
  const [tab, setTab] = useState<FeedTab>(source.kind as FeedTab);
  const [visited, setVisited] = useState<FeedTab[]>([source.kind as FeedTab]);

  const select = (next: FeedTab) => {
    setTab(next);
    setVisited((v) => (v.includes(next) ? v : [...v, next]));
  };

  return (
    <div className='flex h-full flex-col'>
      <FeedTabs current={tab} hasBook={source.kind === 'book'} onSelect={select} />
      {visited.map((t) => (
        <div key={t} className={t === tab ? 'min-h-0 flex-1' : 'hidden'}>
          <Feed
            source={tabSource(t, source)}
            shown={t === tab}
            onForYou={() => select('for-you')}
          />
        </div>
      ))}
    </div>
  );
};

const FeedView = ({ source }: FeedViewProps) =>
  source.kind === 'profile' ? (
    <Feed source={source} shown />
  ) : (
    <Tabbed key={JSON.stringify(source)} source={source} />
  );

export default FeedView;
