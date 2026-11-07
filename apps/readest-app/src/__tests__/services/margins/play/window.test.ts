import { describe, expect, it } from 'vitest';
import { fallbackReason, pageBox, utf8Slice } from '@/services/margins/play/window';

const rect = (x: number, y: number, w: number, h: number) =>
  ({ x, y, left: x, top: y, width: w, height: h, right: x + w, bottom: y + h }) as DOMRect;

describe('play window', () => {
  it('slices canonical text by UTF-8 bytes', () => {
    expect(utf8Slice(new TextEncoder().encode('a—b𝔞c'), 1, 9)).toBe('—b𝔞');
  });

  it('boxes the visible text relative to the host frame', () => {
    const range = {
      getClientRects: () => [rect(120, 60, 300, 20), rect(120, 84, 280, 20)],
    } as unknown as Range;
    expect(pageBox(range, rect(100, 40, 800, 600))).toEqual({
      x: 20,
      y: 20,
      width: 300,
      height: 580,
    });
  });

  it('adds the iframe offset to iframe-local rects', () => {
    const range = { getClientRects: () => [rect(20, 20, 300, 20)] } as unknown as Range;
    expect(pageBox(range, rect(100, 40, 800, 600), { left: 100, top: 40 })).toEqual({
      x: 20,
      y: 20,
      width: 300,
      height: 580,
    });
  });

  it('names the reason play is unavailable', () => {
    const doc = document.implementation.createHTMLDocument('');
    doc.body.innerHTML = '<p>a<ruby>漢<rt>kan</rt></ruby></p>';
    const range = doc.createRange();
    range.selectNodeContents(doc.body);
    expect(fallbackReason({ range, vertical: false, fixedLayout: false })).toBe('ruby');
    expect(fallbackReason({ range, vertical: true, fixedLayout: false })).toBe('vertical');
    expect(fallbackReason({ range, vertical: false, fixedLayout: true })).toBe('fixed-layout');
    doc.body.innerHTML = '<p>plain</p>';
    range.selectNodeContents(doc.body);
    expect(fallbackReason({ range, vertical: false, fixedLayout: false })).toBeNull();
  });
});
