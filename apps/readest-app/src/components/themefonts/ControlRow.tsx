import clsx from 'clsx';
import React from 'react';
import { useEnv } from '@/context/EnvContext';
import { useThemeStore } from '@/store/themeStore';
import { useReaderStore } from '@/store/readerStore';
import { useTranslation } from '@/hooks/useTranslation';
import { saveViewSettings } from '@/helpers/settings';
import { getThemeFontsTriggerSrc } from '@/utils/toolbarIcons';
import { FONT_SIZE_STEP, stepFontSize } from './model';

const TOGGLE_ASSETS = '/images/theme-toggle';

interface ControlRowProps {
  bookKey: string;
}

const ControlRow: React.FC<ControlRowProps> = ({ bookKey }) => {
  const _ = useTranslation();
  const { envConfig } = useEnv();
  const { themeMode, themeColor, isDarkMode, setThemeMode } = useThemeStore();
  const { getViewSettings } = useReaderStore();
  const viewSettings = getViewSettings(bookKey);

  const adjustFontSize = (delta: number) => {
    if (!viewSettings) return;
    const next = stepFontSize(
      viewSettings.defaultFontSize ?? 16,
      delta,
      viewSettings.minimumFontSize ?? 1,
    );
    saveViewSettings(envConfig, bookKey, 'defaultFontSize', next);
  };

  const handleSystemToggle = () => {
    if (themeMode === 'auto') {
      setThemeMode(isDarkMode ? 'dark' : 'light');
    } else {
      setThemeMode('auto');
    }
  };

  const cloudBase = 'pointer-events-none absolute transition-all duration-500 ease-in-out';
  const shown = 'translate-y-0 opacity-100';
  const hidden = 'translate-y-[130%] opacity-0';

  return (
    <div className='flex items-center justify-between gap-2 px-4'>
      <div className='eink-bordered bg-base-300 flex h-9 items-center overflow-hidden rounded-full'>
        <button
          type='button'
          title={_('Decrease Font Size')}
          className='hover:bg-base-content/10 group flex h-full w-14 items-center justify-center'
          onClick={() => adjustFontSize(-FONT_SIZE_STEP)}
        >
          <img
            src={getThemeFontsTriggerSrc('small', themeColor, isDarkMode)}
            alt=''
            className='group-active:scale-x-110 group-active:scale-y-75 h-3 object-contain transition-transform duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)]'
          />
        </button>
        <div className='bg-base-content/20 h-5 w-px' />
        <button
          type='button'
          title={_('Increase Font Size')}
          className='hover:bg-base-content/10 group flex h-full w-14 items-center justify-center'
          onClick={() => adjustFontSize(FONT_SIZE_STEP)}
        >
          <img
            src={getThemeFontsTriggerSrc('large', themeColor, isDarkMode)}
            alt=''
            className='group-active:scale-x-110 group-active:scale-y-75 h-4.5 max-h-5 object-contain transition-transform duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)]'
          />
        </button>
      </div>

      <button
        type='button'
        title={_('Follow System Appearance')}
        aria-pressed={themeMode === 'auto'}
        className='eink-bordered bg-base-300 hover:bg-base-content/10 group flex h-9 w-9 items-center justify-center rounded-full p-1.5'
        onClick={handleSystemToggle}
      >
        <img
          src={
            themeMode === 'auto'
              ? `${TOGGLE_ASSETS}/system_preference_theme_${isDarkMode ? 'light' : 'dark'}.svg`
              : `${TOGGLE_ASSETS}/system_preference_theme.svg`
          }
          alt=''
          className='group-active:scale-75 h-full w-full transition-transform duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)]'
        />
      </button>

      <button
        type='button'
        role='switch'
        aria-checked={isDarkMode}
        aria-label={isDarkMode ? _('Light Mode') : _('Dark Mode')}
        className='eink-bordered relative h-9 w-24 overflow-hidden rounded-full transition-colors duration-500'
        style={{ backgroundColor: isDarkMode ? '#101a33' : '#9bd3f0' }}
        onClick={() => setThemeMode(isDarkMode ? 'light' : 'dark')}
      >
        <img
          src={`${TOGGLE_ASSETS}/cloud_day_layer_2.svg`}
          alt=''
          className={clsx(
            cloudBase,
            '-bottom-1 right-1 w-10 delay-75',
            !isDarkMode ? shown : hidden,
          )}
        />
        <img
          src={`${TOGGLE_ASSETS}/cloud_day_layer_1.svg`}
          alt=''
          className={clsx(cloudBase, '-bottom-6 -right-1 w-16', !isDarkMode ? shown : hidden)}
        />
        <img
          src={`${TOGGLE_ASSETS}/cloud_night_layer_2.svg`}
          alt=''
          className={clsx(
            cloudBase,
            '-bottom-3 left-8 w-10 delay-150',
            isDarkMode ? shown : hidden,
          )}
        />
        <img
          src={`${TOGGLE_ASSETS}/cloud_night_layer_1.svg`}
          alt=''
          className={clsx(
            cloudBase,
            '-bottom-5 -left-3 w-16 delay-75',
            isDarkMode ? shown : hidden,
          )}
        />
        <span
          className={clsx(
            'absolute left-1 top-1 block h-7 w-7 transition-transform duration-500 ease-in-out',
            isDarkMode && 'translate-x-[60px]',
          )}
        >
          <img
            src={`${TOGGLE_ASSETS}/sun.svg`}
            alt=''
            className={clsx(
              'absolute inset-0 h-full w-full transition-opacity delay-150 duration-200',
              isDarkMode ? 'opacity-0' : 'opacity-100',
            )}
          />
          <img
            src={`${TOGGLE_ASSETS}/moon.svg`}
            alt=''
            className={clsx(
              'absolute inset-0 h-full w-full transition-opacity delay-150 duration-200',
              isDarkMode ? 'opacity-100' : 'opacity-0',
            )}
          />
        </span>
      </button>
    </div>
  );
};

export default ControlRow;
