import { describe, it, expect } from 'vitest';
import {
  getToolbarIconSrc,
  getThemeFontsTriggerSrc,
  isColoredIconTheme,
} from '@/utils/toolbarIcons';
import { getChromeColor } from '@/styles/themes';

describe('toolbar icon variants', () => {
  it('renders colored icons only on the Neue Paper light appearance', () => {
    expect(isColoredIconTheme('paper', false)).toBe(true);
    expect(isColoredIconTheme('default', false)).toBe(true);
  });

  it('renders muted icons for Neue Paper dark and every other theme', () => {
    expect(isColoredIconTheme('paper', true)).toBe(false);
    expect(isColoredIconTheme('default', true)).toBe(false);
    expect(isColoredIconTheme('desert-sunset', false)).toBe(false);
    expect(isColoredIconTheme('ocean-wave', true)).toBe(false);
    expect(isColoredIconTheme('my-custom-theme', false)).toBe(false);
  });

  it('maps icon names to the right asset path per variant', () => {
    expect(getToolbarIconSrc('library', 'paper', false)).toBe('/images/toolbar/library.svg');
    expect(getToolbarIconSrc('library', 'starry-night', false)).toBe(
      '/images/toolbar/library-muted.svg',
    );
    expect(getToolbarIconSrc('bookmarks-notes', 'paper', true)).toBe(
      '/images/toolbar/bookmarks-notes-muted.svg',
    );
  });

  it('maps the Theme & Fonts trigger to paper or muted Aa art', () => {
    expect(getThemeFontsTriggerSrc('small', 'paper', false)).toBe(
      '/images/theme-fonts/paper-small.svg',
    );
    expect(getThemeFontsTriggerSrc('large', 'cherry-bloom', false)).toBe(
      '/images/theme-fonts/muted-large.svg',
    );
  });
});

describe('getChromeColor', () => {
  it('returns null for the paper family so the bar keeps the page surface', () => {
    expect(getChromeColor('paper', false)).toBeNull();
    expect(getChromeColor('default', true)).toBeNull();
  });

  it('returns a scene chrome for themed bars in both moods', () => {
    expect(getChromeColor('desert-sunset', false)).toMatch(/^#/);
    expect(getChromeColor('desert-sunset', true)).toMatch(/^#/);
    expect(getChromeColor('ocean-wave', false)).toMatch(/^#/);
    expect(getChromeColor('starry-night', true)).toMatch(/^#/);
  });

  it('returns null for unknown and custom themes', () => {
    expect(getChromeColor('my-custom-theme', false)).toBeNull();
  });
});
