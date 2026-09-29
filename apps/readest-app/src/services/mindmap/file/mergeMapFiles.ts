import { hlcMax, mergeFields } from '@/libs/crdt';
import type { FieldEnvelope, FieldsObject, Hlc } from '@/types/replica';
import type { MapFile } from '@/services/mindmap/schema/types';

const FURTHEST_WINS = 'lastSeenProgress';

const progressOf = (envelope: FieldEnvelope | undefined): number | null =>
  typeof envelope?.v === 'number' && Number.isFinite(envelope.v) ? envelope.v : null;

const mergeMeta = (a: FieldsObject, b: FieldsObject): FieldsObject => {
  const merged = mergeFields(a, b);
  const left = progressOf(a[FURTHEST_WINS]);
  const right = progressOf(b[FURTHEST_WINS]);
  if (left === right) return merged;
  const leftWins = right === null || (left !== null && left > right);
  return { ...merged, [FURTHEST_WINS]: leftWins ? a[FURTHEST_WINS]! : b[FURTHEST_WINS]! };
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
