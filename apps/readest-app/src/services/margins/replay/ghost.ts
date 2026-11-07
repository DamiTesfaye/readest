import { mulberry32 } from '../play/physics';

const BUMP_W = 0.12;

export const ghostGlyph = (
  seed: number,
  index: number,
  w: number,
  h: number,
): [number, number, number, number][] => {
  const r = mulberry32(seed ^ Math.imul(index, 2654435761));
  const bumps = Math.floor(r() * 3);
  return [
    [0, h * 0.25, w, h * 0.45],
    ...Array.from({ length: bumps }, (): [number, number, number, number] => [
      r() * w * (1 - BUMP_W),
      0,
      w * BUMP_W,
      h * 0.25,
    ]),
  ];
};
