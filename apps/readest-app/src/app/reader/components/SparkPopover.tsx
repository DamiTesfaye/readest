import React, { useEffect, useState } from 'react';

import { useTranslation } from '@/hooks/useTranslation';
import ToolbarPopover from '@/components/ToolbarPopover';
import SparkTileArt from '@/components/sparkrive/SparkTileArt';
import { useMindmapViewStore } from '@/store/mindmapViewStore';
import { eventDispatcher } from '@/utils/event';

export const SPARK_POPOVER_WIDTH = 380;

interface SparkPopoverProps {
  bookKey: string;
  isOpen: boolean;
  anchorEl: HTMLElement | null;
  onClose: () => void;
  onToggleTTS: () => void;
}

const ITEM_CLASS = 'flex flex-col items-center gap-1.5 px-1 pb-1 pt-2';
const TITLE_CLASS =
  'popover-action-label text-base-content whitespace-nowrap text-sm leading-tight';
const SUBTITLE_CLASS = 'popover-label text-base-content/60 text-xxs leading-tight';
const OPEN_STAGGER_MS = 150;

const SparkPopover: React.FC<SparkPopoverProps> = ({
  bookKey,
  isOpen,
  anchorEl,
  onClose,
  onToggleTTS,
}) => {
  const _ = useTranslation();
  const [hoveredIcon, setHoveredIcon] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) setHoveredIcon(null);
  }, [isOpen]);

  const hoverHandlers = (icon: string) => ({
    onPointerEnter: (e: React.PointerEvent) => {
      if (e.pointerType !== 'touch') setHoveredIcon(icon);
    },
    onPointerLeave: () => setHoveredIcon(null),
  });

  const renderArt = (icon: string, imgClassName: string, index: number) => (
    <SparkTileArt
      icon={icon}
      imgClassName={imgClassName}
      hovered={hoveredIcon === icon}
      openDelayMs={index * OPEN_STAGGER_MS}
    />
  );

  const handleComingSoon = () => {
    eventDispatcher.dispatch('toast', { type: 'info', message: _('Coming soon') });
    onClose();
  };

  const handleOpenMindmap = () => {
    useMindmapViewStore
      .getState()
      .openEntry(bookKey)
      .catch((error: unknown) => {
        console.error('mindmap: failed to open', error);
        eventDispatcher.dispatch('toast', {
          type: 'error',
          message: _('Could not open the mind map'),
        });
      });
    anchorEl?.focus({ preventScroll: true });
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
      onClick: handleOpenMindmap,
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
        {simpleItems.map((item, index) => (
          <button
            key={item.icon}
            type='button'
            className={ITEM_CLASS}
            onClick={item.onClick}
            {...hoverHandlers(item.icon)}
          >
            <span className='flex h-20 items-center justify-center'>
              {renderArt(item.icon, item.iconClass, index)}
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
          {...hoverHandlers('discuss')}
        >
          <span className='flex h-20 items-center justify-center'>
            {renderArt('discuss', 'h-14', simpleItems.length)}
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
          {...hoverHandlers('gallery')}
        >
          <span className='flex h-20 items-center justify-center'>
            {renderArt('gallery', 'h-12', simpleItems.length + 1)}
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
