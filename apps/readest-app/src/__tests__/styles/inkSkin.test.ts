import { afterEach, describe, it, expect } from 'vitest';
import { box } from '@/libs/ink/shapes';
import { applyInkSkin, sketchMarkup } from '@/styles/inkSkin';

describe('sketchMarkup', () => {
  const draw = (seed: string | number) =>
    sketchMarkup(seed, 120, 60, (ink) => box(ink, 0, 0, 120, 60, { pen: 'pencil' }));

  it('returns path markup and a padded viewBox', () => {
    const { svg, viewBox } = draw('frame-1');
    expect(svg).toContain('<path');
    expect(viewBox.split(' ').map(Number)[2]).toBeGreaterThan(120);
  });

  it('is stable per seed', () => {
    expect(draw('frame-1')).toEqual(draw('frame-1'));
  });

  it('differs across seeds', () => {
    expect(draw('frame-1').svg).not.toBe(draw('frame-2').svg);
  });
});

describe('applyInkSkin', () => {
  const VARS = ['frame-1', 'frame-2', 'frame-3', 'frame-bold', 'underline', 'fill', 'check'];
  const skinText = () => document.getElementById('ink-skin')?.textContent ?? '';

  afterEach(() => {
    applyInkSkin('default');
  });

  it('writes every ink var as an SVG data URI and sets the gate attribute', () => {
    applyInkSkin('paper');
    const text = skinText();
    for (const name of VARS) {
      const match = text.match(new RegExp(`--ink-${name}:url\\("data:image/svg\\+xml,([^"]+)"\\)`));
      expect(match, name).not.toBeNull();
      expect(decodeURIComponent(match![1]!)).toMatch(
        /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/,
      );
      expect(decodeURIComponent(match![1]!)).not.toContain('var(--ll-');
    }
    expect(document.documentElement.hasAttribute('data-ink-skin')).toBe(true);
  });

  it('is idempotent', () => {
    applyInkSkin('paper');
    const first = skinText();
    applyInkSkin('paper');
    expect(skinText()).toBe(first);
    expect(document.querySelectorAll('#ink-skin')).toHaveLength(1);
  });

  it('skips regeneration when theme and mood are unchanged', () => {
    applyInkSkin('paper');
    const first = document.getElementById('ink-skin');
    applyInkSkin('paper');
    expect(document.getElementById('ink-skin')).toBe(first);
    document.documentElement.setAttribute('data-theme', 'paper-dark');
    applyInkSkin('paper');
    expect(document.getElementById('ink-skin')).not.toBe(first);
    document.documentElement.removeAttribute('data-theme');
  });

  it('removes the skin for other themes', () => {
    applyInkSkin('paper');
    applyInkSkin('desert-sunset');
    expect(document.getElementById('ink-skin')).toBeNull();
    expect(document.documentElement.hasAttribute('data-ink-skin')).toBe(false);
  });
});
