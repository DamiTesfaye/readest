import { describe, expect, it } from 'vitest';
import { createGlyphCache, drawFrame, STRIDE } from '@/services/margins/play/renderer';

describe('play renderer', () => {
  it('draws an em-unit outline at the glyph size and origin', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 100;
    canvas.height = 100;
    const g = canvas.getContext('2d', { willReadFrequently: true })!;
    const glyphs = new Float32Array(STRIDE);
    glyphs.set([10, 40, 8, 16, 16 / 1000, 0, 1, 0, 1, 1]);
    drawFrame(g, {
      glyphs,
      current: new Float32Array([10, 40]),
      cache: createGlyphCache(() => 'M0 -1 H0.5 V0 H0 Z'),
      color: '#000',
      bodies: [],
      bodyGlyphs: new Float32Array(0),
      bodyGlyph: () => -1,
      cluster: () => '',
      shapes: [],
      shapeColor: '#000',
    });
    const ink = (x: number, y: number) => g.getImageData(x, y, 1, 1).data[3]!;
    expect(ink(16, 32)).toBe(255);
    expect(ink(16, 26)).toBe(255);
    expect(ink(20, 32)).toBe(0);
    expect(ink(16, 22)).toBe(0);
  });
});
