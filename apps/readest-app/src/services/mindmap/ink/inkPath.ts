import { getStroke } from 'perfect-freehand';
import { type InkPoint, decodeInk } from '@/services/mindmap/ink/ink';

export const INK_PATH_CACHE_LIMIT = 4000;
const cache = new Map<string, string>();

const round = (value: number): number => Math.round(value * 100) / 100;

const outlineToPath = (outline: number[][]): string => {
  const first = outline[0];
  if (!first) return '';
  const parts = [`M${round(first[0]!)} ${round(first[1]!)}Q`];
  outline.forEach(([x0, y0], i) => {
    const [x1, y1] = outline[(i + 1) % outline.length]!;
    parts.push(`${round(x0!)} ${round(y0!)} ${round((x0! + x1!) / 2)} ${round((y0! + y1!) / 2)}`);
  });
  return `${parts.join(' ')}Z`;
};

export const strokePath = (points: readonly InkPoint[], size: number, pen: boolean): string => {
  if (points.length === 0) return '';
  return outlineToPath(
    getStroke([...points], {
      size,
      thinning: 0.6,
      smoothing: 0.5,
      streamline: 0.5,
      simulatePressure: !pen,
      last: true,
    }),
  );
};

export const inkRecordPath = (record: { points: string; size: number; pen: boolean }): string => {
  const key = `${record.size}|${record.pen}|${record.points}`;
  const cached = cache.get(key);
  if (cached !== undefined) {
    cache.delete(key);
    cache.set(key, cached);
    return cached;
  }
  if (cache.size >= INK_PATH_CACHE_LIMIT) cache.delete(cache.keys().next().value!);
  const path = strokePath(decodeInk(record.points), record.size, record.pen);
  cache.set(key, path);
  return path;
};
