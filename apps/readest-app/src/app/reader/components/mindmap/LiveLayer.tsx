import React from 'react';
import { strokePath } from '@/services/mindmap/ink/inkPath';
import type { CanvasController } from '@/services/mindmap/tools/controller';
import { PEN_SIZE } from '@/services/mindmap/tools/penTool';
import { useAtomValue } from './useCanvasStores';

const LiveLayer: React.FC<{ controller: CanvasController }> = ({ controller }) => {
  const live = useAtomValue(controller.live);
  const { x, y, z } = useAtomValue(controller.camera);
  const { ink, draft, link } = live;
  return (
    <svg
      data-testid='mm-live'
      className='pointer-events-none absolute inset-0 h-full w-full overflow-visible'
      aria-hidden='true'
    >
      <g transform={`translate(${x} ${y}) scale(${z})`}>
        {ink && (
          <path
            data-testid='mm-live-ink'
            d={strokePath(ink.points, PEN_SIZE, ink.pen)}
            fill='var(--mm-ink-stroke)'
          />
        )}
        {draft && draft.tool === 'ellipse' && (
          <ellipse
            data-testid='mm-live-draft'
            cx={draft.box.x + draft.box.w / 2}
            cy={draft.box.y + draft.box.h / 2}
            rx={draft.box.w / 2}
            ry={draft.box.h / 2}
            fill='none'
            stroke='var(--mm-select)'
            strokeDasharray='6 4'
            vectorEffect='non-scaling-stroke'
          />
        )}
        {draft && draft.tool !== 'ellipse' && (
          <rect
            data-testid='mm-live-draft'
            x={draft.box.x}
            y={draft.box.y}
            width={draft.box.w}
            height={draft.box.h}
            fill='none'
            stroke='var(--mm-select)'
            strokeDasharray='6 4'
            vectorEffect='non-scaling-stroke'
          />
        )}
        {link && (
          <line
            data-testid='mm-live-link'
            x1={link.from.x}
            y1={link.from.y}
            x2={link.to.x}
            y2={link.to.y}
            stroke='var(--mm-link)'
            strokeWidth={2}
            vectorEffect='non-scaling-stroke'
          />
        )}
      </g>
    </svg>
  );
};

export default LiveLayer;
