import type { Metadata } from 'next';
import CopyrightForm from './CopyrightForm';

export const metadata: Metadata = { title: 'Copyright notice · AmpleRead' };

export default function Page() {
  return (
    <main className='bg-base-200 flex min-h-dvh justify-center p-4 sm:p-8'>
      <div className='bg-base-100 w-full max-w-xl rounded-2xl p-6 shadow-md'>
        <CopyrightForm />
      </div>
    </main>
  );
}
