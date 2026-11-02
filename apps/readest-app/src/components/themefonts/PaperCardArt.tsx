import React from 'react';
import { wash } from '@/libs/ink/fills';
import { roundRectPoly } from '@/libs/ink/geom';
import { box, line, underline } from '@/libs/ink/shapes';
import { sketchMarkup } from '@/styles/inkSkin';

const SIZE = 512;

const PALETTE = {
  '--ll-desk': '#a8c8bb',
  '--ll-paper': '#f8f5ee',
  '--ll-pencil': '#6b6660',
  '--ll-rule-blue': '#8fb0d4',
  '--ll-rule-red': '#d9776a',
  '--ll-marker': '#df6b3c',
  '--ll-blend': 'multiply',
} as React.CSSProperties;

let art: string | null = null;

const drawArt = () =>
  sketchMarkup('neue-paper-card', SIZE, SIZE, (ink) => {
    wash(ink, roundRectPoly(96, 64, 320, 384, 4), 'paper', { alpha: 1 });
    box(ink, 96, 64, 320, 384, { pen: 'pencil' });
    for (let i = 0; i < 4; i++) {
      const y = 300 + i * 36;
      line(ink, 108, y, 404, y, { opts: { color: 'rule-blue', width: 0.8 } });
    }
    line(ink, 148, 72, 148, 440, { opts: { color: 'rule-red', width: 0.8 } });
    underline(ink, 180, 268, 160, { opts: { color: 'marker', width: 2.4 } });
  }).svg;

const PaperCardArt: React.FC = () => {
  art ??= drawArt();
  return (
    <svg
      data-testid='paper-card-art'
      aria-hidden='true'
      className='pointer-events-none absolute inset-0 h-full w-full'
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      preserveAspectRatio='xMidYMid slice'
      style={PALETTE}
    >
      <rect width={SIZE} height={SIZE} fill='var(--ll-desk)' />
      <g transform='rotate(-2 256 256)' dangerouslySetInnerHTML={{ __html: art }} />
    </svg>
  );
};

export default PaperCardArt;
