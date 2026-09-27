import type { BoundsRect } from '@/services/mindmap/records/geometry';
import type { PositionedRecord } from '@/services/mindmap/schema/types';
import { GRID_SIZE, snapBox, snapToGrid } from '@/services/mindmap/snap/snap';
import { isLive, isPositioned, recordBounds } from '@/services/mindmap/spatial/spatialIndex';
import type { FieldChange } from '@/services/mindmap/store/mapStore';
import {
  boxCenter,
  editableField,
  livePositioned,
  sectionAt,
  unionBounds,
} from '@/services/mindmap/tools/records';
import {
  type CanvasPointer,
  type Tool,
  type ToolContext,
  boxBetween,
  draggedPastThreshold,
  hitRecord,
  patchLive,
} from '@/services/mindmap/tools/types';

type SelectState = 'idle' | 'pointing' | 'translating' | 'resizing' | 'brushing';

const SNAP_SEARCH_MARGIN_PX = 400;

const movingSet = (ctx: ToolContext, ids: readonly string[]): PositionedRecord[] => {
  const selected = livePositioned(ctx.store, ids);
  const sections = new Set(selected.filter((r) => r.type === 'section').map((r) => r.id));
  const chosen = new Set(selected.map((r) => r.id));
  const children = ctx.store
    .all()
    .filter(
      (record): record is PositionedRecord =>
        isLive(record) &&
        isPositioned(record) &&
        record.parentId !== null &&
        sections.has(record.parentId) &&
        !chosen.has(record.id),
    );
  return [...selected, ...children];
};

const snapNeighbours = (ctx: ToolContext, group: BoundsRect, moving: Set<string>): BoundsRect[] => {
  const margin = SNAP_SEARCH_MARGIN_PX / ctx.camera.get().z;
  return livePositioned(
    ctx.store,
    ctx.spatial.search({
      x: group.x - margin,
      y: group.y - margin,
      w: group.w + margin * 2,
      h: group.h + margin * 2,
    }),
  )
    .filter((record) => !moving.has(record.id) && record.type !== 'ink')
    .map(recordBounds);
};

export const createSelectTool = (ctx: ToolContext): Tool => {
  let state: SelectState = 'idle';
  let mark: string | null = null;
  let origin: CanvasPointer | null = null;
  let pressed: string | null = null;
  let moving: PositionedRecord[] = [];
  let resizing: PositionedRecord | null = null;
  let baseSelection: readonly string[] = [];

  const reset = (): void => {
    state = 'idle';
    mark = null;
    origin = null;
    pressed = null;
    moving = [];
    resizing = null;
    patchLive(ctx, { brush: null, guides: [] });
  };

  const translate = (pointer: CanvasPointer): void => {
    const dx = pointer.page.x - origin!.page.x;
    const dy = pointer.page.y - origin!.page.y;
    const group = unionBounds(moving.map(recordBounds))!;
    const ids = new Set(moving.map((r) => r.id));
    const shifted = { ...group, x: group.x + dx, y: group.y + dy };
    const snapped = snapBox(
      shifted,
      snapNeighbours(ctx, shifted, ids),
      ctx.camera.get().z,
      !pointer.alt,
    );
    const ax = snapped.x - shifted.x;
    const ay = snapped.y - shifted.y;
    ctx.store.setFields(
      moving.flatMap((r): FieldChange[] => [
        { id: r.id, field: 'x', from: undefined, to: r.x + dx + ax },
        { id: r.id, field: 'y', from: undefined, to: r.y + dy + ay },
      ]),
    );
    patchLive(ctx, { guides: snapped.guides });
  };

  const resize = (pointer: CanvasPointer): void => {
    const start = resizing!;
    const right = start.x + start.w + pointer.page.x - origin!.page.x;
    const bottom = start.y + start.h + pointer.page.y - origin!.page.y;
    const snappedRight = pointer.alt ? right : snapToGrid(right);
    const snappedBottom = pointer.alt ? bottom : snapToGrid(bottom);
    ctx.store.update(start.id, {
      w: Math.max(GRID_SIZE, snappedRight - start.x),
      h: Math.max(GRID_SIZE, snappedBottom - start.y),
    });
  };

  const brush = (pointer: CanvasPointer): void => {
    const box = boxBetween(origin!.page, pointer.page);
    const inside = livePositioned(ctx.store, ctx.spatial.search(box)).map((r) => r.id);
    ctx.selection.set([...new Set([...baseSelection, ...inside])]);
    patchLive(ctx, { brush: box });
  };

  const reparent = (): void => {
    const excluded = new Set(moving.filter((r) => r.type === 'section').map((r) => r.id));
    const changes = livePositioned(
      ctx.store,
      moving.filter((r) => r.type !== 'section').map((r) => r.id),
    ).flatMap((record): FieldChange[] => {
      const parentId = sectionAt(ctx.store, boxCenter(record), excluded);
      return parentId === record.parentId
        ? []
        : [{ id: record.id, field: 'parentId', from: record.parentId, to: parentId }];
    });
    if (changes.length > 0) ctx.store.setFields(changes);
  };

  const pressRecord = (pointer: CanvasPointer, id: string): void => {
    const record = ctx.store.get(id)!;
    const selection = ctx.selection.get();
    if (pointer.clicks >= 2 && !ctx.readOnly && editableField(record)) {
      ctx.selection.set([id]);
      ctx.editing.set(id);
      return;
    }
    if (pointer.shift) {
      ctx.selection.set(
        selection.includes(id) ? selection.filter((s) => s !== id) : [...selection, id],
      );
    } else if (!selection.includes(id)) {
      ctx.selection.set([id]);
    }
    state = 'pointing';
    origin = pointer;
    pressed = id;
    mark = ctx.history.mark();
    moving = ctx.readOnly ? [] : movingSet(ctx, ctx.selection.get());
  };

  return {
    state: () => (ctx.editing.get() ? 'editing' : state),
    down: (pointer) => {
      ctx.editing.set(null);
      if (pointer.target.kind === 'resize' && !ctx.readOnly) {
        const record = ctx.store.get(pointer.target.id);
        if (!isLive(record) || !isPositioned(record)) return;
        state = 'resizing';
        origin = pointer;
        resizing = record;
        mark = ctx.history.mark();
        return;
      }
      const hit = hitRecord(ctx, pointer.page);
      if (hit) {
        pressRecord(pointer, hit);
        return;
      }
      state = 'brushing';
      origin = pointer;
      baseSelection = pointer.shift ? ctx.selection.get() : [];
      if (!pointer.shift) ctx.selection.set([]);
    },
    move: (pointer) => {
      if (state === 'pointing' && moving.length > 0 && draggedPastThreshold(origin!, pointer)) {
        state = 'translating';
      }
      if (state === 'translating') translate(pointer);
      else if (state === 'resizing') resize(pointer);
      else if (state === 'brushing') brush(pointer);
    },
    up: (pointer) => {
      if (state === 'translating') reparent();
      if (state === 'pointing' && !pointer.shift && pressed) ctx.selection.set([pressed]);
      if (mark) ctx.history.squashToMark(mark);
      reset();
    },
    cancel: () => {
      if (mark) ctx.history.bailToMark(mark);
      if (state === 'brushing') ctx.selection.set(baseSelection);
      reset();
    },
  };
};
