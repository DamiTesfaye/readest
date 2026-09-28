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
  searchLinks(bounds: BoundsRect): string[];
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

const toEntry = (id: string, box: BoundsRect): Entry => ({
  minX: box.x,
  minY: box.y,
  maxX: box.x + box.w,
  maxY: box.y + box.h,
  id,
});

const pointsBounds = (points: readonly Point[]): BoundsRect => {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
};

const unionBox = (a: BoundsRect, b: BoundsRect): BoundsRect => {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
};

export const linkBounds = (
  link: LinkRecord,
  from: PositionedRecord,
  to: PositionedRecord,
): BoundsRect => {
  const a = recordBounds(from);
  const b = recordBounds(to);
  return unionBox(unionBox(a, b), pointsBounds(linkShape(a, b, link).points));
};

const hitRank = (a: MapRecord, b: MapRecord): number => {
  const aSection = a.type === 'section' ? 0 : 1;
  const bSection = b.type === 'section' ? 0 : 1;
  return aSection !== bSection ? aSection - bSection : compareByIndex(a, b);
};

const toRect = (bounds: BoundsRect) => ({
  minX: bounds.x,
  minY: bounds.y,
  maxX: bounds.x + bounds.w,
  maxY: bounds.y + bounds.h,
});

interface Tree {
  set(id: string, box: BoundsRect | null): void;
  search(bounds: BoundsRect): string[];
}

const createTree = (): Tree => {
  const tree = new RBush<Entry>();
  const entries = new Map<string, Entry>();
  return {
    set: (id, box) => {
      const previous = entries.get(id);
      if (previous) {
        tree.remove(previous);
        entries.delete(id);
      }
      if (!box) return;
      const entry = toEntry(id, box);
      tree.insert(entry);
      entries.set(id, entry);
    },
    search: (bounds) => tree.search(toRect(bounds)).map((entry) => entry.id),
  };
};

export const createSpatialIndex = (store: MapStore): SpatialIndex => {
  const records = createTree();
  const links = createTree();
  const linksByEnd = new Map<string, Set<string>>();
  const endsOf = new Map<string, readonly [string, string]>();

  const attach = (link: LinkRecord | null, id: string): void => {
    for (const end of endsOf.get(id) ?? []) linksByEnd.get(end)?.delete(id);
    endsOf.delete(id);
    if (!link) return;
    endsOf.set(id, [link.fromId, link.toId]);
    for (const end of [link.fromId, link.toId]) {
      linksByEnd.set(end, (linksByEnd.get(end) ?? new Set()).add(id));
    }
  };

  const reindexLink = (id: string): void => {
    const record = store.get(id);
    const link = isLive(record) && record.type === 'link' ? record : null;
    attach(link, id);
    const ends = link ? liveLinkEnds(link, store.get) : null;
    links.set(id, link && ends ? linkBounds(link, ends[0], ends[1]) : null);
  };

  const reindex = (id: string): void => {
    const record = store.get(id);
    if (record?.type === 'link' || endsOf.has(id)) reindexLink(id);
    if (record?.type === 'link') return;
    records.set(id, isLive(record) && isPositioned(record) ? recordBounds(record) : null);
    for (const linkId of [...(linksByEnd.get(id) ?? [])]) reindexLink(linkId);
  };

  for (const record of store.all()) reindex(record.id);

  const unlisten = store.listen((diff) => {
    const ids = new Set([
      ...diff.added.map((record) => record.id),
      ...diff.changed.map((change) => change.id),
      ...diff.discarded,
    ]);
    for (const id of ids) reindex(id);
  });

  const hitLink = (point: Point, tolerance: number): string | null => {
    const box = {
      x: point.x - tolerance,
      y: point.y - tolerance,
      w: tolerance * 2,
      h: tolerance * 2,
    };
    const hits = links
      .search(box)
      .map((id) => store.get(id))
      .filter((record): record is LinkRecord => isLive(record) && record.type === 'link')
      .filter((link) => hitsLink(link, store.get, point, tolerance))
      .sort(compareByIndex);
    return hits[hits.length - 1]?.id ?? null;
  };

  return {
    search: records.search,
    searchLinks: links.search,
    hitTest: (point, tolerance) => {
      const box = {
        x: point.x - tolerance,
        y: point.y - tolerance,
        w: tolerance * 2,
        h: tolerance * 2,
      };
      const hits = records
        .search(box)
        .map((id) => store.get(id))
        .filter((record): record is PositionedRecord => isLive(record) && isPositioned(record))
        .filter((record) => hitsRecord(record, point, tolerance))
        .sort(hitRank);
      if (hits.length > 0 && hits[hits.length - 1]!.type !== 'section')
        return hits[hits.length - 1]!.id;
      return hitLink(point, tolerance) ?? hits[hits.length - 1]?.id ?? null;
    },
    dispose: unlisten,
  };
};
