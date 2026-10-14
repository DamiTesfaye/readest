import tinycolor from 'tinycolor2';

export type BaseColor = {
  bg: string;
  fg: string;
  primary: string;
};

/** `ambient` follows the ambient light sensor (lux → light/dark), Android-first. */
export type ThemeMode = 'auto' | 'light' | 'dark' | 'ambient';

/**
 * Which page's theme is being read or written (issue #5945). The library and
 * the reader can carry different theme modes and colors; every route that is
 * not the reader resolves as 'library'.
 */
export type ThemeScope = 'library' | 'reader';

export type Palette = {
  'base-100': string;
  'base-200': string;
  'base-300': string;
  'base-content': string;
  neutral: string;
  'neutral-content': string;
  primary: string;
  secondary: string;
  accent: string;
};

export type ThemeScene = {
  textureId?: string; // rendered via customTextureStore/applyBackgroundTexture (Phase 2)
  atmospherePreset?: string; // rendered via AtmosphereOverlay (Phase 2)
  riveAmbient?: string; // ambient Rive file for the journey hub (Phase 3)
};

export type Theme = {
  name: string;
  label: string;
  colors: {
    light: Palette;
    dark: Palette;
  };
  scene?: ThemeScene;
  chrome?: {
    light: string;
    dark: string;
  };
  previewFont?: string;
  mood?: 'light' | 'dark';
  // Hidden themes back a real daisyUI theme (so build-time CSS exists) but are
  // never shown as a picker card. The dual-mood `default` appearance uses this.
  hidden?: boolean;
  isCustomizable?: boolean;
};

export type CustomTheme = {
  name: string;
  label: string;
  colors: {
    light: BaseColor;
    dark: BaseColor;
  };
};

export type ColorScheme = 'light' | 'dark';

export const getContrastHex = (hexColor: string): string => {
  return tinycolor(hexColor).isDark() ? '#FFFFFF' : '#000000';
};

// daisyUI 4 derived every `*-content` color by mixing 80% toward whichever of
// white/black contrasts better; keep that so primary buttons, badges and
// tooltips read exactly as they did before the daisyUI 5 upgrade.
const contentColorFor = (hexColor: string): string => {
  const towardWhite =
    tinycolor.readability(hexColor, '#000000') < tinycolor.readability(hexColor, '#ffffff');
  return tinycolor.mix(hexColor, towardWhite ? '#ffffff' : '#000000', 80).toHexString();
};

// daisyUI 4's defaults for themes that leave the state colors unset, and the
// content colors it derived from them.
const STATE_COLORS = {
  info: ['oklch(72.06% 0.191 231.6)', 'oklch(14.412% 0.0382 231.6)'],
  success: ['oklch(64.8% 0.15 160)', 'oklch(12.96% 0.03 160)'],
  warning: ['oklch(84.71% 0.199 83.87)', 'oklch(16.942% 0.0398 83.87)'],
  error: ['oklch(71.76% 0.221 22.18)', 'oklch(14.352% 0.0442 22.18)'],
} as const;

/**
 * daisyUI 5 theme tokens for a palette. Shared by the build-time plugin that
 * compiles the built-in themes (daisyui-themes.ts) and by `applyCustomTheme`,
 * which injects custom themes at runtime, so both paths render identically.
 * The radius/depth tokens pin daisyUI 4's shape: 0.5rem fields, 1rem boxes,
 * pill badges and toggles, and no faux-3D shading.
 */
export const themeVariables = (palette: Palette, scheme: ColorScheme): Record<string, string> => ({
  'color-scheme': scheme,
  '--color-base-100': palette['base-100'],
  '--color-base-200': palette['base-200'],
  '--color-base-300': palette['base-300'],
  '--color-base-content': palette['base-content'],
  '--color-primary': palette.primary,
  '--color-primary-content': contentColorFor(palette.primary),
  '--color-secondary': palette.secondary,
  '--color-secondary-content': contentColorFor(palette.secondary),
  '--color-accent': palette.accent,
  '--color-accent-content': contentColorFor(palette.accent),
  '--color-neutral': palette.neutral,
  '--color-neutral-content': palette['neutral-content'],
  '--color-info': STATE_COLORS.info[0],
  '--color-info-content': STATE_COLORS.info[1],
  '--color-success': STATE_COLORS.success[0],
  '--color-success-content': STATE_COLORS.success[1],
  '--color-warning': STATE_COLORS.warning[0],
  '--color-warning-content': STATE_COLORS.warning[1],
  '--color-error': STATE_COLORS.error[0],
  '--color-error-content': STATE_COLORS.error[1],
  '--radius-selector': '1.9rem',
  '--radius-field': '0.5rem',
  '--radius-box': '1rem',
  '--size-selector': '0.25rem',
  '--size-field': '0.25rem',
  '--border': '1px',
  '--depth': '0',
  '--noise': '0',
});

