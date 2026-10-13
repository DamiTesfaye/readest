import type { FieldsObject } from '@/types/replica';
import { type HlcClock, stampAbove } from '@/services/mindmap/file/clock';
import {
  CURRENT_SCHEMA_VERSION,
  type MapFile,
  type RecordType,
  isRecordType,
} from '@/services/mindmap/schema/types';
import { fieldsEqual } from '@/services/mindmap/store/mapStore';

export type RecordMigration = (fields: Record<string, unknown>) => Record<string, unknown>;

export const RECORD_MIGRATIONS: Record<RecordType, RecordMigration[]> = {
  node: [],
  link: [],
  section: [],
  sticky: [],
  text: [],
  shape: [],
  ink: [],
};

export const CURRENT_RECORD_VERSION: Record<RecordType, number> = {
  node: 1,
  link: 1,
  section: 1,
  sticky: 1,
  text: 1,
  shape: 1,
  ink: 1,
};

export interface MigrationConfig {
  migrations: Record<RecordType, RecordMigration[]>;
  targetVersions: Record<RecordType, number>;
}

export const DEFAULT_MIGRATION_CONFIG: MigrationConfig = {
  migrations: RECORD_MIGRATIONS,
  targetVersions: CURRENT_RECORD_VERSION,
};

const plainValues = (fields: FieldsObject): Record<string, unknown> =>
  Object.fromEntries(Object.entries(fields).map(([key, envelope]) => [key, envelope.v]));

const recordVersion = (fields: FieldsObject): number => {
  const value = Object.hasOwn(fields, 'version') ? fields['version']!.v : undefined;
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 ? value : 1;
};

const migrateRecord = (
  fields: FieldsObject,
  clock: HlcClock,
  config: MigrationConfig,
): FieldsObject => {
  const type = Object.hasOwn(fields, 'type') ? fields['type']!.v : undefined;
  if (!isRecordType(type)) return fields;
  const from = recordVersion(fields);
  const target = config.targetVersions[type];
  if (from >= target) return fields;
  const before = plainValues(fields);
  let after = before;
  for (let version = from; version < target; version += 1) {
    const migration = config.migrations[type][version - 1];
    if (!migration) throw new Error(`mindmap: no ${type} migration from version ${version}`);
    after = migration(after);
  }
  const migrated: FieldsObject = { ...fields };
  for (const [key, value] of Object.entries({ ...after, version: target })) {
    const unchanged = Object.hasOwn(before, key) && fieldsEqual(before[key], value);
    if (key === 'id' || value === undefined || unchanged) continue;
    migrated[key] = { v: value, t: stampAbove(clock, fields[key]?.t), s: clock.deviceId };
  }
  return migrated;
};

export const migrateMapFile = (
  file: MapFile,
  clock: HlcClock,
  config: MigrationConfig = DEFAULT_MIGRATION_CONFIG,
): MapFile => {
  if (file.schemaVersion > CURRENT_SCHEMA_VERSION) return file;
  let changed = file.schemaVersion !== CURRENT_SCHEMA_VERSION;
  const records: Record<string, FieldsObject> = {};
  for (const id of Object.keys(file.records)) {
    const fields = file.records[id]!;
    const migrated = migrateRecord(fields, clock, config);
    if (migrated !== fields) changed = true;
    records[id] = migrated;
  }
  return changed ? { ...file, schemaVersion: CURRENT_SCHEMA_VERSION, records } : file;
};
