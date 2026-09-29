import { type Atom, createAtom } from '@/services/mindmap/atom';
import {
  type Camera,
  FIT_PADDING,
  type Viewport,
  animateCamera,
  createCamera,
} from '@/services/mindmap/camera/camera';
import { type History, createHistory } from '@/services/mindmap/history/history';
import { createLinkRecord, createNodeRecord } from '@/services/mindmap/records/defaults';
import type { Point } from '@/services/mindmap/records/geometry';
import type {
  MapCamera,
  NodeKind,
  PositionedRecord,
  PresetColor,
} from '@/services/mindmap/schema/types';
import { GRID_SIZE } from '@/services/mindmap/snap/snap';
import { type Direction, nearestInDirection } from '@/services/mindmap/spatial/nearestInDirection';
import {
  type RecordFilter,
  SHOW_ALL,
  type SpatialIndex,
  createSpatialIndex,
  isLive,
  isPositioned,
  isShown,
  recordBounds,
} from '@/services/mindmap/spatial/spatialIndex';
import { type FieldChange, type MapStore, touchedChange } from '@/services/mindmap/store/mapStore';
import { createConnectTool } from '@/services/mindmap/tools/connectTool';
import { createHandTool } from '@/services/mindmap/tools/handTool';
import { createPenTool } from '@/services/mindmap/tools/penTool';
import { createPlaceTool } from '@/services/mindmap/tools/placeTool';
import { childBox, freeSpotBelow, liveLinks, parentOf } from '@/services/mindmap/tools/placement';
import {
  boxCenter,
  bottomIndex,
  editableField,
  livePositioned,
  sectionAt,
  topIndex,
  unionBounds,
} from '@/services/mindmap/tools/records';
import { createSelectTool } from '@/services/mindmap/tools/selectTool';
import {
  type CanvasPointer,
  CONNECT_HANDLE_REACH_PX,
  IDLE_LIVE,
  type LiveState,
  type PointerKind,
  type Tool,
  type ToolContext,
  type ToolId,
  HIT_TOLERANCE_PX,
} from '@/services/mindmap/tools/types';
import { uniqueId } from '@/utils/misc';

export const ZOOM_STEP = 1.2;
export const DUPLICATE_OFFSET = 32;
const FOCUSABLE = new Set(['node', 'sticky', 'text']);
const POSITION_FIELDS: ReadonlySet<string> = new Set(['x', 'y']);
const VIEW_TOOLS: ReadonlySet<ToolId> = new Set(['select', 'hand']);

export interface ActivePointer {
  readonly id: number;
  readonly kind: PointerKind;
}

export interface CanvasControllerOptions {
  store: MapStore;
  camera: MapCamera;
  readOnly?: boolean;
  createId?: () => string;
}

export interface CanvasController {
  readonly store: MapStore;
  readonly history: History;
  readonly camera: Camera;
  readonly spatial: SpatialIndex;
  readonly readOnly: boolean;
  readonly tool: Atom<ToolId>;
  readonly selection: Atom<readonly string[]>;
  readonly live: Atom<LiveState>;
  readonly editing: Atom<string | null>;
  readonly hover: Atom<string | null>;
  readonly viewport: Atom<Viewport>;
  readonly visible: Atom<RecordFilter>;
  readonly gesture: Atom<boolean>;
  isShown(id: string): boolean;
  setTool(tool: ToolId): void;
  setSpaceHeld(held: boolean): void;
  gestureActive(): boolean;
  activePointer(): ActivePointer | null;
  toolState(): string;
  pointerDown(pointer: CanvasPointer): void;
  pointerMove(pointer: CanvasPointer, samples: readonly CanvasPointer[]): void;
  pointerUp(pointer: CanvasPointer): void;
  pointerCancel(): void;
  undo(): void;
  redo(): void;
  deleteSelection(): void;
  duplicateSelection(): void;
  bringToFront(): void;
  sendToBack(): void;
  addChild(animate?: boolean): string | null;
  addSibling(animate?: boolean): string | null;
  selectParent(animate?: boolean): string | null;
  focusDirection(direction: Direction, animate?: boolean): string | null;
  ensureVisible(id: string, animate?: boolean): void;
  nudge(dx: number, dy: number): void;
  resetPosition(id: string, position: Point): void;
  setColor(color: PresetColor): void;
  setKind(kind: NodeKind): void;
  commitEdit(id: string, text: string): void;
  zoomBy(factor: number): void;
  fitView(animate: boolean): void;
  dispose(): void;
}

