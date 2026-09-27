import { describe, expect, it } from 'vitest';
import { decodeInk } from '@/services/mindmap/ink/ink';
import { createNodeRecord, createSectionRecord } from '@/services/mindmap/records/defaults';
import type { InkRecord, MapRecord } from '@/services/mindmap/schema/types';
import { createConnectTool } from '@/services/mindmap/tools/connectTool';
import { createHandTool } from '@/services/mindmap/tools/handTool';
import { PEN_SIZE, createPenTool } from '@/services/mindmap/tools/penTool';
import { createPlaceTool } from '@/services/mindmap/tools/placeTool';
import { drive, pointer, toolHarness } from './toolHarness';

const live = (records: MapRecord[]) => records.filter((r) => r.deleted === null);
const node = (id: string, x: number, y: number, index = 'a1') =>
  createNodeRecord({ id, index, x, y, w: 160, h: 64, label: id });

describe('hand tool', () => {
  it('pans the camera by the screen delta and records no history', () => {
    const { ctx } = toolHarness();
    const hand = createHandTool(ctx);
    drive(hand, [100, 100], [160, 70]);
    expect(ctx.camera.get()).toEqual({ x: 60, y: -30, z: 1 });
    expect(ctx.history.canUndo()).toBe(false);
    expect(hand.state()).toBe('idle');
  });
});

describe('place tools', () => {
  it('places a snapped node centred on a click, edits it and returns to select', () => {
    const { ctx, tool } = toolHarness();
    tool.set('node');
    drive(createPlaceTool(ctx, 'node'), [203, 97], [203, 97]);
    expect(ctx.store.get('new1')).toMatchObject({ type: 'node', x: 128, y: 64, parentId: null });
    expect(ctx.selection.get()).toEqual(['new1']);
    expect(ctx.editing.get()).toBe('new1');
    expect(tool.get()).toBe('select');
    ctx.history.undo();
    expect(live(ctx.store.all())).toHaveLength(0);
  });

  it('sizes a shape by dragging and previews it in the live layer until release', () => {
    const { ctx } = toolHarness();
    const rect = createPlaceTool(ctx, 'rect');
    rect.down(pointer(10, 10));
    rect.move(pointer(170, 110), []);
    expect(rect.state()).toBe('sizing');
    expect(ctx.live.get().draft).toEqual({ tool: 'rect', box: { x: 10, y: 10, w: 160, h: 100 } });
    expect(ctx.store.all()).toHaveLength(0);
    rect.up(pointer(170, 110));
    expect(ctx.store.get('new1')).toMatchObject({
      type: 'shape',
      geo: 'rect',
      x: 16,
      y: 16,
      w: 160,
      h: 96,
    });
    expect(ctx.live.get().draft).toBeNull();
  });

  it('makes ellipses with the ellipse tool', () => {
    const { ctx } = toolHarness();
    drive(createPlaceTool(ctx, 'ellipse'), [0, 0], [0, 0]);
    expect(ctx.store.get('new1')).toMatchObject({ type: 'shape', geo: 'ellipse' });
  });

  it('skips grid snapping when placing a record with Alt held', () => {
    const { ctx } = toolHarness();
    drive(createPlaceTool(ctx, 'rect'), [11, 13], [169, 111], { alt: true });
    expect(ctx.store.get('new1')).toMatchObject({
      type: 'shape',
      geo: 'rect',
      x: 11,
      y: 13,
      w: 158,
      h: 98,
    });
  });

  it('parents a sticky placed inside a section', () => {
    const section = createSectionRecord({ id: 's', index: 'a0', x: 0, y: 0, w: 640, h: 640 });
    const { ctx } = toolHarness([section]);
    drive(createPlaceTool(ctx, 'sticky'), [300, 300], [300, 300]);
    expect(ctx.store.get('new1')).toMatchObject({ type: 'sticky', parentId: 's' });
  });

  it('creates nothing when cancelled or read-only', () => {
    const { ctx } = toolHarness();
    const rect = createPlaceTool(ctx, 'rect');
    rect.down(pointer(0, 0));
    rect.move(pointer(100, 100), []);
    rect.cancel();
    expect(ctx.store.all()).toHaveLength(0);
    expect(ctx.live.get().draft).toBeNull();
    const readOnly = toolHarness([], true).ctx;
    drive(createPlaceTool(readOnly, 'node'), [0, 0], [0, 0]);
    expect(readOnly.store.all()).toHaveLength(0);
  });
});

