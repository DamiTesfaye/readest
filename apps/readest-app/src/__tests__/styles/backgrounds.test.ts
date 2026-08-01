import { describe, it, expect } from 'vitest';
import tinycolor from 'tinycolor2';
import { themes, boostContrast, BODY_MIN_CONTRAST } from '@/styles/themes';
import {
  BACKGROUND_SWATCH_COUNT,
  BASE_SWATCH_INDEX,
  backgroundForSwatchTap,
  getBackgroundSwatches,
  getSelectedSwatchIndex,
  resolveBackgroundColor,
  applyBackgroundToPalette,
} from '@/styles/backgrounds';

const CARD_THEMES = ['default', 'paper', 'desert-sunset', 'starry-night', 'night-pond'];

describe('getBackgroundSwatches', () => {
  for (const name of CARD_THEMES) {
    for (const mode of [false, true]) {
      const label = `${name} ${mode ? 'dark' : 'light'}`;
      it(`${label}: 6 unique swatches, neutral first, theme bg at the base slot`, () => {
        const swatches = getBackgroundSwatches(name, mode);
        expect(swatches).toHaveLength(BACKGROUND_SWATCH_COUNT);
        expect(swatches[0]).toBe(mode ? '#000000' : '#ffffff');
        const theme = themes.find((t) => t.name === name)!;
        expect(swatches[BASE_SWATCH_INDEX]!.toLowerCase()).toBe(
          theme.colors[mode ? 'dark' : 'light']['base-100'].toLowerCase(),
        );
        expect(new Set(swatches.map((s) => s.toLowerCase())).size).toBe(BACKGROUND_SWATCH_COUNT);
      });

      it(`${label}: every swatch supports AA text after the pipeline floor`, () => {
        const theme = themes.find((t) => t.name === name)!;
        const palette = theme.colors[mode ? 'dark' : 'light'];
        for (const swatch of getBackgroundSwatches(name, mode)) {
          const rebuilt = boostContrast(
            applyBackgroundToPalette(palette, swatch, mode),
            mode,
            BODY_MIN_CONTRAST,
          );
          const ratio = tinycolor.readability(rebuilt['base-100'], rebuilt['base-content']);
          expect(ratio, `${swatch} on ${label}`).toBeGreaterThanOrEqual(BODY_MIN_CONTRAST);
        }
      });
    }
  }

  it('falls back to the default theme for unknown names', () => {
    expect(getBackgroundSwatches('nope', false)).toEqual(getBackgroundSwatches('default', false));
  });
});

describe('resolveBackgroundColor', () => {
  it('null background resolves to null (theme default)', () => {
    expect(resolveBackgroundColor(null, 'paper', false)).toBeNull();
  });

  it('preset index maps through the mode-appropriate swatch row', () => {
    const light = resolveBackgroundColor({ kind: 'preset', index: 4 }, 'paper', false);
    const dark = resolveBackgroundColor({ kind: 'preset', index: 4 }, 'paper', true);
    expect(light).toBe(getBackgroundSwatches('paper', false)[4]);
    expect(dark).toBe(getBackgroundSwatches('paper', true)[4]);
    expect(light).not.toBe(dark);
  });

  it('out-of-range preset index resolves to null', () => {
    expect(resolveBackgroundColor({ kind: 'preset', index: 99 }, 'paper', false)).toBeNull();
  });

  it('custom background returns the hex for the active mode only', () => {
    const bg = { kind: 'custom' as const, light: '#f6e7cf' };
    expect(resolveBackgroundColor(bg, 'desert-sunset', false)).toBe('#f6e7cf');
    expect(resolveBackgroundColor(bg, 'desert-sunset', true)).toBeNull();
  });
});

describe('swatch row selection helpers', () => {
  it('null (theme default) highlights the base slot', () => {
    expect(getSelectedSwatchIndex(null)).toBe(BASE_SWATCH_INDEX);
  });

  it('presets highlight their slot; custom highlights nothing', () => {
    expect(getSelectedSwatchIndex({ kind: 'preset', index: 1 })).toBe(1);
    expect(getSelectedSwatchIndex({ kind: 'custom', light: '#ffffff' })).toBe(-1);
  });

  it('tapping the base slot stores null (theme default), others store a preset', () => {
    expect(backgroundForSwatchTap(BASE_SWATCH_INDEX)).toBeNull();
    expect(backgroundForSwatchTap(0)).toEqual({ kind: 'preset', index: 0 });
    expect(backgroundForSwatchTap(5)).toEqual({ kind: 'preset', index: 5 });
  });
});

describe('applyBackgroundToPalette', () => {
  it('re-derives base-200/300 and neutral from the new bg, keeps fg and primary seeds', () => {
    const paperLight = themes.find((t) => t.name === 'paper')!.colors.light;
    const rebuilt = applyBackgroundToPalette(paperLight, '#ffffff', false);
    expect(rebuilt['base-100']).toBe('#ffffff');
    expect(rebuilt['base-content']).toBe(paperLight['base-content']);
    expect(rebuilt.primary).toBe(paperLight.primary);
    expect(rebuilt['base-200']).not.toBe(paperLight['base-200']);
  });
});