export const createCanvasController = (options: CanvasControllerOptions): CanvasController => {
  const { store } = options;
  const readOnly = options.readOnly ?? false;
  const history = createHistory(store);
  const camera = createCamera(options.camera);
  const visible = createAtom<RecordFilter>(SHOW_ALL);
  const spatial = createSpatialIndex(store, visible.get);
  const tool = createAtom<ToolId>('select');
  const selection = createAtom<readonly string[]>([]);
  const live = createAtom<LiveState>(IDLE_LIVE);
  const editing = createAtom<string | null>(null);
  const hover = createAtom<string | null>(null);
  const viewport = createAtom<Viewport>({ width: 0, height: 0 });
  const gestureAtom = createAtom(false);
  let active: { pointer: ActivePointer; tool: Tool } | null = null;
  const setActive = (next: { pointer: ActivePointer; tool: Tool } | null): void => {
    active = next;
    gestureAtom.set(next !== null);
  };
  let penSeen = false;
  let spaceHeld = false;

  const setTool = (next: ToolId): void => {
    if (readOnly && !VIEW_TOOLS.has(next)) return;
    if (active) pointerCancel();
    tool.set(next);
  };

  const ctx: ToolContext = {
    store,
    history,
    camera,
    spatial,
    selection,
    live,
    editing,
    readOnly,
    createId: options.createId ?? uniqueId,
    topIndex: () => topIndex(store),
    setTool,
  };

  const tools: Record<ToolId, Tool> = {
    select: createSelectTool(ctx),
    hand: createHandTool(ctx),
    connect: createConnectTool(ctx),
    pen: createPenTool(ctx),
    node: createPlaceTool(ctx, 'node'),
    sticky: createPlaceTool(ctx, 'sticky'),
    text: createPlaceTool(ctx, 'text'),
    section: createPlaceTool(ctx, 'section'),
    rect: createPlaceTool(ctx, 'rect'),
    ellipse: createPlaceTool(ctx, 'ellipse'),
  };

  const toolFor = (pointer: CanvasPointer): Tool => {
    if (pointer.target.kind === 'connect') return tools.connect;
    if (spaceHeld || pointer.button === 1) return tools.hand;
    if (pointer.kind === 'touch' && penSeen && tool.get() === 'pen') return tools.hand;
    return tools[tool.get()];
  };

  function pointerCancel(): void {
    if (!active) return;
    const current = active.tool;
    setActive(null);
    current.cancel();
  }

  const withinHandleReach = (id: string, pointer: CanvasPointer): boolean => {
    const record = store.get(id);
    if (!isLive(record) || !isPositioned(record)) return false;
    const reach = CONNECT_HANDLE_REACH_PX / camera.get().z;
    const box = recordBounds(record);
    const { x, y } = pointer.page;
    return (
      x >= box.x - reach &&
      x <= box.x + box.w + reach &&
      y >= box.y - reach &&
      y <= box.y + box.h + reach
    );
  };

  const hoverAt = (pointer: CanvasPointer): string | null => {
    if (pointer.target.kind === 'connect') return pointer.target.id;
    const hit = spatial.hitTest(pointer.page, HIT_TOLERANCE_PX / camera.get().z);
    if (hit) return hit;
    const current = hover.get();
    return current && withinHandleReach(current, pointer) ? current : null;
  };

  const gesture = (run: () => void): void => {
    const mark = history.mark();
    run();
    history.squashToMark(mark);
  };

  const shown = (id: string | null): id is string =>
    id !== null && isShown(store.get(id), visible.get(), store.get);

  const pruneSelection = (): void => {
    const kept = selection.get().filter(shown);
    if (kept.length !== selection.get().length) selection.set(kept);
  };

  const pruneHidden = (): void => {
    pruneSelection();
    if (!shown(hover.get())) hover.set(null);
    if (!shown(editing.get())) editing.set(null);
  };

  const unsubscribeVisible = visible.subscribe(pruneHidden);
  let measured = viewport.get();
  const unsubscribeViewport = viewport.subscribe(() => {
    const next = viewport.get();
    if (measured.width > 0 && measured.height > 0) {
      camera.panBy((next.width - measured.width) / 2, (next.height - measured.height) / 2);
    }
    measured = next;
  });
  const unsubscribeStore = store.listen((_diff, source) => {
    if (source !== 'local') pruneHidden();
  });

  const selectedPositioned = (): PositionedRecord[] => livePositioned(store, selection.get());

  const singleSelected = (): PositionedRecord | null => {
    const [first, ...rest] = selectedPositioned();
    return first && rest.length === 0 ? first : null;
  };

  const ensureVisible = (id: string, animate: boolean): void => {
    const record = store.get(id);
    if (!isLive(record) || !isPositioned(record)) return;
    const view = viewport.get();
    if (view.width <= 0 || view.height <= 0) return;
    const bounds = recordBounds(record);
    const visible = camera.viewportBounds(view);
    const z = camera.get().z;
    const pad = FIT_PADDING / z;
    const left = Math.min(0, bounds.x - pad - visible.x);
    const right = Math.max(0, bounds.x + bounds.w + pad - (visible.x + visible.w));
    const top = Math.min(0, bounds.y - pad - visible.y);
    const bottom = Math.max(0, bounds.y + bounds.h + pad - (visible.y + visible.h));
    const dx = left + right;
    const dy = top + bottom;
    if (dx === 0 && dy === 0) return;
    const current = camera.get();
    animateCamera(camera, { x: current.x - dx * z, y: current.y - dy * z, z: current.z }, animate);
  };

  const addNodeAt = (
    box: { x: number; y: number },
    parentId: string | null,
    animate: boolean,
  ): string => {
    const node = createNodeRecord({
      id: ctx.createId(),
      index: ctx.topIndex(),
      x: box.x,
      y: box.y,
    });
    const spot = freeSpotBelow(store, spatial, { x: node.x, y: node.y, w: node.w, h: node.h });
    gesture(() => {
      store.put([{ ...node, x: spot.x, y: spot.y }]);
      if (parentId) {
        store.put([
          createLinkRecord({
            id: ctx.createId(),
            index: ctx.topIndex(),
            fromId: parentId,
            toId: node.id,
          }),
        ]);
      }
    });
    selection.set([node.id]);
    ensureVisible(node.id, animate);
    editing.set(node.id);
    return node.id;
  };

  const setSelectedFields = (
    field: string,
    value: unknown,
    applies: (r: PositionedRecord) => boolean,
  ): void => {
    const changes = selectedPositioned()
      .filter(applies)
      .map((r): FieldChange => ({ id: r.id, field, from: undefined, to: value }));
    if (!readOnly && changes.length > 0) gesture(() => store.setFields(changes));
  };

  return {
    store,
    history,
    camera,
    spatial,
    readOnly,
    tool,
    selection,
    live,
    editing,
    hover,
    viewport,
    visible,
    gesture: gestureAtom,
    isShown: shown,
    setTool,
    setSpaceHeld: (held) => {
      spaceHeld = held;
    },
    gestureActive: () => active !== null,
    activePointer: () => active?.pointer ?? null,
    toolState: () => (active ? active.tool.state() : tools[tool.get()].state()),
    pointerDown: (pointer) => {
      if (pointer.kind === 'pen') penSeen = true;
      if (active?.pointer.kind === 'touch' && pointer.kind === 'pen') pointerCancel();
      if (active) return;
      hover.set(null);
      const current = toolFor(pointer);
      setActive({ pointer: { id: pointer.id, kind: pointer.kind }, tool: current });
      current.down(pointer);
    },
    pointerMove: (pointer, samples) => {
      if (!active) {
        if (pointer.kind === 'mouse') hover.set(hoverAt(pointer));
        return;
      }
      if (pointer.id === active.pointer.id) active.tool.move(pointer, samples);
    },
    pointerUp: (pointer) => {
      if (!active || pointer.id !== active.pointer.id) return;
      const current = active.tool;
      setActive(null);
      current.up(pointer);
    },
    pointerCancel,
    undo: () => {
      if (active || readOnly) return;
      history.undo();
      pruneSelection();
    },
    redo: () => {
      if (active || readOnly) return;
      history.redo();
      pruneSelection();
    },
    deleteSelection: () => {
      const ids = selection.get().filter((id) => isLive(store.get(id)));
      if (readOnly || ids.length === 0) return;
      const removed = new Set(ids);
      const attached = liveLinks(store)
        .filter((link) => removed.has(link.fromId) || removed.has(link.toId))
        .map((link) => link.id);
      gesture(() => store.remove([...new Set([...ids, ...attached])], 'user'));
      selection.set([]);
    },
    duplicateSelection: () => {
      const originals = selectedPositioned();
      if (readOnly || originals.length === 0) return;
      const copies = originals.map((record) => ({
        ...record,
        id: ctx.createId(),
        x: record.x + DUPLICATE_OFFSET,
        y: record.y + DUPLICATE_OFFSET,
        origin: 'user' as const,
        genKey: null,
        touched: [],
      }));
      gesture(() => {
        for (const copy of copies) store.put([{ ...copy, index: ctx.topIndex() }]);
      });
      selection.set(copies.map((copy) => copy.id));
    },
    bringToFront: () => {
      const records = selectedPositioned();
      if (readOnly || records.length === 0) return;
      gesture(() => {
        for (const record of records) store.update(record.id, { index: topIndex(store) });
      });
    },
    sendToBack: () => {
      const records = selectedPositioned();
      if (readOnly || records.length === 0) return;
      gesture(() => {
        for (const record of [...records].reverse())
          store.update(record.id, { index: bottomIndex(store) });
      });
    },
    addChild: (animate = false) => {
      const parent = singleSelected();
      if (readOnly || !parent || parent.type !== 'node') return null;
      const size = createNodeRecord({ id: '', index: 'a0' });
      const box = childBox(store, parent, { x: 0, y: 0, w: size.w, h: size.h });
      return addNodeAt(box, parent.id, animate);
    },
    addSibling: (animate = false) => {
      const current = singleSelected();
      if (readOnly || !current || current.type !== 'node') return null;
      const parent = parentOf(store, current.id);
      return addNodeAt(
        { x: current.x, y: current.y + current.h + GRID_SIZE * 2 },
        shown(parent) ? parent : null,
        animate,
      );
    },
    selectParent: (animate = false) => {
      const current = singleSelected();
      const found = current ? parentOf(store, current.id) : null;
      const parent = shown(found) ? found : null;
      if (parent) {
        selection.set([parent]);
        ensureVisible(parent, animate);
      }
      return parent;
    },
    focusDirection: (direction, animate = false) => {
      const candidates = store
        .all()
        .filter(
          (r): r is PositionedRecord =>
            isLive(r) && isPositioned(r) && FOCUSABLE.has(r.type) && shown(r.id),
        );
      const current = singleSelected();
      const view = viewport.get();
      const from = current
        ? boxCenter(recordBounds(current))
        : camera.screenToPage({ x: view.width / 2, y: view.height / 2 });
      const next = nearestInDirection(
        from,
        candidates
          .filter((r) => r.id !== current?.id)
          .map((r) => ({ id: r.id, center: boxCenter(recordBounds(r)) })),
        direction,
      );
      if (next) {
        selection.set([next]);
        ensureVisible(next, animate);
      }
      return next;
    },
    ensureVisible: (id, animate = false) => ensureVisible(id, animate),
    nudge: (dx, dy) => {
      const records = selectedPositioned();
      if (readOnly || records.length === 0) return;
      gesture(() =>
        store.setFields(
          records.flatMap((r): FieldChange[] => [
            { id: r.id, field: 'x', from: undefined, to: r.x + dx * GRID_SIZE },
            { id: r.id, field: 'y', from: undefined, to: r.y + dy * GRID_SIZE },
          ]),
        ),
      );
    },
    resetPosition: (id, position) => {
      const record = store.get(id);
      if (readOnly || !isLive(record) || !isPositioned(record)) return;
      const centre = { x: position.x + record.w / 2, y: position.y + record.h / 2 };
      const parentId = record.type === 'section' ? null : sectionAt(store, centre);
      const membership: FieldChange[] =
        parentId === record.parentId
          ? []
          : [{ id, field: 'parentId', from: undefined, to: parentId }];
      gesture(() =>
        store.setFields([
          { id, field: 'x', from: undefined, to: position.x },
          { id, field: 'y', from: undefined, to: position.y },
          ...membership,
          touchedChange(
            id,
            record.touched.filter((field) => !POSITION_FIELDS.has(field)),
          ),
        ]),
      );
    },
    setColor: (color) =>
      setSelectedFields('color', color, (r) => r.type !== 'text' && r.type !== 'sticky'),
    setKind: (kind) => setSelectedFields('kind', kind, (r) => r.type === 'node'),
    commitEdit: (id, text) => {
      const record = store.get(id);
      const field = record ? editableField(record) : null;
      editing.set(null);
      if (readOnly || !field || !isLive(record)) return;
      gesture(() => store.setFields([{ id, field, from: undefined, to: text }]));
    },
    zoomBy: (factor) => {
      const view = viewport.get();
      camera.zoomAt({ x: view.width / 2, y: view.height / 2 }, factor);
    },
    fitView: (animate) => {
      const bounds = unionBounds(
        store
          .all()
          .filter(isLive)
          .filter(isPositioned)
          .filter((record) => shown(record.id))
          .map(recordBounds),
      );
      animateCamera(camera, camera.fitTarget(bounds, viewport.get()), animate);
    },
    dispose: () => {
      pointerCancel();
      unsubscribeVisible();
      unsubscribeViewport();
      unsubscribeStore();
      history.dispose();
      spatial.dispose();
    },
  };
};
