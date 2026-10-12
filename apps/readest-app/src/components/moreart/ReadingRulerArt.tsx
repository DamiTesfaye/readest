'use client';

import React from 'react';
import { MoreArtProps, playStyle, useMoreArtMotion } from './useMoreArtMotion';

const CYCLE_S = 1.6;
const ORIGIN = '50% 50%';

const KEYFRAMES = `
@keyframes more-ruler-slide {
  0%, 100% { transform: translate(0, 0); }
  20%, 32% { transform: translate(0.55px, 2.5px); }
  48%, 62% { transform: translate(1.1px, 5px); }
  86% { transform: translate(-0.1px, -0.4px); }
}
`;

const ReadingRulerArt: React.FC<MoreArtProps> = ({ colored, hovered, openDelayMs }) => {
  const { animating, onAnimationIteration } = useMoreArtMotion(hovered, openDelayMs);

  return (
    <span
      data-testid='more-art-reading-ruler'
      data-animating={animating}
      className='flex'
      onAnimationIteration={onAnimationIteration}
    >
      <style>{KEYFRAMES}</style>
      <span
        data-part='ruler'
        className='flex'
        style={animating ? playStyle('more-ruler-slide', CYCLE_S, ORIGIN) : undefined}
      >
        <img
          src={`/images/toolbar/reading-ruler${colored ? '' : '-muted'}.svg`}
          alt=''
          className='h-8 w-auto object-contain'
        />
      </span>
    </span>
  );
};

export default ReadingRulerArt;
