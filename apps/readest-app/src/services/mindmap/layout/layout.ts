import type { GenNode } from '@/services/mindmap/generate/types';
import { tidyTree } from '@/services/mindmap/layout/tidyTree';
import type { BoundsRect, Point } from '@/services/mindmap/records/geometry';
import type { PositionedRecord } from '@/services/mindmap/schema/types';
import { GRID_SIZE, snapToGrid } from '@/services/mindmap/snap/snap';
import { type SpatialIndex, isLive, isPositioned } from '@/services/mindmap/spatial/spatialIndex';
import type { MapStore } from '@/services/mindmap/store/mapStore';
import { CHILD_GAP_X, SIBLING_GAP_Y, occupied, parentOf } from '@/services/mindmap/tools/placement';

export const NEW_NODE_SIZE = { w: 160, h: 64 } as const;
export const COLUMN_STEP = NEW_NODE_SIZE.w + CHILD_GAP_X;
export const ROW_STEP = NEW_NODE_SIZE.h + SIBLING_GAP_Y;
export const BLOCK_GAP = 64;
export const FAN_RING_STEP = 224;
const FAN_RINGS = 4;
const FAN_ANGLES = [0, -30, 30, -60, 60, -90, 90, -120, 120, -150, 150, 180];

type Size = { w: number; h: number };

const snapUp = (value: number): number => Math.ceil(value / GRID_SIZE) * GRID_SIZE;

const intersects = (a: BoundsRect, b: BoundsRect): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

const positioned = (store: MapStore, ignore?: string): PositionedRecord[] =>
  store
    .all()
    .filter((record): record is PositionedRecord => isPositioned(record) && record.id !== ignore);

const below = (boxes: readonly BoundsRect[]): Point =>
  boxes.length === 0
    ? { x: 0, y: 0 }
    : {
        x: snapToGrid(Math.min(...boxes.map((box) => box.x))),
        y: snapUp(Math.max(...boxes.map((box) => box.y + box.h)) + BLOCK_GAP),
      };

const centerOf = (box: BoundsRect): Point => ({ x: box.x + box.w / 2, y: box.y + box.h / 2 });

const isFree = (
  store: MapStore,
  spatial: SpatialIndex,
  box: BoundsRect,
  placed: readonly BoundsRect[],
  ignore?: string,
): boolean =>
  !placed.some((other) => intersects(other, box)) && !occupied(store, spatial, box, ignore);

const fanAround = (center: Point, size: Size, fits: (box: BoundsRect) => boolean): Point | null => {
  for (let ring = 1; ring <= FAN_RINGS; ring += 1) {
    for (const degrees of FAN_ANGLES) {
      const radians = (degrees * Math.PI) / 180;
      const box = {
        ...size,
        x: snapToGrid(center.x + Math.cos(radians) * ring * FAN_RING_STEP - size.w / 2),
        y: snapToGrid(center.y + Math.sin(radians) * ring * FAN_RING_STEP - size.h / 2),
      };
      if (fits(box)) return { x: box.x, y: box.y };
    }
  }
  return null;
};

export const layoutNewNodes = (
  store: MapStore,
  spatial: SpatialIndex,
  nodes: readonly GenNode[],
): Map<string, Point> => {
  const records = positioned(store);
  const placed = new Map<string, Point>();
  const boxes: BoundsRect[] = [];
  const place = (genKey: string, point: Point): void => {
    placed.set(genKey, point);
    boxes.push({ ...point, ...NEW_NODE_SIZE });
  };
  const origin = below(records);
  const trees = nodes.filter((node) => node.kind !== 'quote');
  const slots = tidyTree(trees.map((node) => ({ key: node.genKey, parentKey: node.parentGenKey })));
  for (const [genKey, slot] of slots) {
    place(genKey, {
      x: snapToGrid(origin.x + slot.depth * COLUMN_STEP),
      y: snapToGrid(origin.y + slot.row * ROW_STEP),
    });
  }
  const byGenKey = new Map(
    records
      .filter(isLive)
      .flatMap((record) => (record.genKey === null ? [] : [[record.genKey, record] as const])),
  );
  const fits = (box: BoundsRect): boolean => isFree(store, spatial, box, boxes);
  for (const quote of nodes.filter((node) => node.kind === 'quote')) {
    const key = quote.parentGenKey;
    const planned = key === null ? undefined : placed.get(key);
    const parent = planned ? { ...planned, ...NEW_NODE_SIZE } : key && byGenKey.get(key);
    const point = parent ? fanAround(centerOf(parent), NEW_NODE_SIZE, fits) : null;
    place(quote.genKey, point ?? below([...records, ...boxes]));
  }
  return placed;
};

export const resetPlacement = (
  store: MapStore,
  spatial: SpatialIndex,
  id: string,
): Point | null => {
  const record = store.get(id);
  if (!isLive(record) || !isPositioned(record)) return null;
  if (record.type === 'node' && record.kind === 'quote') {
    const parentId = parentOf(store, id);
    const parent = parentId ? store.get(parentId) : undefined;
    const fits = (box: BoundsRect): boolean => isFree(store, spatial, box, [], id);
    const point = parent && isPositioned(parent) ? fanAround(centerOf(parent), record, fits) : null;
    if (point) return point;
  }
  return below(positioned(store, id));
};
