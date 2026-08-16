import React from 'react';

import { useTranslation } from '@/hooks/useTranslation';
import ToolbarPopover from '@/components/ToolbarPopover';
import { eventDispatcher } from '@/utils/event';

export const SPARK_POPOVER_WIDTH = 380;

interface SparkPopoverProps {
  isOpen: boolean;
  anchorEl: HTMLElement | null;
  onClose: () => void;
  onToggleTTS: () => void;
}

const ITEM_CLASS = 'flex flex-col items-center gap-1.5 px-1 pb-1 pt-2';
const TITLE_CLASS =
  'popover-action-label text-base-content whitespace-nowrap text-sm leading-tight';
const SUBTITLE_CLASS = 'popover-label text-base-content/60 text-xxs leading-tight';

const SparkPopover: React.FC<SparkPopoverProps> = ({ isOpen, anchorEl, onClose, onToggleTTS }) => {
  const _ = useTranslation();

  const handleComingSoon = () => {
    eventDispatcher.dispatch('toast', { type: 'info', message: _('Coming soon') });
    onClose();
  };

  const handleToggleTTS = () => {
    onToggleTTS();
    onClose();
  };

  const simpleItems = [
    {
      icon: 'mindmap',
      title: _('Mindmap'),
      subtitle: _('Organise thoughts'),
      iconClass: 'h-20',
      onClick: handleComingSoon,
    },
    {
      icon: 'mood-modes',
      title: _('Mood & Modes'),
      subtitle: _('Shape your reading experience'),
      iconClass: 'h-20',
      onClick: handleComingSoon,
    },
    {
      icon: 'summarise',
      title: _('Summarise'),
      subtitle: _('Shorten your reading'),
      iconClass: 'h-[4.5rem]',
      onClick: handleComingSoon,
    },
    {
      icon: 'tts',
      title: _('TTS'),
      subtitle: _('Read texts aloud'),
      iconClass: 'h-[4.5rem]',
      onClick: handleToggleTTS,
    },
  ];

  return (
    <ToolbarPopover
      isOpen={isOpen}
      anchorEl={anchorEl}
      width={SPARK_POPOVER_WIDTH}
      onClose={onClose}
    >
      <div className='grid grid-cols-3 gap-x-3 gap-y-3 px-4 pb-4 pt-3'>
        {simpleItems.map((item) => (
          <button key={item.icon} type='button' className={ITEM_CLASS} onClick={item.onClick}>
            <span className='flex h-20 items-center justify-center'>
              <img
                src={`/images/spark/${item.icon}.svg`}
                alt=''
                className={`${item.iconClass} w-auto object-contain`}
              />
            </span>
            <span className='flex flex-col items-center gap-0.5'>
              <span className={TITLE_CLASS}>{item.title}</span>
              <span className={SUBTITLE_CLASS}>{item.subtitle}</span>
            </span>
          </button>
        ))}
        <button
          type='button'
          className={`${ITEM_CLASS} col-start-2 row-start-2`}
          onClick={handleComingSoon}
        >
          <span className='flex h-20 items-center justify-center'>
            <img src='/images/spark/discuss.svg' alt='' className='h-14 w-auto object-contain' />
          </span>
          <span className='flex flex-col items-center'>
            <span className={TITLE_CLASS}>{_('Discuss')}</span>
            <span className={SUBTITLE_CLASS}>{_('with')}</span>
            <span className='popover-title text-base-content text-xs leading-tight'>
              {_('Tim & Alice')}
            </span>
            <span className={SUBTITLE_CLASS}>{_('Host-led podcast')}</span>
          </span>
        </button>
        <button
          type='button'
          className={`${ITEM_CLASS} col-start-3 row-start-2`}
          onClick={handleComingSoon}
        >
          <span className='flex h-20 items-center justify-center'>
            <img src='/images/spark/gallery.svg' alt='' className='h-12 w-auto object-contain' />
          </span>
          <span className='flex flex-col items-center gap-0.5'>
            <span className={TITLE_CLASS}>{_('Gallery')}</span>
            <span className={SUBTITLE_CLASS}>{_('Create & browse media')}</span>
          </span>
        </button>
      </div>
    </ToolbarPopover>
  );
};

export default SparkPopover;
