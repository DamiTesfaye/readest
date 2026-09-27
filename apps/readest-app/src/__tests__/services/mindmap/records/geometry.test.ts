import { describe, expect, it } from 'vitest';
import { encodeInkStroke } from '@/services/mindmap/ink/ink';
import {
  createInkRecord,
  createLinkRecord,
  createNodeRecord,
  createShapeRecord,
} from '@/services/mindmap/records/defaults';
import {
  EllipseGeometry,
  GroupGeometry,
  PolylineGeometry,
  RectGeometry,
  geometryForRecord,
} from '@/services/mindmap/records/geometry';

describe('geometry primitives', () => {
  it('RectGeometry hit-tests inside, on the edge and outside', () => {
    const rect = new RectGeometry({ x: 0, y: 0, w: 100, h: 50 });
    expect(rect.hitTestPoint({ x: 50, y: 25 })).toBe(true);
    expect(rect.hitTestPoint({ x: 100, y: 50 })).toBe(true);
    expect(rect.hitTestPoint({ x: 150, y: 25 })).toBe(false);
  });

  it('RectGeometry measures distance to the nearest edge when outside', () => {
    const rect = new RectGeometry({ x: 0, y: 0, w: 100, h: 50 });
    expect(rect.distanceToPoint({ x: 50, y: 25 })).toBe(0);
    expect(rect.distanceToPoint({ x: 110, y: 25 })).toBe(10);
  });

  it('EllipseGeometry hit-tests the centre but not a bounding-box corner', () => {
    const ellipse = new EllipseGeometry({ x: 0, y: 0, w: 100, h: 100 });
    expect(ellipse.hitTestPoint({ x: 50, y: 50 })).toBe(true);
    expect(ellipse.hitTestPoint({ x: 0, y: 0 })).toBe(false);
  });

  it('PolylineGeometry hit-tests near a segment and misses far from it', () => {
    const line = new PolylineGeometry(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      10,
    );
    expect(line.hitTestPoint({ x: 50, y: 2 })).toBe(true);
    expect(line.hitTestPoint({ x: 50, y: 50 })).toBe(false);
    expect(line.bounds()).toEqual({ x: 0, y: 0, w: 100, h: 0 });
  });

  it('GroupGeometry unions member bounds and hit-tests any member', () => {
    const group = new GroupGeometry([
      new RectGeometry({ x: 0, y: 0, w: 10, h: 10 }),
      new RectGeometry({ x: 90, y: 90, w: 10, h: 10 }),
    ]);
    expect(group.bounds()).toEqual({ x: 0, y: 0, w: 100, h: 100 });
    expect(group.hitTestPoint({ x: 95, y: 95 })).toBe(true);
    expect(group.hitTestPoint({ x: 50, y: 50 })).toBe(false);
  });
});

describe('geometryForRecord', () => {
  it('returns null for links', () => {
    const link = createLinkRecord({ id: 'l1', index: 'a0', fromId: 'n1', toId: 'n2' });
    expect(geometryForRecord(link)).toBeNull();
  });

  it('returns an ellipse for ellipse shapes and a rect for diamonds and nodes', () => {
    expect(
      geometryForRecord(createShapeRecord({ id: 's1', index: 'a0', geo: 'ellipse' })),
    ).toBeInstanceOf(EllipseGeometry);
    expect(
      geometryForRecord(createShapeRecord({ id: 's2', index: 'a0', geo: 'diamond' })),
    ).toBeInstanceOf(RectGeometry);
    expect(geometryForRecord(createNodeRecord({ id: 'n1', index: 'a0' }))).toBeInstanceOf(
      RectGeometry,
    );
  });

  it('hit-tests ink at its current position after a move', () => {
    const [segment] = encodeInkStroke([
      [0, 0, 0.5],
      [100, 0, 0.5],
    ]);
    const ink = createInkRecord({ id: 'i1', index: 'a0', ...segment!, size: 4 });
    expect(geometryForRecord(ink)!.hitTestPoint({ x: 50, y: 0 })).toBe(true);

    const moved = { ...ink, x: ink.x + 200 };
    const geometry = geometryForRecord(moved)!;
    expect(geometry).toBeInstanceOf(PolylineGeometry);
    expect(geometry.hitTestPoint({ x: 250, y: 0 })).toBe(true);
    expect(geometry.hitTestPoint({ x: 50, y: 0 })).toBe(false);
  });

  it('gives deleted ink with empty points a geometry that hits nothing', () => {
    const ink = createInkRecord({ id: 'i1', index: 'a0', x: 0, y: 0, w: 0, h: 0, points: '' });
    expect(geometryForRecord(ink)!.hitTestPoint({ x: 0, y: 0 })).toBe(false);
  });
});
