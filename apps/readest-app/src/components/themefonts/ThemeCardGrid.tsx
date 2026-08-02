import clsx from 'clsx';
import React from 'react';
import { useThemeStore } from '@/store/themeStore';
import { useTranslation } from '@/hooks/useTranslation';
import { getCardThemes } from './model';

const ThemeCardGrid: React.FC = () => {
  const _ = useTranslation();
  const { themeColor, setThemeColor } = useThemeStore();
  const cards = getCardThemes();

  return (
    <div className='grid grid-cols-3 gap-2.5 px-4'>
      {cards.map((theme) => {
        const selected = themeColor === theme.name;
        return (
          <button
            key={theme.name}
            type='button'
            aria-pressed={selected}
            title={_(theme.label)}
            className={clsx(
              'eink-bordered relative flex aspect-square flex-col items-center justify-center overflow-hidden rounded-lg',
              'bg-cover bg-center',
              selected && 'ring-base-content ring-2 ring-offset-1',
            )}
            style={{ backgroundImage: `url('/images/theme-cards/${theme.name}.svg')` }}
            onClick={() => setThemeColor(theme.name)}
          >
            <span
              className='text-2xl font-bold leading-none'
              style={{
                fontFamily: theme.previewFont,
                color: theme.name === 'paper' ? '#2b2b28' : '#ffffff',
              }}
            >
              Aa
            </span>
            <span
              className='mt-1 max-w-full truncate px-1 text-[10px] font-medium'
              style={{ color: theme.name === 'paper' ? '#2b2b28' : '#ffffff' }}
            >
              {_(theme.label)}
            </span>
          </button>
        );
      })}
    </div>
  );
};

export default ThemeCardGrid;
