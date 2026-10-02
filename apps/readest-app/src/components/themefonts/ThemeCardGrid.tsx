import clsx from 'clsx';
import React from 'react';
import { Theme } from '@/styles/themes';
import { useThemeStore } from '@/store/themeStore';
import { useTranslation } from '@/hooks/useTranslation';
import ThemeSceneArt from '@/components/themescene/ThemeSceneArt';
import { useSceneMotion } from '@/components/themescene/useSceneMotion';
import { getCardThemes } from './model';

interface ThemeCardProps {
  theme: Theme;
  selected: boolean;
  onSelect: (name: string) => void;
}

const ThemeCard: React.FC<ThemeCardProps> = ({ theme, selected, onSelect }) => {
  const _ = useTranslation();
  const motion = useSceneMotion();
  const textColor = theme.name === 'paper' ? '#2b2b28' : '#ffffff';

  return (
    <button
      type='button'
      aria-pressed={selected}
      title={_(theme.label)}
      className={clsx(
        'eink-bordered relative flex aspect-square flex-col items-center justify-center overflow-hidden rounded-lg',
        selected && 'ring-base-content ring-2 ring-offset-1',
      )}
      {...motion.handlers}
      onClick={() => {
        motion.onSelect();
        onSelect(theme.name);
      }}
    >
      <ThemeSceneArt
        themeName={theme.name}
        active={motion.active}
        imgClassName='pointer-events-none absolute inset-0 h-full w-full object-cover'
      />
      <span
        className='relative text-2xl font-bold leading-none'
        style={{ fontFamily: theme.previewFont, color: textColor }}
      >
        Aa
      </span>
      <span
        className='relative mt-1 max-w-full whitespace-normal break-words px-1 text-center text-[10px] font-medium leading-tight'
        style={{ color: textColor }}
      >
        {_(theme.label)}
      </span>
    </button>
  );
};

const ThemeCardGrid: React.FC = () => {
  const { themeColor, setThemeColor } = useThemeStore();
  const cards = getCardThemes();

  return (
    <div className='grid grid-cols-3 gap-4 px-4'>
      {cards.map((theme) => (
        <ThemeCard
          key={theme.name}
          theme={theme}
          selected={themeColor === theme.name}
          onSelect={setThemeColor}
        />
      ))}
    </div>
  );
};

export default ThemeCardGrid;
