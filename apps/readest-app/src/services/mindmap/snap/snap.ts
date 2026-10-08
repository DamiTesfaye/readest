import type { BoundsRect, Point } from '@/services/mindmap/records/geometry';

export const GRID_SIZE = 16;
export const SNAP_DISTANCE_PX = 8;

export interface SnapGuide {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface SnapResult {
  x: number;
  y: number;
  guides: SnapGuide[];
}

type Axis = 'x' | 'y';

interface AxisSnap {
  offset: number;
  guide: SnapGuide;
}

const other = (axis: Axis): Axis => (axis === 'x' ? 'y' : 'x');
const start = (box: BoundsRect, axis: Axis): number => (axis === 'x' ? box.x : box.y);
const size = (box: BoundsRect, axis: Axis): number => (axis === 'x' ? box.w : box.h);
const end = (box: BoundsRect, axis: Axis): number => start(box, axis) + size(box, axis);

const segment = (axis: Axis, at: number, from: number, to: number): SnapGuide =>
  axis === 'x' ? { x1: at, y1: from, x2: at, y2: to } : { x1: from, y1: at, x2: to, y2: at };

const better = (current: AxisSnap | null, offset: number, threshold: number): boolean =>
  Math.abs(offset) <= threshold &&
  (current === null || Math.abs(offset) < Math.abs(current.offset));

const edgeSnap = (
  box: BoundsRect,
  others: BoundsRect[],
  axis: Axis,
  threshold: number,
): AxisSnap | null => {
  const edges = (b: BoundsRect): number[] => [
    start(b, axis),
    start(b, axis) + size(b, axis) / 2,
    end(b, axis),
  ];
  const cross = other(axis);
  let best: AxisSnap | null = null;
  for (const target of others) {
    for (const at of edges(target)) {
      for (const edge of edges(box)) {
        const offset = at - edge;
        if (!better(best, offset, threshold)) continue;
        const from = Math.min(start(box, cross), start(target, cross));
        const to = Math.max(end(box, cross), end(target, cross));
        best = { offset, guide: segment(axis, at, from, to) };
      }
    }
  }
  return best;
};

const gapSnap = (
  box: BoundsRect,
  others: BoundsRect[],
  axis: Axis,
  threshold: number,
): AxisSnap | null => {
  const cross = other(axis);
  const row = others
    .filter((b) => start(b, cross) < end(box, cross) && start(box, cross) < end(b, cross))
    .sort((a, b) => start(a, axis) - start(b, axis));
  const middle = start(box, cross) + size(box, cross) / 2;
  let best: AxisSnap | null = null;
  for (let i = 0; i + 1 < row.length; i += 1) {
    const a = row[i]!;
    const b = row[i + 1]!;
    const gap = start(b, axis) - end(a, axis);
    if (gap <= 0) continue;
    const after = end(b, axis) + gap;
    const before = start(a, axis) - gap - size(box, axis);
    if (better(best, after - start(box, axis), threshold)) {
      best = {
        offset: after - start(box, axis),
        guide: segment(cross, middle, end(b, axis), after),
      };
    }
    if (better(best, before - start(box, axis), threshold)) {
      best = {
        offset: before - start(box, axis),
        guide: segment(cross, middle, before + size(box, axis), start(a, axis)),
      };
    }
  }
  return best;
};

export const snapToGrid = (value: number): number => Math.round(value / GRID_SIZE) * GRID_SIZE;

export const snapPoint = (point: Point): Point => ({
  x: snapToGrid(point.x),
  y: snapToGrid(point.y),
});

const snapAxis = (
  box: BoundsRect,
  others: BoundsRect[],
  axis: Axis,
  threshold: number,
): { value: number; guide: SnapGuide | null } => {
  const edge = edgeSnap(box, others, axis, threshold);
  const gap = gapSnap(box, others, axis, threshold);
  const best = edge && (!gap || Math.abs(edge.offset) <= Math.abs(gap.offset)) ? edge : gap;
  if (best) return { value: start(box, axis) + best.offset, guide: best.guide };
  return { value: snapToGrid(start(box, axis)), guide: null };
};

export const snapBox = (
  box: BoundsRect,
  others: BoundsRect[],
  zoom: number,
  enabled: boolean,
): SnapResult => {
  if (!enabled) return { x: box.x, y: box.y, guides: [] };
  const threshold = SNAP_DISTANCE_PX / zoom;
  const x = snapAxis(box, others, 'x', threshold);
  const y = snapAxis(box, others, 'y', threshold);
  return {
    x: x.value,
    y: y.value,
    guides: [x.guide, y.guide].filter((guide): guide is SnapGuide => guide !== null),
  };
};
