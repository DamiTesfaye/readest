import { describe, expect, it } from 'vitest';
import { createLinkRecord, createNodeRecord } from '@/services/mindmap/records/defaults';
import type { MapRecord, NodeRecord, PositionedRecord } from '@/services/mindmap/schema/types';
import { createMapStore } from '@/services/mindmap/store/mapStore';
import { type CanvasController, createCanvasController } from '@/services/mindmap/tools/controller';
import type { CanvasPointer } from '@/services/mindmap/tools/types';
import { pointer } from './toolHarness';

const setupController = (records: MapRecord[] = [], readOnly = false) => {
  const store = createMapStore(records);
  let next = 0;
  const controller = createCanvasController({
    store,
    camera: { x: 0, y: 0, z: 1 },
    readOnly,
    createId: () => {
      next += 1;
      return `new${next}`;
    },
  });
  controller.viewport.set({ width: 1000, height: 800 });
  return { store, controller };
};

const drag = (
  controller: CanvasController,
  from: [number, number],
  to: [number, number],
  overrides: Partial<CanvasPointer> = {},
): void => {
  controller.pointerDown(pointer(from[0], from[1], overrides));
  controller.pointerMove(pointer((from[0] + to[0]) / 2, (from[1] + to[1]) / 2, overrides), []);
  controller.pointerMove(pointer(to[0], to[1], overrides), []);
  controller.pointerUp(pointer(to[0], to[1], overrides));
};

const node = (id: string, x: number, y: number, index = 'a1') =>
  createNodeRecord({ id, index, x, y, w: 160, h: 64, label: id });
const live = (records: MapRecord[]) => records.filter((r) => r.deleted === null);

describe('pointer routing', () => {
  it('lets touch pan but never draw once a pen has been seen, across gestures', () => {
    const { store, controller } = setupController();
    controller.setTool('pen');
    drag(controller, [0, 0], [30, 30], { kind: 'pen', pressure: 0.6 });
    const inkCount = store.all().length;
    drag(controller, [100, 100], [160, 100], { kind: 'touch', id: 2 });
    drag(controller, [100, 100], [100, 140], { kind: 'touch', id: 3 });
    expect(store.all()).toHaveLength(inkCount);
    expect(controller.camera.get()).toMatchObject({ x: 60, y: 40 });
  });

  it('lets touch draw before any pen is seen', () => {
    const { store, controller } = setupController();
    controller.setTool('pen');
    drag(controller, [0, 0], [30, 30], { kind: 'touch' });
    expect(store.all()).toHaveLength(1);
  });

  it('ignores a second pointer while a gesture is active', () => {
    const { store, controller } = setupController([node('a', 0, 0)]);
    controller.pointerDown(pointer(10, 10));
    controller.pointerDown(pointer(500, 500, { id: 2 }));
    controller.pointerMove(pointer(900, 900, { id: 2 }), []);
    controller.pointerUp(pointer(900, 900, { id: 2 }));
    controller.pointerMove(pointer(42, 10), []);
    controller.pointerUp(pointer(42, 10));
    expect(store.get('a')).toMatchObject({ x: 32, y: 0 });
  });

  it('pans with Space held or the middle button', () => {
    const { controller } = setupController([node('a', 0, 0)]);
    controller.setSpaceHeld(true);
    drag(controller, [10, 10], [30, 10]);
    controller.setSpaceHeld(false);
    drag(controller, [500, 500], [500, 520], { button: 1 });
    expect(controller.camera.get()).toMatchObject({ x: 20, y: 20 });
  });

  it('cancels the running gesture when the tool changes', () => {
    const { store, controller } = setupController([node('a', 0, 0)]);
    controller.pointerDown(pointer(10, 10));
    controller.pointerMove(pointer(300, 300), []);
    controller.setTool('pen');
    expect(store.get('a')).toMatchObject({ x: 0, y: 0 });
    expect(controller.gestureActive()).toBe(false);
  });

  it('tracks the hovered record for mouse pointers only', () => {
    const { controller } = setupController([node('a', 0, 0)]);
    controller.pointerMove(pointer(10, 10), []);
    expect(controller.hover.get()).toBe('a');
    controller.pointerMove(pointer(900, 900), []);
    expect(controller.hover.get()).toBeNull();
    controller.pointerMove(pointer(10, 10, { kind: 'touch' }), []);
    expect(controller.hover.get()).toBeNull();
  });
});

