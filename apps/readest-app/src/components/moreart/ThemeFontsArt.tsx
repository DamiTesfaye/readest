'use client';

import React from 'react';
import { MoreArtProps, playStyle, useMoreArtMotion } from './useMoreArtMotion';

const CYCLE_S = 1.2;
const ORIGIN = '50% 100%';

const KEYFRAMES = `
@keyframes more-fonts-hop-small {
  0%, 62%, 100% { transform: translateY(0) scale(1, 1); }
  12% { transform: translateY(0) scale(1.08, 0.86); }
  30% { transform: translateY(-5px) scale(0.96, 1.06); }
  46% { transform: translateY(0) scale(1.06, 0.9); }
}
@keyframes more-fonts-hop-large {
  0%, 22%, 86%, 100% { transform: translateY(0) scale(1, 1); }
  34% { transform: translateY(0) scale(1.08, 0.86); }
  52% { transform: translateY(-6px) scale(0.96, 1.06); }
  70% { transform: translateY(0) scale(1.06, 0.9); }
}
`;

const GLYPHS = [
  { size: 'small', className: 'h-3.5 object-contain' },
  { size: 'large', className: 'h-5 object-contain' },
] as const;

const ThemeFontsArt: React.FC<MoreArtProps> = ({ colored, hovered, openDelayMs }) => {
  const { animating, onAnimationIteration } = useMoreArtMotion(hovered, openDelayMs);

  return (
    <span
      data-testid='more-art-theme-fonts'
      data-animating={animating}
      className='flex items-end gap-0.5'
      onAnimationIteration={onAnimationIteration}
    >
      <style>{KEYFRAMES}</style>
      {GLYPHS.map(({ size, className }) => (
        <span
          key={size}
          data-part={size}
          className='flex'
          style={
            animating
              ? playStyle(`more-fonts-hop-${size}`, CYCLE_S, ORIGIN)
              : { transformOrigin: ORIGIN }
          }
        >
          <img
            src={`/images/theme-fonts/${colored ? 'paper' : 'muted'}-${size}.svg`}
            alt=''
            className={className}
          />
        </span>
      ))}
    </span>
  );
};

export default ThemeFontsArt;