describe('connect tool', () => {
  it('links two records from a connect handle and keeps the anchor side', () => {
    const { ctx } = toolHarness([node('a', 0, 0), node('b', 400, 0, 'a2')]);
    const connect = createConnectTool(ctx);
    connect.down(pointer(160, 32, { target: { kind: 'connect', id: 'a', side: 'right' } }));
    connect.move(pointer(300, 32), []);
    expect(connect.state()).toBe('connecting');
    expect(ctx.live.get().link).toEqual({ from: { x: 160, y: 32 }, to: { x: 300, y: 32 } });
    connect.up(pointer(420, 20));
    expect(ctx.store.get('new1')).toMatchObject({
      type: 'link',
      fromId: 'a',
      toId: 'b',
      fromAnchor: { side: 'right', t: 0.5 },
    });
    expect(ctx.live.get().link).toBeNull();
  });

  it('creates a connected node when dropped on empty space, undone in one step', () => {
    const { ctx } = toolHarness([node('a', 0, 0)]);
    drive(createConnectTool(ctx), [20, 20], [600, 400]);
    const created = live(ctx.store.all()).filter((r) => r.id !== 'a');
    expect(created.map((r) => r.type).sort()).toEqual(['link', 'node']);
    expect(ctx.editing.get()).toBe(created.find((r) => r.type === 'node')!.id);
    ctx.history.undo();
    expect(live(ctx.store.all()).map((r) => r.id)).toEqual(['a']);
  });

  it('leaves nothing behind when cancelled', () => {
    const { ctx } = toolHarness([node('a', 0, 0)]);
    const connect = createConnectTool(ctx);
    connect.down(pointer(20, 20));
    connect.move(pointer(300, 300), []);
    connect.cancel();
    expect(ctx.store.all()).toHaveLength(1);
    expect(ctx.live.get().link).toBeNull();
  });
});

describe('pen tool', () => {
  it('records every coalesced sample with pen pressure', () => {
    const { ctx } = toolHarness();
    const penTool = createPenTool(ctx);
    const pen = { kind: 'pen' as const, pressure: 0.8 };
    penTool.down(pointer(0, 0, pen));
    penTool.move(pointer(30, 0, pen), [
      pointer(10, 0, pen),
      pointer(20, 0, pen),
      pointer(30, 0, pen),
    ]);
    expect(ctx.live.get().ink?.count).toBe(4);
    penTool.up(pointer(30, 0, pen));
    const ink = ctx.store.get('new1') as InkRecord;
    expect(ink).toMatchObject({ type: 'ink', pen: true, x: 0, y: 0, w: 30, size: PEN_SIZE });
    const points = decodeInk(ink.points);
    expect(points).toHaveLength(4);
    expect(points[1]![2]).toBeCloseTo(0.8, 2);
    expect(ctx.live.get().ink).toBeNull();
  });

  it('uses a fixed pressure for mouse strokes', () => {
    const { ctx } = toolHarness();
    drive(createPenTool(ctx), [0, 0], [40, 40]);
    const ink = ctx.store.get('new1') as InkRecord;
    expect(ink.pen).toBe(false);
    expect(decodeInk(ink.points)[0]![2]).toBeCloseTo(0.5, 2);
  });

  it('splits a long stroke into several records inside one undo step', () => {
    const { ctx } = toolHarness();
    const penTool = createPenTool(ctx);
    penTool.down(pointer(0, 0));
    const samples = Array.from({ length: 1300 }, (_, i) => pointer(i, Math.sin(i / 10) * 20));
    penTool.move(samples[samples.length - 1]!, samples);
    penTool.up(pointer(1299, 0));
    expect(live(ctx.store.all()).length).toBeGreaterThanOrEqual(3);
    ctx.history.undo();
    expect(live(ctx.store.all())).toHaveLength(0);
  });
});
