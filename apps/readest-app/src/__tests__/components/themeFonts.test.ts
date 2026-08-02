import { describe, it, expect } from 'vitest';
import { stepFontSize, getCardThemes, MAX_FONT_SIZE } from '@/components/themefonts/model';

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