describe('commands', () => {
  it('deletes the selection with its links in one undo step', () => {
    const link = createLinkRecord({ id: 'l', index: 'a3', fromId: 'a', toId: 'b' });
    const { store, controller } = setupController([node('a', 0, 0), node('b', 400, 0, 'a2'), link]);
    controller.selection.set(['a']);
    controller.deleteSelection();
    expect(live(store.all()).map((r) => r.id)).toEqual(['b']);
    expect(controller.selection.get()).toEqual([]);
    controller.undo();
    expect(
      live(store.all())
        .map((r) => r.id)
        .sort(),
    ).toEqual(['a', 'b', 'l']);
    expect((store.get('a') as NodeRecord).label).toBe('a');
  });

  it('adds linked children to the right, stacked below each other', () => {
    const { store, controller } = setupController([node('p', 0, 0)]);
    controller.selection.set(['p']);
    const first = controller.addChild()!;
    expect(store.get(first)).toMatchObject({ x: 256, y: 0 });
    expect(controller.editing.get()).toBe(first);
    controller.selection.set(['p']);
    const second = controller.addChild()!;
    expect((store.get(second) as PositionedRecord).y).toBe(96);
    const links = live(store.all()).filter((r) => r.type === 'link');
    expect(links).toHaveLength(2);
    controller.selection.set([second]);
    expect(controller.selectParent()).toBe('p');
  });

  it('adds a sibling under the same parent', () => {
    const { store, controller } = setupController([node('p', 0, 0)]);
    controller.selection.set(['p']);
    const child = controller.addChild()!;
    controller.selection.set([child]);
    const sibling = controller.addSibling()!;
    expect(
      store.all().some((r) => r.type === 'link' && r.fromId === 'p' && r.toId === sibling),
    ).toBe(true);
    expect((store.get(sibling) as PositionedRecord).y).toBeGreaterThan(
      (store.get(child) as PositionedRecord).y,
    );
  });

  it('never stacks a new node on top of another record', () => {
    const { store, controller } = setupController([node('p', 0, 0), node('blocker', 256, 0, 'a2')]);
    controller.selection.set(['p']);
    const child = controller.addChild()!;
    expect((store.get(child) as PositionedRecord).y).toBeGreaterThanOrEqual(64);
  });

  it('moves focus to the nearest node in the arrow direction', () => {
    const { controller } = setupController([
      node('a', 0, 0),
      node('right', 400, 20, 'a2'),
      node('far', 900, 0, 'a3'),
      node('down', 0, 400, 'a4'),
    ]);
    controller.selection.set(['a']);
    expect(controller.focusDirection('right')).toBe('right');
    expect(controller.selection.get()).toEqual(['right']);
    controller.selection.set(['a']);
    expect(controller.focusDirection('down')).toBe('down');
    expect(controller.focusDirection('down')).toBeNull();
  });

  it('pans the camera so an off-screen record focused by arrow keys ends up inside the viewport', () => {
    const { controller } = setupController([node('a', 0, 0, 'a1'), node('far', 5000, 0, 'a2')]);
    controller.selection.set(['a']);
    expect(controller.focusDirection('right')).toBe('far');
    const bounds = { x: 5000, y: 0, w: 160, h: 64 };
    const visible = controller.camera.viewportBounds(controller.viewport.get());
    expect(visible.x).toBeLessThanOrEqual(bounds.x);
    expect(visible.x + visible.w).toBeGreaterThanOrEqual(bounds.x + bounds.w);
  });

  it('nudges by one grid step, recolours, rekinds and restacks', () => {
    const { store, controller } = setupController([node('a', 0, 0, 'a1'), node('b', 400, 0, 'a2')]);
    controller.selection.set(['a']);
    controller.nudge(1, -1);
    expect(store.get('a')).toMatchObject({ x: 16, y: -16 });
    controller.setColor('sky');
    controller.setKind('character');
    expect(store.get('a')).toMatchObject({ color: 'sky', kind: 'character' });
    controller.bringToFront();
    expect(store.get('a')!.index > store.get('b')!.index).toBe(true);
    controller.sendToBack();
    expect(store.get('a')!.index < store.get('b')!.index).toBe(true);
  });

  it('duplicates the selection with fresh ids and an offset', () => {
    const { store, controller } = setupController([node('a', 0, 0)]);
    controller.selection.set(['a']);
    controller.duplicateSelection();
    expect(store.get('new1')).toMatchObject({
      x: 32,
      y: 32,
      label: 'a',
      origin: 'user',
      genKey: null,
    });
    expect(controller.selection.get()).toEqual(['new1']);
  });

  it('commits edits to the right field and ends editing', () => {
    const { store, controller } = setupController([node('a', 0, 0)]);
    controller.editing.set('a');
    controller.commitEdit('a', 'Elizabeth');
    expect(store.get('a')).toMatchObject({ label: 'Elizabeth' });
    expect(controller.editing.get()).toBeNull();
  });

  it('drops deleted records from the selection after undo', () => {
    const { controller } = setupController();
    controller.setTool('node');
    controller.pointerDown(pointer(0, 0));
    controller.pointerUp(pointer(0, 0));
    controller.undo();
    expect(controller.selection.get()).toEqual([]);
  });

  it('blocks every edit in a read-only map', () => {
    const { store, controller } = setupController([node('a', 0, 0)], true);
    controller.selection.set(['a']);
    controller.setTool('node');
    expect(controller.tool.get()).toBe('select');
    controller.deleteSelection();
    controller.nudge(1, 0);
    controller.commitEdit('a', 'x');
    expect(controller.addChild()).toBeNull();
    expect(store.get('a')).toMatchObject({ x: 0, label: 'a', deleted: null });
  });

  it('zooms around the viewport centre and fits the records', () => {
    const { controller } = setupController([node('a', 0, 0), node('b', 1840, 0, 'a2')]);
    controller.zoomBy(2);
    expect(controller.camera.screenToPage({ x: 500, y: 400 })).toEqual({ x: 500, y: 400 });
    controller.fitView(false);
    expect(controller.camera.get().z).toBeCloseTo((1000 - 96) / 2000, 9);
  });

  it('stops following the store after dispose', () => {
    const { store, controller } = setupController();
    controller.dispose();
    store.put([node('a', 0, 0)]);
    expect(controller.spatial.search({ x: 0, y: 0, w: 10, h: 10 })).toEqual([]);
  });
});

