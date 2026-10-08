import { render } from '@testing-library/react';
import { vi } from 'vitest';
import { cdp } from 'vitest/browser';
import MindmapCanvas, {
  type MindmapCanvasProps,
} from '@/app/reader/components/mindmap/MindmapCanvas';
import type { MapCamera, MapRecord } from '@/services/mindmap/schema/types';
import { createMapStore } from '@/services/mindmap/store/mapStore';
import { type CanvasController, createCanvasController } from '@/services/mindmap/tools/controller';

export const CANVAS_LEFT = 40;
export const CANVAS_TOP = 60;

export interface CdpSession {
  send(method: string, params?: Record<string, unknown>): Promise<unknown>;
}

export interface CdpInput {
  session: CdpSession;
  toCdp(clientX: number, clientY: number): { x: number; y: number };
  mouse(
    type: 'mouseMoved' | 'mousePressed' | 'mouseReleased',
    clientX: number,
    clientY: number,
    extra?: Record<string, unknown>,
  ): Promise<void>;
  pen(type: 'mouseMoved' | 'mousePressed' | 'mouseReleased', x: number, y: number): Promise<void>;
  drag(from: [number, number], to: [number, number], steps?: number): Promise<void>;
  key(keyName: string, code: string, vk: number, text?: string): Promise<void>;
}

export const frames = async (count = 2): Promise<void> => {
  for (let i = 0; i < count; i += 1) {
    await new Promise<number>((resolve) => requestAnimationFrame(resolve));
  }
};

export const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const calibrate = async (session: CdpSession) => {
  const seen: Array<{ x: number; y: number }> = [];
  const listener = (event: PointerEvent) => seen.push({ x: event.clientX, y: event.clientY });
  window.addEventListener('pointermove', listener);
  await session.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 400, y: 300 });
  await session.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 800, y: 600 });
  await frames();
  window.removeEventListener('pointermove', listener);
  const [a, b] = seen.slice(-2) as [{ x: number; y: number }, { x: number; y: number }];
  const scale = 400 / (b.x - a.x);
  return { scale, ox: 400 - a.x * scale, oy: 300 - a.y * scale };
};

export const createCdpInput = async (): Promise<CdpInput> => {
  const session = cdp() as unknown as CdpSession;
  const cal = await calibrate(session);
  const toCdp = (clientX: number, clientY: number) => ({
    x: clientX * cal.scale + cal.ox,
    y: clientY * cal.scale + cal.oy,
  });
  const mouse: CdpInput['mouse'] = async (type, clientX, clientY, extra = {}) => {
    await session.send('Input.dispatchMouseEvent', {
      type,
      ...toCdp(clientX, clientY),
      button: type === 'mouseMoved' ? 'none' : 'left',
      buttons: type === 'mousePressed' ? 1 : 0,
      clickCount: type === 'mouseMoved' ? 0 : 1,
      ...extra,
    });
  };
  const pen: CdpInput['pen'] = async (type, x, y) => {
    await session.send('Input.dispatchMouseEvent', {
      type,
      ...toCdp(x, y),
      button: 'left',
      buttons: type === 'mouseReleased' ? 0 : 1,
      clickCount: 1,
      pointerType: 'pen',
      force: 0.5,
    });
  };
  const drag: CdpInput['drag'] = async (from, to, steps = 8) => {
    await mouse('mouseMoved', ...from);
    await mouse('mousePressed', ...from);
    for (let i = 1; i <= steps; i += 1) {
      const x = from[0] + ((to[0] - from[0]) * i) / steps;
      const y = from[1] + ((to[1] - from[1]) * i) / steps;
      await mouse('mouseMoved', x, y, { button: 'left', buttons: 1 });
    }
    await mouse('mouseReleased', ...to);
  };
  const key: CdpInput['key'] = async (keyName, code, vk, text) => {
    await session.send('Input.dispatchKeyEvent', {
      type: text ? 'keyDown' : 'rawKeyDown',
      key: keyName,
      code,
      windowsVirtualKeyCode: vk,
      text,
    });
    await session.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: keyName,
      code,
      windowsVirtualKeyCode: vk,
    });
  };
  return { session, toCdp, mouse, pen, drag, key };
};

export const mountCanvas = (
  records: MapRecord[],
  camera: MapCamera = { x: 0, y: 0, z: 1 },
): CanvasController => {
  let next = 0;
  const controller = createCanvasController({
    store: createMapStore(records),
    camera,
    createId: () => {
      next += 1;
      return `new${next}`;
    },
  });
  const props: MindmapCanvasProps = {
    controller,
    title: 'Input map',
    mapStyle: 'sticker',
    mode: 'light',
    animate: false,
    wheelZooms: false,
    autoFocus: true,
    reveal: null,
    announcement: '',
    onJumpToBook: vi.fn(),
  };
  render(
    <div
      style={{ position: 'absolute', left: CANVAS_LEFT, top: CANVAS_TOP, width: 1000, height: 700 }}
    >
      <MindmapCanvas {...props} />
    </div>,
  );
  return controller;
};

export const clientAt = (controller: CanvasController, x: number, y: number): [number, number] => {
  const point = controller.camera.pageToScreen({ x, y });
  return [CANVAS_LEFT + point.x, CANVAS_TOP + point.y];
};

export const inkCount = (controller: CanvasController): number =>
  controller.store.all().filter((record) => record.type === 'ink' && !record.deleted).length;
