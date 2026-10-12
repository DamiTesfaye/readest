'use client';

import React from 'react';
import { ArtSegment, renderSegments } from './artSegments';
import { MoreArtProps, playStyle, useMoreArtMotion } from './useMoreArtMotion';

type LibraryPart = 'book' | 'lean';

const CYCLE_S = 1.6;

const KEYFRAMES = `
@keyframes more-library-pull {
  0%, 100% { transform: translateY(0) rotate(0deg); }
  30%, 55% { transform: translateY(-4px) rotate(-4deg); }
  75% { transform: translateY(0.4px) rotate(0deg); }
}
@keyframes more-library-lean {
  0%, 30%, 100% { transform: rotate(0deg); }
  45% { transform: rotate(5deg); }
  62% { transform: rotate(-2deg); }
  80% { transform: rotate(1deg); }
}
`;

const ORIGINS: Record<LibraryPart, string> = {
  book: '32.16px 28.37px',
  lean: '8.37px 27.97px',
};

const COLORED_SEGMENTS: readonly ArtSegment<LibraryPart>[] = [
  {
    shapes: [
      ['#A56C46', 'M42.7018 28.3906H4.74512V32.0039H42.7018V28.3906Z'],
      ['#A56C46', 'M42.7041 14.1875H39.0908V31.9999H42.7041V14.1875Z'],
    ],
  },
  {
    part: 'book',
    shapes: [
      ['#FFB34C', 'M39.0354 3.57812H32.1572V28.3747H39.0354V3.57812Z'],
      ['#75462F', 'M39.0354 7H32.1572V12.4255H39.0354V7Z'],
      ['#75462F', 'M39.0354 12.7656H32.1572V13.2088H39.0354V12.7656Z'],
      ['#75462F', 'M39.0354 6.22656H32.1572V6.66975H39.0354V6.22656Z'],
    ],
  },
  {
    shapes: [
      ['#138784', 'M31.8557 0H28.1494V28.3742H31.8557V0Z'],
      [
        '#9DBF5C',
        'M29.0527 15.7286C29.0527 15.837 29.1405 15.9247 29.2489 15.9247H30.7536C30.862 15.9247 30.9498 15.837 30.9498 15.7286V1.6805C30.9498 1.57213 30.862 1.48438 30.7536 1.48438H29.2489C29.1405 1.48438 29.0527 1.57213 29.0527 1.6805V15.7286Z',
      ],
      ['#138784', 'M15.1855 8.66103V28.4141H17.5034V8.66103H15.1855Z'],
      ['#9DBF5C', 'M15.1855 9.54043L15.1855 16.2656H17.5034V9.54043H15.1855Z'],
    ],
  },
  {
    part: 'lean',
    shapes: [
      [
        '#75462F',
        'M12.0871 9.72643L6.89355 27.5391L9.84494 28.3996L15.0384 10.5869L12.0871 9.72643Z',
      ],
      [
        '#FF454D',
        'M8.66173 21.4746L6.89355 27.5391L9.84522 28.3997L11.6134 22.3352L8.66173 21.4746Z',
      ],
      ['#FFB34C', 'M11.4655 11.861L10.8896 13.8359L13.841 14.6965L14.4169 12.7215L11.4655 11.861Z'],
    ],
  },
  {
    shapes: [
      ['#9DBF5C', 'M23.9494 6.67188H17.8672V28.3797H23.9494V6.67188Z'],
      ['#75462F', 'M27.7795 1.875H26.1885V28.374H27.7795V1.875Z'],
      ['#FF454D', 'M25.9055 1.875H24.3145V28.374H25.9055V1.875Z'],
    ],
  },
];

const MUTED_SEGMENTS: readonly ArtSegment<LibraryPart>[] = [
  {
    shapes: [
      ['#999999', 'M42.7022 28.3906H4.74561V32.0039H42.7022V28.3906Z'],
      ['#999999', 'M42.7036 14.1875H39.0903V31.9999H42.7036V14.1875Z'],
    ],
  },
  {
    part: 'book',
    shapes: [
      ['#CCCCCC', 'M39.0354 3.57812H32.1572V28.3747H39.0354V3.57812Z'],
      ['#FCFCFC', 'M39.0354 7H32.1572V12.4255H39.0354V7Z'],
      ['#FCFCFC', 'M39.0359 12.7656H32.1577V13.2088H39.0359V12.7656Z'],
      ['#FCFCFC', 'M39.0359 6.22656H32.1577V6.66975H39.0359V6.22656Z'],
    ],
  },
  {
    shapes: [
      ['white', 'M31.8557 0H28.1494V28.3742H31.8557V0Z'],
      [
        '#CCCCCC',
        'M29.0527 15.7286C29.0527 15.837 29.1405 15.9247 29.2489 15.9247H30.7536C30.862 15.9247 30.9498 15.837 30.9498 15.7286V1.6805C30.9498 1.57213 30.862 1.48438 30.7536 1.48438H29.2489C29.1405 1.48438 29.0527 1.57213 29.0527 1.6805V15.7286Z',
      ],
      ['#D9D9D9', 'M15.1855 8.65322V28.4062H17.5034V8.65322H15.1855Z'],
      ['#474A57', 'M15.1855 9.54043L15.1855 16.2656H17.5034V9.54043H15.1855Z'],
    ],
  },
  {
    part: 'lean',
    shapes: [
      [
        '#FCFCFC',
        'M12.0871 9.72643L6.89355 27.5391L9.84494 28.3996L15.0384 10.5869L12.0871 9.72643Z',
      ],
      [
        '#D9D9D9',
        'M8.66173 21.4746L6.89355 27.5391L9.84522 28.3997L11.6134 22.3352L8.66173 21.4746Z',
      ],
      ['#474A57', 'M11.4655 11.861L10.8896 13.8359L13.841 14.6965L14.4169 12.7215L11.4655 11.861Z'],
    ],
  },
  {
    shapes: [
      ['#D9D9D9', 'M23.9494 6.67188H17.8672V28.3797H23.9494V6.67188Z'],
      ['#474A57', 'M27.7795 1.875H26.1885V28.374H27.7795V1.875Z'],
      ['#D9D9D9', 'M25.9055 1.875H24.3145V28.374H25.9055V1.875Z'],
    ],
  },
];

const LibraryArt: React.FC<MoreArtProps> = ({ colored, hovered, openDelayMs }) => {
  const { animating, onAnimationIteration } = useMoreArtMotion(hovered, openDelayMs);
  const partStyle = (part: LibraryPart) =>
    animating
      ? playStyle(`more-library-${part}`, CYCLE_S, ORIGINS[part])
      : { transformBox: 'view-box' as const, transformOrigin: ORIGINS[part] };

  return (
    <svg
      width={colored ? '43' : '43'}
      height={colored ? '32' : '32'}
      viewBox={colored ? '0 0 43 32' : '0 0 43 32'}
      fill='none'
      xmlns='http://www.w3.org/2000/svg'
      aria-hidden='true'
      data-testid='more-art-library'
      data-animating={animating}
      className='h-6 w-auto overflow-visible'
      onAnimationIteration={onAnimationIteration}
    >
      <style>{KEYFRAMES}</style>
      {renderSegments(colored ? COLORED_SEGMENTS : MUTED_SEGMENTS, partStyle)}
    </svg>
  );
};

export default LibraryArt;
