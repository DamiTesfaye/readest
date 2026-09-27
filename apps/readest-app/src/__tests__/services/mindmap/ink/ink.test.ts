import { describe, expect, it } from 'vitest';
import {
  type InkPoint,
  type InkSegment,
  absoluteInkPoints,
  decodeInk,
  encodeInkStroke,
} from '@/services/mindmap/ink/ink';

const PRESSURE = 51 / 255;

const stroke = (count: number): InkPoint[] =>
  Array.from({ length: count }, (_, i): InkPoint => [i * 0.5, i * 0.25, PRESSURE]);

const absolute = (segment: InkSegment): InkPoint[] => absoluteInkPoints(segment);

describe('ink codec', () => {
  it('round-trips a snapped stroke exactly', () => {
    const points: InkPoint[] = [
      [10, 20, 51 / 255],
      [12.125, 21.5, 102 / 255],
      [15, 25.25, 1],
      [15, 25.25, 1],
      [-20, 10, 0],
    ];
    const [segment] = encodeInkStroke(points);
    expect(absolute(segment!)).toEqual(points);
  });

  it('stores points relative to the segment box', () => {
    const [segment] = encodeInkStroke([
      [100, 200, PRESSURE],
      [140, 180, PRESSURE],
    ]);
    expect(segment).toMatchObject({ x: 100, y: 180, w: 40, h: 20 });
    expect(decodeInk(segment!.points)[0]).toEqual([0, 20, PRESSURE]);
  });

  it('snaps coordinates to an eighth of a page unit', () => {
    const [segment] = encodeInkStroke([[10.06, 20.2, 0.3]]);
    const [point] = absolute(segment!);
    expect(point![0]).toBe(10);
    expect(point![1]).toBe(20.25);
  });

  it('returns no segments for an empty stroke', () => {
    expect(encodeInkStroke([])).toEqual([]);
  });

  it('keeps 600 points in one segment and repeats the last point in the next', () => {
    expect(encodeInkStroke(stroke(600))).toHaveLength(1);
    const segments = encodeInkStroke(stroke(601));
    expect(segments).toHaveLength(2);
    const first = absolute(segments[0]!);
    const second = absolute(segments[1]!);
    expect(second).toHaveLength(2);
    expect(second[0]).toEqual(first[first.length - 1]);
  });

  it('leaves no gap between segments of a long stroke', () => {
    const points = stroke(1200);
    const segments = encodeInkStroke(points).map(absolute);
    for (let i = 1; i < segments.length; i += 1) {
      const previous = segments[i - 1]!;
      expect(segments[i]![0]).toEqual(previous[previous.length - 1]);
    }
    const joined = segments.flatMap((segment, i) => (i === 0 ? segment : segment.slice(1)));
    expect(joined).toEqual(points);
  });

  it('starts a new segment when one step overflows Int16', () => {
    const segments = encodeInkStroke([
      [0, 0, PRESSURE],
      [5000, 0, PRESSURE],
    ]);
    expect(segments.map(absolute)).toEqual([[[0, 0, PRESSURE]], [[5000, 0, PRESSURE]]]);
  });

  it('decodes empty and malformed payloads to no points', () => {
    expect(decodeInk('')).toEqual([]);
    expect(decodeInk('not base64!')).toEqual([]);
    expect(decodeInk('AAAA')).toEqual([]);
  });
});
