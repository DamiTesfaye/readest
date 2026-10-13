import type { Point } from '@/services/mindmap/records/geometry';
import type { Tool, ToolContext } from '@/services/mindmap/tools/types';

export const createHandTool = (ctx: ToolContext): Tool => {
  let last: Point | null = null;
  return {
    state: () => (last ? 'panning' : 'idle'),
    down: (pointer) => {
      last = pointer.screen;
    },
    move: (pointer) => {
      if (!last) return;
      ctx.camera.panBy(pointer.screen.x - last.x, pointer.screen.y - last.y);
      last = pointer.screen;
    },
    up: () => {
      last = null;
    },
    cancel: () => {
      last = null;
    },
  };
};
