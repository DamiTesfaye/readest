import { afterEach, describe, expect, it, vi } from 'vitest';
import { attachCreatorHover } from '@/services/margins/creatorHover';

const creator = { name: 'Dami', avatarUrl: null, color: '#E8846B', initial: 'D' };

const pointer = (type: string, o: { x: number; y: number; pointerType: string }) => {
  const e = new Event(type, { bubbles: true }) as PointerEvent;
  Object.assign(e, { clientX: o.x, clientY: o.y, pointerType: o.pointerType });
  return e;
};

const setup = () => {
  const doc = document.implementation.createHTMLDocument('t');
  const show = vi.fn();
  const hitTest = vi.fn(({ x }: { x: number }) => (x < 20 ? 'margins:m1' : undefined));
  const creatorOf = vi.fn((key: string) => (key === 'margins:m1' ? creator : undefined));
  const detach = attachCreatorHover(doc, { hitTest, creatorOf, show });
  return { doc, show, hitTest, detach };
};

afterEach(() => vi.useRealTimers());

describe('attachCreatorHover', () => {
  it('shows the creator while the mouse is over a marker and hides it after', () => {
    vi.useFakeTimers();
    const { doc, show } = setup();
    doc.dispatchEvent(pointer('pointermove', { x: 10, y: 10, pointerType: 'mouse' }));
    expect(show).toHaveBeenLastCalledWith(creator, 10, 10);
    vi.advanceTimersByTime(200);
    doc.dispatchEvent(pointer('pointermove', { x: 12, y: 10, pointerType: 'mouse' }));
    expect(show).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(200);
    doc.dispatchEvent(pointer('pointermove', { x: 50, y: 10, pointerType: 'mouse' }));
    expect(show).toHaveBeenLastCalledWith(null, 50, 10);
  });

  it('shows the creator on a long press and hides it on the next touch', () => {
    vi.useFakeTimers();
    const { doc, show } = setup();
    doc.dispatchEvent(pointer('pointerdown', { x: 10, y: 10, pointerType: 'touch' }));
    vi.advanceTimersByTime(300);
    expect(show).not.toHaveBeenCalled();
    vi.advanceTimersByTime(300);
    expect(show).toHaveBeenLastCalledWith(creator, 10, 10);
    doc.dispatchEvent(pointer('pointerdown', { x: 100, y: 100, pointerType: 'touch' }));
    expect(show).toHaveBeenLastCalledWith(null, 100, 100);
  });

  it('cancels a long press when the finger lifts early, and detaches cleanly', () => {
    vi.useFakeTimers();
    const { doc, show, detach } = setup();
    doc.dispatchEvent(pointer('pointerdown', { x: 10, y: 10, pointerType: 'touch' }));
    doc.dispatchEvent(pointer('pointerup', { x: 10, y: 10, pointerType: 'touch' }));
    vi.advanceTimersByTime(1000);
    expect(show).not.toHaveBeenCalled();
    detach();
    doc.dispatchEvent(pointer('pointermove', { x: 10, y: 10, pointerType: 'mouse' }));
    expect(show).not.toHaveBeenCalled();
  });
});
