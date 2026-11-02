import { Ink, inkViewBox } from '@/libs/ink/builder';

export const sketchMarkup = (
  seed: string | number,
  w: number,
  h: number,
  draw: (ink: Ink) => void,
): { svg: string; viewBox: string } => {
  const ink = new Ink(seed, { grain: false });
  draw(ink);
  const res = ink.toSvg({ w, h });
  return { svg: res.svg, viewBox: inkViewBox(res) };
};
