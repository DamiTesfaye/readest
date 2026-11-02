import { Overlayer } from 'foliate-js/overlayer.js';
import { bandFill } from '@/libs/ink/fills';
import { roundRectPoly } from '@/libs/ink/geom';
import { strike, underline } from '@/libs/ink/shapes';
import type { Ink } from '@/libs/ink/builder';
import { sketchMarkup } from '@/styles/inkSkin';

type Rect = { left: number; top: number; bottom: number; width: number; height: number };
type DrawOptions = {
  color?: string;
  padding?: number;
  vertical?: boolean;
  writingMode?: string;
};
type Kind = 'highlight' | 'underline' | 'squiggly' | 'strikethrough';

const CURRENT = { color: 'current' } as const;

const DRAW: Record<Kind, (ink: Ink, r: Rect, o: DrawOptions) => void> = {
  highlight: (ink, r) =>
    bandFill(ink, roundRectPoly(r.left - 2, r.top, r.width + 4, r.height, 3), 'current', {
      alpha: 1,
    }),
  underline: (ink, r, o) =>
    underline(ink, r.left, r.bottom + (o.padding ?? 0), r.width, { opts: CURRENT }),
  squiggly: (ink, r, o) =>
    underline(ink, r.left, r.bottom + (o.padding ?? 0), r.width, { kind: 'wavy', opts: CURRENT }),
  strikethrough: (ink, r) =>
    strike(ink, r.left, (r.top + r.bottom) / 2, r.width, { opts: CURRENT }),
};

const isVertical = (kind: Kind, o: DrawOptions) =>
  kind === 'highlight'
    ? !!o.vertical
    : o.writingMode === 'vertical-rl' || o.writingMode === 'vertical-lr';

const drawer =
  (kind: Kind) =>
  (rects: Rect[], options: DrawOptions = {}): SVGGElement => {
    if (isVertical(kind, options)) return Overlayer[kind](rects, options);
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.style.color = options.color ?? 'red';
    if (kind === 'highlight') {
      g.style.opacity = 'var(--overlayer-highlight-opacity, .3)';
      g.style.mixBlendMode = 'var(--overlayer-highlight-blend-mode, normal)';
    }
    g.innerHTML = rects
      .map((r) => {
        const seed = `${kind}:${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)}`;
        return sketchMarkup(seed, 0, 0, (ink) => DRAW[kind](ink, r, options)).svg;
      })
      .join('');
    return g;
  };

export const inkAnnotations = {
  highlight: drawer('highlight'),
  underline: drawer('underline'),
  squiggly: drawer('squiggly'),
  strikethrough: drawer('strikethrough'),
};
