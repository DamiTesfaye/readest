import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import MindmapCanvas, {
  type MindmapCanvasProps,
} from '@/app/reader/components/mindmap/MindmapCanvas';
import { createLinkRecord, createNodeRecord } from '@/services/mindmap/records/defaults';
import type { MapCamera, MapRecord } from '@/services/mindmap/schema/types';
import { type RecordFilter, SHOW_ALL } from '@/services/mindmap/spatial/spatialIndex';
import { createMapStore } from '@/services/mindmap/store/mapStore';
import { createCanvasController } from '@/services/mindmap/tools/controller';
import type { CanvasPointer } from '@/services/mindmap/tools/types';
import '@/styles/globals.css';

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (value: string, options?: Record<string, string | number>) =>
    value.replace(/{{(\w+)}}/g, (_, name: string) => String(options?.[name] ?? '')),
}));

const WIDTH = 800;
const HEIGHT = 600;

const nextFrame = () => new Promise<number>((resolve) => requestAnimationFrame(resolve));

const mount = (
  records: MapRecord[],
  camera: MapCamera = { x: 0.5, y: 0, z: 1 },
  props: Partial<MindmapCanvasProps> = {},
  filter: RecordFilter = SHOW_ALL,
) => {
  const controller = createCanvasController({ store: createMapStore(records), camera });
  controller.visible.set(filter);
  const base: MindmapCanvasProps = {
    controller,
    title: 'World',
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
  const frame = (next: MindmapCanvasProps) => (
    <div style={{ position: 'absolute', left: 0, top: 0, width: WIDTH, height: HEIGHT }}>
      <MindmapCanvas {...next} />
    </div>
  );
  const view = render(frame(base));
  return {
    controller,
    rerender: (next: Partial<MindmapCanvasProps>) => view.rerender(frame({ ...base, ...next })),
  };
};

const pointer = (x: number, y: number): CanvasPointer => ({
  id: 1,
  kind: 'mouse',
  button: 0,
  screen: { x, y },
  page: { x, y },
  pressure: 0.5,
  alt: false,
  shift: false,
  clicks: 1,
  target: { kind: 'canvas' },
});

const darkPixels = async (): Promise<number> => {
  const root = screen.getByTestId('mindmap-canvas');
  for (const child of root.children) {
    if (child.getAttribute('data-testid') !== 'mm-world')
      (child as HTMLElement).style.visibility = 'hidden';
  }
  const shot = await page.screenshot({ element: root, base64: true, save: false });
  const blob = await (await fetch(`data:image/png;base64,${shot}`)).blob();
  const bitmap = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext('2d')!;
  context.drawImage(bitmap, 0, 0);
  const { data } = context.getImageData(0, 0, bitmap.width, bitmap.height);
  let count = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i]! + data[i + 1]! + data[i + 2]! < 300) count += 1;
  }
  return count;
};

const drawStroke = (points: Array<[number, number]>) => {
  const { controller } = mount([]);
  act(() => {
    controller.setTool('pen');
    controller.pointerDown(pointer(...points[0]!));
    for (const point of points.slice(1)) controller.pointerMove(pointer(...point), []);
    controller.pointerUp(pointer(...points[points.length - 1]!));
  });
  return controller;
};

afterEach(cleanup);

describe('ink records in a real browser', () => {
  it('paints a perfectly horizontal pen stroke', async () => {
    await page.viewport(1000, 800);
    const controller = drawStroke(Array.from({ length: 40 }, (_, i) => [100 + i * 5, 200]));
    const ink = controller.store.all().find((record) => record.type === 'ink');
    expect(ink?.type === 'ink' && ink.h).toBe(0);
    await nextFrame();
    expect(await darkPixels()).toBeGreaterThan(200);
  });

  it('paints a perfectly vertical pen stroke', async () => {
    await page.viewport(1000, 800);
    drawStroke(Array.from({ length: 40 }, (_, i) => [300, 100 + i * 5]));
    await nextFrame();
    expect(await darkPixels()).toBeGreaterThan(200);
  });

  it('paints a pen dot', async () => {
    await page.viewport(1000, 800);
    drawStroke([[300, 300]]);
    await nextFrame();
    expect(await darkPixels()).toBeGreaterThan(4);
  });
});

