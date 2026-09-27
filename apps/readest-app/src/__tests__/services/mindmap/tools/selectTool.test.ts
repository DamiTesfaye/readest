import { describe, expect, it } from 'vitest';
import {
  createNodeRecord,
  createSectionRecord,
  createShapeRecord,
} from '@/services/mindmap/records/defaults';
import type { MapRecord, PositionedRecord } from '@/services/mindmap/schema/types';
import { createSelectTool } from '@/services/mindmap/tools/selectTool';
import { drive, pointer, toolHarness } from './toolHarness';

const node = (id: string, x: number, y: number, index = 'a1') =>
  createNodeRecord({ id, index, x, y, w: 160, h: 64, label: id });

const position = (record: MapRecord | undefined) => {
  const r = record as PositionedRecord;
  return { x: r.x, y: r.y };
};

const setup = (records: MapRecord[], readOnly = false) => {
  const { ctx } = toolHarness(records, readOnly);
  return { ctx, select: createSelectTool(ctx) };
};

describe('select tool', () => {
  it('selects on click, toggles with shift and clears on empty canvas', () => {
    const { ctx, select } = setup([node('a', 0, 0), node('b', 400, 0, 'a2')]);
    drive(select, [10, 10], [10, 10]);
    expect(ctx.selection.get()).toEqual(['a']);
    drive(select, [410, 10], [410, 10], { shift: true });
    expect(ctx.selection.get()).toEqual(['a', 'b']);
    drive(select, [10, 10], [10, 10], { shift: true });
    expect(ctx.selection.get()).toEqual(['b']);
    drive(select, [900, 700], [900, 700]);
    expect(ctx.selection.get()).toEqual([]);
  });

  it('walks idle, pointing, translating and back to idle', () => {
    const { select } = setup([node('a', 0, 0)]);
    expect(select.state()).toBe('idle');
    select.down(pointer(10, 10));
    expect(select.state()).toBe('pointing');
    select.move(pointer(40, 30), []);
    expect(select.state()).toBe('translating');
    select.up(pointer(40, 30));
    expect(select.state()).toBe('idle');
  });

  it('moves from the start snapshot plus the total delta and snaps to the grid', () => {
    const { ctx, select } = setup([node('a', 0, 0)]);
    drive(select, [10, 10], [47, 31]);
    expect(position(ctx.store.get('a'))).toEqual({ x: 32, y: 16 });
  });

  it('does not snap while Alt is held', () => {
    const { ctx, select } = setup([node('a', 0, 0)]);
    drive(select, [10, 10], [47, 31], { alt: true });
    expect(position(ctx.store.get('a'))).toEqual({ x: 37, y: 21 });
  });

  it('snaps to a neighbour edge, shows a guide while dragging and clears it on release', () => {
    const { ctx, select } = setup([node('a', 0, 0), node('b', 0, 200, 'a2')]);
    select.down(pointer(10, 210));
    select.move(pointer(15, 230), []);
    expect(ctx.live.get().guides.length).toBeGreaterThan(0);
    select.up(pointer(15, 230));
    expect(position(ctx.store.get('b')).x).toBe(0);
    expect(ctx.live.get().guides).toEqual([]);
  });

  it('squashes a whole drag into one undo step', () => {
    const { ctx, select } = setup([node('a', 0, 0)]);
    drive(select, [10, 10], [100, 100]);
    ctx.history.undo();
    expect(position(ctx.store.get('a'))).toEqual({ x: 0, y: 0 });
    expect(ctx.history.canUndo()).toBe(false);
  });

  it('bails a cancelled drag back to the start without an undo step', () => {
    const { ctx, select } = setup([node('a', 0, 0)]);
    select.down(pointer(10, 10));
    select.move(pointer(200, 200), []);
    select.cancel();
    expect(position(ctx.store.get('a'))).toEqual({ x: 0, y: 0 });
    expect(ctx.history.canUndo()).toBe(false);
    expect(select.state()).toBe('idle');
  });

  it('carries section children and reparents records dropped into or out of a section', () => {
    const section = createSectionRecord({ id: 's', index: 'a0', x: 0, y: 0, w: 480, h: 480 });
    const child = { ...node('c', 32, 32), parentId: 's' };
    const { ctx, select } = setup([section, child, node('o', 800, 0, 'a2')]);
    drive(select, [200, 400], [264, 400]);
    expect(position(ctx.store.get('c'))).toEqual({ x: 96, y: 32 });
    drive(select, [810, 10], [210, 210]);
    expect(ctx.store.get('o')!.parentId).toBe('s');
    drive(select, [110, 40], [1110, 40]);
    expect(ctx.store.get('c')!.parentId).toBeNull();
  });

  it('resizes from the handle with grid snapping and a minimum size', () => {
    const shape = createShapeRecord({ id: 'r', index: 'a1', x: 0, y: 0, w: 96, h: 96 });
    const { ctx, select } = setup([shape]);
    drive(select, [96, 96], [141, 170], { target: { kind: 'resize', id: 'r' } });
    expect(select.state()).toBe('idle');
    expect(ctx.store.get('r')).toMatchObject({ w: 144, h: 176 });
    drive(select, [144, 176], [-500, -500], { target: { kind: 'resize', id: 'r' } });
    expect(ctx.store.get('r')).toMatchObject({ w: 16, h: 16 });
  });

  it('brushes a selection and keeps the previous one with shift', () => {
    const { ctx, select } = setup([
      node('a', 0, 0),
      node('b', 400, 0, 'a2'),
      node('c', 0, 400, 'a3'),
    ]);
    select.down(pointer(-20, -20));
    select.move(pointer(600, 100), []);
    expect(select.state()).toBe('brushing');
    expect(ctx.live.get().brush).toEqual({ x: -20, y: -20, w: 620, h: 120 });
    select.up(pointer(600, 100));
    expect([...ctx.selection.get()].sort()).toEqual(['a', 'b']);
    expect(ctx.live.get().brush).toBeNull();
    drive(select, [-20, 380], [50, 500], { shift: true });
    expect([...ctx.selection.get()].sort()).toEqual(['a', 'b', 'c']);
  });

  it('enters editing on double click', () => {
    const { ctx, select } = setup([node('a', 0, 0)]);
    drive(select, [10, 10], [10, 10], { clicks: 2 });
    expect(ctx.editing.get()).toBe('a');
    expect(select.state()).toBe('editing');
  });

  it('selects but never moves records in a read-only map', () => {
    const { ctx, select } = setup([node('a', 0, 0)], true);
    drive(select, [10, 10], [300, 300]);
    expect(position(ctx.store.get('a'))).toEqual({ x: 0, y: 0 });
    expect(ctx.selection.get()).toEqual(['a']);
  });
});
