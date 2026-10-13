import React from 'react';

import type { Book } from '@/types/book';
import { useTranslation } from '@/hooks/useTranslation';
import { getProgressPercentage } from '@/utils/bookProgress';

interface LibraryBookItemProps {
  book: Book;
  isOpen: boolean;
  showProgress: boolean;
  onSelect: (book: Book) => void;
}

const LibraryBookItem: React.FC<LibraryBookItemProps> = ({
  book,
  isOpen,
  showProgress,
  onSelect,
}) => {
  const _ = useTranslation();
  const percentage = showProgress ? getProgressPercentage(book) : null;
  const status = isOpen ? _('Open') : percentage !== null ? `${percentage}%` : '';

  return (
    <button
      type='button'
      title={book.title}
      className='hover:bg-base-content/5 flex w-56 shrink-0 items-start gap-3 rounded-md p-2 text-start'
      onClick={() => onSelect(book)}
    >
      <img
        src={book.coverImageUrl ?? ''}
        alt=''
        loading='lazy'
        className='aspect-auto max-h-24 w-16 shrink-0 rounded-sm object-cover shadow-md'
        onError={(e) => {
          (e.target as HTMLImageElement).style.visibility = 'hidden';
        }}
      />
      <div className='flex min-w-0 flex-col gap-0.5'>
        <span className='text-base-content line-clamp-3 text-sm font-medium [font-family:"Avenir_Next_LT_Pro"]'>
          {book.title}
        </span>
        <span className='text-base-content/60 popover-label line-clamp-2'>{book.author}</span>
        <span className='text-base-content/60 mt-1 text-xs font-light [font-family:Avenir,"Avenir_Next_LT_Pro",sans-serif]'>
          {status || ' '}
        </span>
      </div>
    </button>
  );
};

export default LibraryBookItem;
