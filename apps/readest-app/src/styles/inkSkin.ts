import { Ink, inkViewBox } from '@/libs/ink/builder';
import { bandFill } from '@/libs/ink/fills';
import { roundRectPoly } from '@/libs/ink/geom';
import { box, check, underline } from '@/libs/ink/shapes';

export const INK_SKIN_THEMES = ['paper'];

const STYLE_ID = 'ink-skin';
const FRAME_PAD = 6;

export const sketchMarkup = (
  seed: string | number,
  w: number,
  h: number,
  draw: (ink: Ink) => void,
  pad?: number,
): { svg: string; viewBox: string } => {
  const ink = new Ink(seed, { grain: false });
  draw(ink);
  const res = ink.toSvg({ w, h, pad });
  return { svg: res.svg, viewBox: inkViewBox(res) };
};

type Drawing = [name: string, w: number, h: number, draw: (ink: Ink) => void];

const frame = (pen: 'pencil' | 'ink') => (ink: Ink) => box(ink, 0, 0, 120, 60, { pen });

const DRAWINGS: Drawing[] = [
  ['frame-1', 120, 60, frame('pencil')],
  ['frame-2', 120, 60, frame('pencil')],
  ['frame-3', 120, 60, frame('pencil')],
  ['frame-bold', 120, 60, frame('ink')],
  ['underline', 200, 8, (ink) => underline(ink, 0, 4, 200)],
  [
    'fill',
    120,
    40,
    (ink) => bandFill(ink, roundRectPoly(0, 0, 120, 40, 4), 'marker', { alpha: 0.84 }),
  ],
  ['check', 20, 20, (ink) => check(ink, 2, 2, 16, { pen: 'ink' })],
];

const toDataUri = (
  name: string,
  w: number,
  h: number,
  draw: (ink: Ink) => void,
  css: CSSStyleDeclaration,
) => {
  const { svg, viewBox } = sketchMarkup(`ink-skin-${name}`, w, h, draw, FRAME_PAD);
  const [, , vw, vh] = viewBox.split(' ');
  const doc = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${vw}" height="${vh}">${svg}</svg>`;
  const resolved = doc.replace(
    /var\(--ll-([\w-]+)\)/g,
    (_, key: string) => css.getPropertyValue(`--ll-${key}`).trim() || 'currentColor',
  );
  return `url("data:image/svg+xml,${encodeURIComponent(resolved)}")`;
};

// Frames are drawn once per theme or mood switch and served to CSS as data URIs.
export const applyInkSkin = (themeName: string): void => {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  document.getElementById(STYLE_ID)?.remove();
  if (!INK_SKIN_THEMES.includes(themeName)) {
    delete root.dataset['inkSkin'];
    return;
  }
  const css = getComputedStyle(root);
  const vars = DRAWINGS.map(
    ([name, w, h, draw]) => `--ink-${name}:${toDataUri(name, w, h, draw, css)};`,
  );
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `:root{${vars.join('')}}`;
  document.head.appendChild(style);
  root.dataset['inkSkin'] = '';
};
