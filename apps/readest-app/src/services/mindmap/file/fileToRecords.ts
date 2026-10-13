import type { FieldsObject } from '@/types/replica';
import {
  CONTENT_FIELDS,
  type MapFile,
  type MapMeta,
  type MapRecord,
  type RecordType,
  isRecordType,
} from '@/services/mindmap/schema/types';
import { decodeMeta, validateRecordFields } from '@/services/mindmap/schema/validate';

export interface FileToRecordsResult {
  records: MapRecord[];
  meta: MapMeta;
  invalid: string[];
}

const plainRecord = (
  id: string,
  type: RecordType,
  fields: FieldsObject,
): Record<string, unknown> => {
  const plain: Record<string, unknown> = {};
  for (const key of Object.keys(fields)) plain[key] = fields[key]!.v;
  for (const field of CONTENT_FIELDS[type]) {
    if (plain[field] === null || plain[field] === undefined) plain[field] = '';
  }
  plain['id'] = id;
  return plain;
};

export const fileToRecords = (file: MapFile): FileToRecordsResult => {
  const records: MapRecord[] = [];
  const invalid: string[] = [];
  for (const id of Object.keys(file.records)) {
    const fields = file.records[id]!;
    const type = Object.hasOwn(fields, 'type') ? fields['type']!.v : undefined;
    if (!isRecordType(type)) {
      invalid.push(id);
      continue;
    }
    const plain = plainRecord(id, type, fields);
    if (validateRecordFields(type, plain)) records.push(plain as unknown as MapRecord);
    else invalid.push(id);
  }
  return { records, meta: decodeMeta(file.meta), invalid };
};
