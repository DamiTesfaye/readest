import { act, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { createNodeRecord } from '@/services/mindmap/records/defaults';
import '@/styles/globals.css';
import {
  CANVAS_LEFT,
  CANVAS_TOP,
  type CdpInput,
  clientAt,
  createCdpInput,
  frames,
  inkCount,
  mountCanvas,
} from './cdpCanvas';

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (value: string, options?: Record<string, string | number>) =>
    value.replace(/{{(\w+)}}/g, (_, name: string) => String(options?.[name] ?? '')),
}));

const nodeA = () =>
  createNodeRecord({ id: 'a', index: 'a1', x: 100, y: 100, w: 160, h: 64, label: 'Alpha' });

let input: CdpInput;

beforeEach(async () => {
  await page.viewport(1280, 900);
  input = await createCdpInput();
});

afterEach(async () => {
  await input.session.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: 0,
    y: 0,
    button: 'left',
  });
  cleanup();
});

const palmDown = async () => {
  await input.session.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ ...input.toCdp(CANVAS_LEFT + 600, CANVAS_TOP + 500), id: 7 }],
  });
};

const strokeAcross = async (y: number, from: number, to: number) => {
  for (let x = from; x <= to; x += 20)
    await input.pen('mouseMoved', CANVAS_LEFT + x, CANVAS_TOP + y);
};

describe('canvas pointers in real Chromium', () => {
  it('zooms a two times trackpad pinch by about two times', async () => {
    const controller = mountCanvas([nodeA()]);
    await frames();
    await input.session.send('Input.synthesizePinchGesture', {
      ...input.toCdp(CANVAS_LEFT + 500, CANVAS_TOP + 350),
      scaleFactor: 2,
      gestureSourceType: 'mouse',
    });
    await frames(4);
    expect(controller.camera.get().z).toBeGreaterThan(1.8);
    expect(controller.camera.get().z).toBeLessThan(2.2);
  });

  it('keeps one ctrl+wheel mouse notch to a modest zoom step', async () => {
    const controller = mountCanvas([nodeA()]);
    await frames();
    await input.session.send('Input.dispatchMouseEvent', {
      type: 'mouseWheel',
      ...input.toCdp(CANVAS_LEFT + 500, CANVAS_TOP + 350),
      deltaX: 0,
      deltaY: -100,
      modifiers: 2,
    });
    await frames();
    expect(controller.camera.get().z).toBeGreaterThan(1.1);
    expect(controller.camera.get().z).toBeLessThan(1.3);
  });

  it('draws the pen stroke when a resting palm landed first', async () => {
    const controller = mountCanvas([]);
    await frames();
    act(() => controller.setTool('pen'));
    await input.pen('mousePressed', CANVAS_LEFT + 100, CANVAS_TOP + 100);
    await input.pen('mouseMoved', CANVAS_LEFT + 150, CANVAS_TOP + 120);
    await input.pen('mouseReleased', CANVAS_LEFT + 150, CANVAS_TOP + 120);
    expect(inkCount(controller)).toBe(1);
    await palmDown();
    await input.pen('mousePressed', CANVAS_LEFT + 200, CANVAS_TOP + 300);
    await strokeAcross(300, 220, 320);
    await input.pen('mouseReleased', CANVAS_LEFT + 320, CANVAS_TOP + 300);
    await input.session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await frames();
    expect(inkCount(controller)).toBe(2);
  });

  it('keeps the pen stroke when a palm touch is cancelled mid stroke', async () => {
    const controller = mountCanvas([]);
    await frames();
    act(() => controller.setTool('pen'));
    await input.pen('mousePressed', CANVAS_LEFT + 200, CANVAS_TOP + 300);
    await strokeAcross(300, 220, 260);
    await palmDown();
    await input.session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    await strokeAcross(300, 280, 320);
    await input.pen('mouseReleased', CANVAS_LEFT + 320, CANVAS_TOP + 300);
    await frames();
    expect(inkCount(controller)).toBe(1);
  });

  it('keeps the connect handles while the mouse travels from a hovered node to one', async () => {
    const controller = mountCanvas([nodeA()]);
    await frames();
    const glide = async (from: [number, number], to: [number, number]) => {
      const [fx, fy] = clientAt(controller, ...from);
      const [tx, ty] = clientAt(controller, ...to);
      for (let step = 0; step <= 20; step += 1) {
        await input.mouse('mouseMoved', fx + ((tx - fx) * step) / 20, fy + ((ty - fy) * step) / 20);
      }
      await frames();
    };
    await glide([180, 132], [180, 132]);
    expect(document.querySelectorAll('[data-connect-handle]')).toHaveLength(4);
    await glide([180, 132], [274, 132]);
    expect(controller.hover.get()).toBe('a');
    await glide([104, 104], [180, 86]);
    expect(controller.hover.get()).toBe('a');
    expect(document.querySelector('[data-connect-handle="top"]')).not.toBeNull();
    await glide([180, 86], [600, 500]);
    expect(controller.hover.get()).toBeNull();
  });

  it('does not count the press of a drag as the first click of a double click', async () => {
    const controller = mountCanvas([nodeA()]);
    await frames();
    const start = clientAt(controller, 180, 132);
    await input.drag(start, clientAt(controller, 180, 400), 4);
    act(() => controller.undo());
    await input.mouse('mousePressed', ...start);
    await input.mouse('mouseReleased', ...start);
    expect(controller.editing.get()).toBeNull();
    expect(controller.selection.get()).toEqual(['a']);
  });

  it('still opens the editor on a real double click', async () => {
    const controller = mountCanvas([nodeA()]);
    await frames();
    const point = clientAt(controller, 180, 132);
    await input.mouse('mouseMoved', ...point);
    await input.mouse('mousePressed', ...point);
    await input.mouse('mouseReleased', ...point);
    await input.mouse('mousePressed', ...point, { clickCount: 2 });
    await input.mouse('mouseReleased', ...point, { clickCount: 2 });
    await frames();
    expect(controller.editing.get()).toBe('a');
  });
});
