import type { Point } from '@/services/mindmap/records/geometry';
import { createLinkRecord, createNodeRecord } from '@/services/mindmap/records/defaults';
import { anchorPoint } from '@/services/mindmap/records/linkGeometry';
import type { LinkAnchor } from '@/services/mindmap/schema/types';
import { isLive, isPositioned, recordBounds } from '@/services/mindmap/spatial/spatialIndex';
import { boxCenter, centeredOn, sectionAt } from '@/services/mindmap/tools/records';
import {
  type CanvasPointer,
  type Tool,
  type ToolContext,
  hitRecord,
  patchLive,
} from '@/services/mindmap/tools/types';

interface Source {
  id: string;
  side: LinkAnchor['side'] | null;
  at: Point;
}

const connectable = (ctx: ToolContext, id: string | null): boolean => {
  const record = id ? ctx.store.get(id) : undefined;
  return (
    isLive(record) && isPositioned(record) && record.type !== 'ink' && record.type !== 'section'
  );
};

export const createConnectTool = (ctx: ToolContext): Tool => {
  let source: Source | null = null;
  let mark: string | null = null;

  const reset = (): void => {
    source = null;
    mark = null;
    patchLive(ctx, { link: null });
  };

  const startFrom = (pointer: CanvasPointer): Source | null => {
    const id = pointer.target.kind === 'connect' ? pointer.target.id : hitRecord(ctx, pointer.page);
    if (!connectable(ctx, id)) return null;
    const record = ctx.store.get(id!);
    if (!isLive(record) || !isPositioned(record)) return null;
    const side = pointer.target.kind === 'connect' ? pointer.target.side : null;
    return { id: record.id, side, at: anchorPoint(recordBounds(record), side ?? 'center') };
  };

  const finish = (pointer: CanvasPointer): void => {
    const from = source!;
    const hit = hitRecord(ctx, pointer.page);
    const target = hit !== from.id && connectable(ctx, hit) ? hit : null;
    const fromAnchor = from.side ? { side: from.side, t: 0.5 } : null;
    if (target) {
      ctx.store.put([
        createLinkRecord({
          id: ctx.createId(),
          index: ctx.topIndex(),
          fromId: from.id,
          toId: target,
          fromAnchor,
        }),
      ]);
      ctx.selection.set([target]);
      return;
    }
    const draft = centeredOn(
      createNodeRecord({ id: ctx.createId(), index: ctx.topIndex() }),
      pointer.page,
    );
    const node = { ...draft, parentId: sectionAt(ctx.store, boxCenter(draft)) };
    ctx.store.put([node]);
    ctx.store.put([
      createLinkRecord({
        id: ctx.createId(),
        index: ctx.topIndex(),
        fromId: from.id,
        toId: node.id,
        fromAnchor,
      }),
    ]);
    ctx.selection.set([node.id]);
    ctx.editing.set(node.id);
  };

  return {
    state: () => (source ? 'connecting' : 'idle'),
    down: (pointer) => {
      if (ctx.readOnly) return;
      source = startFrom(pointer);
      if (!source) return;
      mark = ctx.history.mark();
      patchLive(ctx, { link: { from: source.at, to: pointer.page } });
    },
    move: (pointer) => {
      if (source) patchLive(ctx, { link: { from: source.at, to: pointer.page } });
    },
    up: (pointer) => {
      if (!source || !mark) return;
      const current = mark;
      finish(pointer);
      ctx.history.squashToMark(current);
      reset();
    },
    cancel: () => {
      if (mark) ctx.history.bailToMark(mark);
      reset();
    },
  };
};
