import { describe, it, expect } from 'vitest';
import {
  stepFontSize,
  getCardThemes,
  MAX_FONT_SIZE,
  CUSTOMIZE_VIEW_KEYS,
  CUSTOMIZE_DEFAULTS,
  captureCustomizeSnapshot,
  diffViewSnapshot,
} from '@/components/themefonts/model';

describe('stepFontSize', () => {
  it('steps up and down by the given delta', () => {
    expect(stepFontSize(16, 1, 8)).toBe(17);
    expect(stepFontSize(16, -1, 8)).toBe(15);
  });

  it('clamps at the minimum font size', () => {
    expect(stepFontSize(8, -1, 8)).toBe(8);
    expect(stepFontSize(7, -1, 8)).toBe(8);
  });

  it('clamps at the maximum font size', () => {
    expect(stepFontSize(MAX_FONT_SIZE, 1, 8)).toBe(MAX_FONT_SIZE);
    expect(stepFontSize(MAX_FONT_SIZE + 5, 1, 8)).toBe(MAX_FONT_SIZE);
  });
});

describe('customize snapshot/rollback', () => {
  const theme = { themeColor: 'ocean-wave', themeMode: 'light' as const, themeBackground: null };
  const view = {
    defaultFontSize: 16,
    lineHeight: 1.4,
    marginTopPx: 44,
    unrelatedKey: 'untouched',
  };

  it('captures every customize key and the theme selection', () => {
    const snapshot = captureCustomizeSnapshot(view, theme);
    expect(Object.keys(snapshot.view)).toEqual([...CUSTOMIZE_VIEW_KEYS]);
    expect(snapshot.view.defaultFontSize).toBe(16);
    expect(snapshot.theme.themeColor).toBe('ocean-wave');
    expect('unrelatedKey' in snapshot.view).toBe(false);
  });

  it('diff returns only keys whose current value drifted from the snapshot', () => {
    const snapshot = captureCustomizeSnapshot(view, theme);
    const current = { ...view, lineHeight: 1.8, marginTopPx: 60 };
    const pairs = diffViewSnapshot(snapshot.view, current);
    expect(pairs).toEqual([
      ['lineHeight', 1.4],
      ['marginTopPx', 44],
    ]);
  });

  it('diff is empty when nothing changed', () => {
    const snapshot = captureCustomizeSnapshot(view, theme);
    expect(diffViewSnapshot(snapshot.view, { ...view })).toEqual([]);
  });

  it('defaults carry the app-wide typography and layout values', () => {
    expect(CUSTOMIZE_DEFAULTS['lineHeight']).toBe(1.4);
    expect(CUSTOMIZE_DEFAULTS['defaultFontSize']).toBe(16);
    expect(CUSTOMIZE_DEFAULTS['marginTopPx']).toBe(44);
    expect(CUSTOMIZE_DEFAULTS['maxColumnCount']).toBe(2);
  });
});

describe('getCardThemes', () => {
  it('lists the six picker cards in display order, excluding the hidden default', () => {
    expect(getCardThemes().map((t) => t.name)).toEqual([
      'paper',
      'desert-sunset',
      'starry-night',
      'forest-pond',
      'ocean-wave',
      'cherry-bloom',
    ]);
  });
});
