import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import MindmapCanvas, {
  type MindmapCanvasProps,
} from '@/app/reader/components/mindmap/MindmapCanvas';
import type { MapCamera, MapRecord } from '@/services/mindmap/schema/types';
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
) => {
  const controller = createCanvasController({ store: createMapStore(records), camera });
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
