import { describe, expect, it } from 'vitest';
import type { FieldEnvelope, FieldsObject, Hlc } from '@/types/replica';
import { DEFAULT_MAP_META } from '@/services/mindmap/schema/types';
import { decodeMeta, validateRecordFields } from '@/services/mindmap/schema/validate';

const envelope = (v: unknown): FieldEnvelope => ({
  v,
  t: '0000000000001-00000000-d1' as Hlc,
  s: 'd1',
});

const nodeFields: Record<string, unknown> = {
  id: 'n1',
  type: 'node',
  version: 1,
  parentId: null,
  index: 'a0',
  origin: 'user',
  genKey: null,
  touched: [],
  anchor: null,
  revealAt: null,
  deleted: null,
  x: 0,
  y: 0,
  w: 160,
  h: 64,
  label: 'Elizabeth',
  kind: 'character',
  color: 'terracotta',
  icon: '',
};

const linkFields: Record<string, unknown> = {
  id: 'l1',
  type: 'link',
  version: 1,
  parentId: null,
  index: 'a0',
  origin: 'user',
  genKey: null,
  touched: [],
  anchor: null,
  revealAt: null,
  deleted: null,
  fromId: 'n1',
  toId: 'n2',
  fromAnchor: { side: 'right', t: 0.5 },
  toAnchor: null,
  label: '',
  path: 'bezier',
  dash: false,
};

const without = (fields: Record<string, unknown>, key: string): Record<string, unknown> =>
  Object.fromEntries(Object.entries(fields).filter(([name]) => name !== key));

describe('validateRecordFields', () => {
  it('accepts a well-formed node and link', () => {
    expect(validateRecordFields('node', nodeFields)).toBe(true);
    expect(validateRecordFields('link', linkFields)).toBe(true);
  });

  it('rejects a missing field, a bad enum, a bad index and an out-of-range revealAt', () => {
    expect(validateRecordFields('node', without(nodeFields, 'label'))).toBe(false);
    expect(validateRecordFields('node', { ...nodeFields, kind: 'wizard' })).toBe(false);
    expect(validateRecordFields('node', { ...nodeFields, index: 'i' })).toBe(false);
    expect(validateRecordFields('node', { ...nodeFields, revealAt: 1.5 })).toBe(false);
    expect(validateRecordFields('link', { ...linkFields, fromAnchor: 'right' })).toBe(false);
  });

  it('accepts a record carrying an unknown future field', () => {
    expect(validateRecordFields('node', { ...nodeFields, futureField: 'x' })).toBe(true);
  });
});

describe('decodeMeta', () => {
  it('returns the defaults for empty meta', () => {
    expect(decodeMeta({})).toEqual(DEFAULT_MAP_META);
  });

  it('reads valid values including the source', () => {
    const meta: FieldsObject = {
      title: envelope('Family'),
      intent: envelope('story'),
      spoiler: envelope('grow'),
      style: envelope('paper'),
      camera: envelope({ x: 1, y: 2, z: 0.5 }),
      lastSeenProgress: envelope(0.25),
      source: envelope('generated'),
    };
    expect(decodeMeta(meta)).toEqual({
      title: 'Family',
      intent: 'story',
      spoiler: 'grow',
      style: 'paper',
      camera: { x: 1, y: 2, z: 0.5 },
      lastSeenProgress: 0.25,
      source: 'generated',
    });
  });

  it('falls back per field when a value is invalid', () => {
    const meta = decodeMeta({
      title: envelope('Kept'),
      intent: envelope('wizard'),
      camera: envelope(null),
    });
    expect(meta.title).toBe('Kept');
    expect(meta.intent).toBe('adaptive');
    expect(meta.camera).toEqual({ x: 0, y: 0, z: 1 });
  });
});
