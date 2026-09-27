import { hlcMax, mergeFields } from '@/libs/crdt';
import type { Hlc } from '@/types/replica';
import type { MapFile } from '@/services/mindmap/schema/types';

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
    meta: mergeFields(a.meta, b.meta),
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
