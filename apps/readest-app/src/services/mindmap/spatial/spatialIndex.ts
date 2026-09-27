import RBush from 'rbush';
import { compareByIndex } from '@/services/mindmap/order/keyBetween';
import {
  type BoundsRect,
  type Point,
  PolylineGeometry,
  geometryForRecord,
} from '@/services/mindmap/records/geometry';
import { linkShape } from '@/services/mindmap/records/linkGeometry';
import type { LinkRecord, MapRecord, PositionedRecord } from '@/services/mindmap/schema/types';
import type { MapStore } from '@/services/mindmap/store/mapStore';

interface Entry {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  id: string;
}

export interface SpatialIndex {
  search(bounds: BoundsRect): string[];
  hitTest(point: Point, tolerance: number): string | null;
  dispose(): void;
}

export const isLive = (record: MapRecord | undefined): record is MapRecord =>
  record !== undefined && record.deleted === null;

export const isPositioned = (record: MapRecord): record is PositionedRecord =>
  record.type !== 'link';

export const recordBounds = (record: PositionedRecord): BoundsRect => {
  const pad = record.type === 'ink' ? record.size / 2 : 0;
  return { x: record.x - pad, y: record.y - pad, w: record.w + pad * 2, h: record.h + pad * 2 };
};

export const hitsRecord = (record: PositionedRecord, point: Point, tolerance: number): boolean => {
  if (record.type === 'shape' && record.geo === 'diamond') {
    const rx = record.w / 2 + tolerance;
    const ry = record.h / 2 + tolerance;
    const dx = Math.abs(point.x - (record.x + record.w / 2));
    const dy = Math.abs(point.y - (record.y + record.h / 2));
    return rx > 0 && ry > 0 && dx / rx + dy / ry <= 1;
  }
  const geometry = geometryForRecord(record)!;
  const reach = record.type === 'ink' ? record.size / 2 + tolerance : tolerance;
  return geometry.distanceToPoint(point) <= reach;
};

export const liveLinkEnds = (
  link: LinkRecord,
  lookup: (id: string) => MapRecord | undefined,
): [PositionedRecord, PositionedRecord] | null => {
  const from = lookup(link.fromId);
  const to = lookup(link.toId);
  if (!isLive(from) || !isLive(to) || !isPositioned(from) || !isPositioned(to)) return null;
  return [from, to];
};

export const hitsLink = (
  link: LinkRecord,
  lookup: (id: string) => MapRecord | undefined,
  point: Point,
  tolerance: number,
): boolean => {
  const ends = liveLinkEnds(link, lookup);
  if (!ends) return false;
  const shape = linkShape(recordBounds(ends[0]), recordBounds(ends[1]), link);
  return new PolylineGeometry(shape.points).distanceToPoint(point) <= tolerance;
};

const toEntry = (record: PositionedRecord): Entry => {
  const box = recordBounds(record);
  return { minX: box.x, minY: box.y, maxX: box.x + box.w, maxY: box.y + box.h, id: record.id };
};

const hitRank = (a: MapRecord, b: MapRecord): number => {
  const aSection = a.type === 'section' ? 0 : 1;
  const bSection = b.type === 'section' ? 0 : 1;
  return aSection !== bSection ? aSection - bSection : compareByIndex(a, b);
};

export const createSpatialIndex = (store: MapStore): SpatialIndex => {
  const tree = new RBush<Entry>();
  const entries = new Map<string, Entry>();

  const reindex = (id: string): void => {
    const previous = entries.get(id);
    if (previous) {
      tree.remove(previous);
      entries.delete(id);
    }
    const record = store.get(id);
    if (!isLive(record) || !isPositioned(record)) return;
    const entry = toEntry(record);
    tree.insert(entry);
    entries.set(id, entry);
  };

  const initial = store.all().filter(isLive).filter(isPositioned).map(toEntry);
  tree.load(initial);
  for (const entry of initial) entries.set(entry.id, entry);

  const unlisten = store.listen((diff) => {
    const ids = new Set([
      ...diff.added.map((record) => record.id),
      ...diff.changed.map((change) => change.id),
      ...diff.discarded,
    ]);
    for (const id of ids) reindex(id);
  });

  const search = (bounds: BoundsRect): string[] =>
    tree
      .search({
        minX: bounds.x,
        minY: bounds.y,
        maxX: bounds.x + bounds.w,
        maxY: bounds.y + bounds.h,
      })
      .map((entry) => entry.id);

  return {
    search,
    hitTest: (point, tolerance) => {
      const box = {
        x: point.x - tolerance,
        y: point.y - tolerance,
        w: tolerance * 2,
        h: tolerance * 2,
      };
      const hits = search(box)
        .map((id) => store.get(id))
        .filter((record): record is PositionedRecord => isLive(record) && isPositioned(record))
        .filter((record) => hitsRecord(record, point, tolerance))
        .sort(hitRank);
      if (hits.length > 0 && hits[hits.length - 1]!.type !== 'section')
        return hits[hits.length - 1]!.id;
      const link = store
        .all()
        .filter((record): record is LinkRecord => isLive(record) && record.type === 'link')
        .find((record) => hitsLink(record, store.get, point, tolerance));
      return link?.id ?? hits[hits.length - 1]?.id ?? null;
    },
    dispose: unlisten,
  };
};
