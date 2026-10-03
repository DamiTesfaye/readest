import type { BoundsRect } from '@/services/mindmap/records/geometry';
import type { LinkRecord, PositionedRecord } from '@/services/mindmap/schema/types';
import { GRID_SIZE, snapToGrid } from '@/services/mindmap/snap/snap';
import { type SpatialIndex, isLive, isPositioned } from '@/services/mindmap/spatial/spatialIndex';
import type { MapStore } from '@/services/mindmap/store/mapStore';

export const CHILD_GAP_X = 96;
export const SIBLING_GAP_Y = 32;
const MAX_TRIES = 200;

export const liveLinks = (store: MapStore): LinkRecord[] =>
  store.all().filter((record): record is LinkRecord => isLive(record) && record.type === 'link');

export const parentOf = (store: MapStore, id: string): string | null =>
  liveLinks(store).find((link) => link.toId === id && isLive(store.get(link.fromId)))?.fromId ??
  null;

export const childrenOf = (store: MapStore, id: string): PositionedRecord[] =>
  liveLinks(store)
    .filter((link) => link.fromId === id)
    .map((link) => store.get(link.toId))
    .filter((record): record is PositionedRecord => isLive(record) && isPositioned(record));

export const occupied = (
  store: MapStore,
  spatial: SpatialIndex,
  box: BoundsRect,
  ignore?: string,
): boolean =>
  spatial.search({ x: box.x + 1, y: box.y + 1, w: box.w - 2, h: box.h - 2 }, true).some((id) => {
    const record = store.get(id);
    return id !== ignore && isLive(record) && record.type !== 'section';
  });

export const freeSpotBelow = (
  store: MapStore,
  spatial: SpatialIndex,
  box: BoundsRect,
): BoundsRect => {
  let candidate = { ...box, x: snapToGrid(box.x), y: snapToGrid(box.y) };
  for (let i = 0; i < MAX_TRIES && occupied(store, spatial, candidate); i += 1) {
    candidate = { ...candidate, y: snapToGrid(candidate.y + candidate.h + SIBLING_GAP_Y) };
  }
  return candidate;
};

export const childBox = (
  store: MapStore,
  parent: PositionedRecord,
  size: BoundsRect,
): BoundsRect => {
  const siblings = childrenOf(store, parent.id);
  const x = parent.x + parent.w + CHILD_GAP_X;
  const y =
    siblings.length === 0
      ? parent.y + (parent.h - size.h) / 2
      : Math.max(...siblings.map((s) => s.y + s.h)) + SIBLING_GAP_Y;
  return { ...size, x, y: Math.round(y / GRID_SIZE) * GRID_SIZE };
};
