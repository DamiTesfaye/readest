import React from 'react';

import type { BookNote } from '@/types/book';
import { useTranslation } from '@/hooks/useTranslation';
import { formatBooknoteDate } from '@/utils/time';
import {
  BOOKMARK_RIBBON_COLOR,
  BookmarkRibbon,
  CopyIcon,
  DeleteIcon,
  EditIcon,
} from './BooknoteIcons';
import type { BooknoteEntry } from './selectors';

interface BooknoteEntryItemProps {
  entry: BooknoteEntry;
  onNavigate: (item: BookNote) => void;
  onCopy: (item: BookNote) => void;
  onEdit: (item: BookNote) => void;
  onDelete: (item: BookNote) => void;
}

const actionButtonClassName =
  'text-base-content/60 hover:text-base-content flex items-center transition-colors';

const BooknoteEntryItem: React.FC<BooknoteEntryItemProps> = ({
  entry,
  onNavigate,
  onCopy,
  onEdit,
  onDelete,
}) => {
  const _ = useTranslation();
  const { item } = entry;
  const date = formatBooknoteDate(item.createdAt);

  if (entry.kind === 'bookmark') {
    return (
      <div className='bg-base-300/60 hover:bg-base-300 eink-bordered group relative rounded-lg transition-colors'>
        <button
          type='button'
          title={entry.label}
          className='flex w-full flex-col gap-1 p-3 pe-11 text-start'
          onClick={() => onNavigate(item)}
        >
          <span className='popover-title text-base-content line-clamp-1 text-sm'>
            {entry.label}
          </span>
          <span className='popover-label text-base-content/60'>{date}</span>
        </button>
        <span
          className='pointer-events-none absolute end-4 top-0 h-6 w-3.5'
          style={{ color: BOOKMARK_RIBBON_COLOR }}
        >
          <BookmarkRibbon className='h-full w-full' />
        </span>
        <div className='absolute bottom-3 end-4 flex items-center gap-3'>
          <button
            type='button'
            aria-label={_('Delete')}
            className={`${actionButtonClassName} eink:opacity-100 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100`}
            onClick={() => onDelete(item)}
          >
            <DeleteIcon className='h-3.5 w-2.5' />
          </button>
          {item.page ? (
            <span className='popover-label text-base-content/70'>{item.page}</span>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className='hover:bg-base-content/5 flex flex-col gap-2 rounded-lg p-3 transition-colors'>
      <button
        type='button'
        className='flex w-full items-start gap-3 text-start'
        onClick={() => onNavigate(item)}
      >
        <span className='text-base-content/85 line-clamp-2 flex-1 text-xs leading-relaxed [font-family:"Avenir_Next_LT_Pro"]'>
          {item.text || item.note}
        </span>
        {item.page ? (
          <span className='popover-label text-base-content/70 shrink-0'>{item.page}</span>
        ) : null}
      </button>
      <div className='flex items-center justify-between gap-3'>
        <span className='popover-label text-base-content/60'>{date}</span>
        <div className='flex items-center gap-4' dir='ltr'>
          <button
            type='button'
            aria-label={_('Copy')}
            className={actionButtonClassName}
            onClick={() => onCopy(item)}
          >
            <CopyIcon className='h-3.5 w-3.5' />
          </button>
          <button
            type='button'
            aria-label={_('Edit')}
            className={actionButtonClassName}
            onClick={() => onEdit(item)}
          >
            <EditIcon className='h-3.5 w-3.5' />
          </button>
          <button
            type='button'
            aria-label={_('Delete')}
            className={actionButtonClassName}
            onClick={() => onDelete(item)}
          >
            <DeleteIcon className='h-3.5 w-2.5' />
          </button>
        </div>
      </div>
    </div>
  );
};

export default BooknoteEntryItem;
