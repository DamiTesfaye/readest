import React from 'react';
import { useTranslation } from '@/hooks/useTranslation';

export interface RevealSummary {
  chapter: number | null;
  revealed: number;
  total: number;
  newCount: number;
}

const RevealChip: React.FC<RevealSummary> = ({ chapter, revealed, total, newCount }) => {
  const _ = useTranslation();
  return (
    <div
      data-testid='mm-reveal-chip'
      className='nodrag eink-bordered bg-base-100 text-base-content absolute bottom-4 start-4 flex flex-col gap-1 rounded-2xl px-3 py-2 text-xs shadow-md'
    >
      <span className='font-semibold'>
        {chapter === null ? _('Revealed so far') : _('Revealed to ch. {{chapter}}', { chapter })}
      </span>
      <progress
        className='progress h-1.5 w-36'
        value={revealed}
        max={Math.max(total, 1)}
        aria-label={_('Revealed nodes')}
      />
      <span className='flex items-center gap-2'>
        {_('{{revealed}} of {{total}}', { revealed, total })}
        {newCount > 0 && (
          <span className='bg-base-content text-base-100 rounded-full px-1.5 py-0.5 font-semibold'>
            {_('{{count}} new', { count: newCount })}
          </span>
        )}
      </span>
    </div>
  );
};

export default RevealChip;
