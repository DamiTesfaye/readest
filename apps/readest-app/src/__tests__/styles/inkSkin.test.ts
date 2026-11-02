import { describe, it, expect } from 'vitest';
import { box } from '@/libs/ink/shapes';
import { sketchMarkup } from '@/styles/inkSkin';

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