describe('link culling in a real browser', () => {
  it('keeps a link drawn while it crosses the view with both ends off screen', async () => {
    await page.viewport(1000, 800);
    const { controller } = mount([
      createNodeRecord({ id: 'left', index: 'a1', x: -3000, y: 300, w: 160, h: 64, label: 'L' }),
      createNodeRecord({ id: 'right', index: 'a2', x: 3000, y: 300, w: 160, h: 64, label: 'R' }),
      createLinkRecord({
        id: 'across',
        index: 'a3',
        fromId: 'left',
        toId: 'right',
        label: 'spans',
      }),
    ]);
    await nextFrame();
    const path = screen.getByTestId('mm-link-across');
    expect(path.style.display).toBe('');
    expect(path.getBoundingClientRect().left).toBeLessThan(0);
    expect(path.getBoundingClientRect().right).toBeGreaterThan(WIDTH);
    expect(screen.getByTestId('mm-record-left').style.display).toBe('none');
    act(() => controller.camera.set({ x: 0, y: -5000, z: 1 }));
    expect(path.style.display).toBe('none');
  });

  it('shows a link again after its far end moves into view remotely', async () => {
    await page.viewport(1000, 800);
    const { controller } = mount([
      createNodeRecord({ id: 'a', index: 'a1', x: 9000, y: 100, label: 'A' }),
      createNodeRecord({ id: 'b', index: 'a2', x: 9000, y: 900, label: 'B' }),
      createLinkRecord({ id: 'ab', index: 'a3', fromId: 'a', toId: 'b' }),
    ]);
    await nextFrame();
    expect(screen.getByTestId('mm-link-ab').style.display).toBe('none');
    act(() => {
      controller.store.applyRemote({
        added: [],
        changed: [{ id: 'b', field: 'x', from: 9000, to: 100 }],
        discarded: [],
      });
    });
    expect(screen.getByTestId('mm-link-ab').style.display).toBe('');
  });
});

describe('hidden records in a real browser', () => {
  const records = (): MapRecord[] => [
    createNodeRecord({ id: 'shown', index: 'a1', x: 100, y: 100, w: 160, h: 64, label: 'Shown' }),
    createNodeRecord({ id: 'secret', index: 'a2', x: 400, y: 100, w: 160, h: 64, label: 'Secret' }),
    createLinkRecord({ id: 'l', index: 'a3', fromId: 'shown', toId: 'secret', label: 'loves' }),
  ];
  const notSecret = (record: MapRecord): boolean => record.id !== 'secret';

  const clickAt = (x: number, y: number) => {
    const canvas = screen.getByTestId('mindmap-canvas');
    const init = {
      clientX: x,
      clientY: y,
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      bubbles: true,
      cancelable: true,
    };
    canvas.dispatchEvent(new PointerEvent('pointerdown', init));
    canvas.dispatchEvent(new PointerEvent('pointerup', init));
  };

  it('does not render, hit, fit or name a hidden record, then shows it once revealed', async () => {
    await page.viewport(1000, 800);
    const { controller } = mount(records(), { x: 0, y: 0, z: 1 });
    act(() => controller.visible.set(notSecret));
    await nextFrame();
    expect(screen.queryByTestId('mm-record-secret')).toBeNull();
    expect(screen.queryByTestId('mm-link-l')).toBeNull();
    expect(screen.queryByText('loves')).toBeNull();
    expect(screen.getByTestId('mm-record-shown').getAttribute('aria-label')).toBe('Shown, Idea');
    act(() => clickAt(480, 132));
    expect(controller.selection.get()).toEqual([]);
    act(() => controller.fitView(false));
    expect(controller.camera.get().z).toBe(1);
    expect(controller.camera.get().x).toBe(WIDTH / 2 - 180);
    act(() => controller.visible.set(() => true));
    await nextFrame();
    expect(screen.getByTestId('mm-record-secret').style.display).toBe('');
    expect(screen.getByTestId('mm-link-l').style.display).toBe('');
    expect(screen.getByTestId('mm-record-shown').getAttribute('aria-label')).toContain(
      'loves Secret',
    );
    const { x, y } = controller.camera.get();
    act(() => clickAt(x + 480, y + 132));
    expect(controller.selection.get()).toEqual(['secret']);
  });

  it('renders fog placeholders inside the moving world', async () => {
    await page.viewport(1000, 800);
    const { controller } = mount(
      [],
      { x: 0, y: 0, z: 1 },
      {
        worldChildren: (
          <div
            data-testid='fog'
            style={{ position: 'absolute', left: 300, top: 200, width: 50, height: 50 }}
          />
        ),
      },
    );
    act(() => controller.camera.set({ x: 20, y: 10, z: 2 }));
    await nextFrame();
    const fog = screen.getByTestId('fog');
    expect(screen.getByTestId('mm-world').contains(fog)).toBe(true);
    expect(fog.getBoundingClientRect().left).toBeCloseTo(20 + 300 * 2, 0);
    expect(fog.getBoundingClientRect().width).toBeCloseTo(100, 0);
  });
});

