import type React from 'react';
import { memo, useMemo } from 'react';
import type { Book } from '@/types/book';
import { useTranslation } from '@/hooks/useTranslation';
import { SHOW_UNREAD_STATUS_BADGE } from '@/services/constants';
import { getProgressPercentage } from '@/utils/bookProgress';
import StatusBadge from './StatusBadge';

interface ReadingProgressProps {
  book: Book;
}

const ReadingProgress: React.FC<ReadingProgressProps> = memo(
  ({ book }) => {
    const _ = useTranslation();
    const progressPercentage = useMemo(() => getProgressPercentage(book), [book]);

    if (book.readingStatus === 'finished') {
      return (
        <div className='flex justify-start'>
          <StatusBadge status={book.readingStatus}>{_('Finished')}</StatusBadge>
        </div>
      );
    }

    if (book.readingStatus === 'abandoned') {
      return (
        <div
          className='text-neutral-content/70 flex items-center justify-between gap-2 text-xs'
          role='status'
        >
          <StatusBadge status={book.readingStatus}>{_('On hold')}</StatusBadge>
          {progressPercentage !== null && !Number.isNaN(progressPercentage) && (
            <span>{progressPercentage}%</span>
          )}
        </div>
      );
    }

    if (book.readingStatus === 'unread') {
      if (SHOW_UNREAD_STATUS_BADGE) {
        return (
          <div className='flex justify-start'>
            <StatusBadge status={book.readingStatus}>{_('Unread')}</StatusBadge>
          </div>
        );
      } else {
        return <div className='flex justify-start'></div>;
      }
    }

    if (progressPercentage === null || Number.isNaN(progressPercentage)) {
      return <div className='flex justify-start'></div>;
    }

    return (
      <div
        className='text-neutral-content/70 flex justify-between text-xs'
        role='status'
        aria-label={`${progressPercentage}%`}
      >
        <span>{progressPercentage}%</span>
      </div>
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.book.hash === nextProps.book.hash &&
      prevProps.book.updatedAt === nextProps.book.updatedAt &&
      prevProps.book.readingStatus === nextProps.book.readingStatus
    );
  },
);

ReadingProgress.displayName = 'ReadingProgress';

export default ReadingProgress;
