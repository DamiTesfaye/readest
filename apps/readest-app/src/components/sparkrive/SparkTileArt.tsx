'use client';

import clsx from 'clsx';
import React, { useRef, useState } from 'react';
import { isSceneMotionAllowed } from '@/components/themescene/sceneAnimations';
import { canHover, getSparkAnimation, SparkAnimation } from './sparkAnimations';
import { useSparkRive } from './useSparkRive';

interface SparkTileArtProps {
  icon: string;
  imgClassName: string;
  hovered: boolean;
  openDelayMs: number;
}

interface SparkCanvasArtProps extends SparkTileArtProps {
  animation: SparkAnimation;
}

const SparkCanvasArt: React.FC<SparkCanvasArtProps> = ({
  icon,
  imgClassName,
  hovered,
  openDelayMs,
  animation,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoverDevice] = useState(canHover);
  const isLoaded = useSparkRive(canvasRef, { animation, hoverDevice, hovered, openDelayMs });
  const nativePointer = hoverDevice && animation.nativeHover;

  return (
    <span className='relative inline-flex'>
      <img
        src={`/images/spark/${icon}.svg`}
        alt=''
        className={clsx(
          imgClassName,
          'w-auto object-contain transition-opacity duration-200',
          isLoaded && 'opacity-0',
        )}
      />
      <span
        style={animation.inset ? { inset: animation.inset } : undefined}
        className={clsx(
          'absolute inset-0 transition-opacity duration-200',
          !nativePointer && 'pointer-events-none',
          isLoaded ? 'opacity-100' : 'opacity-0',
        )}
      >
        <canvas
          ref={canvasRef}
          aria-hidden='true'
          data-testid={`spark-canvas-${icon}`}
          className='block h-full w-full'
        />
      </span>
    </span>
  );
};

const SparkTileArt: React.FC<SparkTileArtProps> = (props) => {
  const [motionAllowed] = useState(isSceneMotionAllowed);
  const animation = getSparkAnimation(props.icon);
  if (animation && motionAllowed) return <SparkCanvasArt {...props} animation={animation} />;
  return (
    <img
      src={`/images/spark/${props.icon}.svg`}
      alt=''
      className={clsx(props.imgClassName, 'w-auto object-contain')}
    />
  );
};

export default SparkTileArt;
