import clsx from 'clsx';
import React from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { SettingLabel } from '../primitives';

const ASSETS = '/images/theme-toggle';

interface ThemeModeSelectorProps {
  themeMode: 'auto' | 'light' | 'dark';
  /** Effective mode currently rendered (auto resolves to system). */
  isDarkMode: boolean;
  /** Current OS scheme — drives the A button's indicator artwork. */
  systemIsDarkMode: boolean;
  onThemeModeChange: (mode: 'auto' | 'light' | 'dark') => void;
}

const ThemeModeSelector: React.FC<ThemeModeSelectorProps> = ({
  themeMode,
  isDarkMode,
  systemIsDarkMode,
  onThemeModeChange,
}) => {
  const _ = useTranslation();

  const cloudBase =
    'pointer-events-none absolute transition-all duration-500 ease-in-out motion-reduce:transition-none';
  const shown = 'translate-y-0 opacity-100';
  const hidden = 'translate-y-[130%] opacity-0';

  return (
    <div className='flex items-center justify-between px-4'>
      <SettingLabel>{_('Theme Mode')}</SettingLabel>
      <div className='flex items-center gap-3'>
        <button
          type='button'
          title={_('Auto Mode')}
          aria-pressed={themeMode === 'auto'}
          className={clsx(
            'btn btn-ghost btn-circle btn-sm eink-bordered p-1',
            themeMode === 'auto' && 'btn-active bg-base-300',
          )}
          onClick={() => onThemeModeChange('auto')}
        >
          <img
            src={`${ASSETS}/${systemIsDarkMode ? 'auto_dark' : 'auto_light'}.svg`}
            alt=''
            className='h-full w-full'
          />
        </button>

        <button
          type='button'
          role='switch'
          aria-checked={isDarkMode}
          aria-label={isDarkMode ? _('Light Mode') : _('Dark Mode')}
          className='eink-bordered relative h-12 w-36 overflow-hidden rounded-full transition-colors duration-500 motion-reduce:transition-none'
          style={{ backgroundColor: isDarkMode ? '#101a33' : '#9bd3f0' }}
          onClick={() => onThemeModeChange(isDarkMode ? 'light' : 'dark')}
        >
          {/* Celestial body: travels left↔right; sun/moon crossfade mid-flight */}
          <span
            className={clsx(
              'absolute left-1 top-1 block h-10 w-10 transition-transform duration-500 ease-in-out motion-reduce:transition-none',
              isDarkMode && 'translate-x-24',
            )}
          >
            <img
              src={`${ASSETS}/sun.svg`}
              alt=''
              className={clsx(
                'absolute inset-0 h-full w-full transition-opacity delay-150 duration-200 motion-reduce:transition-none',
                isDarkMode ? 'opacity-0' : 'opacity-100',
              )}
            />
            <img
              src={`${ASSETS}/moon.svg`}
              alt=''
              className={clsx(
                'absolute inset-0 h-full w-full transition-opacity delay-150 duration-200 motion-reduce:transition-none',
                isDarkMode ? 'opacity-100' : 'opacity-0',
              )}
            />
          </span>

          {/* Day clouds: sink out through the bottom edge when going dark */}
          <img
            src={`${ASSETS}/cloud_day_layer_1.svg`}
            alt=''
            className={clsx(cloudBase, '-bottom-3 -right-2 w-24', !isDarkMode ? shown : hidden)}
          />
          <img
            src={`${ASSETS}/cloud_day_layer_2.svg`}
            alt=''
            className={clsx(
              cloudBase,
              'bottom-0 right-14 w-14 delay-75',
              !isDarkMode ? shown : hidden,
            )}
          />
          <img
            src={`${ASSETS}/cloud_day_layer_3.svg`}
            alt=''
            className={clsx(
              cloudBase,
              'bottom-1 right-24 w-9 delay-150',
              !isDarkMode ? shown : hidden,
            )}
          />

          {/* Night clouds: rise into the opposite side when going dark */}
          <img
            src={`${ASSETS}/cloud_night_layer_1.svg`}
            alt=''
            className={clsx(
              cloudBase,
              '-bottom-3 -left-2 w-24 delay-75',
              isDarkMode ? shown : hidden,
            )}
          />
          <img
            src={`${ASSETS}/cloud_night_layer_2.svg`}
            alt=''
            className={clsx(
              cloudBase,
              'bottom-0 left-14 w-14 delay-150',
              isDarkMode ? shown : hidden,
            )}
          />
          <img
            src={`${ASSETS}/cloud_night_layer_3.svg`}
            alt=''
            className={clsx(cloudBase, 'bottom-1 left-24 w-9', isDarkMode ? shown : hidden)}
          />
        </button>
      </div>
    </div>
  );
};

export default ThemeModeSelector;
