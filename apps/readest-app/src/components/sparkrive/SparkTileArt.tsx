'use client';

import clsx from 'clsx';
import React, { useRef, useState } from 'react';
import { isSceneMotionAllowed } from '@/components/themescene/sceneAnimations';
import { canHover, getSparkAnimation, SparkAnimation } from './sparkAnimations';
import { useSparkRive } from './useSparkRive';
import SparkTtsArt from './SparkTtsArt';
import SparkMindmapArt from './SparkMindmapArt';

interface SparkTileArtProps {
  icon: string;
  imgClassName: string;
  hovered: boolean;
  openDelayMs: number;
  colored: boolean;
}

const staticSrc = (icon: string, colored: boolean) =>
  `/images/spark/${icon}${colored ? '' : '-muted'}.svg`;

interface SparkCanvasArtProps extends SparkTileArtProps {
  animation: SparkAnimation;
}

const SparkCanvasArt: React.FC<SparkCanvasArtProps> = ({
  icon,
  imgClassName,
  hovered,
  openDelayMs,
  colored,
  animation,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoverDevice] = useState(canHover);
  const isLoaded = useSparkRive(canvasRef, {
    animation,
    hoverDevice,
    hovered,
    openDelayMs,
    colored,
  });
  const nativePointer = hoverDevice && animation.nativeHover;

  return (
    <span className='relative inline-flex'>
      <img
        src={staticSrc(icon, colored)}
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
          animation.mutedGrayscale && !colored && 'grayscale',
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
  if (props.icon === 'tts' && motionAllowed) return <SparkTtsArt {...props} />;
  if (props.icon === 'mindmap' && motionAllowed) return <SparkMindmapArt {...props} />;
  if (animation && motionAllowed) return <SparkCanvasArt {...props} animation={animation} />;
  return (
    <img
      src={staticSrc(props.icon, props.colored)}
      alt=''
      className={clsx(props.imgClassName, 'w-auto object-contain')}
    />
  );
};

export default SparkTileArt;
