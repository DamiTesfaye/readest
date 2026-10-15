import type { Metadata } from 'next';
import { Suspense } from 'react';
import { getApiBase } from '@/services/ampleread';
import { AMPLEREAD_WEB_BASE_URL } from '@/services/constants';
import ProfileRoute from './ProfilePage';

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const HANDLE = /^[a-z0-9_]{3,20}$/;

const STATIC: Metadata = {
  title: 'AmpleRead',
  description: 'A profile on AmpleRead.',
};

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  if (process.env['NEXT_PUBLIC_APP_PLATFORM'] !== 'web') return STATIC;

  const params = (await searchParams) ?? {};
  const handle = Array.isArray(params['handle']) ? params['handle'][0] : params['handle'];
  if (!handle || !HANDLE.test(handle)) return { ...STATIC, robots: { index: false } };

  const title = `@${handle} · AmpleRead`;
  const res = await fetch(`${getApiBase()}/v1/users/${handle}`, { cache: 'no-store' }).catch(
    () => null,
  );
  if (!res?.ok) return { title, robots: { index: false } };
  return {
    title,
    openGraph: { type: 'profile', url: `${AMPLEREAD_WEB_BASE_URL}/@${handle}`, title },
  };
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ProfileRoute />
    </Suspense>
  );
}
