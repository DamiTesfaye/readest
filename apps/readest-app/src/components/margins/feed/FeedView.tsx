import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useEnv } from '@/context/EnvContext';
import { useTranslation } from '@/hooks/useTranslation';
import { getSession } from '@/services/ampleread/auth/session';
import type { PostView } from '@/services/margins/public/api';
import {
  bookFeedParams,
  type FeedSource,
  fetchFeedPage,
  preloadPost,
} from '@/services/margins/public/feedApi';
import { prefersReducedMotion } from '@/utils/animation';
import { navigateToLibrary } from '@/utils/nav';
import FeedCard from './FeedCard';

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

const FeedView = ({ source }: FeedViewProps) => {
  const _ = useTranslation();
  const router = useRouter();
  const { appService } = useEnv();
  const [posts, setPosts] = useState<PostView[] | null>(null);
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
    setCursor(null);
    setActive(0);
    void getSession().then((s) => live && setSignedIn(!!s));
    fetchFeedPage(source, undefined, { appService })
      .then((page) => {
        if (!live) return;
        setPosts(page.posts);
        setCursor(page.nextCursor);
      })
      .catch(fail);
    return () => {
      live = false;
    };
  }, [key, appService]);

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
  }, [active, posts, cursor]);

  useEffect(() => {
    posts?.slice(active + 1, active + 1 + PRELOAD).forEach(preloadPost);
  }, [active, posts]);

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
  }, [posts]);

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

  const hide = (post: PostView) =>
    setPosts((prev) => prev?.filter((p) => p.author.handle !== post.author.handle) ?? null);

  const empty = {
    'for-you': _('No Margins yet'),
    following: _('Follow creators from any card to see their Margins here'),
    book: _('No Margins on this book yet'),
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
        <p className='text-base-content/60 flex h-full items-center justify-center p-6 text-sm'>
          {empty}
        </p>
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
            active={i === active}
            muted={muted}
            reduced={reduced}
            signedIn={signedIn}
            onUnmute={() => setMuted(false)}
            onMute={() => setMuted(true)}
            onHidden={hide}
            onOpenBook={openBook}
            onEngage={noEngagement}
          />
        </article>
      ))}
    </div>
  );
};

export default FeedView;
