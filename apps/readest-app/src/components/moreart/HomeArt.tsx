'use client';

import React from 'react';
import type { HomeRowIcon } from '@/utils/homeRowVariant';
import { MoreArtProps, playStyle, useMoreArtMotion } from './useMoreArtMotion';

interface HomeArtProps extends MoreArtProps {
  icon: HomeRowIcon;
}

const CYCLE_S = 1.8;
const LIT = '#FFE23A';
const MUTED_LIT = '#FCFCFC';
const LAMP_HALO = '#F3702E';

const KEYFRAMES = `
@keyframes more-home-lights {
  0%, 100% { opacity: 0; }
  16% { opacity: 0.9; }
  22% { opacity: 0.3; }
  30%, 76% { opacity: 0.9; }
}
`;

const GO_HOME_WINDOW_PANES = [
  'M15.8664 7.85156C15.7129 9.00944 15.3908 10.2698 14.9137 11.3358H14.2119V7.85156H15.8664Z',
  'M17.7461 7.6875C17.8997 8.84537 18.2217 10.2326 18.6988 11.2987H19.1491V7.6875H17.7461Z',
];

const lights = (icon: HomeRowIcon, colored: boolean) => {
  const lit = colored ? LIT : MUTED_LIT;
  if (icon === 'space-base') {
    return (
      <>
        <circle cx='26.244' cy='45.036' r='1.123' fill={lit} />
        <circle
          cx='4.581'
          cy='46.174'
          r='1.4'
          fill={colored ? LAMP_HALO : MUTED_LIT}
          opacity={0.5}
        />
        <circle cx='4.581' cy='46.174' r='0.698' fill={lit} />
      </>
    );
  }
  return (
    <>
      <circle cx='13.531' cy='4.96' r='1.046' fill={lit} />
      <rect x='9.468' y='9.992' width='1.571' height='1.396' fill={lit} />
      {GO_HOME_WINDOW_PANES.map((d) => (
        <path key={d} d={d} fill={lit} />
      ))}
      <circle cx='5.447' cy='10.181' r='0.8' fill={lit} opacity={0.6} />
    </>
  );
};

const VIEW_BOXES: Record<HomeRowIcon, string> = {
  'go-home': '0 0 27 14',
  'space-base': '0 0 56 62',
};

const HomeArt: React.FC<HomeArtProps> = ({ icon, colored, hovered, openDelayMs }) => {
  const { animating, onAnimationIteration } = useMoreArtMotion(hovered, openDelayMs);

  return (
    <span
      data-testid={`more-art-${icon}`}
      data-animating={animating}
      className='relative flex'
      onAnimationIteration={onAnimationIteration}
    >
      <style>{KEYFRAMES}</style>
      <img
        src={`/images/toolbar/${icon}${colored ? '' : '-muted'}.svg`}
        alt=''
        className='h-6 w-auto object-contain'
      />
      <svg
        viewBox={VIEW_BOXES[icon]}
        aria-hidden='true'
        className='pointer-events-none absolute inset-0 h-full w-full'
      >
        <g
          data-part='lights'
          opacity='0'
          style={animating ? playStyle('more-home-lights', CYCLE_S, '50% 50%') : undefined}
        >
          {lights(icon, colored)}
        </g>
      </svg>
    </span>
  );
};

export default HomeArt;
