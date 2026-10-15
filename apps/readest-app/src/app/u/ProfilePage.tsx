'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { Card } from '@/components/landing/Card';
import { ProfileBody } from '@/components/margins/feed/ProfileSheet';
import { useTranslation } from '@/hooks/useTranslation';

const ProfileRoute = () => {
  const _ = useTranslation();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const fromPath = pathname?.match(/^\/@([^/]+)/)?.[1];
  const handle = searchParams?.get('handle') || (fromPath ? decodeURIComponent(fromPath) : null);
  return (
    <main className='bg-base-200 flex min-h-dvh flex-col items-center justify-center p-4 sm:p-8'>
      <Card>
        {handle ? (
          <ProfileBody handle={handle} />
        ) : (
          <p className='text-center'>{_("This profile isn't available")}</p>
        )}
      </Card>
    </main>
  );
};

export default ProfileRoute;
