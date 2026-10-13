import React, { useId } from 'react';
import type { Camera } from '@/services/mindmap/camera/camera';
import { useAtomValue } from './useCanvasStores';

export const GRID_LEVELS = [64, 16, 4] as const;
const EINK_LEVELS = [64] as const;
const FADE_START_PX = 8;
const FADE_RANGE_PX = 16;

export const gridLevelOpacity = (step: number, zoom: number): number =>
  Math.min(1, Math.max(0, (step * zoom - FADE_START_PX) / FADE_RANGE_PX));

export const gridDotRadius = (zoom: number): number => Math.min(1.5, Math.max(0.6, zoom));

interface GridLayerProps {
  camera: Camera;
  eink: boolean;
}

const GridLayer: React.FC<GridLayerProps> = ({ camera, eink }) => {
  const { x, y, z } = useAtomValue(camera);
  const id = useId();
  const levels = (eink ? EINK_LEVELS : GRID_LEVELS).filter(
    (step) => eink || gridLevelOpacity(step, z) > 0,
  );
  return (
    <svg
      data-testid='mm-grid'
      className='pointer-events-none absolute inset-0 h-full w-full'
      aria-hidden='true'
    >
      <defs>
        {levels.map((step) => {
          const size = step * z;
          return (
            <pattern
              key={step}
              id={`${id}-${step}`}
              data-testid={`mm-grid-${step}`}
              width={size}
              height={size}
              x={x - size / 2}
              y={y - size / 2}
              patternUnits='userSpaceOnUse'
            >
              <circle
                cx={size / 2}
                cy={size / 2}
                r={gridDotRadius(z)}
                fill='var(--mm-grid)'
                opacity={eink ? 1 : gridLevelOpacity(step, z)}
              />
            </pattern>
          );
        })}
      </defs>
      {levels.map((step) => (
        <rect key={step} width='100%' height='100%' fill={`url(#${id}-${step})`} />
      ))}
    </svg>
  );
};

export default GridLayer;
