import clsx from 'clsx';
import { useRef, useState } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import type { InkPoint } from '@/services/mindmap/ink/ink';
import { strokePath } from '@/services/mindmap/ink/inkPath';

export interface DrawnStroke {
  points: InkPoint[];
  size: number;
  color: string;
}

export interface DrawingPadProps {
  onDone(svg: string, size: { width: number; height: number }): void;
  onCancel(): void;
}

const PALETTE = ['#15151A', '#F7F3EA', '#C8F135', '#5B3DF5'];
const WIDTHS = [2, 4, 8];
const BOX = { width: 320, height: 320 };

export const strokesToSvg = (
  strokes: DrawnStroke[],
  box: { width: number; height: number },
): string => {
  const paths = strokes
    .map((s) => `<path d="${strokePath(s.points, s.size, false)}" fill="${s.color}"/>`)
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${box.width} ${box.height}" width="${box.width}" height="${box.height}">${paths}</svg>`;
};

const pointOf = (e: React.PointerEvent<SVGSVGElement>): InkPoint => {
  const rect = e.currentTarget.getBoundingClientRect();
  const sx = rect.width ? BOX.width / rect.width : 1;
  const sy = rect.height ? BOX.height / rect.height : 1;
  return [(e.clientX - rect.left) * sx, (e.clientY - rect.top) * sy, e.pressure || 0.5];
};

function DrawingPad({ onDone, onCancel }: DrawingPadProps) {
  const _ = useTranslation();
  const [strokes, setStrokes] = useState<DrawnStroke[]>([]);
  const [current, setCurrent] = useState<DrawnStroke | null>(null);
  const [color, setColor] = useState(PALETTE[3]!);
  const [size, setSize] = useState(WIDTHS[1]!);
  const drawing = useRef(false);

  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    if (current) setStrokes((all) => [...all, current]);
    setCurrent(null);
  };

  return (
    <div className='flex flex-col gap-2'>
      <svg
        role='img'
        aria-label={_('Drawing')}
        viewBox={`0 0 ${BOX.width} ${BOX.height}`}
        className='bg-base-200 mx-auto aspect-square w-full max-w-xs touch-none rounded-lg'
        onPointerDown={(e) => {
          drawing.current = true;
          e.currentTarget.setPointerCapture?.(e.pointerId);
          setCurrent({ points: [pointOf(e)], size, color });
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const point = pointOf(e);
          setCurrent((s) => (s ? { ...s, points: [...s.points, point] } : s));
        }}
        onPointerUp={end}
        onPointerCancel={end}
      >
        {[...strokes, ...(current ? [current] : [])].map((s, i) => (
          <path key={i} d={strokePath(s.points, s.size, false)} fill={s.color} />
        ))}
      </svg>
      <div className='flex items-center gap-2'>
        <div role='group' aria-label={_('Colour')} className='flex gap-1'>
          {PALETTE.map((c) => (
            <button
              key={c}
              type='button'
              aria-label={c}
              aria-pressed={color === c}
              className={clsx(
                'border-base-content/30 h-6 w-6 rounded-full border',
                color === c && 'ring-2 ring-[#5B3DF5] ring-offset-1',
              )}
              style={{ background: c }}
              onClick={() => setColor(c)}
            />
          ))}
        </div>
        <div role='group' aria-label={_('Width')} className='join'>
          {WIDTHS.map((w) => (
            <button
              key={w}
              type='button'
              aria-pressed={size === w}
              className={clsx('btn btn-xs join-item', size === w && 'btn-active')}
              onClick={() => setSize(w)}
            >
              {w}
            </button>
          ))}
        </div>
        <button
          type='button'
          className='btn btn-ghost btn-xs ml-auto'
          disabled={strokes.length === 0}
          onClick={() => setStrokes((all) => all.slice(0, -1))}
        >
          {_('Undo')}
        </button>
      </div>
      <div className='flex justify-end gap-2'>
        <button type='button' className='btn btn-ghost btn-sm' onClick={onCancel}>
          {_('Cancel')}
        </button>
        <button
          type='button'
          className='btn btn-primary btn-sm'
          disabled={strokes.length === 0}
          onClick={() => onDone(strokesToSvg(strokes, BOX), BOX)}
        >
          {_('Done')}
        </button>
      </div>
    </div>
  );
}

export default DrawingPad;