describe('visibility filter', () => {
  const hideHidden = (record: MapRecord): boolean => !record.id.startsWith('hidden');
  const setup = () => {
    const { store, controller } = setupController([
      node('a', 0, 0),
      node('hidden', 400, 0),
      node('b', 800, 0),
      createLinkRecord({ id: 'l', index: 'a2', fromId: 'hidden', toId: 'a', path: 'straight' }),
    ]);
    controller.visible.set(hideHidden);
    return { store, controller };
  };

  it('shows every record by default', () => {
    const { controller } = setupController([node('a', 0, 0)]);
    expect(controller.visible.get()(node('a', 0, 0))).toBe(true);
  });

  it('keeps hidden records and links to them out of search and hit tests', () => {
    const { controller } = setup();
    const everywhere = { x: -5000, y: -5000, w: 10000, h: 10000 };
    expect(controller.spatial.search(everywhere).sort()).toEqual(['a', 'b']);
    expect(controller.spatial.searchLinks(everywhere)).toEqual([]);
    expect(controller.spatial.hitTest({ x: 450, y: 30 }, 4)).toBeNull();
    expect(controller.spatial.hitTest({ x: 250, y: 32 }, 4)).toBeNull();
    controller.visible.set(() => true);
    expect(controller.spatial.hitTest({ x: 450, y: 30 }, 4)).toBe('hidden');
  });

  it('never clicks, hovers or brushes a hidden record', () => {
    const { controller } = setup();
    controller.pointerDown(pointer(450, 30));
    controller.pointerUp(pointer(450, 30));
    expect(controller.selection.get()).toEqual([]);
    controller.pointerMove(pointer(450, 30), []);
    expect(controller.hover.get()).toBeNull();
    drag(controller, [-50, -50], [1200, 200]);
    expect([...controller.selection.get()].sort()).toEqual(['a', 'b']);
  });

  it('skips hidden records when moving focus with the arrows', () => {
    const { controller } = setup();
    controller.selection.set(['a']);
    expect(controller.focusDirection('right')).toBe('b');
  });

  it('does not select a hidden parent', () => {
    const { controller } = setup();
    controller.selection.set(['a']);
    expect(controller.selectParent()).toBeNull();
    expect(controller.selection.get()).toEqual(['a']);
  });

  it('fits the view to the shown records only', () => {
    const { controller } = setupController([node('a', 0, 0), node('hidden', 5000, 5000)]);
    controller.visible.set(hideHidden);
    controller.fitView(false);
    expect(controller.camera.get()).toEqual({ x: 500 - 80, y: 400 - 32, z: 1 });
  });

  it('drops records from the selection, hover and editor when they become hidden', () => {
    const { controller } = setupController([node('a', 0, 0), node('hidden', 400, 0)]);
    controller.selection.set(['a', 'hidden']);
    controller.hover.set('hidden');
    controller.editing.set('hidden');
    controller.visible.set(hideHidden);
    expect(controller.selection.get()).toEqual(['a']);
    expect(controller.hover.get()).toBeNull();
    expect(controller.editing.get()).toBeNull();
  });

  it('does not snap a dragged record to a hidden neighbour', () => {
    const { store, controller } = setupController([node('a', 0, 0), node('hidden', 300, 15)]);
    controller.visible.set(hideHidden);
    drag(controller, [10, 10], [10, 23]);
    expect(store.get('a')).toMatchObject({ y: 16 });
    controller.visible.set(() => true);
    store.update('a', { y: 0 });
    drag(controller, [10, 10], [10, 23]);
    expect(store.get('a')).toMatchObject({ y: 15 });
  });
});

