import React from 'react';

import { useEnv } from '@/context/EnvContext';
import { useReaderStore } from '@/store/readerStore';
import { useThemeStore } from '@/store/themeStore';
import { useTranslation } from '@/hooks/useTranslation';
import { saveViewSettings } from '@/helpers/settings';
import ToolbarPopover from '@/components/ToolbarPopover';
import PopoverTitleBar from '@/components/PopoverTitleBar';
import { getThemeFontsTriggerSrc, getToolbarIconSrc } from '@/utils/toolbarIcons';

export const MORE_POPOVER_WIDTH = 300;

interface MorePopoverProps {
  bookKey: string;
  isOpen: boolean;
  anchorEl: HTMLElement | null;
  onClose: () => void;
  onGoHome: () => void;
  onOpenThemeFonts: () => void;
  onOpenBooknotes: () => void;
  onToggleAnnotations: () => void;
}

const ITEM_CLASS = 'flex flex-col items-center justify-center gap-2 px-2 pb-1';
const CAPTION_CLASS = 'popover-action-label text-base-content text-xs';
const SECTION_LABEL_CLASS = 'popover-label text-base-content/60';

const MorePopover: React.FC<MorePopoverProps> = ({
  bookKey,
  isOpen,
  anchorEl,
  onClose,
  onGoHome,
  onOpenThemeFonts,
  onOpenBooknotes,
  onToggleAnnotations,
}) => {
  const _ = useTranslation();
  const { envConfig } = useEnv();
  const { themeColor, isDarkMode } = useThemeStore();
  const { getViewSettings } = useReaderStore();

  const readingRulerEnabled = getViewSettings(bookKey)?.readingRulerEnabled ?? false;

  const handleToggleReadingRuler = () => {
    saveViewSettings(envConfig, bookKey, 'readingRulerEnabled', !readingRulerEnabled, false, false);
    onClose();
  };

  const handleToggleAnnotations = () => {
    onClose();
    onToggleAnnotations();
  };

  const handleGoHome = () => {
    onClose();
    onGoHome();
  };

  return (
    <ToolbarPopover
      isOpen={isOpen}
      anchorEl={anchorEl}
      width={MORE_POPOVER_WIDTH}
      onClose={onClose}
    >
      <div className='flex flex-col gap-4 px-4 pb-4 pt-4'>
        <PopoverTitleBar title={_('More')} showDivider />
        <div className='flex flex-col gap-1'>
          <span className={SECTION_LABEL_CLASS}>{_('Appearance')}</span>
          <div className='grid grid-cols-2'>
            <button type='button' className={ITEM_CLASS} onClick={onOpenThemeFonts}>
              <span className='flex h-8 items-end justify-center gap-0.5 pb-1.5'>
                <img
                  src={getThemeFontsTriggerSrc('small', themeColor, isDarkMode)}
                  alt=''
                  className='h-3.5 object-contain'
                />
                <img
                  src={getThemeFontsTriggerSrc('large', themeColor, isDarkMode)}
                  alt=''
                  className='h-5 object-contain'
                />
              </span>
              <span className={CAPTION_CLASS}>{_('Theme & Fonts')}</span>
            </button>
          </div>
        </div>
        <div className='flex flex-col gap-1'>
          <span className={SECTION_LABEL_CLASS}>{_('Notes & Highlights')}</span>
          <div className='grid grid-cols-2'>
            <button type='button' className={ITEM_CLASS} onClick={handleToggleAnnotations}>
              <span className='flex h-8 items-center justify-center'>
                <img
                  src={getToolbarIconSrc('annotations-cup', themeColor, isDarkMode)}
                  alt=''
                  className='h-8 w-auto object-contain'
                />
              </span>
              <span className={CAPTION_CLASS}>{_('Annotations')}</span>
            </button>
            <button type='button' className={ITEM_CLASS} onClick={onOpenBooknotes}>
              <span className='flex h-8 items-center justify-center'>
                <img
                  src={getToolbarIconSrc('bookmarks-notes', themeColor, isDarkMode)}
                  alt=''
                  className='h-7 w-auto object-contain'
                />
              </span>
              <span className={CAPTION_CLASS}>{_('Bookmarks & Notes')}</span>
            </button>
          </div>
        </div>
        <div className='flex flex-col gap-1'>
          <span className={SECTION_LABEL_CLASS}>{_('Reading Tools')}</span>
          <div className='grid grid-cols-2'>
            <button
              type='button'
              className={ITEM_CLASS}
              aria-pressed={readingRulerEnabled}
              onClick={handleToggleReadingRuler}
            >
              <span className='flex h-8 items-center justify-center'>
                <span className='relative'>
                  <img
                    src={getToolbarIconSrc('reading-ruler', themeColor, isDarkMode)}
                    alt=''
                    className='h-8 w-auto object-contain'
                  />
                  {readingRulerEnabled && (
                    <span className='bg-success absolute -right-4 top-0 h-2 w-2 rounded-full' />
                  )}
                </span>
              </span>
              <span className={CAPTION_CLASS}>{_('Reading Ruler')}</span>
            </button>
          </div>
        </div>
        <button
          type='button'
          className='eink-bordered bg-base-300 mt-1 flex w-full items-center justify-between gap-3 rounded-lg px-4 py-3 text-start transition-opacity hover:opacity-90'
          onClick={handleGoHome}
        >
          <span className='flex flex-col gap-0.5'>
            <span className={CAPTION_CLASS}>{_('Done reading for now?')}</span>
            <span className='popover-label text-base-content/60'>
              {_('Head back to your homepage')}
            </span>
          </span>
          <img
            src={getToolbarIconSrc('go-home', themeColor, isDarkMode)}
            alt=''
            className='h-6 w-auto object-contain'
          />
        </button>
      </div>
    </ToolbarPopover>
  );
};

export default MorePopover;
