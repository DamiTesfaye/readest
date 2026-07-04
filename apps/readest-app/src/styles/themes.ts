import tinycolor from 'tinycolor2';

export type BaseColor = {
  bg: string;
  fg: string;
  primary: string;
};

export type ThemeMode = 'auto' | 'light' | 'dark';

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
  // Fixed mood: the theme renders only in this mode and the light/dark/auto
  // toggle does not apply. Absent = dual-mood (follows themeMode).
  mood?: 'light' | 'dark';
  // Hidden themes back a real daisyUI theme (so build-time CSS exists) but are
  // never shown as a picker card. The dual-mood `default` appearance uses this.
  hidden?: boolean;
  isCustomizale?: boolean;
};

export type CustomTheme = {
  name: string;
  label: string;
  colors: {
    light: BaseColor;
    dark: BaseColor;
  };
};

function srgbToLinear(v: number): number {
  // Standard formula for gamma decoding of sRGB
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

export function hexToOklch(hexColor: string): string {
  // 1) Convert from hex → sRGB (0..255) → [0..1]
  const { r, g, b } = tinycolor(hexColor).toRgb();
  const R = srgbToLinear(r / 255);
  const G = srgbToLinear(g / 255);
  const B = srgbToLinear(b / 255);

  // 2) Convert linear sRGB → L'M'S'  (the Oklab-specific "LMS" space)
  const l_ = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m_ = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s_ = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);

  // 3) Convert L'M'S' → Oklab
  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const a = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const b_ = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;

  // 4) Convert Oklab → Oklch
  const C = Math.sqrt(a * a + b_ * b_);
  let h = Math.atan2(b_, a) * (180 / Math.PI);
  if (h < 0) h += 360;

  // 5) Format as l% c h, with a bit of rounding
  const lPercent = (L * 100).toFixed(4);
  const cValue = Number(C.toFixed(6));
  const hValue = Number(h.toFixed(3));

  if (cValue === 0) {
    return `${lPercent}% 0 0deg`;
  }

  return `${lPercent}% ${cValue} ${hValue}deg`;
}

export const getContrastOklch = (hexColor: string): string => {
  return tinycolor(hexColor).isDark() ? '100% 0 0deg' : '0% 0 0deg';
};

export const getContrastHex = (hexColor: string): string => {
  return tinycolor(hexColor).isDark() ? '#FFFFFF' : '#000000';
};

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
    label: _('Paper'),
    mood: 'light',
    colors: {
      light: generateLightPalette({ fg: '#2b2b28', bg: '#faf7f0', primary: '#4f7a6a' }),
      dark: generateDarkPalette({ fg: '#e0ddd4', bg: '#26261f', primary: '#8ab4a0' }),
    },
    scene: {},
  },
  {
    name: 'desert-sunset',
    label: _('Desert Sunset'),
    mood: 'light',
    colors: {
      light: generateLightPalette({ fg: '#4a3222', bg: '#fbe7c9', primary: '#c15a1f' }),
      dark: generateDarkPalette({ fg: '#fdebd2', bg: '#3f2a1f', primary: '#f49e5c' }),
    },
    scene: {},
  },
  {
    name: 'starry-night',
    label: _('Starry Night'),
    mood: 'dark',
    colors: {
      light: generateLightPalette({ fg: '#1c2b4a', bg: '#eef1f8', primary: '#c55a3d' }),
      dark: generateDarkPalette({ fg: '#f4e9da', bg: '#16294a', primary: '#f2a48d' }),
    },
    scene: {},
  },
  {
    name: 'night-pond',
    label: _('Night Pond'),
    mood: 'dark',
    colors: {
      light: generateLightPalette({ fg: '#17313a', bg: '#e9f2ec', primary: '#e4574c' }),
      dark: generateDarkPalette({ fg: '#f2eee3', bg: '#0e3b3a', primary: '#f26d5b' }),
    },
    scene: {},
  },
] as Theme[];

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
  grass: 'night-pond',
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
): boolean => {
  const mood = themes.find((t) => t.name === themeName)?.mood;
  if (mood) return mood === 'dark';
  return themeMode === 'dark' || (themeMode === 'auto' && systemIsDarkMode);
};

