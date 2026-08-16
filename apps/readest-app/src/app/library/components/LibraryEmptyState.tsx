import * as React from 'react';
import clsx from 'clsx';

import { useAuth } from '@/context/AuthContext';
import { useTranslation } from '@/hooks/useTranslation';
import { useAppRouter } from '@/hooks/useAppRouter';
import { navigateToLogin } from '@/utils/nav';

interface LibraryEmptyStateProps {
  onImport: () => void;
}

const LibraryEmptyState: React.FC<LibraryEmptyStateProps> = ({ onImport }) => {
  const _ = useTranslation();
  const { user } = useAuth();
  const router = useAppRouter();

  return (
    <div className='hero-content text-center'>
      <div className='flex max-w-md flex-col items-center'>
        <img
          src='/images/homepage/import-library-placeholder.svg'
          alt=''
          aria-hidden
          className='mb-6 h-32 w-auto'
        />
        <h1 className='mb-3 text-balance text-3xl font-semibold [font-family:Literata,serif]'>
          {_("Let's Fill These Shelves")}
        </h1>
        <p className='text-base-content/80 mb-8 max-w-xs text-pretty font-sans text-base leading-relaxed'>
          {_("Import your books and keep everything you're reading in one place")}
        </p>
        <div className='flex w-full max-w-xs flex-col items-center gap-3'>
          <button
            type='button'
            className={clsx(
              'bg-base-300 eink-bordered hover:bg-base-300/70 flex h-9 items-center rounded-lg px-4',
              'font-sans text-sm font-medium',
            )}
            onClick={onImport}
          >
            {_('Import to Library')}
          </button>
          {!user && (
            <button
              type='button'
              className={clsx(
                'text-base-content/70 hover:text-base-content mt-1 py-2 text-sm font-medium',
                'underline underline-offset-4',
                'focus-visible:text-base-content focus-visible:outline-none',
                'sm:hidden',
              )}
              onClick={() => navigateToLogin(router)}
            >
              {_('Sign in to sync your library')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default LibraryEmptyState;