export const generateLightPalette = ({ bg, fg, primary }: BaseColor) => {
  return {
    'base-100': bg, // Main background
    'base-200': tinycolor(bg).darken(5).toHexString(), // Slightly darker
    'base-300': tinycolor(bg).darken(12).toHexString(), // More darker
    'base-content': fg, // Main text color
    neutral: tinycolor(bg).darken(15).desaturate(20).toHexString(), // Muted neutral
    'neutral-content': tinycolor(fg).lighten(20).desaturate(20).toHexString(), // Slightly lighter text
    primary: primary,
    secondary: tinycolor(primary).lighten(20).toHexString(), // Lighter secondary
    accent: tinycolor(primary).analogous()[1]!.toHexString(), // Analogous accent
  } as Palette;
};

export const generateDarkPalette = ({ bg, fg, primary }: BaseColor) => {
  return {
    'base-100': bg, // Main background
    'base-200': tinycolor(bg).lighten(5).toHexString(), // Slightly lighter
    'base-300': tinycolor(bg).lighten(12).toHexString(), // More lighter
    'base-content': fg, // Main text color
    neutral: tinycolor(bg).lighten(15).desaturate(20).toHexString(), // Muted neutral
    'neutral-content': tinycolor(fg).darken(20).desaturate(20).toHexString(), // Darkened text
    primary: primary,
    secondary: tinycolor(primary).darken(20).toHexString(), // Darker secondary
    accent: tinycolor(primary).triad()[1]!.toHexString(), // Triad accent
  } as Palette;
};

// Pushes the foreground away from the background until body text clears the
// target ratio, so a scene keeps its own background character instead of being
// flattened to black or white. Defaults to WCAG AAA (7:1) for the High Contrast
// toggle; BODY_MIN_CONTRAST (AA, 4.5:1) is the floor applied to every palette.
const HIGH_CONTRAST_TARGET_RATIO = 7;
export const BODY_MIN_CONTRAST = 4.5;

export const boostContrast = (
  palette: Palette,
  isDarkMode: boolean,
  targetRatio: number = HIGH_CONTRAST_TARGET_RATIO,
): Palette => {
  const bg = palette['base-100'];
  let fg = palette['base-content'];
  let guard = 0;
  while (tinycolor.readability(bg, fg) < targetRatio && guard < 100) {
    fg = isDarkMode
      ? tinycolor(fg).lighten(2).toHexString()
      : tinycolor(fg).darken(2).toHexString();
    guard += 1;
  }
  // Mid-tone backgrounds can put the target out of reach in the push direction,
  // so fall back to whichever of the pushed fg, black, or white reads best.
  if (tinycolor.readability(bg, fg) < targetRatio) {
    fg = tinycolor.mostReadable(bg, [fg, '#000000', '#ffffff']).toHexString();
  }
  return { ...palette, 'base-content': fg };
};

const _ = (stubKey: string) => stubKey;

