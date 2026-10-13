import type { FieldsObject } from '@/types/replica';
import { md5 } from '@/utils/md5';
import { CONTENT_FIELDS, type MapFile, isRecordType } from '@/services/mindmap/schema/types';

const clearDeletedContent = (fields: FieldsObject): FieldsObject => {
  const type = Object.hasOwn(fields, 'type') ? fields['type']!.v : undefined;
  const deleted = Object.hasOwn(fields, 'deleted') ? fields['deleted']!.v : null;
  if (!isRecordType(type) || deleted === null || deleted === undefined) return fields;
  const cleared: FieldsObject = { ...fields };
  for (const field of CONTENT_FIELDS[type]) {
    const envelope = cleared[field];
    if (envelope) cleared[field] = { ...envelope, v: null };
  }
  return cleared;
};

const sortKeysDeep = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (typeof value !== 'object' || value === null) return value;
  const source = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(source)
      .sort()
      .map((key) => [key, sortKeysDeep(source[key])]),
  );
};

export const canonicalStringify = (file: MapFile): string => {
  const records: Record<string, FieldsObject> = {};
  for (const id of Object.keys(file.records)) records[id] = clearDeletedContent(file.records[id]!);
  return JSON.stringify(
    sortKeysDeep({
      schemaVersion: file.schemaVersion,
      mapId: file.mapId,
      meta: file.meta,
      records,
    }),
  );
};

export const md5Hex = (text: string): string => md5(text);