const generateCustomThemeVariables = (palette: Palette, fallbackIncluded = false): string => {
  const colors = `
    --b1: ${hexToOklch(palette['base-100'])};
    --b2: ${hexToOklch(palette['base-200'])};
    --b3: ${hexToOklch(palette['base-300'])};
    --bc: ${hexToOklch(palette['base-content'])};
    
    --p: ${hexToOklch(palette.primary)};
    --pc: ${getContrastOklch(palette.primary)};
    
    --s: ${hexToOklch(palette.secondary)};
    --sc: ${getContrastOklch(palette.secondary)};
    
    --a: ${hexToOklch(palette.accent)};
    --ac: ${getContrastOklch(palette.accent)};
    
    --n: ${hexToOklch(palette.neutral)};
    --nc: ${hexToOklch(palette['neutral-content'])};
    
    --in: 69.37% 0.047 231deg;
    --inc: 100% 0 0deg;
    --su: 78.15% 0.12 160deg;
    --suc: 100% 0 0deg;
    --wa: 90.69% 0.123 84deg;
    --wac: 0% 0 0deg;
    --er: 70.9% 0.184 22deg;
    --erc: 100% 0 0deg;
  `;

  const fallbackColors = `
    --fallback-b1: ${palette['base-100']};
    --fallback-b2: ${palette['base-200']};
    --fallback-b3: ${palette['base-300']};
    --fallback-bc: ${palette['base-content']};

    --fallback-p: ${palette.primary};
    --fallback-pc: ${getContrastHex(palette.primary)};

    --fallback-s: ${palette.secondary};
    --fallback-sc: ${getContrastHex(palette.secondary)};

    --fallback-a: ${palette.accent};
    --fallback-ac: ${getContrastHex(palette.accent)};

    --fallback-n: ${palette.neutral};
    --fallback-nc: ${palette['neutral-content']};

    --fallback-in: #ff0000;
    --fallback-inc: #ffffff;
    --fallback-su: #00ff00;
    --fallback-suc: #000000;
    --fallback-wa: #ffff00;
    --fallback-wac: #000000;
    --fallback-er: #ff8000;
    --fallback-erc: #000000;
  `;

  return colors + (fallbackIncluded ? fallbackColors : '');
};

export const applyCustomTheme = (
  customTheme?: CustomTheme,
  themeName?: string,
  fallbackIncluded = false,
) => {
  if (!customTheme && !themeName) return;

  const lightThemeName = customTheme ? `${customTheme.name}-light` : `${themeName}-light`;
  const darkThemeName = customTheme ? `${customTheme.name}-dark` : `${themeName}-dark`;

  const lightPalette = customTheme
    ? generateLightPalette(customTheme.colors.light)
    : (themes.find((t) => t.name === themeName) || themes[0]!).colors.light;

  const darkPalette = customTheme
    ? generateDarkPalette(customTheme.colors.dark)
    : (themes.find((t) => t.name === themeName) || themes[0]!).colors.dark;

  const css = `
    [data-theme="${lightThemeName}"] {
      ${generateCustomThemeVariables(lightPalette, fallbackIncluded)}
    }
    
    [data-theme="${darkThemeName}"] {
      ${generateCustomThemeVariables(darkPalette, fallbackIncluded)}
    }
    
    :root {
      --${lightThemeName}: 1;
      --${darkThemeName}: 1;
    }
  `;

  const styleElement = document.createElement('style');
  styleElement.id = `theme-${customTheme ? customTheme.name : themeName}-styles`;
  styleElement.textContent = css;

  const existingStyle = document.getElementById(styleElement.id);
  if (existingStyle) {
    existingStyle.remove();
  }

  document.head.appendChild(styleElement);

  return {
    light: lightThemeName,
    dark: darkThemeName,
  };
};
