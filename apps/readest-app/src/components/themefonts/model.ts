import { Theme, themes } from '@/styles/themes';

export const FONT_SIZE_STEP = 1;
export const MAX_FONT_SIZE = 120;

export const stepFontSize = (
  current: number,
  delta: number,
  min: number,
  max: number = MAX_FONT_SIZE,
): number => {
  return Math.min(max, Math.max(min, current + delta));
};

export const getCardThemes = (): Theme[] => themes.filter((t) => !t.hidden);
