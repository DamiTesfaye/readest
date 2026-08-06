import { Theme, ThemeMode, themes } from '@/styles/themes';
import { ThemeBackground } from '@/styles/backgrounds';
import { DEFAULT_BOOK_FONT, DEFAULT_BOOK_LAYOUT, DEFAULT_BOOK_STYLE } from '@/services/constants';

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

export const rangeOptions = (min: number, max: number, step: number, value: number): number[] => {
  const options: number[] = [];
  for (let v = min; v <= max + 1e-9; v += step) {
    options.push(Math.round(v * 100) / 100);
  }
  if (!options.includes(value)) {
    options.push(value);
    options.sort((a, b) => a - b);
  }
  return options;
};

export const filterFonts = (fonts: string[], query: string): string[] => {
  const needle = query.trim().toLowerCase();
  if (!needle) return fonts;
  return fonts.filter((font) => font.toLowerCase().includes(needle));
};

export const uniformValue = (values: number[]): number | null => {
  return values.every((v) => v === values[0]) ? (values[0] ?? null) : null;
};

export const CUSTOMIZE_VIEW_KEYS = [
  'defaultFont',
  'overrideFont',
  'overrideLayout',
  'serifFont',
  'sansSerifFont',
  'defaultFontSize',
  'fontWeight',
  'lineHeight',
  'paragraphMargin',
  'letterSpacing',
  'wordSpacing',
  'marginTopPx',
  'marginBottomPx',
  'marginLeftPx',
  'marginRightPx',
  'gapPercent',
  'maxColumnCount',
] as const;

export type CustomizeViewKey = (typeof CUSTOMIZE_VIEW_KEYS)[number];
export type CustomizeViewState = Partial<Record<CustomizeViewKey, unknown>>;

export interface CustomizeThemeState {
  themeColor: string;
  themeMode: ThemeMode;
  themeBackground: ThemeBackground | null;
}

export interface CustomizeSnapshot {
  view: CustomizeViewState;
  theme: CustomizeThemeState;
}

export const captureCustomizeSnapshot = (
  viewSettings: Record<string, unknown>,
  theme: CustomizeThemeState,
): CustomizeSnapshot => ({
  view: Object.fromEntries(CUSTOMIZE_VIEW_KEYS.map((key) => [key, viewSettings[key]])),
  theme: { ...theme },
});

export const diffViewSnapshot = (
  snapshotView: CustomizeViewState,
  currentViewSettings: Record<string, unknown>,
): Array<[CustomizeViewKey, unknown]> => {
  return CUSTOMIZE_VIEW_KEYS.filter((key) => currentViewSettings[key] !== snapshotView[key]).map(
    (key) => [key, snapshotView[key]],
  );
};

export const CUSTOMIZE_DEFAULTS: CustomizeViewState = Object.fromEntries(
  CUSTOMIZE_VIEW_KEYS.map((key) => [
    key,
    (
      { ...DEFAULT_BOOK_FONT, ...DEFAULT_BOOK_STYLE, ...DEFAULT_BOOK_LAYOUT } as Record<
        string,
        unknown
      >
    )[key],
  ]),
);
