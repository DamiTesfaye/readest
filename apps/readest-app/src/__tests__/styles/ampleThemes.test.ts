import { describe, it, expect } from 'vitest';
import tinycolor from 'tinycolor2';
import { themes, resolveThemeName, getEffectiveDarkMode, boostContrast } from '@/styles/themes';

// The hidden dual-mood default: follows the appearance toggle, never shown
// as a picker card.
const DEFAULT_THEME = 'default';
// Mode-locked scene cards, in picker display order.
const CARD_THEMES = ['paper', 'desert-sunset', 'starry-night', 'night-pond'];

describe('AmpleRead theme list', () => {
  it('contains the hidden default plus the 4 scene cards in display order', () => {
    expect(themes.map((t) => t.name)).toEqual([DEFAULT_THEME, ...CARD_THEMES]);
  });

  it('default is first (fallback anchor) and the only hidden theme', () => {
    expect(themes[0]!.name).toBe(DEFAULT_THEME);
    expect(themes.filter((t) => t.hidden).map((t) => t.name)).toEqual([DEFAULT_THEME]);
  });

  it('card themes carry a scene field; the default does not', () => {
    for (const t of themes) {
      if (CARD_THEMES.includes(t.name)) {
        expect(t.scene, `${t.name} should have a scene`).toBeDefined();
      } else {
        expect(t.scene, `${t.name} should be quiet`).toBeUndefined();
      }
    }
  });

  it('uses kebab-case names safe for data-theme attributes', () => {
    for (const t of themes) {
      expect(t.name).toMatch(/^[a-z]+(-[a-z]+)*$/);
    }
  });

  it('default shares paper light palette seeds but stays dual-mood', () => {
    const def = themes.find((t) => t.name === DEFAULT_THEME)!;
    expect(def.mood).toBeUndefined();
    expect(def.colors.light).toBeDefined();
    expect(def.colors.dark).toBeDefined();
  });
});

describe('AmpleRead theme contrast (WCAG)', () => {
  for (const mode of ['light', 'dark'] as const) {
    for (const themeName of [DEFAULT_THEME, ...CARD_THEMES]) {
      it(`${themeName} ${mode}: fg/bg >= 4.5 and primary/bg >= 3.0`, () => {
        const theme = themes.find((t) => t.name === themeName)!;
        const palette = theme.colors[mode];
        const bodyRatio = tinycolor.readability(palette['base-100'], palette['base-content']);
        const primaryRatio = tinycolor.readability(palette['base-100'], palette.primary);
        expect(bodyRatio, `fg on bg`).toBeGreaterThanOrEqual(4.5);
        expect(primaryRatio, `primary on bg`).toBeGreaterThanOrEqual(3.0);
      });
    }
  }
});

describe('resolveThemeName legacy migration', () => {
  it('maps removed AmpleRead themes and legacy Readest names to current themes', () => {
    const legacyMap: Record<string, string> = {
      // Removed AmpleRead themes → default appearance
      sepia: 'default',
      ink: 'default',
      contrast: 'default',
      // Legacy Readest names (pre-collapse)
      gray: 'default',
      solarized: 'default',
      gruvbox: 'default',
      grass: 'night-pond',
      sky: 'starry-night',
      nord: 'starry-night',
      cherry: 'desert-sunset',
      sunset: 'desert-sunset',
    };
    for (const [legacy, expected] of Object.entries(legacyMap)) {
      expect(resolveThemeName(legacy)).toBe(expected);
    }
  });

  it('passes current theme names through unchanged', () => {
    for (const t of themes) {
      expect(resolveThemeName(t.name)).toBe(t.name);
    }
  });

  it('falls back to default for unknown or missing input', () => {
    expect(resolveThemeName('no-such-theme')).toBe('default');
    expect(resolveThemeName(null)).toBe('default');
    expect(resolveThemeName(undefined)).toBe('default');
    expect(resolveThemeName('')).toBe('default');
  });

  it('every resolved value is a real theme', () => {
    const names = new Set(themes.map((t) => t.name));
    for (const legacy of [
      'default',
      'gray',
      'sepia',
      'ink',
      'grass',
      'cherry',
      'sky',
      'solarized',
      'gruvbox',
      'nord',
      'contrast',
      'sunset',
    ]) {
      expect(names.has(resolveThemeName(legacy))).toBe(true);
    }
  });
});

