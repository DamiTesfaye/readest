import tinycolor from 'tinycolor2';
import {
  BODY_MIN_CONTRAST,
  Palette,
  boostContrast,
  generateDarkPalette,
  generateLightPalette,
  hexToOklch,
  themes,
} from './themes';

// Presets are stored by slot index so the selection survives a light/dark flip.
// Custom shades are stored per mode because a hex has no mode independent
// identity.
export type ThemeBackground =
  | { kind: 'preset'; index: number }
  | { kind: 'custom'; light?: string; dark?: string };

export const BACKGROUND_SWATCH_COUNT = 6;
// Slot 3 is the theme's own background, so selecting it means "theme default".
export const BASE_SWATCH_INDEX = 3;

// Slot 0 is the neutral page (pure white or pure black); slots 1 to 5 are shades
// of the theme's background. Both modes order slots from furthest from the page
// tone to deepest, so slot i carries the same design intent in either mode.
// Slots 1 and 2 mix toward the neutral rather than lighten or darken, because
// lightening an already near-white background clips to white and collides with
// slot 0.
const NEUTRAL_MIX_NEAR = 66;
const NEUTRAL_MIX_FAR = 33;

export const getBackgroundSwatches = (themeName: string, isDarkMode: boolean): string[] => {
  const theme = themes.find((t) => t.name === themeName) ?? themes[0]!;
  const bg = theme.colors[isDarkMode ? 'dark' : 'light']['base-100'];
  const neutral = isDarkMode ? '#000000' : '#ffffff';
  const towardNeutral = (amount: number) => tinycolor.mix(bg, neutral, amount).toHexString();
  const deepen = (amount: number) =>
    (isDarkMode ? tinycolor(bg).lighten(amount) : tinycolor(bg).darken(amount)).toHexString();
  return [
    neutral,
    towardNeutral(NEUTRAL_MIX_NEAR),
    towardNeutral(NEUTRAL_MIX_FAR),
    bg,
    deepen(4),
    deepen(8),
  ];
};

// Selecting the theme's own bg slot is stored as null, so the choice survives
// later tweaks to the swatch derivation.
export const getSelectedSwatchIndex = (background: ThemeBackground | null): number => {
  if (!background) return BASE_SWATCH_INDEX;
  return background.kind === 'preset' ? background.index : -1;
};

export const backgroundForSwatchTap = (index: number): ThemeBackground | null => {
  return index === BASE_SWATCH_INDEX ? null : { kind: 'preset', index };
};

export const resolveBackgroundColor = (
  background: ThemeBackground | null,
  themeName: string,
  isDarkMode: boolean,
): string | null => {
  if (!background) return null;
  if (background.kind === 'preset') {
    return getBackgroundSwatches(themeName, isDarkMode)[background.index] ?? null;
  }
  return (isDarkMode ? background.dark : background.light) ?? null;
};

// Swaps the background and re-derives the dependent slots from it, keeping the
// theme's fg and primary as seeds. Contrast is not guaranteed here; callers run
// the result through the boostContrast floor like every other palette.
export const applyBackgroundToPalette = (
  palette: Palette,
  bg: string,
  isDarkMode: boolean,
): Palette => {
  const seeds = { bg, fg: palette['base-content'], primary: palette.primary };
  return isDarkMode ? generateDarkPalette(seeds) : generateLightPalette(seeds);
};

// Built-in theme CSS is generated at build time by tailwind.config.ts, so a user
// background needs a runtime override of the daisyUI base vars for both modes of
// the active theme. Mirrors the style injection in applyCustomTheme.
export const applyBackgroundOverride = (
  themeName: string,
  background: ThemeBackground | null,
): void => {
  if (typeof document === 'undefined') return;
  const styleId = 'theme-background-override';
  document.getElementById(styleId)?.remove();
  if (!background) return;
  const theme = themes.find((t) => t.name === themeName);
  if (!theme) return; // custom themes manage their colors via ThemeEditor
  const css = (['light', 'dark'] as const)
    .map((mode) => {
      const isDark = mode === 'dark';
      const bg = resolveBackgroundColor(background, themeName, isDark);
      if (!bg) return '';
      const palette = boostContrast(
        applyBackgroundToPalette(theme.colors[mode], bg, isDark),
        isDark,
        BODY_MIN_CONTRAST,
      );
      return `[data-theme="${themeName}-${mode}"] {
        --b1: ${hexToOklch(palette['base-100'])};
        --b2: ${hexToOklch(palette['base-200'])};
        --b3: ${hexToOklch(palette['base-300'])};
        --bc: ${hexToOklch(palette['base-content'])};
        --n: ${hexToOklch(palette.neutral)};
        --nc: ${hexToOklch(palette['neutral-content'])};
      }`;
    })
    .join('\n');
  const styleElement = document.createElement('style');
  styleElement.id = styleId;
  styleElement.textContent = css;
  document.head.appendChild(styleElement);
};
