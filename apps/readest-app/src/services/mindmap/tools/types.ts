import type { Atom } from '@/services/mindmap/atom';
import type { Camera } from '@/services/mindmap/camera/camera';
import type { History } from '@/services/mindmap/history/history';
import type { InkPoint } from '@/services/mindmap/ink/ink';
import type { BoundsRect, Point } from '@/services/mindmap/records/geometry';
import type { LinkAnchor } from '@/services/mindmap/schema/types';
import type { SnapGuide } from '@/services/mindmap/snap/snap';
import type { SpatialIndex } from '@/services/mindmap/spatial/spatialIndex';
import type { MapStore } from '@/services/mindmap/store/mapStore';

export type PlaceToolId = 'node' | 'sticky' | 'text' | 'section' | 'rect' | 'ellipse';

export type ToolId = 'select' | 'hand' | 'connect' | 'pen' | PlaceToolId;

export type PointerKind = 'mouse' | 'pen' | 'touch';

export type PointerTarget =
  | { kind: 'canvas' }
  | { kind: 'connect'; id: string; side: LinkAnchor['side'] }
  | { kind: 'resize'; id: string };

export interface CanvasPointer {
  id: number;
  kind: PointerKind;
  button: number;
  screen: Point;
  page: Point;
  pressure: number;
  alt: boolean;
  shift: boolean;
  clicks: number;
  target: PointerTarget;
}

export interface LiveState {
  ink: { points: readonly InkPoint[]; count: number; pen: boolean } | null;
  draft: { tool: PlaceToolId; box: BoundsRect } | null;
  link: { from: Point; to: Point } | null;
  brush: BoundsRect | null;
  guides: readonly SnapGuide[];
}

export const IDLE_LIVE: LiveState = { ink: null, draft: null, link: null, brush: null, guides: [] };

export interface ToolContext {
  store: MapStore;
  history: History;
  camera: Camera;
  spatial: SpatialIndex;
  selection: Atom<readonly string[]>;
  live: Atom<LiveState>;
  editing: Atom<string | null>;
  readOnly: boolean;
  createId(): string;
  topIndex(): string;
  setTool(tool: ToolId): void;
}

export interface Tool {
  state(): string;
  down(pointer: CanvasPointer): void;
  move(pointer: CanvasPointer, samples: readonly CanvasPointer[]): void;
  up(pointer: CanvasPointer): void;
  cancel(): void;
}

export const DRAG_THRESHOLD_PX = 3;
export const HIT_TOLERANCE_PX = 4;

export const patchLive = (ctx: ToolContext, patch: Partial<LiveState>): void => {
  ctx.live.set({ ...ctx.live.get(), ...patch });
};

export const draggedPastThreshold = (from: CanvasPointer, to: CanvasPointer): boolean =>
  Math.hypot(to.screen.x - from.screen.x, to.screen.y - from.screen.y) > DRAG_THRESHOLD_PX;

export const hitRecord = (ctx: ToolContext, page: Point): string | null =>
  ctx.spatial.hitTest(page, HIT_TOLERANCE_PX / ctx.camera.get().z);

export const boxBetween = (a: Point, b: Point): BoundsRect => ({
  x: Math.min(a.x, b.x),
  y: Math.min(a.y, b.y),
  w: Math.abs(b.x - a.x),
  h: Math.abs(b.y - a.y),
});
