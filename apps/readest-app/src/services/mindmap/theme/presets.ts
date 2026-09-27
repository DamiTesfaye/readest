import tinycolor from 'tinycolor2';
import { HIGHLIGHT_COLOR_HEX } from '@/services/constants';
import type { PresetColor } from '@/services/mindmap/schema/types';

export type MindmapMode = 'light' | 'dark' | 'eink';

export interface PresetTokens {
  fill: string;
  text: string;
  rim: string;
}

export interface SurfaceTokens {
  fill: string;
  text: string;
}

export const PRESET_COLORS: readonly PresetColor[] = [
  'terracotta',
  'plum',
  'sky',
  'mustard',
  'olive',
  'ink',
  'paper',
];

const LIGHT_RIM = '#fff4e0';
const DARK_RIM = 'oklch(var(--b3))';
const EINK: PresetTokens = { fill: '#ffffff', text: '#000000', rim: '#000000' };

export const PRESET_TOKENS: Record<MindmapMode, Record<PresetColor, PresetTokens>> = {
  light: {
    terracotta: { fill: '#ac4923', text: '#fffaf3', rim: LIGHT_RIM },
    plum: { fill: '#9f4685', text: '#fffaf3', rim: LIGHT_RIM },
    sky: { fill: '#0073b3', text: '#fffaf3', rim: LIGHT_RIM },
    mustard: { fill: '#906200', text: '#fffaf3', rim: LIGHT_RIM },
    olive: { fill: '#597900', text: '#fffaf3', rim: LIGHT_RIM },
    ink: { fill: '#2b2a28', text: '#fbf8f2', rim: LIGHT_RIM },
    paper: { fill: '#f3ecdc', text: '#2b2a28', rim: LIGHT_RIM },
  },
  dark: {
    terracotta: { fill: '#924d35', text: '#f7f3ec', rim: DARK_RIM },
    plum: { fill: '#884b75', text: '#f7f3ec', rim: DARK_RIM },
    sky: { fill: '#1f6a96', text: '#f7f3ec', rim: DARK_RIM },
    mustard: { fill: '#7d5e07', text: '#f7f3ec', rim: DARK_RIM },
    olive: { fill: '#566d27', text: '#f7f3ec', rim: DARK_RIM },
    ink: { fill: '#d9d4c7', text: '#1d1c1a', rim: DARK_RIM },
    paper: { fill: '#4a4538', text: '#f6f1e4', rim: DARK_RIM },
  },
  eink: {
    terracotta: EINK,
    plum: EINK,
    sky: EINK,
    mustard: EINK,
    olive: EINK,
    ink: EINK,
    paper: EINK,
  },
};

export const STICKY_TOKENS: Record<MindmapMode, SurfaceTokens> = {
  light: { fill: '#fbe89a', text: '#2b2410' },
  dark: { fill: '#b08a3a', text: '#1d1708' },
  eink: { fill: '#ffffff', text: '#000000' },
};

export const SELECT_COLOR: Record<MindmapMode, string> = {
  light: '#2563eb',
  dark: '#7fb2ff',
  eink: '#000000',
};

export const QUOTE_HIGHLIGHT = HIGHLIGHT_COLOR_HEX['yellow'] ?? '#facc15';

export const QUOTE_TINT_PERCENT: Record<'light' | 'dark', number> = { light: 18, dark: 8 };

export const contrastRatio = (foreground: string, background: string): number =>
  tinycolor.readability(foreground, background);

const tint = (percent: number): string =>
  `color-mix(in srgb, oklch(var(--bc)) ${percent}%, transparent)`;

const modeSurfaces = (mode: MindmapMode): Record<string, string> => {
  if (mode === 'eink') {
    return {
      '--mm-canvas': '#ffffff',
      '--mm-grid': '#000000',
      '--mm-link': '#000000',
      '--mm-section': 'transparent',
      '--mm-section-border': '#000000',
      '--mm-fog': 'transparent',
      '--mm-fog-border': '#000000',
      '--mm-shadow': 'transparent',
      '--mm-edge': 'transparent',
      '--mm-label-bg': '#ffffff',
      '--mm-label-text': '#000000',
      '--mm-quote-paper': '#ffffff',
      '--mm-quote-tape': '#000000',
    };
  }
  return {
    '--mm-canvas': 'oklch(var(--b2))',
    '--mm-grid': tint(22),
    '--mm-link': tint(45),
    '--mm-section': tint(6),
    '--mm-section-border': tint(25),
    '--mm-fog': tint(10),
    '--mm-fog-border': tint(25),
    '--mm-shadow': mode === 'light' ? tint(25) : 'transparent',
    '--mm-edge': mode === 'dark' ? 'color-mix(in srgb, #ffffff 18%, transparent)' : 'transparent',
    '--mm-label-bg': 'oklch(var(--b1))',
    '--mm-label-text': 'oklch(var(--bc))',
    '--mm-quote-paper': `color-mix(in srgb, ${QUOTE_HIGHLIGHT} ${QUOTE_TINT_PERCENT[mode]}%, oklch(var(--b1)))`,
    '--mm-quote-tape': `color-mix(in srgb, ${QUOTE_HIGHLIGHT} 55%, transparent)`,
  };
};

export const mindmapCssVars = (mode: MindmapMode): Record<string, string> => {
  const vars: Record<string, string> = {
    ...modeSurfaces(mode),
    '--mm-select': SELECT_COLOR[mode],
    '--mm-sticky-fill': STICKY_TOKENS[mode].fill,
    '--mm-sticky-text': STICKY_TOKENS[mode].text,
  };
  for (const preset of PRESET_COLORS) {
    const tokens = PRESET_TOKENS[mode][preset];
    vars[`--mm-${preset}-fill`] = tokens.fill;
    vars[`--mm-${preset}-text`] = tokens.text;
    vars[`--mm-${preset}-rim`] = tokens.rim;
    vars[`--mm-${preset}-stroke`] =
      mode !== 'eink' && preset === 'ink' ? 'oklch(var(--bc))' : tokens.fill;
  }
  if (mode === 'eink')
    for (const preset of PRESET_COLORS) vars[`--mm-${preset}-stroke`] = '#000000';
  return vars;
};
