import tinycolor from 'tinycolor2';
import { describe, expect, it } from 'vitest';
import {
  LINK_TINT_PERCENT,
  type MindmapMode,
  ON_SELECT_COLOR,
  PRESET_COLORS,
  PRESET_TOKENS,
  QUOTE_HIGHLIGHT,
  QUOTE_TINT_PERCENT,
  SELECT_COLOR,
  STICKY_TOKENS,
  STROKE_TOKENS,
  contrastRatio,
  mindmapCssVars,
} from '@/services/mindmap/theme/presets';
import { themes } from '@/styles/themes';

const MODES: MindmapMode[] = ['light', 'dark', 'eink'];
const AA = 4.5;
const UI_AA = 3;

describe('mindmap presets', () => {
  it('measures black on white as 21:1', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
  });

  for (const mode of MODES) {
    for (const preset of PRESET_COLORS) {
      it(`${preset} label meets WCAG AA in ${mode} mode`, () => {
        const { fill, text } = PRESET_TOKENS[mode][preset];
        expect(contrastRatio(text, fill)).toBeGreaterThanOrEqual(AA);
      });
    }
    it(`sticky text meets WCAG AA in ${mode} mode`, () => {
      expect(
        contrastRatio(STICKY_TOKENS[mode].text, STICKY_TOKENS[mode].fill),
      ).toBeGreaterThanOrEqual(AA);
    });
  }

  for (const theme of themes) {
    for (const scheme of ['light', 'dark'] as const) {
      const palette = theme.colors[scheme];
      it(`link labels and quote notes meet WCAG AA in ${theme.name} ${scheme}`, () => {
        expect(contrastRatio(palette['base-content'], palette['base-100'])).toBeGreaterThanOrEqual(
          AA,
        );
        const paper = tinycolor
          .mix(palette['base-100'], QUOTE_HIGHLIGHT, QUOTE_TINT_PERCENT[scheme])
          .toHexString();
        expect(contrastRatio(palette['base-content'], paper)).toBeGreaterThanOrEqual(AA);
      });
    }
  }

  for (const theme of themes) {
    for (const scheme of ['light', 'dark'] as const) {
      const palette = theme.colors[scheme];
      const canvas = palette['base-200'];
      it(`every stroke meets 3:1 on the canvas in ${theme.name} ${scheme}`, () => {
        const link = tinycolor.mix(canvas, palette['base-content'], LINK_TINT_PERCENT[scheme]);
        expect(contrastRatio(link.toHexString(), canvas)).toBeGreaterThanOrEqual(UI_AA);
        expect(contrastRatio(palette['base-content'], canvas)).toBeGreaterThanOrEqual(UI_AA);
        for (const stroke of Object.values(STROKE_TOKENS[scheme])) {
          expect(contrastRatio(stroke, canvas)).toBeGreaterThanOrEqual(UI_AA);
        }
        expect(contrastRatio(PRESET_TOKENS[scheme].paper.rim, canvas)).toBeGreaterThanOrEqual(
          UI_AA,
        );
      });
    }
  }

  for (const mode of ['light', 'dark'] as const) {
    it(`connect handle glyph meets 3:1 on the handle in ${mode} mode`, () => {
      expect(contrastRatio(ON_SELECT_COLOR[mode], SELECT_COLOR[mode])).toBeGreaterThanOrEqual(
        UI_AA,
      );
    });
  }

  it('drops the quote note rules on e-ink', () => {
    expect(mindmapCssVars('eink')['--mm-quote-rule']).toBe('transparent');
  });

  it('defines every token the canvas uses in every mode', () => {
    for (const mode of MODES) {
      const vars = mindmapCssVars(mode);
      for (const preset of PRESET_COLORS) {
        for (const part of ['fill', 'text', 'rim', 'stroke']) {
          expect(vars[`--mm-${preset}-${part}`]).toBeTruthy();
        }
      }
      for (const name of [
        'select',
        'link',
        'shadow',
        'edge',
        'grid',
        'canvas',
        'label-bg',
        'label-text',
        'sticky-fill',
        'sticky-text',
        'section',
        'fog',
        'quote-paper',
        'quote-rule',
        'on-select',
      ]) {
        expect(vars[`--mm-${name}`]).toBeTruthy();
      }
    }
  });

  it('flips the ink preset stroke with the theme and never uses filters', () => {
    expect(mindmapCssVars('light')['--mm-ink-stroke']).toBe('oklch(var(--bc))');
    expect(mindmapCssVars('dark')['--mm-ink-stroke']).toBe('oklch(var(--bc))');
    expect(mindmapCssVars('eink')['--mm-sky-stroke']).toBe('#000000');
    const all = MODES.flatMap((mode) => Object.values(mindmapCssVars(mode))).join(' ');
    expect(all).not.toMatch(/invert|filter/);
  });
});