describe('remote and generated changes', () => {
  const deleteRemotely = (store: ReturnType<typeof setupController>['store'], id: string) =>
    store.applyRemote({
      added: [],
      changed: [{ id, field: 'deleted', from: null, to: { by: 'user' } }],
      discarded: [],
    });

  it('drops a remotely deleted record from the selection, hover and label editor', () => {
    const { store, controller } = setupController([node('a', 0, 0), node('b', 400, 0)]);
    controller.selection.set(['a', 'b']);
    controller.hover.set('a');
    controller.editing.set('a');
    deleteRemotely(store, 'a');
    expect(controller.selection.get()).toEqual(['b']);
    expect(controller.hover.get()).toBeNull();
    expect(controller.editing.get()).toBeNull();
  });

  it('drops records a generated diff discards', () => {
    const { store, controller } = setupController([node('a', 0, 0)]);
    controller.selection.set(['a']);
    store.applyGenerated({ added: [], changed: [], discarded: ['a'] });
    expect(controller.selection.get()).toEqual([]);
  });

  it('keeps the selection for remote edits that leave the record live', () => {
    const { store, controller } = setupController([node('a', 0, 0)]);
    const selection = ['a'];
    controller.selection.set(selection);
    store.applyRemote({
      added: [],
      changed: [{ id: 'a', field: 'x', from: 0, to: 40 }],
      discarded: [],
    });
    expect(controller.selection.get()).toBe(selection);
  });
});

describe('reset position', () => {
  const generatedNode = (id: string, x: number, y: number): NodeRecord => ({
    ...node(id, x, y),
    origin: 'generated',
    genKey: `toc:${id}`,
  });

  it('moves a generated record and clears its touched position fields as one undo step', () => {
    const { store, controller } = setupController([generatedNode('g', 0, 0)]);
    store.update('g', { label: 'Renamed' });
    drag(controller, [10, 10], [90, 10]);
    expect(store.get('g')?.touched).toEqual(['label', 'x']);
    controller.resetPosition('g', { x: 320, y: 64 });
    expect(store.get('g')).toMatchObject({ x: 320, y: 64, touched: ['label'] });
    controller.undo();
    expect(store.get('g')).toMatchObject({ x: 80, y: 0, touched: ['label', 'x'] });
    controller.redo();
    expect(store.get('g')).toMatchObject({ x: 320, y: 64, touched: ['label'] });
    controller.undo();
    controller.undo();
    expect(store.get('g')).toMatchObject({ x: 0, label: 'Renamed' });
  });

  it('does nothing on a read-only map', () => {
    const { store, controller } = setupController([generatedNode('g', 0, 0)], true);
    controller.resetPosition('g', { x: 320, y: 64 });
    expect(store.get('g')).toMatchObject({ x: 0, y: 0 });
  });
});
