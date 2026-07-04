import React from 'react';
import clsx from 'clsx';
import { CgColorPicker } from 'react-icons/cg';
import { MdRadioButtonUnchecked, MdRadioButtonChecked } from 'react-icons/md';
import { PiPlus } from 'react-icons/pi';
import { Theme } from '@/styles/themes';
import { useTranslation } from '@/hooks/useTranslation';
import { useResponsiveSize } from '@/hooks/useResponsiveSize';
import { SectionTitle } from '../primitives';

const CARD_ASSETS = '/images/theme-cards';

interface ThemeColorSelectorProps {
  themes: Theme[];
  themeColor: string;
  isDarkMode: boolean;
  onThemeColorChange: (name: string) => void;
  onEditTheme: (name: string) => void;
  onCreateTheme: () => void;
}

const ThemeColorSelector: React.FC<ThemeColorSelectorProps> = ({
  themes,
  themeColor,
  isDarkMode,
  onThemeColorChange,
  onEditTheme,
  onCreateTheme,
}) => {
  const _ = useTranslation();
  const iconSize16 = useResponsiveSize(16);
  const iconSize24 = useResponsiveSize(24);

  // The hidden `default` appearance is controlled by the mode toggle above, not
  // shown as a card.
  const cards = themes.filter((t) => !t.hidden);

  const cardBg = (theme: Theme) =>
    isDarkMode ? theme.colors.dark['base-100'] : theme.colors.light['base-100'];
  const cardFg = (theme: Theme) =>
    isDarkMode ? theme.colors.dark['base-content'] : theme.colors.light['base-content'];

  const RadioPill = ({ theme, selected }: { theme: Theme; selected: boolean }) => (
    <span
      className='absolute right-2 top-2 flex items-center gap-1 rounded-full px-2 py-1 text-sm font-medium backdrop-blur-sm'
      style={{ backgroundColor: cardBg(theme), color: cardFg(theme) }}
    >
      <span className='max-w-[8rem] truncate'>{_(theme.label)}</span>
      {selected ? (
        <MdRadioButtonChecked size={iconSize16} />
      ) : (
        <MdRadioButtonUnchecked size={iconSize16} />
      )}
    </span>
  );

  return (
    <div>
      <SectionTitle className='mb-2'>
        {_('Prefer something different? Create your own theme')}
      </SectionTitle>
      {/* CSS-columns masonry: cards keep their natural artwork aspect and flow
          into two balanced columns. */}
      <div className='columns-2 gap-4 [column-fill:_balance]'>
        {cards.map((theme) => {
          const { name, label, scene, isCustomizale } = theme;
          const selected = themeColor === name;
          return (
            <button
              key={name}
              tabIndex={0}
              onClick={() => onThemeColorChange(name)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  onThemeColorChange(name);
                }
                e.stopPropagation();
              }}
              aria-pressed={selected}
              // Selection reads through a 2px border in the card's own text
              // color (guaranteed contrast, works on e-ink where hover/shadow
              // don't) plus the checked radio in the pill.
              className={clsx(
                'eink-bordered relative mb-4 flex w-full break-inside-avoid flex-col overflow-hidden rounded-lg border-2 shadow-md',
                selected ? 'border-current' : 'border-transparent',
              )}
              style={{ backgroundColor: cardBg(theme), color: cardFg(theme) }}
            >
              <input
                aria-label={_(label)}
                type='radio'
                name='theme'
                value={name}
                checked={selected}
                onChange={() => onThemeColorChange(name)}
                className='hidden'
              />
              {scene ? (
                // Scene card: artwork fills the card; the themed background
                // shows through until the image loads (or if it is missing).
                <img
                  src={`${CARD_ASSETS}/${name}.svg`}
                  alt=''
                  className='h-auto min-h-[7rem] w-full object-cover'
                />
              ) : (
                // Custom theme: no artwork — a themed swatch panel.
                <span className='flex min-h-[7rem] w-full items-center justify-center p-4'>
                  {_(label)}
                </span>
              )}
              <RadioPill theme={theme} selected={selected} />
              {isCustomizale && selected && (
                <span
                  role='button'
                  tabIndex={0}
                  aria-label={_('Edit theme')}
                  onClick={(e) => {
                    e.stopPropagation();
                    onEditTheme(name);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.stopPropagation();
                      onEditTheme(name);
                    }
                  }}
                  className='absolute left-2 top-2'
                >
                  <CgColorPicker size={iconSize16} />
                </span>
              )}
            </button>
          );
        })}
        <button
          className='eink-bordered mb-4 flex min-h-[7rem] w-full break-inside-avoid cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed p-4 shadow-md'
          onClick={onCreateTheme}
        >
          <PiPlus size={iconSize24} />
          <span className='max-w-full truncate'>{_('Custom')}</span>
        </button>
      </div>
    </div>
  );
};

export default ThemeColorSelector;
