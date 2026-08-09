import React, { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { CgColorPicker } from 'react-icons/cg';
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

// Custom pill radio: an open ring when idle, a filled dot when selected. The
// ring inherits the card's text color (`border-current`) so it reads on any
// artwork. Wobbles (via remount key) when the selection lands on it.
const PillRadio = ({ selected, animKey }: { selected: boolean; animKey?: number }) => (
  <span
    key={animKey}
    className={clsx(
      'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 border-current',
      selected && 'animate-wobble',
    )}
  >
    {selected && <span className='h-2 w-2 rounded-full bg-current' />}
  </span>
);

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

  // Bump on selection change so only the newly-selected card's ring wobbles;
  // skip the initial mount so nothing wobbles on open.
  const [wobbleKey, setWobbleKey] = useState(0);
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    setWobbleKey((k) => k + 1);
  }, [themeColor]);

  // The hidden `default` appearance is controlled by the mode toggle above, not
  // shown as a card.
  const cards = themes.filter((t) => !t.hidden);

  const cardBg = (theme: Theme) =>
    isDarkMode ? theme.colors.dark['base-100'] : theme.colors.light['base-100'];
  const cardFg = (theme: Theme) =>
    isDarkMode ? theme.colors.dark['base-content'] : theme.colors.light['base-content'];

  const renderCard = (theme: Theme) => {
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
        // Masonry item: no fixed height — artwork sets the natural aspect so
        // differently-scaled scenes stagger. Selection reads via a 2px
        // border-current ring (works on e-ink) plus the filled radio.
        className={clsx(
          'eink-bordered relative mb-4 flex w-full break-inside-avoid flex-col overflow-hidden rounded-xl border-2 shadow-md',
          'transition-transform duration-200 ease-out hover:scale-[1.03]',
          selected ? 'border-current' : 'border-transparent',
        )}
        style={{ backgroundColor: cardBg(theme), color: cardFg(theme) }}
      >
        {scene ? (
          <img src={`${CARD_ASSETS}/${name}.svg`} alt='' className='block h-auto w-full' />
        ) : (
          <span className='flex min-h-[6rem] w-full items-center justify-center p-4' />
        )}
        <span
          className='absolute right-2 top-2 flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-semibold backdrop-blur-sm'
          style={{ backgroundColor: cardBg(theme), color: cardFg(theme) }}
        >
          <span className='max-w-[8rem] truncate'>{_(label)}</span>
          <PillRadio selected={selected} animKey={selected ? wobbleKey : undefined} />
        </span>
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
  };

  return (
    <div>
      <SectionTitle className='mb-2'>
        {_('Prefer something different? Create your own theme')}
      </SectionTitle>
      {/* CSS-columns masonry: cards keep their natural artwork aspect and flow
          into two balanced columns. */}
      <div className='columns-2 gap-4 [column-fill:_balance]'>{cards.map(renderCard)}</div>
      {/* The create-your-own tile sits centered on its own final row. */}
      <div className='flex justify-center'>
        <button
          className={clsx(
            'eink-bordered flex min-h-[6rem] w-[calc(50%-0.5rem)] cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed p-4 shadow-md',
            'transition-transform duration-200 ease-out hover:scale-[1.03]',
          )}
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
