import clsx from 'clsx';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeStore } from '@/store/themeStore';
import {
  backgroundForSwatchTap,
  getBackgroundSwatches,
  getSelectedSwatchIndex,
} from '@/styles/backgrounds';
import { SettingLabel } from '../primitives';

// Each slot swaps to its light or dark equivalent when the appearance flips, so
// the stored choice (a slot, not a hex) carries across modes.
const BackgroundSwatchRow = () => {
  const _ = useTranslation();
  const { themeColor, isDarkMode, themeBackground, setThemeBackground } = useThemeStore();
  const swatches = getBackgroundSwatches(themeColor, isDarkMode);
  const selectedIndex = getSelectedSwatchIndex(themeBackground);

  return (
    <div className='px-4' data-setting-id='settings.color.background'>
      <SettingLabel>{_('Background')}</SettingLabel>
      <div role='radiogroup' aria-label={_('Background')} className='mt-2 flex items-center gap-3'>
        {swatches.map((hex, index) => (
          <button
            key={hex}
            type='button'
            role='radio'
            aria-checked={selectedIndex === index}
            aria-label={index === 0 ? _('Neutral background') : `${_('Theme background')} ${index}`}
            onClick={() => setThemeBackground(backgroundForSwatchTap(index))}
            className={clsx(
              'eink-bordered border-base-content/20 h-8 w-8 rounded-full border transition-transform hover:scale-110',
              selectedIndex === index
                ? 'ring-base-content ring-offset-base-100 ring-2 ring-offset-2'
                : 'ring-0',
            )}
            style={{ backgroundColor: hex }}
          />
        ))}
      </div>
    </div>
  );
};

export default BackgroundSwatchRow;
