import { absoluteInkPoints } from '@/services/mindmap/ink/ink';
import type { MapRecord } from '@/services/mindmap/schema/types';

export interface Point {
  x: number;
  y: number;
}

export interface BoundsRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Geometry {
  bounds(): BoundsRect;
  hitTestPoint(point: Point): boolean;
  distanceToPoint(point: Point): number;
}

const EMPTY_BOUNDS: BoundsRect = { x: 0, y: 0, w: 0, h: 0 };

export class RectGeometry implements Geometry {
  constructor(private readonly rect: BoundsRect) {}

  bounds(): BoundsRect {
    return this.rect;
  }

  hitTestPoint(point: Point): boolean {
    const { x, y, w, h } = this.rect;
    return point.x >= x && point.x <= x + w && point.y >= y && point.y <= y + h;
  }

  distanceToPoint(point: Point): number {
    const { x, y, w, h } = this.rect;
    const dx = Math.max(x - point.x, 0, point.x - (x + w));
    const dy = Math.max(y - point.y, 0, point.y - (y + h));
    return Math.hypot(dx, dy);
  }
}

export class EllipseGeometry implements Geometry {
  constructor(private readonly rect: BoundsRect) {}

  bounds(): BoundsRect {
    return this.rect;
  }

  private normalized(point: Point): Point {
    const { x, y, w, h } = this.rect;
    const rx = w / 2 || 1;
    const ry = h / 2 || 1;
    return { x: (point.x - (x + w / 2)) / rx, y: (point.y - (y + h / 2)) / ry };
  }

  hitTestPoint(point: Point): boolean {
    const n = this.normalized(point);
    return n.x * n.x + n.y * n.y <= 1;
  }

  distanceToPoint(point: Point): number {
    const n = this.normalized(point);
    const norm = Math.hypot(n.x, n.y);
    if (norm <= 1) return 0;
    return (norm - 1) * Math.max(this.rect.w / 2, this.rect.h / 2);
  }
}

const distanceToSegment = (point: Point, a: Point, b: Point): number => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return Math.hypot(point.x - a.x, point.y - a.y);
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq));
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
};

export class PolylineGeometry implements Geometry {
  constructor(
    private readonly points: Point[],
    private readonly strokeWidth: number = 0,
  ) {}

  bounds(): BoundsRect {
    if (this.points.length === 0) return EMPTY_BOUNDS;
    const xs = this.points.map((p) => p.x);
    const ys = this.points.map((p) => p.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    return { x: minX, y: minY, w: Math.max(...xs) - minX, h: Math.max(...ys) - minY };
  }

  distanceToPoint(point: Point): number {
    const first = this.points[0];
    if (!first) return Infinity;
    let min = Math.hypot(point.x - first.x, point.y - first.y);
    for (let i = 1; i < this.points.length; i += 1) {
      min = Math.min(min, distanceToSegment(point, this.points[i - 1]!, this.points[i]!));
    }
    return min;
  }

  hitTestPoint(point: Point): boolean {
    return this.distanceToPoint(point) <= this.strokeWidth / 2;
  }
}

export class GroupGeometry implements Geometry {
  constructor(private readonly members: Geometry[]) {}

  bounds(): BoundsRect {
    if (this.members.length === 0) return EMPTY_BOUNDS;
    const boxes = this.members.map((m) => m.bounds());
    const minX = Math.min(...boxes.map((b) => b.x));
    const minY = Math.min(...boxes.map((b) => b.y));
    const maxX = Math.max(...boxes.map((b) => b.x + b.w));
    const maxY = Math.max(...boxes.map((b) => b.y + b.h));
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }

  hitTestPoint(point: Point): boolean {
    return this.members.some((m) => m.hitTestPoint(point));
  }

  distanceToPoint(point: Point): number {
    return Math.min(...this.members.map((m) => m.distanceToPoint(point)));
  }
}

export const geometryForRecord = (record: MapRecord): Geometry | null => {
  if (record.type === 'link') return null;
  const box = { x: record.x, y: record.y, w: record.w, h: record.h };
  if (record.type === 'shape' && record.geo === 'ellipse') return new EllipseGeometry(box);
  if (record.type === 'ink') {
    const points = absoluteInkPoints(record).map(([x, y]) => ({ x, y }));
    return new PolylineGeometry(points, record.size);
  }
  return new RectGeometry(box);
};
