import { useCallback, useEffect, useState } from 'react';
import PostCard, { OpenInBook } from '@/app/reader/components/margins/PostCard';
import { useEnv } from '@/context/EnvContext';
import { useTranslation } from '@/hooks/useTranslation';
import { getSession } from '@/services/ampleread/auth/session';
import { type PostPage, type PostView, publicApi } from '@/services/margins/public/api';
import { ownedHashes, sessionSalt } from '@/services/margins/public/openPost';
import { openMarginsStore } from '@/services/margins/store';
import { getLocale } from '@/utils/misc';

export const isTrendingView = (params: Pick<URLSearchParams, 'get'> | null): boolean =>
  params?.get('margins') === 'trending';

export const useTrendingPage = () => {
  const { appService } = useEnv();
  return useCallback(
    async (cursor?: string): Promise<PostPage> => {
      const salt = sessionSalt();
      const owned = appService ? await ownedHashes(await openMarginsStore(appService), salt) : [];
      const lang = getLocale().split('-')[0] || 'en';
      return publicApi.trending({ cursor, lang, salt, owned });
    },
    [appService],
  );
};

function TrendingView() {
  const _ = useTranslation();
  const fetchPage = useTrendingPage();
  const [posts, setPosts] = useState<PostView[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const fail = () => console.error('Margins: trending failed');

  const load = useCallback(
    async (from?: string) => {
      const page = await fetchPage(from);
      setPosts((prev) => (from ? [...prev, ...page.posts] : page.posts));
      setCursor(page.nextCursor);
    },
    [fetchPage],
  );

  useEffect(() => {
    void getSession().then((s) => setSignedIn(!!s));
    load().catch(fail);
  }, [load]);

  return (
    <div className='mx-auto flex w-full max-w-3xl flex-col gap-4 px-6 py-8'>
      <h1 className='text-xl font-semibold'>{_('Trending Margins')}</h1>
      <ul className='flex flex-col gap-2'>
        {posts.map((post) => (
          <li key={post.id} className='bg-base-200/60 rounded-xl'>
            <PostCard
              post={post}
              signedIn={signedIn}
              onMuted={(handle) => setPosts((all) => all.filter((p) => p.author.handle !== handle))}
              actions={<OpenInBook post={post} />}
            />
          </li>
        ))}
      </ul>
      {cursor && (
        <button
          type='button'
          className='btn btn-ghost btn-sm self-center'
          onClick={() => void load(cursor).catch(fail)}
        >
          {_('Load more')}
        </button>
      )}
    </div>
  );
}

export default TrendingView;