describe('boostContrast (High Contrast)', () => {
  it('lifts night-pond dark to AAA (>=7:1) while keeping its background', () => {
    const nightPondDark = themes.find((t) => t.name === 'night-pond')!.colors.dark;
    const boosted = boostContrast(nightPondDark, true);
    expect(
      tinycolor.readability(boosted['base-100'], boosted['base-content']),
    ).toBeGreaterThanOrEqual(7);
    // Background keeps its scene character — not forced to pure black.
    expect(boosted['base-100']).toBe(nightPondDark['base-100']);
    expect(tinycolor(boosted['base-100']).toHexString()).not.toBe('#000000');
  });

  it('lifts a light theme by darkening the foreground', () => {
    const paperLight = themes.find((t) => t.name === 'paper')!.colors.light;
    const boosted = boostContrast(paperLight, false);
    expect(
      tinycolor.readability(boosted['base-100'], boosted['base-content']),
    ).toBeGreaterThanOrEqual(7);
    expect(boosted['base-100']).toBe(paperLight['base-100']);
  });

  it('lifts a below-AAA palette up to the target ratio', () => {
    // A muted grey-on-grey palette below 7:1 to prove the boost actually lifts.
    const lowContrast = {
      'base-100': '#3a3a3a',
      'base-200': '#444444',
      'base-300': '#4e4e4e',
      'base-content': '#9a9a9a',
      neutral: '#555555',
      'neutral-content': '#cccccc',
      primary: '#8888aa',
      secondary: '#7777aa',
      accent: '#9999bb',
    };
    const before = tinycolor.readability(lowContrast['base-100'], lowContrast['base-content']);
    const boosted = boostContrast(lowContrast, true);
    const after = tinycolor.readability(boosted['base-100'], boosted['base-content']);
    expect(before).toBeLessThan(7);
    expect(after).toBeGreaterThan(before);
    expect(after).toBeGreaterThanOrEqual(7);
  });

  it('is pure (does not mutate input) and idempotent', () => {
    const source = themes.find((t) => t.name === 'starry-night')!.colors.dark;
    const snapshot = { ...source };
    const once = boostContrast(source, true);
    expect(source).toEqual(snapshot); // input untouched
    const twice = boostContrast(once, true);
    expect(twice['base-content']).toBe(once['base-content']); // stable
  });

  it('accepts a custom target ratio (AA floor at 4.5)', () => {
    const lowContrast = {
      'base-100': '#f0e8d8',
      'base-200': '#e6dcc8',
      'base-300': '#d8ccb4',
      'base-content': '#b0a890', // ~1.6:1 on the bg — well below AA
      neutral: '#cccccc',
      'neutral-content': '#333333',
      primary: '#c15a1f',
      secondary: '#d97b42',
      accent: '#e0a060',
    };
    const boosted = boostContrast(lowContrast, false, 4.5);
    const ratio = tinycolor.readability(boosted['base-100'], boosted['base-content']);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
    expect(boosted['base-100']).toBe(lowContrast['base-100']);
    // The AA target must stop earlier than the AAA default — otherwise the
    // ratio argument is being ignored.
    expect(boosted['base-content']).not.toBe(boostContrast(lowContrast, false)['base-content']);
  });

  it('falls back to the most readable of fg/black/white on a mid-tone trap', () => {
    // Mid-gray background: pushing a light fg lighter in light mode can never
    // reach 7:1. The fallback must land on black or white — whichever reads best.
    const midTone = {
      'base-100': '#808080',
      'base-200': '#8a8a8a',
      'base-300': '#949494',
      'base-content': '#9a9a9a',
      neutral: '#777777',
      'neutral-content': '#222222',
      primary: '#446688',
      secondary: '#557799',
      accent: '#6688aa',
    };
    const boosted = boostContrast(midTone, false, 7);
    const best = tinycolor
      .mostReadable('#808080', ['#000000', '#ffffff'])
      .toHexString()
      .toLowerCase();
    expect(boosted['base-content'].toLowerCase()).toBe(best);
  });
});

describe('single-mood themes', () => {
  it('locks every card theme to its mood; default stays dual', () => {
    const moods = Object.fromEntries(themes.map((t) => [t.name, t.mood]));
    expect(moods).toEqual({
      default: undefined,
      paper: 'light',
      'desert-sunset': 'light',
      'starry-night': 'dark',
      'night-pond': 'dark',
    });
  });

  it('getEffectiveDarkMode: mode-locked cards ignore themeMode and system', () => {
    expect(getEffectiveDarkMode('night-pond', 'light', false)).toBe(true);
    expect(getEffectiveDarkMode('starry-night', 'auto', false)).toBe(true);
    expect(getEffectiveDarkMode('desert-sunset', 'dark', true)).toBe(false);
    expect(getEffectiveDarkMode('paper', 'dark', true)).toBe(false);
  });

  it('getEffectiveDarkMode: default follows themeMode and system', () => {
    expect(getEffectiveDarkMode('default', 'dark', false)).toBe(true);
    expect(getEffectiveDarkMode('default', 'light', true)).toBe(false);
    expect(getEffectiveDarkMode('default', 'auto', true)).toBe(true);
    expect(getEffectiveDarkMode('default', 'auto', false)).toBe(false);
  });

  it('getEffectiveDarkMode: unknown/custom theme names follow themeMode', () => {
    expect(getEffectiveDarkMode('my-custom-theme', 'dark', false)).toBe(true);
    expect(getEffectiveDarkMode('my-custom-theme', 'auto', false)).toBe(false);
  });
});
