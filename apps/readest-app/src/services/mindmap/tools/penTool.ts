import { type InkPoint, encodeInkStroke } from '@/services/mindmap/ink/ink';
import { createInkRecord } from '@/services/mindmap/records/defaults';
import {
  type CanvasPointer,
  type Tool,
  type ToolContext,
  patchLive,
} from '@/services/mindmap/tools/types';

export const MOUSE_PRESSURE = 0.5;
export const PEN_SIZE = 4;

const inkPoint = (pointer: CanvasPointer): InkPoint => [
  pointer.page.x,
  pointer.page.y,
  pointer.kind === 'pen' ? pointer.pressure : MOUSE_PRESSURE,
];

export const createPenTool = (ctx: ToolContext): Tool => {
  let points: InkPoint[] | null = null;
  let pen = false;
  let mark: string | null = null;

  const reset = (): void => {
    points = null;
    mark = null;
    patchLive(ctx, { ink: null });
  };

  return {
    state: () => (points ? 'drawing' : 'idle'),
    down: (pointer) => {
      if (ctx.readOnly) return;
      points = [inkPoint(pointer)];
      pen = pointer.kind === 'pen';
      mark = ctx.history.mark();
      patchLive(ctx, { ink: { points, count: 1, pen } });
    },
    move: (pointer, samples) => {
      if (!points) return;
      for (const sample of samples.length > 0 ? samples : [pointer]) points.push(inkPoint(sample));
      patchLive(ctx, { ink: { points, count: points.length, pen } });
    },
    up: () => {
      if (!points || !mark) return;
      const current = mark;
      for (const segment of encodeInkStroke(points)) {
        ctx.store.put([
          createInkRecord({
            id: ctx.createId(),
            index: ctx.topIndex(),
            ...segment,
            size: PEN_SIZE,
            pen,
          }),
        ]);
      }
      ctx.history.squashToMark(current);
      reset();
    },
    cancel: () => {
      if (mark) ctx.history.bailToMark(mark);
      reset();
    },
  };
};
