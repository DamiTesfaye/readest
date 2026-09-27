import { describe, expect, it } from 'vitest';
import type { FieldEnvelope, FieldsObject, Hlc } from '@/types/replica';
import type { MapFile } from '@/services/mindmap/schema/types';
import { fileToRecords } from '@/services/mindmap/file/fileToRecords';

const envelope = (v: unknown): FieldEnvelope => ({
  v,
  t: '0000000000001-00000000-d1' as Hlc,
  s: 'd1',
});

const toFields = (plain: Record<string, unknown>): FieldsObject =>
  Object.fromEntries(Object.entries(plain).map(([key, value]) => [key, envelope(value)]));

const base = {
  version: 1,
  parentId: null,
  index: 'a0',
  origin: 'user',
  genKey: null,
  touched: [],
  anchor: null,
  revealAt: null,
  deleted: null,
};

const nodeFields = (overrides: Record<string, unknown> = {}): FieldsObject =>
  toFields({
    ...base,
    type: 'node',
    x: 0,
    y: 0,
    w: 160,
    h: 64,
    label: 'Elizabeth',
    kind: 'character',
    color: 'terracotta',
    icon: '',
    ...overrides,
  });

const fileWith = (records: Record<string, FieldsObject>, meta: FieldsObject = {}): MapFile => ({
  schemaVersion: 1,
  mapId: 'm1',
  meta,
  records,
});

describe('fileToRecords', () => {
  it('decodes a valid record into a MapRecord with its id', () => {
    const { records, invalid } = fileToRecords(fileWith({ n1: nodeFields() }));
    expect(invalid).toEqual([]);
    expect(records).toEqual([
      expect.objectContaining({ id: 'n1', type: 'node', label: 'Elizabeth', icon: '' }),
    ]);
  });

  it('excludes an invalid record but leaves the file untouched', () => {
    const bad = nodeFields({ kind: 'wizard' });
    const file = fileWith({ n1: bad });
    const { records, invalid } = fileToRecords(file);
    expect(records).toEqual([]);
    expect(invalid).toEqual(['n1']);
    expect(file.records['n1']).toBe(bad);
  });

  it('reads null content fields of deleted records back as empty strings', () => {
    const link = toFields({
      ...base,
      type: 'link',
      deleted: { by: 'gen' },
      fromId: null,
      toId: null,
      fromAnchor: null,
      toAnchor: null,
      label: null,
      path: 'bezier',
      dash: false,
    });
    const node = nodeFields({ deleted: { by: 'user' }, label: null });
    const { records, invalid } = fileToRecords(fileWith({ l1: link, n1: node }));
    expect(invalid).toEqual([]);
    expect(records).toEqual([
      expect.objectContaining({ id: 'l1', fromId: '', toId: '', label: '' }),
      expect.objectContaining({ id: 'n1', label: '' }),
    ]);
  });

  it('marks a record whose type is not an own record type invalid', () => {
    const { records, invalid } = fileToRecords(fileWith({ x1: { type: envelope('constructor') } }));
    expect(records).toEqual([]);
    expect(invalid).toEqual(['x1']);
  });

  it('decodes meta with the source field', () => {
    const { meta } = fileToRecords(
      fileWith({}, { title: envelope('Map'), source: envelope('generated') }),
    );
    expect(meta.title).toBe('Map');
    expect(meta.source).toBe('generated');
    expect(meta.intent).toBe('adaptive');
  });
});
