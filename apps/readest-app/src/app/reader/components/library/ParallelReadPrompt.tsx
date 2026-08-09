import React from 'react';

import type { Book } from '@/types/book';
import { useTranslation } from '@/hooks/useTranslation';
import ModalPortal from '@/components/ModalPortal';

interface ParallelReadPromptProps {
  book: Book;
  canReadParallel: boolean;
  onReadParallel: () => void;
  onReadSingle: () => void;
  onCancel: () => void;
}

const ParallelReadPrompt: React.FC<ParallelReadPromptProps> = ({
  book,
  canReadParallel,
  onReadParallel,
  onReadSingle,
  onCancel,
}) => {
  const _ = useTranslation();

  return (
    <ModalPortal>
      <div className='flex w-full items-center justify-center px-4'>
        <div
          role='none'
          className='absolute inset-0'
          onClick={onCancel}
          onContextMenu={(e) => {
            e.preventDefault();
            onCancel();
          }}
        />
        <div
          role='dialog'
          aria-modal='true'
          aria-label={_('Open book')}
          className='bg-base-300 eink-bordered relative flex w-full max-w-md flex-col gap-4 rounded-lg p-4 shadow-2xl'
        >
          <div className='flex items-start gap-3'>
            <img
              src={book.coverImageUrl ?? ''}
              alt=''
              className='aspect-auto max-h-20 w-14 shrink-0 rounded-sm object-cover shadow-md'
              onError={(e) => {
                (e.target as HTMLImageElement).style.visibility = 'hidden';
              }}
            />
            <div className='flex min-w-0 flex-col gap-1'>
              <span className='text-base-content text-sm font-bold'>{book.title}</span>
              <span className='text-base-content/60 text-xs'>{book.author}</span>
              <span className='text-base-content/80 mt-1 text-sm'>
                {_('How do you want to open this book?')}
              </span>
            </div>
          </div>
          <div className='flex flex-col gap-2 sm:flex-row sm:justify-end'>
            <button type='button' className='btn btn-ghost btn-sm' onClick={onCancel}>
              {_('Cancel')}
            </button>
            <button
              type='button'
              disabled={!canReadParallel}
              className='btn btn-sm eink-bordered'
              onClick={onReadParallel}
            >
              {_('Read in parallel')}
            </button>
            <button type='button' className='btn btn-primary btn-sm' onClick={onReadSingle}>
              {_('Read on its own')}
            </button>
          </div>
          {!canReadParallel && (
            <span className='text-base-content/60 text-xs'>
              {_("Parallel read isn't available for PDF or CBZ books.")}
            </span>
          )}
        </div>
      </div>
    </ModalPortal>
  );
};

export default ParallelReadPrompt;
