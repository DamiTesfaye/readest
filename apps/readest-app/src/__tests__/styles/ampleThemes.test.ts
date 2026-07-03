import { describe, it, expect } from 'vitest';
import tinycolor from 'tinycolor2';
import { themes, resolveThemeName, getEffectiveDarkMode } from '@/styles/themes';

const SCENE_THEMES = ['night-pond', 'starry-night', 'desert-sunset'];
const QUIET_THEMES = ['paper', 'sepia', 'ink', 'contrast'];

describe('AmpleRead theme list', () => {
  it('contains exactly the 7 curated themes with paper first', () => {
    expect(themes.map((t) => t.name)).toEqual([...QUIET_THEMES, ...SCENE_THEMES]);
  });

  it('scene themes carry a scene field; quiet themes do not', () => {
    for (const t of themes) {
      if (SCENE_THEMES.includes(t.name)) {
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
});

describe('AmpleRead theme contrast (WCAG)', () => {
  for (const mode of ['light', 'dark'] as const) {
    for (const themeName of [...QUIET_THEMES, ...SCENE_THEMES]) {
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
  it('maps every legacy Readest theme name to a current theme', () => {
    const legacyMap: Record<string, string> = {
      default: 'paper',
      gray: 'paper',
      solarized: 'paper',
      gruvbox: 'sepia',
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

  it('passes current theme names through unchanged (including the e-ink default)', () => {
    for (const t of themes) {
      expect(resolveThemeName(t.name)).toBe(t.name);
    }
    expect(resolveThemeName('contrast')).toBe('contrast');
  });

  it('falls back to paper for unknown or missing input', () => {
    expect(resolveThemeName('no-such-theme')).toBe('paper');
    expect(resolveThemeName(null)).toBe('paper');
    expect(resolveThemeName(undefined)).toBe('paper');
    expect(resolveThemeName('')).toBe('paper');
  });

  it('every resolved value is a real theme', () => {
    const names = new Set(themes.map((t) => t.name));
    for (const legacy of [
      'default',
      'gray',
      'sepia',
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

describe('single-mood themes', () => {
  it('assigns fixed moods: sepia light, ink dark, scenes fixed, paper/contrast dual', () => {
    const moods = Object.fromEntries(themes.map((t) => [t.name, t.mood]));
    expect(moods).toEqual({
      paper: undefined,
      sepia: 'light',
      ink: 'dark',
      contrast: undefined,
      'night-pond': 'dark',
      'starry-night': 'dark',
      'desert-sunset': 'light',
    });
  });

  it('getEffectiveDarkMode: fixed-mood themes ignore themeMode and system', () => {
    expect(getEffectiveDarkMode('night-pond', 'light', false)).toBe(true);
    expect(getEffectiveDarkMode('starry-night', 'auto', false)).toBe(true);
    expect(getEffectiveDarkMode('desert-sunset', 'dark', true)).toBe(false);
    expect(getEffectiveDarkMode('sepia', 'dark', true)).toBe(false);
    expect(getEffectiveDarkMode('ink', 'light', false)).toBe(true);
  });

  it('getEffectiveDarkMode: dual-mood themes follow themeMode and system', () => {
    expect(getEffectiveDarkMode('paper', 'dark', false)).toBe(true);
    expect(getEffectiveDarkMode('paper', 'light', true)).toBe(false);
    expect(getEffectiveDarkMode('paper', 'auto', true)).toBe(true);
    expect(getEffectiveDarkMode('paper', 'auto', false)).toBe(false);
    expect(getEffectiveDarkMode('contrast', 'auto', true)).toBe(true);
  });

  it('getEffectiveDarkMode: unknown/custom theme names follow themeMode', () => {
    expect(getEffectiveDarkMode('my-custom-theme', 'dark', false)).toBe(true);
    expect(getEffectiveDarkMode('my-custom-theme', 'auto', false)).toBe(false);
  });
});
