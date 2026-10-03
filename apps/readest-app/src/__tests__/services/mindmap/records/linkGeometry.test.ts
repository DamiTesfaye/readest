import { describe, expect, it } from 'vitest';
import { anchorPoint, linkShape } from '@/services/mindmap/records/linkGeometry';

const left = { x: 0, y: 0, w: 100, h: 50 };
const right = { x: 300, y: 0, w: 100, h: 50 };
const below = { x: 0, y: 300, w: 100, h: 50 };

describe('linkShape', () => {
  it('joins the facing sides when no anchor is stored', () => {
    const shape = linkShape(left, right, { fromAnchor: null, toAnchor: null, path: 'straight' });
    expect(shape.points).toEqual([
      { x: 100, y: 25 },
      { x: 300, y: 25 },
    ]);
    expect(shape.mid).toEqual({ x: 200, y: 25 });
    expect(shape.d).toBe('M100 25L300 25');
  });

  it('uses vertical sides for records stacked on top of each other', () => {
    const shape = linkShape(left, below, { fromAnchor: null, toAnchor: null, path: 'straight' });
    expect(shape.points[0]).toEqual({ x: 50, y: 50 });
    expect(shape.points[1]).toEqual({ x: 50, y: 300 });
  });

  it('honours stored anchors', () => {
    const shape = linkShape(left, right, {
      fromAnchor: { side: 'bottom', t: 0.25 },
      toAnchor: { side: 'top', t: 1 },
      path: 'straight',
    });
    expect(shape.points).toEqual([
      { x: 25, y: 50 },
      { x: 400, y: 0 },
    ]);
  });

  it('draws steps with two right-angle corners', () => {
    const shape = linkShape(
      left,
      { x: 300, y: 200, w: 100, h: 50 },
      {
        fromAnchor: null,
        toAnchor: null,
        path: 'step',
      },
    );
    expect(shape.points).toEqual([
      { x: 100, y: 25 },
      { x: 200, y: 25 },
      { x: 200, y: 225 },
      { x: 300, y: 225 },
    ]);
  });

  it('samples a bezier that starts and ends on the anchors', () => {
    const shape = linkShape(left, right, { fromAnchor: null, toAnchor: null, path: 'bezier' });
    expect(shape.d.startsWith('M100 25C')).toBe(true);
    expect(shape.points[0]).toEqual({ x: 100, y: 25 });
    expect(shape.points[shape.points.length - 1]).toEqual({ x: 300, y: 25 });
    expect(shape.mid.x).toBeCloseTo(200, 9);
  });

  it('puts the centre anchor in the middle of the box', () => {
    expect(anchorPoint(left, 'center')).toEqual({ x: 50, y: 25 });
  });
});
