import type { BoundsRect, Point } from '@/services/mindmap/records/geometry';
import type { LinkAnchor, LinkRecord } from '@/services/mindmap/schema/types';

type Side = LinkAnchor['side'];

export interface LinkShape {
  d: string;
  points: Point[];
  mid: Point;
}

const BEZIER_SAMPLES = 16;
const MIN_REACH = 40;

const DIRECTION: Record<Side, Point> = {
  top: { x: 0, y: -1 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  center: { x: 0, y: 0 },
};

const center = (box: BoundsRect): Point => ({ x: box.x + box.w / 2, y: box.y + box.h / 2 });

const facingSides = (from: BoundsRect, to: BoundsRect): [Side, Side] => {
  const a = center(from);
  const b = center(to);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? ['right', 'left'] : ['left', 'right'];
  return dy >= 0 ? ['bottom', 'top'] : ['top', 'bottom'];
};

export const anchorPoint = (box: BoundsRect, side: Side, t = 0.5): Point => {
  if (side === 'top') return { x: box.x + box.w * t, y: box.y };
  if (side === 'bottom') return { x: box.x + box.w * t, y: box.y + box.h };
  if (side === 'left') return { x: box.x, y: box.y + box.h * t };
  if (side === 'right') return { x: box.x + box.w, y: box.y + box.h * t };
  return center(box);
};

const cubicAt = (a: Point, c1: Point, c2: Point, b: Point, t: number): Point => {
  const u = 1 - t;
  const w0 = u * u * u;
  const w1 = 3 * u * u * t;
  const w2 = 3 * u * t * t;
  const w3 = t * t * t;
  return {
    x: w0 * a.x + w1 * c1.x + w2 * c2.x + w3 * b.x,
    y: w0 * a.y + w1 * c1.y + w2 * c2.y + w3 * b.y,
  };
};

const polylineD = (points: Point[]): string =>
  points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join('');

export const linkShape = (
  from: BoundsRect,
  to: BoundsRect,
  link: Pick<LinkRecord, 'fromAnchor' | 'toAnchor' | 'path'>,
): LinkShape => {
  const [autoFrom, autoTo] = facingSides(from, to);
  const fromSide = link.fromAnchor?.side ?? autoFrom;
  const toSide = link.toAnchor?.side ?? autoTo;
  const a = anchorPoint(from, fromSide, link.fromAnchor?.t);
  const b = anchorPoint(to, toSide, link.toAnchor?.t);
  if (link.path === 'straight') {
    return {
      d: polylineD([a, b]),
      points: [a, b],
      mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    };
  }
  if (link.path === 'step') {
    const horizontal = DIRECTION[fromSide].y === 0;
    const corner1 = horizontal ? { x: (a.x + b.x) / 2, y: a.y } : { x: a.x, y: (a.y + b.y) / 2 };
    const corner2 = horizontal ? { x: corner1.x, y: b.y } : { x: b.x, y: corner1.y };
    const points = [a, corner1, corner2, b];
    return {
      d: polylineD(points),
      points,
      mid: { x: (corner1.x + corner2.x) / 2, y: (corner1.y + corner2.y) / 2 },
    };
  }
  const reach = Math.max(MIN_REACH, Math.hypot(b.x - a.x, b.y - a.y) / 2);
  const c1 = { x: a.x + DIRECTION[fromSide].x * reach, y: a.y + DIRECTION[fromSide].y * reach };
  const c2 = { x: b.x + DIRECTION[toSide].x * reach, y: b.y + DIRECTION[toSide].y * reach };
  const points = Array.from({ length: BEZIER_SAMPLES + 1 }, (_, i) =>
    cubicAt(a, c1, c2, b, i / BEZIER_SAMPLES),
  );
  return {
    d: `M${a.x} ${a.y}C${c1.x} ${c1.y} ${c2.x} ${c2.y} ${b.x} ${b.y}`,
    points,
    mid: cubicAt(a, c1, c2, b, 0.5),
  };
};
