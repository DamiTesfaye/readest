import type { Box } from './window';

export const lerpFactor = (dtMs: number, reduced: boolean) =>
  reduced ? 1 : 1 - 0.78 ** (dtMs / 16.7);

export const drift = (tMs: number, i: number, box: Box) => ({
  x: box.width * (0.5 + 0.35 * Math.sin(tMs / 2400 + i * 1.7)),
  y: box.height * (0.5 + 0.35 * Math.sin(tMs / 3100 + i * 2.3)),
});
