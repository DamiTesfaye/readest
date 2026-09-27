import { type Atom, createAtom } from '@/services/mindmap/atom';
import type { BoundsRect, Point } from '@/services/mindmap/records/geometry';
import type { MapCamera } from '@/services/mindmap/schema/types';

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 4;
export const FIT_PADDING = 48;
export const CAMERA_ANIMATION_MS = 200;

export interface Viewport {
  width: number;
  height: number;
}

export interface Camera extends Atom<MapCamera> {
  screenToPage(point: Point): Point;
  pageToScreen(point: Point): Point;
  panBy(dx: number, dy: number): void;
  zoomAt(screen: Point, factor: number): void;
  viewportBounds(viewport: Viewport): BoundsRect;
  fitTarget(bounds: BoundsRect | null, viewport: Viewport): MapCamera;
}

export const clampZoom = (z: number): number => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

export const createCamera = (initial: MapCamera): Camera => {
  const atom = createAtom<MapCamera>({ ...initial, z: clampZoom(initial.z) });
  const screenToPage = (point: Point): Point => {
    const { x, y, z } = atom.get();
    return { x: (point.x - x) / z, y: (point.y - y) / z };
  };
  return {
    ...atom,
    screenToPage,
    pageToScreen: (point) => {
      const { x, y, z } = atom.get();
      return { x: point.x * z + x, y: point.y * z + y };
    },
    panBy: (dx, dy) => {
      const current = atom.get();
      atom.set({ ...current, x: current.x + dx, y: current.y + dy });
    },
    zoomAt: (screen, factor) => {
      const page = screenToPage(screen);
      const z = clampZoom(atom.get().z * factor);
      atom.set({ x: screen.x - page.x * z, y: screen.y - page.y * z, z });
    },
    viewportBounds: (viewport) => {
      const { x, y, z } = atom.get();
      return { x: -x / z, y: -y / z, w: viewport.width / z, h: viewport.height / z };
    },
    fitTarget: (bounds, viewport) => {
      if (!bounds) return { x: viewport.width / 2, y: viewport.height / 2, z: 1 };
      const z = clampZoom(
        Math.min(
          1,
          (viewport.width - FIT_PADDING * 2) / Math.max(bounds.w, 1),
          (viewport.height - FIT_PADDING * 2) / Math.max(bounds.h, 1),
        ),
      );
      return {
        x: viewport.width / 2 - (bounds.x + bounds.w / 2) * z,
        y: viewport.height / 2 - (bounds.y + bounds.h / 2) * z,
        z,
      };
    },
  };
};

export const animateCamera = (
  camera: Camera,
  target: MapCamera,
  animate: boolean,
  now: () => number = () => performance.now(),
  frame: (callback: () => void) => void = (callback) => {
    requestAnimationFrame(callback);
  },
): void => {
  if (!animate) {
    camera.set(target);
    return;
  }
  const start = camera.get();
  const startedAt = now();
  const step = (): void => {
    const t = Math.min(1, (now() - startedAt) / CAMERA_ANIMATION_MS);
    const eased = 1 - (1 - t) * (1 - t);
    camera.set({
      x: start.x + (target.x - start.x) * eased,
      y: start.y + (target.y - start.y) * eased,
      z: start.z + (target.z - start.z) * eased,
    });
    if (t < 1) frame(step);
  };
  frame(step);
};
