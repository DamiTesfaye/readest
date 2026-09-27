import type { FieldEnvelope, FieldsObject } from '@/types/replica';
import type { MapFile } from '@/services/mindmap/schema/types';

const HLC_PATTERN = /^[0-9a-f]{13}-[0-9a-f]{8}-/;
const FORBIDDEN_KEY = '__proto__';

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isEnvelope = (value: unknown): value is FieldEnvelope =>
  isPlainObject(value) &&
  Object.hasOwn(value, 'v') &&
  typeof value['t'] === 'string' &&
  HLC_PATTERN.test(value['t']) &&
  typeof value['s'] === 'string';

const isFieldsObject = (value: unknown): value is FieldsObject =>
  isPlainObject(value) &&
  Object.keys(value).every((key) => key !== FORBIDDEN_KEY && isEnvelope(value[key]));

export const parseMapFile = (text: string, mapId: string): MapFile | null => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isPlainObject(parsed)) return null;
  const schemaVersion = parsed['schemaVersion'];
  const meta = parsed['meta'];
  const records = parsed['records'];
  if (typeof schemaVersion !== 'number' || !Number.isInteger(schemaVersion) || schemaVersion < 0) {
    return null;
  }
  if (parsed['mapId'] !== mapId || !isFieldsObject(meta) || !isPlainObject(records)) return null;
  const valid = Object.keys(records).every(
    (id) => id !== FORBIDDEN_KEY && isFieldsObject(records[id]),
  );
  if (!valid) return null;
  return { schemaVersion, mapId, meta, records: records as Record<string, FieldsObject> };
};
