import { describe, it, expect } from 'vitest';
import { Overlayer } from 'foliate-js/overlayer.js';
import { inkAnnotations } from '@/app/reader/utils/inkAnnotations';

const rect = { left: 10, top: 20, right: 210, bottom: 40, width: 200, height: 20 };

describe('inkAnnotations', () => {
  it('draws a sketched highlight in the annotation color', () => {
    const g = inkAnnotations.highlight([rect], { color: '#ff0' });
    expect(g.tagName.toLowerCase()).toBe('g');
    expect(g.style.color).toBe('rgb(255, 255, 0)');
    expect(g.querySelectorAll('path').length).toBeGreaterThan(0);
    expect(g.innerHTML).toContain('currentColor');
  });

  it('is deterministic for the same rects', () => {
    const a = inkAnnotations.highlight([rect], { color: '#ff0' }).innerHTML;
    const b = inkAnnotations.highlight([rect], { color: '#ff0' }).innerHTML;
    expect(a).toBe(b);
  });

  it.each(['underline', 'squiggly', 'strikethrough'] as const)('sketches %s', (kind) => {
    const g = inkAnnotations[kind]([rect], { color: '#f00' });
    expect(g.querySelectorAll('path').length).toBeGreaterThan(0);
  });

  it('delegates vertical text to the foliate drawers', () => {
    const vertical = inkAnnotations.highlight([rect], { color: '#ff0', vertical: true });
    expect(vertical.outerHTML).toBe(
      Overlayer.highlight([rect], { color: '#ff0', vertical: true }).outerHTML,
    );
    const options = { color: '#f00', writingMode: 'vertical-rl' };
    expect(inkAnnotations.underline([rect], options).outerHTML).toBe(
      Overlayer.underline([rect], options).outerHTML,
    );
  });
});
