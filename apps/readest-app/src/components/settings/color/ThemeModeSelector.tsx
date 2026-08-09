import clsx from 'clsx';
import React, { useState } from 'react';
import { impactFeedback } from '@tauri-apps/plugin-haptics';
import { useEnv } from '@/context/EnvContext';
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
  const { appService } = useEnv();

  const haptic = () => {
    if (appService?.hasHaptics) {
      impactFeedback('light');
    }
  };

  // Bumping this key remounts the auto-button artwork so the squash-and-stretch
  // keyframes replay on every click (including rapid repeats).
  const [autoSquashKey, setAutoSquashKey] = useState(0);
  const handleAutoClick = () => {
    haptic();
    setAutoSquashKey((k) => k + 1);
    onThemeModeChange('auto');
  };

  const handlePillClick = () => {
    haptic();
    onThemeModeChange(isDarkMode ? 'light' : 'dark');
  };

  const cloudBase = 'pointer-events-none absolute transition-all duration-500 ease-in-out';
  const shown = 'translate-y-0 opacity-100';
  const hidden = 'translate-y-[130%] opacity-0';

  return (
    <div className='flex items-center justify-between px-4'>
      <div className='flex flex-col'>
        <SettingLabel>{_('Select a default appearance')}</SettingLabel>
        <span className='text-neutral-content text-xs'>{_('(System/Light/Dark)')}</span>
      </div>
      <div className='flex items-center gap-3'>
        <button
          type='button'
          title={_('Auto Mode')}
          aria-pressed={themeMode === 'auto'}
          className={clsx(
            'eink-bordered flex h-10 w-10 items-center justify-center rounded-full p-2',
            'transition-colors duration-200 hover:bg-base-300',
            themeMode === 'auto' && 'bg-base-300',
          )}
          onClick={handleAutoClick}
        >
          <img
            key={autoSquashKey}
            src={`${ASSETS}/${systemIsDarkMode ? 'auto_dark' : 'auto_light'}.svg`}
            alt=''
            className={clsx('h-full w-full', autoSquashKey > 0 && 'animate-squash-stretch')}
          />
        </button>

        <button
          type='button'
          role='switch'
          aria-checked={isDarkMode}
          aria-label={isDarkMode ? _('Light Mode') : _('Dark Mode')}
          className='eink-bordered relative h-12 w-36 overflow-hidden rounded-full transition-colors duration-500'
          style={{ backgroundColor: isDarkMode ? '#101a33' : '#9bd3f0' }}
          onClick={handlePillClick}
        >
          {/* Cloud stacking: layer 3 (back) → layer 2 → layer 1 (front).
              Bases sit below the pill edge so the clip makes them peek halfway. */}

          {/* Day clouds: sink out through the bottom edge when going dark */}
          <img
            src={`${ASSETS}/cloud_day_layer_3.svg`}
            alt=''
            className={clsx(
              cloudBase,
              '-bottom-2 right-14 w-12 delay-150',
              !isDarkMode ? shown : hidden,
            )}
          />
          <img
            src={`${ASSETS}/cloud_day_layer_2.svg`}
            alt=''
            className={clsx(
              cloudBase,
              '-bottom-2 right-1 w-16 delay-75',
              !isDarkMode ? shown : hidden,
            )}
          />
          <img
            src={`${ASSETS}/cloud_day_layer_1.svg`}
            alt=''
            className={clsx(cloudBase, '-bottom-10 -right-1 w-28', !isDarkMode ? shown : hidden)}
          />

          {/* Night clouds: rise into the opposite side when going dark */}
          {/* <img
            src={`${ASSETS}/cloud_night_layer_3.svg`}
            alt=''
            className={clsx(cloudBase, '-bottom-3 right-24 w-12', isDarkMode ? shown : hidden)}
          /> */}
          <img
            src={`${ASSETS}/cloud_night_layer_2.svg`}
            alt=''
            className={clsx(
              cloudBase,
              '-bottom-5 left-12 w-16 delay-150',
              isDarkMode ? shown : hidden,
            )}
          />
          <img
            src={`${ASSETS}/cloud_night_layer_1.svg`}
            alt=''
            className={clsx(
              cloudBase,
              '-bottom-8 -left-5 w-28 delay-75',
              isDarkMode ? shown : hidden,
            )}
          />

          {/* Celestial body last in DOM: travels above every cloud layer,
              sun/moon crossfade mid-flight */}
          <span
            className={clsx(
              'absolute left-1 top-1 block h-10 w-10 transition-transform duration-500 ease-in-out',
              isDarkMode && 'translate-x-24',
            )}
          >
            <img
              src={`${ASSETS}/sun.svg`}
              alt=''
              className={clsx(
                'absolute inset-0 h-full w-full transition-opacity delay-150 duration-200',
                isDarkMode ? 'opacity-0' : 'opacity-100',
              )}
            />
            <img
              src={`${ASSETS}/moon.svg`}
              alt=''
              className={clsx(
                'absolute inset-0 h-full w-full transition-opacity delay-150 duration-200',
                isDarkMode ? 'opacity-100' : 'opacity-0',
              )}
            />
          </span>
        </button>
      </div>
    </div>
  );
};

export default ThemeModeSelector;
