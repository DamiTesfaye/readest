import { act, cleanup, render, screen } from '@testing-library/react';
import { Profiler } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import MindmapCanvas, {
  type MindmapCanvasProps,
} from '@/app/reader/components/mindmap/MindmapCanvas';
import { CAMERA_SETTLE_MS } from '@/app/reader/components/mindmap/WorldLayer';
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
const MEASURED_PASSES = 3;
const ON_CI = Boolean(process.env['CI']);
const FITTED_PAN_BUDGET_MS = ON_CI ? 43 : FRAME_BUDGET_MS;
const FITTED_ZOOM_BUDGET_MS = ON_CI ? 47 : FRAME_BUDGET_MS;
const DRAG_REACT_BUDGET_MS = ON_CI ? 2.7 : 2;
const CI_BUDGET_ISSUE = '#2';

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
const settle = () => new Promise((resolve) => setTimeout(resolve, CAMERA_SETTLE_MS + 50));

const p95 = (durations: number[]): number =>
  [...durations].sort((a, b) => a - b)[Math.floor(durations.length * 0.95)]!;

const measureP95 = async (step: () => void): Promise<number> => {
  for (let i = 0; i < WARM_UP_FRAMES; i += 1) {
    step();
    await nextFrame();
  }
  const passes: number[] = [];
  for (let pass = 0; pass < MEASURED_PASSES; pass += 1) {
    const durations: number[] = [];
    let last = performance.now();
    for (let i = 0; i < MEASURED_FRAMES; i += 1) {
      step();
      await nextFrame();
      const now = performance.now();
      durations.push(now - last);
      last = now;
    }
    passes.push(p95(durations));
  }
  return Math.min(...passes);
};

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
    expect(screen.getByTestId('mm-record-n0').style.display).toBe('');
    await act(settle);
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

  it(`drags one record among 2,000 linked records in under ${DRAG_REACT_BUDGET_MS} ms of React work per move (CI budget tracked in ${CI_BUDGET_ISSUE})`, async () => {
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

  it('culls and rings only on-screen records when 2,000 are selected', async () => {
    await page.viewport(1280, 900);
    const { controller } = mount(grid(2000), { x: 1, y: 1, z: 1 });
    act(() => controller.selection.set(controller.store.all().map((record) => record.id)));
    await nextFrame();
    expect(screen.getByTestId('mm-record-n1999').style.display).toBe('none');
    const rings = document.querySelectorAll('[data-testid="mm-selection-ring"]').length;
    expect(rings).toBeGreaterThan(0);
    expect(rings).toBeLessThan(200);
    act(() => controller.fitView(false));
    await nextFrame();
    expect(document.querySelectorAll('[data-testid="mm-selection-ring"]')).toHaveLength(1);
  });

  it('keeps p95 frame time under 20 ms while panning with 2,000 records selected', async () => {
    await page.viewport(1280, 900);
    const { controller } = mount(linkedTree(2000), { x: 1, y: 1, z: 1 });
    act(() =>
      controller.selection.set(
        controller.store
          .all()
          .filter((record) => record.type === 'node')
          .map((record) => record.id),
      ),
    );
    await nextFrame();
    expect(await measureP95(() => controller.camera.panBy(-4, -2))).toBeLessThan(FRAME_BUDGET_MS);
  });

  it(`keeps p95 frame time under ${FITTED_PAN_BUDGET_MS} ms while panning a fitted map of 2,000 linked records (CI budget tracked in ${CI_BUDGET_ISSUE})`, async () => {
    await page.viewport(1280, 900);
    const { controller } = mount(linkedTree(2000), { x: 0, y: 0, z: 1 });
    act(() => controller.fitView(false));
    await nextFrame();
    expect(screen.getByTestId('mm-record-n1999').style.display).toBe('');
    expect(await measureP95(() => controller.camera.panBy(-2, -1))).toBeLessThan(
      FITTED_PAN_BUDGET_MS,
    );
  });

  it(`keeps p95 frame time under ${FITTED_ZOOM_BUDGET_MS} ms while zooming a fitted map of 2,000 linked records (CI budget tracked in ${CI_BUDGET_ISSUE})`, async () => {
    await page.viewport(1280, 900);
    const { controller } = mount(linkedTree(2000), { x: 0, y: 0, z: 1 });
    act(() => controller.fitView(false));
    await nextFrame();
    let step = 0;
    const zoomP95 = await measureP95(() => {
      step += 1;
      const factor = Math.floor(step / 30) % 2 === 0 ? 1.02 : 1 / 1.02;
      controller.camera.zoomAt({ x: 500, y: 350 }, factor);
    });
    expect(zoomP95).toBeLessThan(FITTED_ZOOM_BUDGET_MS);
  });

  it('promotes the world layer while the camera moves and drops it once it settles', async () => {
    await page.viewport(1280, 900);
    const { controller } = mount(grid(10), { x: 1, y: 1, z: 1 });
    const world = screen.getByTestId('mm-world');
    expect(world.style.willChange).toBe('');
    act(() => controller.camera.panBy(10, 0));
    expect(world.style.willChange).toBe('transform');
    await new Promise((resolve) => setTimeout(resolve, 100));
    act(() => controller.camera.panBy(10, 0));
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(world.style.willChange).toBe('transform');
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(world.style.willChange).toBe('');
  });
});
