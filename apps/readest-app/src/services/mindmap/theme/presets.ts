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
const THEME_STROKE = 'oklch(var(--bc))';

export const STROKE_TOKENS: Record<
  'light' | 'dark',
  Record<Exclude<PresetColor, 'ink'>, string>
> = {
  light: {
    terracotta: '#ac4923',
    plum: '#9f4685',
    sky: '#0073b3',
    mustard: '#906200',
    olive: '#597900',
    paper: '#76695a',
  },
  dark: {
    terracotta: '#e8946f',
    plum: '#d99ac6',
    sky: '#7dbde6',
    mustard: '#d6ad45',
    olive: '#a9c46a',
    paper: '#cfc6b0',
  },
};

export const PRESET_TOKENS: Record<MindmapMode, Record<PresetColor, PresetTokens>> = {
  light: {
    terracotta: { fill: '#ac4923', text: '#fffaf3', rim: LIGHT_RIM },
    plum: { fill: '#9f4685', text: '#fffaf3', rim: LIGHT_RIM },
    sky: { fill: '#0073b3', text: '#fffaf3', rim: LIGHT_RIM },
    mustard: { fill: '#906200', text: '#fffaf3', rim: LIGHT_RIM },
    olive: { fill: '#597900', text: '#fffaf3', rim: LIGHT_RIM },
    ink: { fill: '#2b2a28', text: '#fbf8f2', rim: LIGHT_RIM },
    paper: { fill: '#f3ecdc', text: '#2b2a28', rim: STROKE_TOKENS.light.paper },
  },
  dark: {
    terracotta: { fill: '#924d35', text: '#f7f3ec', rim: DARK_RIM },
    plum: { fill: '#884b75', text: '#f7f3ec', rim: DARK_RIM },
    sky: { fill: '#1f6a96', text: '#f7f3ec', rim: DARK_RIM },
    mustard: { fill: '#7d5e07', text: '#f7f3ec', rim: DARK_RIM },
    olive: { fill: '#566d27', text: '#f7f3ec', rim: DARK_RIM },
    ink: { fill: '#d9d4c7', text: '#1d1c1a', rim: DARK_RIM },
    paper: { fill: '#4a4538', text: '#f6f1e4', rim: STROKE_TOKENS.dark.paper },
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

export const ON_SELECT_COLOR: Record<MindmapMode, string> = {
  light: '#ffffff',
  dark: '#0b1b33',
  eink: '#ffffff',
};

export const LINK_TINT_PERCENT: Record<'light' | 'dark', number> = { light: 65, dark: 55 };

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
      '--mm-quote-rule': 'transparent',
    };
  }
  const link = tint(LINK_TINT_PERCENT[mode]);
  return {
    '--mm-canvas': 'oklch(var(--b2))',
    '--mm-grid': tint(22),
    '--mm-link': link,
    '--mm-section': tint(6),
    '--mm-section-border': link,
    '--mm-fog': tint(10),
    '--mm-fog-border': link,
    '--mm-shadow': mode === 'light' ? tint(25) : 'transparent',
    '--mm-edge': mode === 'dark' ? 'color-mix(in srgb, #ffffff 18%, transparent)' : 'transparent',
    '--mm-label-bg': 'oklch(var(--b1))',
    '--mm-label-text': 'oklch(var(--bc))',
    '--mm-quote-paper': `color-mix(in srgb, ${QUOTE_HIGHLIGHT} ${QUOTE_TINT_PERCENT[mode]}%, oklch(var(--b1)))`,
    '--mm-quote-tape': `color-mix(in srgb, ${QUOTE_HIGHLIGHT} 55%, transparent)`,
    '--mm-quote-rule': 'color-mix(in srgb, var(--mm-link) 35%, transparent)',
  };
};

const presetStroke = (mode: MindmapMode, preset: PresetColor): string => {
  if (mode === 'eink') return '#000000';
  return preset === 'ink' ? THEME_STROKE : STROKE_TOKENS[mode][preset];
};

const presetMark = (mode: MindmapMode, preset: PresetColor): string =>
  mode === 'dark' && preset !== 'paper'
    ? presetStroke(mode, preset)
    : PRESET_TOKENS[mode][preset].fill;

export const mindmapCssVars = (mode: MindmapMode): Record<string, string> => {
  const vars: Record<string, string> = {
    ...modeSurfaces(mode),
    '--mm-select': SELECT_COLOR[mode],
    '--mm-on-select': ON_SELECT_COLOR[mode],
    '--mm-sticky-fill': STICKY_TOKENS[mode].fill,
    '--mm-sticky-text': STICKY_TOKENS[mode].text,
  };
  for (const preset of PRESET_COLORS) {
    const tokens = PRESET_TOKENS[mode][preset];
    vars[`--mm-${preset}-fill`] = tokens.fill;
    vars[`--mm-${preset}-text`] = tokens.text;
    vars[`--mm-${preset}-rim`] = tokens.rim;
    vars[`--mm-${preset}-stroke`] = presetStroke(mode, preset);
    vars[`--mm-${preset}-mark`] = presetMark(mode, preset);
  }
  return vars;
};
