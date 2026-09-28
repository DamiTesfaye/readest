import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createNodeRecord } from '@/services/mindmap/records/defaults';
import { renderInput } from './inputHarness';

const root = () => screen.getByTestId('root');

const pointerAt = (
  target: Element,
  type: 'pointerDown' | 'pointerMove' | 'pointerUp',
  x: number,
  y: number,
  init: Record<string, unknown> = {},
) =>
  fireEvent[type](target, {
    clientX: x,
    clientY: y,
    pointerId: 1,
    pointerType: 'mouse',
    button: 0,
    detail: 1,
    ...init,
  });

const offsetRoot = (left: number, top: number) =>
  vi.spyOn(root(), 'getBoundingClientRect').mockReturnValue({
    left,
    top,
    right: left + 800,
    bottom: top + 600,
    width: 800,
    height: 600,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect);

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('useCanvasInput pointers', () => {
  it('converts client positions relative to the canvas, not the window', () => {
    const { controller } = renderInput();
    offsetRoot(100, 50);
    act(() => controller.setTool('node'));
    pointerAt(root(), 'pointerDown', 300, 250);
    pointerAt(root(), 'pointerUp', 300, 250);
    expect(controller.store.get('new1')).toMatchObject({ x: 128, y: 176 });
  });

  it('captures the pointer and focuses the canvas', () => {
    renderInput();
    pointerAt(root(), 'pointerDown', 10, 10);
    expect(HTMLElement.prototype.setPointerCapture).toHaveBeenCalled();
    expect(document.activeElement).toBe(root());
  });

  it('starts a connect gesture from a handle', () => {
    const { controller } = renderInput([
      createNodeRecord({ id: 'a', index: 'a1', x: 0, y: 0 }),
      createNodeRecord({ id: 'b', index: 'a2', x: 400, y: 0 }),
    ]);
    pointerAt(screen.getByTestId('handle'), 'pointerDown', 174, 32);
    pointerAt(root(), 'pointerMove', 300, 30);
    pointerAt(root(), 'pointerUp', 420, 30);
    expect(
      controller.store.all().some((r) => r.type === 'link' && r.fromId === 'a' && r.toId === 'b'),
    ).toBe(true);
  });

  it('ignores pointers that start on nodrag chrome and right clicks', () => {
    const { controller } = renderInput();
    const down = vi.spyOn(controller, 'pointerDown');
    pointerAt(screen.getByTestId('chrome'), 'pointerDown', 5, 5);
    pointerAt(root(), 'pointerDown', 5, 5, { button: 2 });
    expect(down).not.toHaveBeenCalled();
  });

  it('pinches to zoom with two fingers, cancelling the one-finger gesture', () => {
    const { controller } = renderInput([createNodeRecord({ id: 'a', index: 'a1', x: 0, y: 0 })]);
    const touch = (type: 'pointerDown' | 'pointerMove' | 'pointerUp', id: number, x: number) =>
      pointerAt(root(), type, x, 10, { pointerId: id, pointerType: 'touch' });
    touch('pointerDown', 1, 10);
    touch('pointerMove', 1, 60);
    touch('pointerDown', 2, 110);
    expect(controller.store.get('a')).toMatchObject({ x: 0, y: 0 });
    touch('pointerMove', 2, 210);
    expect(controller.camera.get().z).toBeCloseTo(3, 5);
    touch('pointerUp', 1, 60);
    touch('pointerUp', 2, 210);
    expect(controller.gestureActive()).toBe(false);
  });

  it('feeds coalesced pointer events to the pen', () => {
    const { controller } = renderInput();
    act(() => controller.setTool('pen'));
    pointerAt(root(), 'pointerDown', 0, 0, { pointerType: 'pen' });
    const sample = (x: number) => ({
      clientX: x,
      clientY: 0,
      pointerId: 1,
      pointerType: 'pen',
      pressure: 0.7,
      button: 0,
      detail: 0,
      altKey: false,
      shiftKey: false,
    });
    const move = Object.assign(new Event('pointermove', { bubbles: true }), sample(30), {
      getCoalescedEvents: () => [sample(10), sample(20), sample(30)],
    });
    act(() => {
      root().dispatchEvent(move);
    });
    expect(controller.live.get().ink?.count).toBe(4);
  });
});

describe('useCanvasInput wheel', () => {
  it('zooms with ctrl+wheel through a non-passive listener', () => {
    const { controller } = renderInput();
    const event = new WheelEvent('wheel', {
      deltaY: -100,
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    root().dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(controller.camera.get().z).toBeGreaterThan(1);
  });

  it('pans with a plain wheel and zooms when the wheel preference is on', () => {
    const { controller, rerender } = renderInput();
    root().dispatchEvent(
      new WheelEvent('wheel', { deltaX: 10, deltaY: 20, bubbles: true, cancelable: true }),
    );
    expect(controller.camera.get()).toEqual({ x: -10, y: -20, z: 1 });
    rerender(true);
    root().dispatchEvent(new WheelEvent('wheel', { deltaY: -50, bubbles: true, cancelable: true }));
    expect(controller.camera.get().z).toBeGreaterThan(1);
  });

  it('leaves wheel events inside nowheel chrome alone', () => {
    const { controller } = renderInput();
    const event = new WheelEvent('wheel', { deltaY: 20, bubbles: true, cancelable: true });
    screen.getByTestId('chrome').dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(controller.camera.get()).toEqual({ x: 0, y: 0, z: 1 });
  });
});
