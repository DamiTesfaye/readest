import { describe, expect, it } from 'vitest';
import {
  createInkRecord,
  createLinkRecord,
  createNodeRecord,
  createSectionRecord,
  createShapeRecord,
  createStickyRecord,
  createTextRecord,
} from '@/services/mindmap/records/defaults';
import { DEFAULT_MAP_META, isRecordType } from '@/services/mindmap/schema/types';

describe('record defaults', () => {
  it('creates a node with base, positioned and content defaults', () => {
    const node = createNodeRecord({ id: 'n1', index: 'a0' });
    expect(node).toEqual({
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
      label: '',
      kind: 'idea',
      color: 'terracotta',
      icon: '',
    });
  });

  it('allows overriding node fields', () => {
    const node = createNodeRecord({ id: 'n1', index: 'a0', label: 'Elizabeth', kind: 'character' });
    expect(node.label).toBe('Elizabeth');
    expect(node.kind).toBe('character');
  });

  it('creates a link with typed anchors and no position fields', () => {
    const link = createLinkRecord({
      id: 'l1',
      index: 'a0',
      fromId: 'n1',
      toId: 'n2',
      fromAnchor: { side: 'right', t: 0.5 },
    });
    expect(link.fromAnchor).toEqual({ side: 'right', t: 0.5 });
    expect(link.toAnchor).toBeNull();
    expect(link.path).toBe('bezier');
    expect(link.dash).toBe(false);
    expect(Object.hasOwn(link, 'x')).toBe(false);
  });

  it('creates section, sticky, text and shape records with their defaults', () => {
    expect(createSectionRecord({ id: 's1', index: 'a0' }).title).toBe('');
    expect(createStickyRecord({ id: 'k1', index: 'a0' }).color).toBe('mustard');
    expect(createTextRecord({ id: 't1', index: 'a0' }).size).toBe(16);
    expect(createShapeRecord({ id: 'h1', index: 'a0' }).geo).toBe('rect');
  });

  it('creates an ink record from a segment box and encoded points', () => {
    const ink = createInkRecord({
      id: 'i1',
      index: 'a0',
      x: 10,
      y: 20,
      w: 30,
      h: 40,
      points: 'AA==',
    });
    expect(ink.x).toBe(10);
    expect(ink.points).toBe('AA==');
    expect(ink.color).toBe('ink');
    expect(ink.pen).toBe(false);
  });
});

describe('schema types', () => {
  it('recognises record types by own keys only', () => {
    expect(isRecordType('node')).toBe(true);
    expect(isRecordType('constructor')).toBe(false);
    expect(isRecordType('toString')).toBe(false);
    expect(isRecordType(7)).toBe(false);
  });

  it('defaults a map to a blank source', () => {
    expect(DEFAULT_MAP_META.source).toBe('blank');
    expect(DEFAULT_MAP_META.camera).toEqual({ x: 0, y: 0, z: 1 });
  });
});