export const themes = [
  {
    // The default appearance: dual-mood, follows the light/dark/auto toggle.
    // Hidden from the picker (the toggle IS its control); seeded from paper.
    name: 'default',
    label: _('Default'),
    hidden: true,
    colors: {
      light: generateLightPalette({ fg: '#2b2b28', bg: '#faf7f0', primary: '#4f7a6a' }),
      dark: generateDarkPalette({ fg: '#e0ddd4', bg: '#26261f', primary: '#8ab4a0' }),
    },
  },
  {
    name: 'paper',
    label: _('Neue Paper'),
    colors: {
      light: generateLightPalette({ fg: '#2b2b28', bg: '#faf7f0', primary: '#4f7a6a' }),
      dark: generateDarkPalette({ fg: '#e0ddd4', bg: '#26261f', primary: '#8ab4a0' }),
    },
    previewFont: 'Bitter, Georgia, serif',
    scene: {},
  },
  {
    name: 'desert-sunset',
    label: _('Desert Sunset'),
    colors: {
      light: generateLightPalette({ fg: '#4a3222', bg: '#fbe7c9', primary: '#c15a1f' }),
      dark: generateDarkPalette({ fg: '#fdebd2', bg: '#3f2a1f', primary: '#f49e5c' }),
    },
    chrome: { light: '#b3826b', dark: '#3f2a1f' },
    previewFont: "'Roboto Slab', Rockwell, 'Courier New', serif",
    scene: {},
  },
  {
    name: 'starry-night',
    label: _('Starry Night'),
    colors: {
      light: generateLightPalette({ fg: '#1c2b4a', bg: '#eef1f8', primary: '#c55a3d' }),
      dark: generateDarkPalette({ fg: '#f4e9da', bg: '#16294a', primary: '#f2a48d' }),
    },
    chrome: { light: '#16294a', dark: '#101c33' },
    previewFont: "Literata, Palatino, 'Times New Roman', serif",
    scene: {},
  },
  {
    name: 'forest-pond',
    label: _('Forest Pond'),
    colors: {
      light: generateLightPalette({ fg: '#1e3327', bg: '#e9f1e6', primary: '#c34633' }),
      dark: generateDarkPalette({ fg: '#f2eee3', bg: '#16301f', primary: '#f26d5b' }),
    },
    chrome: { light: '#2e5741', dark: '#16301f' },
    previewFont: "'Open Sans', Verdana, sans-serif",
    scene: {},
  },
  {
    name: 'ocean-wave',
    label: _('Ocean Wave'),
    colors: {
      light: generateLightPalette({ fg: '#1d3a4f', bg: '#e7f0f6', primary: '#2f6d99' }),
      dark: generateDarkPalette({ fg: '#dfeaf2', bg: '#143247', primary: '#85b8d8' }),
    },
    chrome: { light: '#8fb4cd', dark: '#143247' },
    previewFont: "'PT Sans', 'Trebuchet MS', sans-serif",
    scene: {},
  },
  {
    name: 'cherry-bloom',
    label: _('Cherry Blossom'),
    colors: {
      light: generateLightPalette({ fg: '#46262a', bg: '#f9ecec', primary: '#b64d62' }),
      dark: generateDarkPalette({ fg: '#f5e6e2', bg: '#382125', primary: '#e59aa4' }),
    },
    chrome: { light: '#c993a0', dark: '#382125' },
    previewFont: "'Noto Serif', 'Book Antiqua', cursive, serif",
    scene: {},
  },
] as Theme[];

export const getChromeColor = (themeName: string, isDarkMode: boolean): string | null => {
  const chrome = themes.find((t) => t.name === themeName)?.chrome;
  if (!chrome) return null;
  return isDarkMode ? chrome.dark : chrome.light;
};

// Legacy theme names → current themes. Saved settings
// (localStorage.themeColor) predate the collapse; resolve at the
// entry points in themeStore so the rest of the app only ever sees
// current names. sepia/ink/contrast were removed in the redesign:
// sepia/ink fold into the default appearance, and contrast migrates
// to default + High Contrast (the toggle side effect lives in themeStore).
const LEGACY_THEME_ALIASES: Record<string, string> = {
  sepia: 'default',
  ink: 'default',
  contrast: 'default',
  gray: 'default',
  solarized: 'default',
  gruvbox: 'default',
  grass: 'forest-pond',
  'night-pond': 'forest-pond',
  sky: 'starry-night',
  nord: 'starry-night',
  cherry: 'desert-sunset',
  sunset: 'desert-sunset',
};

export const resolveThemeName = (name: string | null | undefined): string => {
  if (!name) return 'default';
  if (themes.some((t) => t.name === name)) return name;
  return LEGACY_THEME_ALIASES[name] ?? 'default';
};

// Effective dark mode for a theme: fixed-mood themes ignore the
// light/dark/auto toggle; dual-mood themes (and custom themes, which
// have no mood) follow themeMode + system preference.
export const getEffectiveDarkMode = (
  themeName: string,
  themeMode: ThemeMode,
  systemIsDarkMode: boolean,
  ambientIsDarkMode = systemIsDarkMode,
): boolean => {
  const mood = themes.find((t) => t.name === themeName)?.mood;
  if (mood) return mood === 'dark';
  if (themeMode === 'ambient') return ambientIsDarkMode;
  return themeMode === 'dark' || (themeMode === 'auto' && systemIsDarkMode);
};

const themeBlock = (name: string, palette: Palette, scheme: ColorScheme): string => {
  const declarations = Object.entries(themeVariables(palette, scheme))
    .map(([property, value]) => `  ${property}: ${value};`)
    .join('\n');
  return `[data-theme="${name}"] {\n${declarations}\n}`;
};

export const applyCustomTheme = (customTheme: CustomTheme) => {
  const light = `${customTheme.name}-light`;
  const dark = `${customTheme.name}-dark`;
  const css = [
    themeBlock(light, generateLightPalette(customTheme.colors.light), 'light'),
    themeBlock(dark, generateDarkPalette(customTheme.colors.dark), 'dark'),
  ].join('\n');

  const id = `theme-${customTheme.name}-styles`;
  document.getElementById(id)?.remove();
  const styleElement = document.createElement('style');
  styleElement.id = id;
  styleElement.textContent = css;
  document.head.appendChild(styleElement);

  return { light, dark };
};
