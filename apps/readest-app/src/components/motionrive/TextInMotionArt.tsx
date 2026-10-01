'use client';

import clsx from 'clsx';
import React, { useRef, useState } from 'react';
import { isSceneMotionAllowed } from '@/components/themescene/sceneAnimations';
import { getToolbarIconSrc, isColoredIconTheme } from '@/utils/toolbarIcons';
import { useMotionRive } from './useMotionRive';

const ART_CLASS = 'h-8 w-auto object-contain';

interface TextInMotionArtProps {
  themeName: string;
  isDarkMode: boolean;
  hovered: boolean;
}

const MotionCanvas: React.FC<TextInMotionArtProps & { src: string }> = ({
  src,
  themeName,
  isDarkMode,
  hovered,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isLoaded = useMotionRive(canvasRef, {
    colored: isColoredIconTheme(themeName, isDarkMode),
    hovered,
  });

  return (
    <span className='relative inline-flex'>
      <img src={src} alt='' className={clsx(ART_CLASS, isLoaded && 'invisible')} />
      <canvas
        ref={canvasRef}
        aria-hidden='true'
        data-testid='text-in-motion-canvas'
        className={clsx(
          'pointer-events-none absolute inset-0 h-full w-full',
          isLoaded ? 'opacity-100' : 'opacity-0',
        )}
      />
    </span>
  );
};

const TextInMotionArt: React.FC<TextInMotionArtProps> = (props) => {
  const [motionAllowed] = useState(isSceneMotionAllowed);
  const src = getToolbarIconSrc('moving-pictures', props.themeName, props.isDarkMode);
  if (!motionAllowed) return <img src={src} alt='' className={ART_CLASS} />;
  return <MotionCanvas {...props} src={src} />;
};

export default TextInMotionArt;
