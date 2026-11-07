import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { CitationLine } from '@/components/margins/CitationLine';
import { useTranslation } from '@/hooks/useTranslation';
import type { PostView } from '@/services/margins/public/api';
import { useMarginsPublic } from '@/services/margins/public/flag';
import { MARGINS_OPEN_POST_EVENT, TRENDING_RAIL_LIMIT } from '@/services/margins/public/openPost';
import { eventDispatcher } from '@/utils/event';
import { navigateToLibrary } from '@/utils/nav';
import { useTrendingPage } from '@/services/margins/public/feedApi';

export function TrendingRail() {
  const _ = useTranslation();
  const router = useRouter();
  const on = useMarginsPublic();
  const fetchPage = useTrendingPage();
  const [posts, setPosts] = useState<PostView[]>([]);

  useEffect(() => {
    if (!on) return;
    let live = true;
    fetchPage()
      .then((page) => live && setPosts(page.posts.slice(0, TRENDING_RAIL_LIMIT)))
      .catch(() => console.error('Margins: trending failed'));
    return () => {
      live = false;
    };
  }, [on, fetchPage]);

  if (!on || posts.length === 0) return null;
  return (
    <section aria-label={_('Trending Margins')} className='flex flex-col gap-3'>
      <h2 className='text-base-content text-base font-semibold'>{_('Trending Margins')}</h2>
      <ul className='flex flex-col gap-1'>
        {posts.map((post) => (
          <li key={post.id}>
            <button
              type='button'
              className='hover:bg-base-200 flex w-full flex-col gap-1 rounded-lg p-2 text-start'
              onClick={() => eventDispatcher.dispatch(MARGINS_OPEN_POST_EVENT, { postId: post.id })}
            >
              <span className='text-base-content/60 truncate text-xs'>
                <span>{`@${post.author.handle}`}</span>
                {post.book.title && <span> · </span>}
                {post.book.title && <span>{post.book.title}</span>}
              </span>
              <span className='line-clamp-3 font-serif text-sm'>
                {post.quote ?? <CitationLine citation={post.citation} book={post.book} />}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <button
        type='button'
        className='link self-start text-sm'
        onClick={() => navigateToLibrary(router, 'feed=for-you')}
      >
        {_('See all')}
      </button>
    </section>
  );
}

export default TrendingRail;
