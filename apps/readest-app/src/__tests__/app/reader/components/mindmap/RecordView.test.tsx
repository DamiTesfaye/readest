import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import RecordView, { POP_CLASS, stickyTilt } from '@/app/reader/components/mindmap/RecordView';
import { encodeInkStroke } from '@/services/mindmap/ink/ink';
import {
  createInkRecord,
  createNodeRecord,
  createSectionRecord,
  createShapeRecord,
  createStickyRecord,
} from '@/services/mindmap/records/defaults';
import type { MapStyle, PositionedRecord } from '@/services/mindmap/schema/types';

afterEach(cleanup);

const show = (record: PositionedRecord, mapStyle: MapStyle = 'sticker', pop = false) => {
  const register = vi.fn(() => () => undefined);
  render(
    <RecordView
      record={record}
      mapStyle={mapStyle}
      ariaLabel='Label'
      pop={pop}
      register={register}
    />,
  );
  return { element: screen.getByTestId(`mm-record-${record.id}`), register };
};

describe('RecordView', () => {
  it('positions the record in page units and registers its element for culling', () => {
    const { element, register } = show(
      createNodeRecord({ id: 'n', index: 'a1', x: 10, y: 20, w: 160, h: 64 }),
    );
    expect(element.style.left).toBe('10px');
    expect(element.style.top).toBe('20px');
    expect(element.style.width).toBe('160px');
    expect(register).toHaveBeenCalledWith('n', element);
    expect(element.getAttribute('role')).toBe('button');
    expect(element.getAttribute('aria-label')).toBe('Label');
  });

  it('draws sticker nodes from the preset variables with an initial disc', () => {
    const { element } = show(
      createNodeRecord({ id: 'n', index: 'a1', label: 'Emma', color: 'plum' }),
    );
    expect(element.innerHTML).toContain('var(--mm-plum-fill)');
    expect(element.innerHTML).toContain('var(--mm-plum-rim)');
    expect(element.innerHTML).toContain('var(--mm-plum-mark)');
    expect(element.textContent).toContain('E');
  });

  it('switches the node look with the map style', () => {
    expect(
      show(createNodeRecord({ id: 'p', index: 'a1', color: 'sky' }), 'paper').element.innerHTML,
    ).toContain('var(--mm-label-bg)');
    cleanup();
    const ink = show(createNodeRecord({ id: 'i', index: 'a1', color: 'sky' }), 'ink').element;
    expect(ink.innerHTML).toContain('var(--mm-sky-stroke)');
    expect(ink.innerHTML).not.toContain('var(--mm-sky-fill)');
  });

  it('renders quotes as taped notes with the chapter caption', () => {
    const quote = {
      ...createNodeRecord({ id: 'q', index: 'a1', label: 'It is a truth', kind: 'quote' }),
      anchor: { cfi: 'epubcfi(/6/2)', section: 5, progress: 0.1 },
    };
    const { element } = show(quote);
    expect(element.textContent).toContain('Ch. 6 · your highlight');
    expect(element.innerHTML).toContain('var(--mm-quote-paper)');
  });

  it('tilts stickies by a stable angle within two degrees', () => {
    const { element } = show(createStickyRecord({ id: 'sticky-1', index: 'a1', text: 'Note' }));
    expect(stickyTilt('sticky-1')).toBe(stickyTilt('sticky-1'));
    expect(Math.abs(stickyTilt('sticky-1'))).toBeLessThanOrEqual(2);
    expect(element.innerHTML).toContain(`rotate(${stickyTilt('sticky-1')}deg)`);
  });

  it('draws sections with a title tag and shapes by geometry', () => {
    expect(
      show(createSectionRecord({ id: 's', index: 'a1', title: 'Act I' })).element.textContent,
    ).toBe('Act I');
    cleanup();
    const diamond = show(
      createShapeRecord({ id: 'd', index: 'a1', geo: 'diamond', w: 100, h: 60 }),
    ).element;
    expect(diamond.querySelector('polygon')!.getAttribute('points')).toBe('50,0 100,30 50,60 0,30');
  });

  it('renders ink as a filled perfect-freehand outline', () => {
    const [segment] = encodeInkStroke([
      [0, 0, 0.5],
      [60, 20, 0.5],
    ]);
    const { element } = show(createInkRecord({ id: 'i', index: 'a1', ...segment! }));
    const path = element.querySelector('[data-testid="mm-ink-path"]')!;
    expect(path.getAttribute('d')).toMatch(/^M.*Z$/);
    expect(path.getAttribute('fill')).toBe('var(--mm-ink-stroke)');
  });

  it('adds the pop-in class only when asked', () => {
    expect(
      show(createNodeRecord({ id: 'a', index: 'a1' }), 'sticker', true).element.innerHTML,
    ).toContain(POP_CLASS);
    cleanup();
    expect(show(createNodeRecord({ id: 'b', index: 'a1' })).element.innerHTML).not.toContain(
      POP_CLASS,
    );
  });
});
