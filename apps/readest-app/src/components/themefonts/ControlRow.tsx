import clsx from 'clsx';
import React from 'react';
import { useEnv } from '@/context/EnvContext';
import { useThemeStore } from '@/store/themeStore';
import { useReaderStore } from '@/store/readerStore';
import { useTranslation } from '@/hooks/useTranslation';
import { saveViewSettings } from '@/helpers/settings';
import { FONT_SIZE_STEP, stepFontSize } from './model';

const TOGGLE_ASSETS = '/images/theme-toggle';

interface ControlRowProps {
  bookKey: string;
}

const ControlRow: React.FC<ControlRowProps> = ({ bookKey }) => {
  const _ = useTranslation();
  const { envConfig } = useEnv();
  const { themeMode, isDarkMode, setThemeMode } = useThemeStore();
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

  const cloudBase =
    'pointer-events-none absolute transition-all duration-500 ease-in-out motion-reduce:transition-none';
  const shown = 'translate-y-0 opacity-100';
  const hidden = 'translate-y-[130%] opacity-0';

  return (
    <div className='flex items-center justify-between gap-2 px-4'>
      <div className='eink-bordered bg-base-200 flex h-9 items-center overflow-hidden rounded-full'>
        <button
          type='button'
          title={_('Decrease Font Size')}
          className='hover:bg-base-300 flex h-full w-10 items-center justify-center'
          onClick={() => adjustFontSize(-FONT_SIZE_STEP)}
        >
          <span className='text-base-content text-xs font-bold'>A</span>
        </button>
        <div className='bg-base-300 h-5 w-px' />
        <button
          type='button'
          title={_('Increase Font Size')}
          className='hover:bg-base-300 flex h-full w-10 items-center justify-center'
          onClick={() => adjustFontSize(FONT_SIZE_STEP)}
        >
          <span className='text-base-content text-lg font-bold'>A</span>
        </button>
      </div>

      <button
        type='button'
        title={_('Follow System Appearance')}
        aria-pressed={themeMode === 'auto'}
        className={clsx(
          'eink-bordered hover:bg-base-300 flex h-9 w-9 items-center justify-center rounded-full p-1.5',
          themeMode === 'auto' && 'bg-base-300',
        )}
        onClick={handleSystemToggle}
      >
        <img src={`${TOGGLE_ASSETS}/system_preference.svg`} alt='' className='h-full w-full' />
      </button>

      <button
        type='button'
        role='switch'
        aria-checked={isDarkMode}
        aria-label={isDarkMode ? _('Light Mode') : _('Dark Mode')}
        className='eink-bordered relative h-9 w-24 overflow-hidden rounded-full transition-colors duration-500 motion-reduce:transition-none'
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
            'absolute left-1 top-1 block h-7 w-7 transition-transform duration-500 ease-in-out motion-reduce:transition-none',
            isDarkMode && 'translate-x-14',
          )}
        >
          <img
            src={`${TOGGLE_ASSETS}/sun.svg`}
            alt=''
            className={clsx(
              'absolute inset-0 h-full w-full transition-opacity delay-150 duration-200 motion-reduce:transition-none',
              isDarkMode ? 'opacity-0' : 'opacity-100',
            )}
          />
          <img
            src={`${TOGGLE_ASSETS}/moon.svg`}
            alt=''
            className={clsx(
              'absolute inset-0 h-full w-full transition-opacity delay-150 duration-200 motion-reduce:transition-none',
              isDarkMode ? 'opacity-100' : 'opacity-0',
            )}
          />
        </span>
      </button>
    </div>
  );
};

export default ControlRow;