describe('pop-in in a real browser', () => {
  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const popping = (id: string): number => {
    const inner = screen.getByTestId(`mm-record-${id}`).firstElementChild as HTMLElement;
    return inner.getAnimations().filter((a) => a.playState === 'running').length;
  };

  it('pops a created record once, not again when it scrolls back into view', async () => {
    await page.viewport(1000, 800);
    const { controller } = mount([], { x: 0, y: 0, z: 1 }, { animate: true });
    act(() => {
      controller.store.put([
        createNodeRecord({ id: 'fresh', index: 'a1', x: 100, y: 100, label: 'Fresh' }),
      ]);
    });
    await nextFrame();
    expect(popping('fresh')).toBe(1);
    await wait(400);
    expect(popping('fresh')).toBe(0);
    act(() => controller.camera.set({ x: -5000, y: 0, z: 1 }));
    await nextFrame();
    expect(screen.getByTestId('mm-record-fresh').style.display).toBe('none');
    await nextFrame();
    act(() => controller.camera.set({ x: 0, y: 0, z: 1 }));
    await nextFrame();
    expect(popping('fresh')).toBe(0);
  });

  it('pops a record revealed after mount, once, and never one shown at mount', async () => {
    await page.viewport(1000, 800);
    const { controller } = mount(
      [
        createNodeRecord({ id: 'old', index: 'a1', x: 100, y: 100, label: 'Old' }),
        createNodeRecord({ id: 'later', index: 'a2', x: 400, y: 100, label: 'Later' }),
      ],
      { x: 0, y: 0, z: 1 },
      { animate: true },
      (record) => record.id !== 'later',
    );
    await nextFrame();
    expect(screen.queryByTestId('mm-record-later')).toBeNull();
    expect(popping('old')).toBe(0);
    act(() => controller.visible.set(() => true));
    await nextFrame();
    expect(popping('later')).toBe(1);
    expect(popping('old')).toBe(0);
    await wait(400);
    act(() => controller.visible.set((record) => record.id !== 'later'));
    act(() => controller.visible.set(() => true));
    await nextFrame();
    expect(popping('later')).toBe(0);
  });
});

describe('selection culling in a real browser', () => {
  it('keeps the record holding focus drawn when the camera pans away from it', async () => {
    await page.viewport(1000, 800);
    const { controller } = mount(
      [
        createNodeRecord({ id: 'a', index: 'a1', x: 100, y: 100, label: 'A' }),
        createNodeRecord({ id: 'b', index: 'a2', x: 400, y: 100, label: 'B' }),
      ],
      { x: 0, y: 0, z: 1 },
    );
    act(() => controller.selection.set(['a', 'b']));
    const a = screen.getByTestId('mm-record-a');
    a.focus();
    act(() => controller.camera.set({ x: -9000, y: 0, z: 1 }));
    expect(a.style.display).toBe('');
    expect(document.activeElement).toBe(a);
    expect(screen.getByTestId('mm-record-b').style.display).toBe('none');
  });
});
