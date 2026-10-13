'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { completeHandoff } from '@/services/ampleread/auth/signIn';
import { takeWebHandoff } from '@/services/ampleread/auth/platform';
import { useTranslation } from '@/hooks/useTranslation';

export default function AmpleReadAuthCallbackPage() {
  const _ = useTranslation();
  const router = useRouter();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const href = window.location.href;
    window.history.replaceState(null, '', window.location.pathname);
    const record = takeWebHandoff(new URL(href).searchParams.get('req') ?? '');
    if (!record) {
      setFailed(true);
      return;
    }
    completeHandoff(href, record)
      .then(() => router.replace('/library'))
      .catch(() => setFailed(true));
  }, [router]);

  return (
    <main className='flex h-screen items-center justify-center'>
      <p>
        {failed
          ? _('AmpleRead sign-in failed. Try again from Settings.')
          : _('Signing in to AmpleRead…')}
      </p>
    </main>
  );
}
