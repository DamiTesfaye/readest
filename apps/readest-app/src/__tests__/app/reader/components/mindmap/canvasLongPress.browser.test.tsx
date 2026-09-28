import { cleanup, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { createNodeRecord } from '@/services/mindmap/records/defaults';
import '@/styles/globals.css';
import { type CdpInput, clientAt, createCdpInput, frames, mountCanvas, wait } from './cdpCanvas';

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (value: string, options?: Record<string, string | number>) =>
    value.replace(/{{(\w+)}}/g, (_, name: string) => String(options?.[name] ?? '')),
}));

const HOLD_MS = 800;

const nodeA = () =>
  createNodeRecord({ id: 'a', index: 'a1', x: 100, y: 100, w: 160, h: 64, label: 'Alpha' });

let input: CdpInput;

beforeEach(async () => {
  await page.viewport(1280, 900);
  input = await createCdpInput();
  await input.session.send('Emulation.setTouchEmulationEnabled', {
    enabled: true,
    maxTouchPoints: 5,
  });
});

afterEach(async () => {
  await input.session.send('Emulation.setTouchEmulationEnabled', { enabled: false });
  cleanup();
});

const touch = async (type: 'touchStart' | 'touchMove', points: Array<[number, number]>) => {
  await input.session.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: points.map(([x, y], id) => ({ ...input.toCdp(x, y), id })),
  });
};

const lift = () =>
  input.session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

const menus = () => screen.queryAllByTestId('mm-record-menu');

describe('touch long press in real Chromium', () => {
  it('opens the record menu on a record held still', async () => {
    const controller = mountCanvas([nodeA()]);
    await frames();
    await touch('touchStart', [clientAt(controller, 180, 132)]);
    await wait(HOLD_MS);
    expect(menus()).toHaveLength(1);
    await lift();
    await frames();
    expect(controller.selection.get()).toEqual(['a']);
    expect(menus()).toHaveLength(1);
    expect((controller.store.get('a') as { x: number }).x).toBe(100);
  });

  it('does not open the menu when the finger drags the record', async () => {
    const controller = mountCanvas([nodeA()]);
    await frames();
    const [x, y] = clientAt(controller, 180, 132);
    await touch('touchStart', [[x, y]]);
    for (let step = 1; step <= 6; step += 1) await touch('touchMove', [[x + step * 10, y]]);
    await wait(HOLD_MS);
    await lift();
    expect(menus()).toHaveLength(0);
    expect((controller.store.get('a') as { x: number }).x).toBeGreaterThan(100);
  });

  it('does not open the menu when a second finger starts a pinch', async () => {
    const controller = mountCanvas([nodeA()]);
    await frames();
    const [x, y] = clientAt(controller, 180, 132);
    await touch('touchStart', [[x, y]]);
    await touch('touchStart', [
      [x, y],
      [x + 200, y],
    ]);
    await wait(HOLD_MS);
    await lift();
    expect(menus()).toHaveLength(0);
  });

  it('does not open the menu for a quick tap or a hold on empty canvas', async () => {
    const controller = mountCanvas([nodeA()]);
    await frames();
    await touch('touchStart', [clientAt(controller, 180, 132)]);
    await wait(100);
    await lift();
    await touch('touchStart', [clientAt(controller, 600, 500)]);
    await wait(HOLD_MS);
    await lift();
    expect(menus()).toHaveLength(0);
  });

  it('opens a single menu where Chromium also fires contextmenu for the long press', async () => {
    const controller = mountCanvas([nodeA()]);
    await frames();
    const cancel = vi.spyOn(controller, 'pointerCancel');
    const contextMenus: Event[] = [];
    const canvas = screen.getByTestId('mindmap-canvas');
    canvas.addEventListener('contextmenu', (event) => contextMenus.push(event));
    const { x, y } = input.toCdp(...clientAt(controller, 180, 132));
    await input.session.send('Input.synthesizeTapGesture', {
      x,
      y,
      duration: 1200,
      tapCount: 1,
      gestureSourceType: 'touch',
    });
    await frames(4);
    expect(contextMenus.length).toBeGreaterThan(0);
    expect(contextMenus.every((event) => event.defaultPrevented)).toBe(true);
    expect(menus()).toHaveLength(1);
    expect(cancel).toHaveBeenCalledOnce();
    expect(controller.selection.get()).toEqual(['a']);
  });
});
