import { act, cleanup, render, screen } from '@testing-library/react';
import { Profiler } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import MindmapCanvas, {
  type MindmapCanvasProps,
} from '@/app/reader/components/mindmap/MindmapCanvas';
import { createLinkRecord, createNodeRecord } from '@/services/mindmap/records/defaults';
import type { MapCamera, MapRecord } from '@/services/mindmap/schema/types';
import { createMapStore } from '@/services/mindmap/store/mapStore';
import { type CanvasController, createCanvasController } from '@/services/mindmap/tools/controller';
import '@/styles/globals.css';

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (value: string, options?: Record<string, string | number>) =>
    value.replace(/{{(\w+)}}/g, (_, name: string) => String(options?.[name] ?? '')),
}));

const CANVAS_LEFT = 40;
const CANVAS_TOP = 60;
const FRAME_BUDGET_MS = 20;
const WARM_UP_FRAMES = 20;
const MEASURED_FRAMES = 120;
const DRAG_REACT_BUDGET_MS = 2;

const rgb = (hex: string): string => {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`;
};

const mount = (
  records: MapRecord[],
  camera: MapCamera,
  props: Partial<MindmapCanvasProps> = {},
) => {
  const controller = createCanvasController({ store: createMapStore(records), camera });
  const base: MindmapCanvasProps = {
    controller,
    title: 'Browser map',
    mapStyle: 'sticker',
    mode: 'light',
    animate: false,
    wheelZooms: false,
    autoFocus: false,
    reveal: null,
    announcement: '',
    onJumpToBook: vi.fn(),
    ...props,
  };
  const react = { commits: 0, ms: 0 };
  const frame = (next: MindmapCanvasProps) => (
    <div
      style={{ position: 'absolute', left: CANVAS_LEFT, top: CANVAS_TOP, width: 1000, height: 700 }}
    >
      <Profiler
        id='canvas'
        onRender={(_id, _phase, actual) => {
          react.commits += 1;
          react.ms += actual;
        }}
      >
        <MindmapCanvas {...next} />
      </Profiler>
    </div>
  );
  const view = render(frame(base));
  return {
    controller,
    react,
    rerender: (next: Partial<MindmapCanvasProps>) => view.rerender(frame({ ...base, ...next })),
  };
};

const grid = (count: number): MapRecord[] =>
  Array.from({ length: count }, (_, i) =>
    createNodeRecord({
      id: `n${i}`,
      index: 'a1',
      x: (i % 50) * 200,
      y: Math.floor(i / 50) * 120,
      label: `Node ${i}`,
    }),
  );

const linkedTree = (count: number): MapRecord[] => [
  ...grid(count),
  ...Array.from({ length: count - 1 }, (_, k) =>
    createLinkRecord({
      id: `l${k + 1}`,
      index: 'a2',
      fromId: `n${Math.floor(k / 4)}`,
      toId: `n${k + 1}`,
      label: (k + 1) % 10 === 0 ? `rel ${k + 1}` : '',
    }),
  ),
];

const click = (controller: CanvasController, clientX: number, clientY: number) => {
  const canvas = screen.getByTestId('mindmap-canvas');
  const init = {
    clientX,
    clientY,
    pointerId: 1,
    pointerType: 'mouse',
    button: 0,
    bubbles: true,
    cancelable: true,
  };
  canvas.dispatchEvent(new PointerEvent('pointerdown', init));
  canvas.dispatchEvent(new PointerEvent('pointerup', init));
  return controller.selection.get();
};

const nextFrame = () => new Promise<number>((resolve) => requestAnimationFrame(resolve));

afterEach(cleanup);

describe('mindmap canvas in a real browser', () => {
  it('hit-tests at the pointer position relative to an offset canvas at any zoom', async () => {
    await page.viewport(1280, 900);
    const node = createNodeRecord({
      id: 'a',
      index: 'a1',
      x: 100,
      y: 100,
      w: 160,
      h: 64,
      label: 'Target',
    });
    const { controller } = mount([node], { x: 50, y: 20, z: 2 });
    const selected = click(controller, CANVAS_LEFT + 50 + 110 * 2, CANVAS_TOP + 20 + 110 * 2);
    expect(selected).toEqual(['a']);
    expect(click(controller, CANVAS_LEFT + 5, CANVAS_TOP + 5)).toEqual([]);
  });

  it('opens the label editor on a real double-click, where PointerEvent.detail is always 0', async () => {
    await page.viewport(1280, 900);
    const node = createNodeRecord({
      id: 'a',
      index: 'a1',
      x: 100,
      y: 100,
      w: 160,
      h: 64,
      label: 'Target',
    });
    const { controller } = mount([node], { x: 1, y: 1, z: 1 });
    const canvas = screen.getByTestId('mindmap-canvas');
    const clientX = CANVAS_LEFT + 1 + 100 + 80;
    const clientY = CANVAS_TOP + 1 + 100 + 32;
    const init = {
      clientX,
      clientY,
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      bubbles: true,
      cancelable: true,
    };
    canvas.dispatchEvent(new PointerEvent('pointerdown', init));
    expect(new PointerEvent('pointerdown', init).detail).toBe(0);
    canvas.dispatchEvent(new PointerEvent('pointerup', init));
    canvas.dispatchEvent(new PointerEvent('pointerdown', init));
    canvas.dispatchEvent(new PointerEvent('pointerup', init));
    expect(controller.editing.get()).toBe('a');
  });

  it('places records and links where the camera says, with links scaled with the world', async () => {
    await page.viewport(1280, 900);
    const a = createNodeRecord({ id: 'a', index: 'a1', x: 0, y: 0, w: 100, h: 50, label: 'A' });
    const b = createNodeRecord({ id: 'b', index: 'a2', x: 300, y: 0, w: 100, h: 50, label: 'B' });
    const link = createLinkRecord({
      id: 'l',
      index: 'a3',
      fromId: 'a',
      toId: 'b',
      path: 'straight',
    });
    mount([a, b, link], { x: 30, y: 40, z: 2 });
    await nextFrame();
    const box = screen.getByTestId('mm-record-b').getBoundingClientRect();
    expect(box.left).toBeCloseTo(CANVAS_LEFT + 30 + 300 * 2, 0);
    expect(box.width).toBeCloseTo(200, 0);
    const path = screen.getByTestId('mm-link-l').getBoundingClientRect();
    expect(path.left).toBeCloseTo(CANVAS_LEFT + 30 + 100 * 2, 0);
    expect(path.right).toBeCloseTo(CANVAS_LEFT + 30 + 300 * 2, 0);
    expect(getComputedStyle(screen.getByTestId('mm-links')).pointerEvents).toBe('none');
  });

  it('culls records outside the viewport and brings them back on pan', async () => {
    await page.viewport(1280, 900);
    const { controller } = mount(grid(2000), { x: 1, y: 1, z: 1 });
    await nextFrame();
    const hidden = () =>
      [...document.querySelectorAll<HTMLElement>('[data-testid^="mm-record-"]')].filter(
        (element) => element.style.display === 'none',
      ).length;
    expect(hidden()).toBeGreaterThan(1500);
    expect(screen.getByTestId('mm-record-n0').style.display).toBe('');
    expect(screen.getByTestId('mm-record-n1999').style.display).toBe('none');
    act(() => controller.camera.set({ x: -9000, y: -4500, z: 1 }));
    expect(screen.getByTestId('mm-record-n1999').style.display).toBe('');
    expect(screen.getByTestId('mm-record-n0').style.display).toBe('none');
  });

  it('switches light and dark colours without touching the record DOM', async () => {
    await page.viewport(1280, 900);
    const node = createNodeRecord({
      id: 'a',
      index: 'a1',
      x: 0,
      y: 0,
      label: 'Themed',
      color: 'sky',
    });
    const { rerender } = mount([node], { x: 0, y: 0, z: 1 });
    const body = screen.getByTestId('mm-record-a').firstElementChild!
      .firstElementChild as HTMLElement;
    expect(getComputedStyle(body).backgroundColor).toBe(rgb('#0073b3'));
    const mutations: MutationRecord[] = [];
    const observer = new MutationObserver((records) => mutations.push(...records));
    observer.observe(screen.getByTestId('mm-world'), {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });
    rerender({ mode: 'dark' });
    await nextFrame();
    observer.disconnect();
    expect(getComputedStyle(body).backgroundColor).toBe(rgb('#1f6a96'));
    expect(mutations.filter((m) => m.target !== screen.getByTestId('mm-world'))).toEqual([]);
  });

  it('hit-tests a hover over empty canvas in under 1 ms with 1,999 links', () => {
    const { controller } = mount(linkedTree(2000), { x: 1, y: 1, z: 1 });
    for (let i = 0; i < 20; i += 1) controller.spatial.hitTest({ x: 190, y: 100 }, 4);
    const start = performance.now();
    for (let i = 0; i < 200; i += 1) controller.spatial.hitTest({ x: 190, y: 100 + i * 0.01 }, 4);
    expect((performance.now() - start) / 200).toBeLessThan(1);
  });

  it('drags one record among 2,000 linked records with little React work per move', async () => {
    await page.viewport(1280, 900);
    const { react } = mount(linkedTree(2000), { x: 1, y: 1, z: 1 });
    await nextFrame();
    const canvas = screen.getByTestId('mindmap-canvas');
    const at = (x: number) => ({
      clientX: CANVAS_LEFT + 1 + x,
      clientY: CANVAS_TOP + 1 + 30,
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      buttons: 1,
      bubbles: true,
      cancelable: true,
    });
    canvas.dispatchEvent(new PointerEvent('pointerdown', at(60)));
    for (let x = 60; x < 120; x += 3) canvas.dispatchEvent(new PointerEvent('pointermove', at(x)));
    await nextFrame();
    const before = react.ms;
    const moves = MEASURED_FRAMES;
    for (let i = 0; i < moves; i += 1) {
      canvas.dispatchEvent(new PointerEvent('pointermove', at(120 + i * 3)));
      await nextFrame();
    }
    canvas.dispatchEvent(new PointerEvent('pointerup', at(120 + moves * 3)));
    expect((react.ms - before) / moves).toBeLessThan(DRAG_REACT_BUDGET_MS);
  });

  it('keeps p95 frame time under 20 ms while panning 2,000 records', async () => {
    await page.viewport(1280, 900);
    const { controller } = mount(grid(2000), { x: 1, y: 1, z: 1 });
    for (let i = 0; i < WARM_UP_FRAMES; i += 1) {
      controller.camera.panBy(-4, -2);
      await nextFrame();
    }
    const durations: number[] = [];
    let last = performance.now();
    for (let i = 0; i < MEASURED_FRAMES; i += 1) {
      controller.camera.panBy(-4, -2);
      await nextFrame();
      const now = performance.now();
      durations.push(now - last);
      last = now;
    }
    const sorted = [...durations].sort((a, b) => a - b);
    const p95 = sorted[Math.floor(sorted.length * 0.95)]!;
    expect(p95).toBeLessThan(FRAME_BUDGET_MS);
  });
});
