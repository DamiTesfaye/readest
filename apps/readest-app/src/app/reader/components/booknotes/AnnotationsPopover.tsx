import clsx from 'clsx';
import React, { useCallback, useMemo } from 'react';

import type { BookNote } from '@/types/book';
import { useBookDataStore } from '@/store/bookDataStore';
import { useReaderStore } from '@/store/readerStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useThemeStore } from '@/store/themeStore';
import { useTranslation } from '@/hooks/useTranslation';
import { eventDispatcher } from '@/utils/event';
import { formatBooknoteDate } from '@/utils/time';
import type { PopoverPlacement } from '@/utils/popover';
import type { Rect } from '@/utils/sel';
import ToolbarPopover from '@/components/ToolbarPopover';
import PopoverTitleBar from '@/components/PopoverTitleBar';
import { getToolbarIconSrc } from '@/utils/toolbarIcons';
import type { SystemSettings } from '@/types/settings';
import { getHighlightColorHex } from '../../utils/annotatorUtil';
import { selectAnnotationEntries } from './selectors';

export const ANNOTATIONS_POPOVER_WIDTH = 320;
const MAX_POPOVER_HEIGHT = 480;

interface AnnotationsPopoverProps {
  bookKey: string;
  isOpen: boolean;
  anchorEl: HTMLElement | null;
  getPlacement?: (anchorRect: Rect, viewport: Rect) => PopoverPlacement;
  onClose: () => void;
}

const getExcerptClassName = (item: BookNote) =>
  clsx(
    'annotation-text inline text-xs leading-relaxed [font-family:"Avenir_Next_LT_Pro"]',
    (item.style === 'underline' || item.style === 'squiggly') && 'underline decoration-2',
    item.style === 'squiggly' && 'decoration-wavy',
    item.style === 'strikethrough' && 'line-through decoration-2',
    item.style === 'highlight' && 'rounded-[4px] px-[2px] py-[1px]',
  );

const getExcerptStyle = (settings: SystemSettings, item: BookNote): React.CSSProperties => {
  const hex = getHighlightColorHex(settings, item.color) ?? item.color;
  if (!hex) return {};
  if (item.style === 'highlight') {
    return {
      backgroundColor: `color-mix(in srgb, ${hex} calc(var(--overlayer-highlight-opacity, 0.3) * 100%), transparent)`,
    };
  }
  if (item.style === 'underline' || item.style === 'squiggly' || item.style === 'strikethrough') {
    return {
      textDecorationColor: `color-mix(in srgb, ${hex} 80%, transparent)`,
    };
  }
  return {};
};

const AnnotationsPopover: React.FC<AnnotationsPopoverProps> = ({
  bookKey,
  isOpen,
  anchorEl,
  getPlacement,
  onClose,
}) => {
  const _ = useTranslation();
  const { settings } = useSettingsStore();
  const { themeColor, isDarkMode } = useThemeStore();
  const { getConfig } = useBookDataStore();
  const { getView } = useReaderStore();

  const booknotes = getConfig(bookKey)?.booknotes;
  const entries = useMemo(() => selectAnnotationEntries(booknotes ?? []), [booknotes]);

  const handleNavigate = useCallback(
    (item: BookNote) => {
      eventDispatcher.dispatch('navigate', { bookKey, cfi: item.cfi });
      getView(bookKey)?.goTo(item.cfi);
      onClose();
    },
    [bookKey, getView, onClose],
  );

  return (
    <ToolbarPopover
      isOpen={isOpen}
      anchorEl={anchorEl}
      width={ANNOTATIONS_POPOVER_WIDTH}
      maxHeight={MAX_POPOVER_HEIGHT}
      getPlacement={getPlacement}
      className='!overflow-hidden'
      onClose={onClose}
    >
      <div className='flex max-h-full flex-col'>
        <div className='bg-base-200 flex flex-col gap-2 px-4 pb-2 pt-4'>
          <PopoverTitleBar title={_('Annotations')} showDivider />
        </div>
        {entries.length === 0 ? (
          <div className='flex select-none flex-col items-center gap-1 px-6 pb-6 pt-4 text-center'>
            <img
              src={getToolbarIconSrc('annotations-cup', themeColor, isDarkMode)}
              alt=''
              className='mb-1 h-16 w-auto object-contain'
            />
            <p className='popover-title text-base-content text-sm'>{_('No Annotations')}</p>
            <p className='text-base-content/55 popover-label leading-relaxed'>
              {_('Select text while reading to highlight or underline it')}
            </p>
          </div>
        ) : (
          <div className='no-scrollbar flex flex-col gap-1 overflow-y-auto overscroll-contain px-3 pb-3 pt-1'>
            {entries.map((item) => (
              <div
                key={item.id}
                className='hover:bg-base-content/5 flex flex-col gap-2 rounded-lg p-3 transition-colors'
              >
                <button
                  type='button'
                  className='w-full text-start'
                  onClick={() => handleNavigate(item)}
                >
                  <span className='text-base-content/85 line-clamp-2'>
                    <span
                      className={getExcerptClassName(item)}
                      style={getExcerptStyle(settings, item)}
                    >
                      {item.text || item.note}
                    </span>
                  </span>
                </button>
                <div className='flex items-center justify-between gap-3'>
                  <span className='popover-label text-base-content/60'>
                    {formatBooknoteDate(item.createdAt)}
                  </span>
                  {item.page ? (
                    <span className='flex items-baseline gap-1'>
                      <span className='popover-label text-base-content/60'>{_('Page')}</span>
                      <span className='popover-title text-base-content text-sm'>{item.page}</span>
                    </span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </ToolbarPopover>
  );
};

export default AnnotationsPopover;
