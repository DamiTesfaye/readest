import type { Metadata } from 'next';
import ModerationQueue from './ModerationQueue';

export const metadata: Metadata = { title: 'Moderation · AmpleRead', robots: { index: false } };

export default function Page() {
  return (
    <main className='bg-base-200 min-h-dvh p-4 sm:p-8'>
      <ModerationQueue />
    </main>
  );
}
