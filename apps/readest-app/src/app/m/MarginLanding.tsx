'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Card } from '@/components/landing/Card';
import { useTranslation } from '@/hooks/useTranslation';
import { type PostLookup, publicApi } from '@/services/margins/public/api';
import { navigateToLibrary } from '@/utils/nav';
import PostCard from '@/app/reader/components/margins/PostCard';

const FALLBACK_MS = 1500;

export const MarginLanding = ({ postId }: { postId: string | null }) => {
  const _ = useTranslation();
  const router = useRouter();
  const [lookup, setLookup] = useState<PostLookup | null>(null);

  useEffect(() => {
    if (!postId) return;
    let live = true;
    publicApi
      .post(postId)
      .then((p) => live && setLookup(p))
      .catch(() => console.error('Margins: post read failed'));
    return () => {
      live = false;
    };
  }, [postId]);

  const openApp = () => {
    if (!postId) return;
    setTimeout(() => {
      if (document.visibilityState === 'visible')
        navigateToLibrary(router, `post=${encodeURIComponent(postId)}`);
    }, FALLBACK_MS);
  };

  const gone = !postId || lookup?.status === 'gone';

  return (
    <main className='bg-base-200 flex min-h-dvh flex-col items-center justify-center p-4 sm:p-8'>
      <Card>
        {gone && <p className='text-center'>{_('This Margin is no longer available')}</p>}
        {lookup?.status === 'hidden' && <p className='text-center'>{_('Under review')}</p>}
        {lookup && 'author' in lookup && <PostCard post={lookup} signedIn={false} />}
        {postId && !gone && (
          <a
            href={`ampleread://m/${encodeURIComponent(postId)}`}
            onClick={openApp}
            className='btn btn-primary btn-block mt-4 rounded-xl'
          >
            {_('Open in AmpleRead')}
          </a>
        )}
      </Card>
    </main>
  );
};

const MarginRoute = () => {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const segments = pathname?.split('/').filter(Boolean) ?? [];
  const postId = searchParams?.get('id') || (segments[0] === 'm' ? segments[1] : null) || null;
  return <MarginLanding postId={postId} />;
};

export default MarginRoute;
