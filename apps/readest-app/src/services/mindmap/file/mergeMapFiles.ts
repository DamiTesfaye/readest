import { hlcMax, mergeFields } from '@/libs/crdt';
import type { FieldsObject, Hlc } from '@/types/replica';
import type { MapFile } from '@/services/mindmap/schema/types';

const FURTHEST_WINS = 'lastSeenProgress';

const mergeMeta = (a: FieldsObject, b: FieldsObject): FieldsObject => {
  const merged = mergeFields(a, b);
  const left = a[FURTHEST_WINS];
  const right = b[FURTHEST_WINS];
  if (!left || !right || typeof left.v !== 'number' || typeof right.v !== 'number') return merged;
  if (left.v === right.v) return merged;
  return { ...merged, [FURTHEST_WINS]: left.v > right.v ? left : right };
};

export const mergeMapFiles = (a: MapFile, b: MapFile): MapFile => {
  const records: MapFile['records'] = {};
  for (const id of new Set([...Object.keys(a.records), ...Object.keys(b.records)])) {
    const left = a.records[id];
    const right = b.records[id];
    records[id] = left && right ? mergeFields(left, right) : (left ?? right)!;
  }
  return {
    schemaVersion: Math.max(a.schemaVersion, b.schemaVersion),
    mapId: a.mapId,
    meta: mergeMeta(a.meta, b.meta),
    records,
  };
};

export const highestHlc = (file: MapFile): Hlc | null => {
  let newest: Hlc | null = null;
  for (const fields of [file.meta, ...Object.values(file.records)]) {
    for (const envelope of Object.values(fields)) newest = hlcMax(newest, envelope.t);
  }
  return newest;
};
