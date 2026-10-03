import type { Point } from '@/services/mindmap/records/geometry';

export type Direction = 'up' | 'down' | 'left' | 'right';

export interface FocusCandidate {
  id: string;
  center: Point;
}

const CROSS_WEIGHT = 2;

export const nearestInDirection = (
  from: Point,
  candidates: readonly FocusCandidate[],
  direction: Direction,
): string | null => {
  let best: { id: string; score: number } | null = null;
  for (const candidate of candidates) {
    const dx = candidate.center.x - from.x;
    const dy = candidate.center.y - from.y;
    const along =
      direction === 'left' ? -dx : direction === 'right' ? dx : direction === 'up' ? -dy : dy;
    const across = direction === 'left' || direction === 'right' ? Math.abs(dy) : Math.abs(dx);
    if (along <= 0) continue;
    const score = along + across * CROSS_WEIGHT;
    if (!best || score < best.score) best = { id: candidate.id, score };
  }
  return best?.id ?? null;
};
