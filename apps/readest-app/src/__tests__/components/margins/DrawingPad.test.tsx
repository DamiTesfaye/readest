import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (s: string) => s,
}));

import DrawingPad, { strokesToSvg } from '@/app/reader/components/margins/DrawingPad';

afterEach(cleanup);

describe('DrawingPad', () => {
  it('serialises strokes into an SVG of paths only', () => {
    const svg = strokesToSvg(
      [
        {
          points: [
            [10, 10, 0.5],
            [40, 30, 0.5],
            [80, 20, 0.5],
          ],
          size: 4,
          color: '#5B3DF5',
        },
        { points: [[5, 5, 0.5]], size: 8, color: '#15151A' },
      ],
      { width: 320, height: 240 },
    );
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
    expect(doc.querySelector('parsererror')).toBeNull();
    const root = doc.documentElement;
    expect(root.localName).toBe('svg');
    expect(root.getAttribute('viewBox')).toBe('0 0 320 240');
    const names = new Set(Array.from(root.querySelectorAll('*')).map((e) => e.localName));
    expect([...names]).toEqual(['path']);
    expect(svg).not.toMatch(/script/i);
    expect(root.querySelector('path')!.getAttribute('fill')).toBe('#5B3DF5');
  });

  it('keeps Done disabled until something is drawn', () => {
    const onDone = vi.fn();
    render(<DrawingPad onDone={onDone} onCancel={vi.fn()} />);
    const done = screen.getByRole<HTMLButtonElement>('button', { name: 'Done' });
    expect(done.disabled).toBe(true);
    const pad = screen.getByRole('img', { name: 'Drawing' });
    fireEvent.pointerDown(pad, { clientX: 10, clientY: 10, pressure: 0.5 });
    fireEvent.pointerMove(pad, { clientX: 30, clientY: 20, pressure: 0.5 });
    fireEvent.pointerUp(pad);
    expect(done.disabled).toBe(false);
    fireEvent.click(done);
    expect(onDone).toHaveBeenCalledWith(expect.stringContaining('<path'), {
      width: 320,
      height: 320,
    });
  });
});
