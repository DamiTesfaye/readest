import { GRID_SIZE, snapToGrid } from '@/services/mindmap/snap/snap';
import {
  boxCenter,
  centeredOn,
  createRecordForTool,
  editableField,
  sectionAt,
} from '@/services/mindmap/tools/records';
import {
  type CanvasPointer,
  type PlaceToolId,
  type Tool,
  type ToolContext,
  boxBetween,
  draggedPastThreshold,
  patchLive,
} from '@/services/mindmap/tools/types';

const SIZABLE: ReadonlySet<PlaceToolId> = new Set(['section', 'rect', 'ellipse']);

export const createPlaceTool = (ctx: ToolContext, tool: PlaceToolId): Tool => {
  let origin: CanvasPointer | null = null;
  let mark: string | null = null;
  let sizing = false;

  const reset = (): void => {
    origin = null;
    mark = null;
    sizing = false;
    patchLive(ctx, { draft: null });
  };

  const create = (pointer: CanvasPointer): void => {
    const draft = createRecordForTool(tool, { id: ctx.createId(), index: ctx.topIndex() });
    const box = boxBetween(origin!.page, pointer.page);
    const sized =
      sizing && box.w >= GRID_SIZE && box.h >= GRID_SIZE
        ? {
            ...draft,
            x: snapToGrid(box.x),
            y: snapToGrid(box.y),
            w: Math.max(GRID_SIZE, snapToGrid(box.w)),
            h: Math.max(GRID_SIZE, snapToGrid(box.h)),
          }
        : centeredOn(draft, origin!.page);
    const parentId = tool === 'section' ? null : sectionAt(ctx.store, boxCenter(sized));
    ctx.store.put([{ ...sized, parentId }]);
    ctx.selection.set([sized.id]);
    if (editableField(sized)) ctx.editing.set(sized.id);
  };

  return {
    state: () => (sizing ? 'sizing' : origin ? 'pointing' : 'idle'),
    down: (pointer) => {
      if (ctx.readOnly) return;
      origin = pointer;
      mark = ctx.history.mark();
    },
    move: (pointer) => {
      if (!origin || !SIZABLE.has(tool)) return;
      if (!sizing && draggedPastThreshold(origin, pointer)) sizing = true;
      if (sizing) patchLive(ctx, { draft: { tool, box: boxBetween(origin.page, pointer.page) } });
    },
    up: (pointer) => {
      if (!origin || !mark) return;
      const current = mark;
      create(pointer);
      ctx.history.squashToMark(current);
      reset();
      ctx.setTool('select');
    },
    cancel: () => {
      if (mark) ctx.history.bailToMark(mark);
      reset();
    },
  };
};
