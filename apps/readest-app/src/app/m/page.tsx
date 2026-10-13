import type { Metadata } from 'next';
import { Suspense } from 'react';
import { getApiBase } from '@/services/ampleread';
import { AMPLEREAD_WEB_BASE_URL } from '@/services/constants';
import type { PostLookup, PostView } from '@/services/margins/public/api';
import type { Envelope, NoteElement } from '@/services/margins/payload';
import MarginRoute from './MarginLanding';

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const STATIC: Metadata = {
  title: 'Open in AmpleRead',
  description: 'A Margin shared from AmpleRead.',
};

const cut = (s: string, n: number) => [...s].slice(0, n).join('');

const noteOf = (post: PostView) => {
  const elements = (post.payload as Envelope | null)?.elements ?? [];
  const note = elements.find((e): e is NoteElement => e.kind === 'note');
  return typeof note?.text === 'string' ? note.text : '';
};

const lookup = async (id: string): Promise<PostLookup | null> => {
  const res = await fetch(`${getApiBase()}/v1/posts/${encodeURIComponent(id)}`, {
    cache: 'no-store',
  });
  if (res.status === 410) return { id, status: 'gone' };
  return res.ok ? ((await res.json()) as PostLookup) : null;
};

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  if (process.env['NEXT_PUBLIC_APP_PLATFORM'] !== 'web') return STATIC;

  const params = (await searchParams) ?? {};
  const id = Array.isArray(params['id']) ? params['id'][0] : params['id'];
  if (!id) return STATIC;

  const post = await lookup(id).catch(() => null);
  if (!post) return STATIC;
  if (post.status === 'hidden')
    return { title: 'Under review · AmpleRead', robots: { index: false } };
  if (!('author' in post))
    return { title: 'This Margin is no longer available', robots: { index: false } };

  const title = `@${post.author.handle}${post.book.title ? ` on ${cut(post.book.title, 200)}` : ''}`;
  const description = cut(post.quote || noteOf(post), 120);
  const images = post.cardUrl ? [{ url: post.cardUrl, width: 1200, height: 630 }] : undefined;
  return {
    title,
    description,
    openGraph: {
      type: 'article',
      url: `${AMPLEREAD_WEB_BASE_URL}/m/${encodeURIComponent(post.id)}`,
      title,
      description,
      images,
    },
    twitter: { card: 'summary_large_image', title, description, images: post.cardUrl ?? undefined },
  };
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <MarginRoute />
    </Suspense>
  );
}
