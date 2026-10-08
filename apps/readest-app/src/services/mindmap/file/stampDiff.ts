import type { FieldEnvelope, FieldsObject } from '@/types/replica';
import { type HlcClock, stampAbove } from '@/services/mindmap/file/clock';
import {
  CONTENT_FIELDS,
  type MapFile,
  type MapMeta,
  type MapRecord,
} from '@/services/mindmap/schema/types';
import {
  type Diff,
  type FieldChange,
  readField,
  recordFields,
} from '@/services/mindmap/store/mapStore';

export type RecordLookup = (id: string) => MapRecord | undefined;

const stamp = (value: unknown, clock: HlcClock, current?: FieldEnvelope): FieldEnvelope => ({
  v: value,
  t: stampAbove(clock, current?.t),
  s: clock.deviceId,
});

const stampRecord = (record: MapRecord, clock: HlcClock, current?: FieldsObject): FieldsObject => {
  const fields: FieldsObject = {};
  for (const [key, value] of Object.entries(recordFields(record))) {
    if (key !== 'id' && value !== undefined) fields[key] = stamp(value, clock, current?.[key]);
  }
  return fields;
};

const isRevival = (change: FieldChange): boolean =>
  change.field === 'deleted' && change.from !== null && change.to === null;

export const stampDiff = (
  file: MapFile,
  diff: Diff,
  clock: HlcClock,
  lookup: RecordLookup,
): MapFile => {
  const records: Record<string, FieldsObject> = { ...file.records };
  for (const record of diff.added) {
    records[record.id] = stampRecord(record, clock, records[record.id]);
  }
  for (const change of diff.changed) {
    const fields = records[change.id];
    if (fields && change.field !== 'id') {
      const current = fields[change.field];
      records[change.id] = { ...fields, [change.field]: stamp(change.to, clock, current) };
    }
  }
  for (const change of diff.changed.filter(isRevival)) {
    const record = lookup(change.id);
    const fields = records[change.id];
    if (!record || !fields) continue;
    const restamped: FieldsObject = { ...fields };
    for (const field of CONTENT_FIELDS[record.type]) {
      restamped[field] = stamp(readField(record, field), clock, fields[field]);
    }
    records[change.id] = restamped;
  }
  const discarded = new Set(diff.discarded);
  const kept = Object.fromEntries(Object.entries(records).filter(([id]) => !discarded.has(id)));
  return { ...file, records: kept };
};

export const stampMeta = (file: MapFile, patch: Partial<MapMeta>, clock: HlcClock): MapFile => {
  const meta: FieldsObject = { ...file.meta };
  for (const [key, value] of Object.entries(patch as Record<string, unknown>)) {
    if (value !== undefined) meta[key] = stamp(value, clock, file.meta[key]);
  }
  return { ...file, meta };
};
