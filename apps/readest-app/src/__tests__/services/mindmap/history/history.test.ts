import { describe, expect, it } from 'vitest';
import { createNodeRecord } from '@/services/mindmap/records/defaults';
import type { NodeRecord } from '@/services/mindmap/schema/types';
import { type MapStore, createMapStore } from '@/services/mindmap/store/mapStore';
import { combineDiffs, createHistory } from '@/services/mindmap/history/history';

const nodeIn = (store: MapStore, id: string): NodeRecord => store.get(id) as NodeRecord;

describe('combineDiffs', () => {
  it('keeps the first from and the last to and drops net-empty fields', () => {
    const combined = combineDiffs([
      { added: [], changed: [{ id: 'n1', field: 'x', from: 0, to: 10 }], discarded: [] },
      { added: [], changed: [{ id: 'n1', field: 'x', from: 10, to: 30 }], discarded: [] },
      { added: [], changed: [{ id: 'n1', field: 'y', from: 5, to: 6 }], discarded: [] },
      { added: [], changed: [{ id: 'n1', field: 'y', from: 6, to: 5 }], discarded: [] },
    ]);
    expect(combined.changed).toEqual([{ id: 'n1', field: 'x', from: 0, to: 30 }]);
  });

  it('folds changes into a record created in the same step', () => {
    const node = createNodeRecord({ id: 'n1', index: 'a0', x: 0 });
    const combined = combineDiffs([
      { added: [node], changed: [], discarded: [] },
      { added: [], changed: [{ id: 'n1', field: 'x', from: 0, to: 40 }], discarded: [] },
    ]);
    expect(combined).toEqual({ added: [{ ...node, x: 40 }], changed: [], discarded: [] });
  });

  it('drops a record created and deleted in the same step', () => {
    const node = createNodeRecord({ id: 'n1', index: 'a0' });
    const combined = combineDiffs([
      { added: [node], changed: [], discarded: [] },
      {
        added: [],
        changed: [{ id: 'n1', field: 'deleted', from: null, to: { by: 'user' } }],
        discarded: [],
      },
    ]);
    expect(combined).toEqual({ added: [], changed: [], discarded: [] });
  });
});

describe('createHistory', () => {
  it('squashes a drag into one undoable step', () => {
    const store = createMapStore([createNodeRecord({ id: 'n1', index: 'a0', x: 0 })]);
    const history = createHistory(store);
    const mark = history.mark();
    store.update('n1', { x: 10 });
    store.update('n1', { x: 20 });
    history.squashToMark(mark);
    expect(history.undo()).toBe(true);
    expect(nodeIn(store, 'n1').x).toBe(0);
    expect(history.redo()).toBe(true);
    expect(nodeIn(store, 'n1').x).toBe(20);
  });

  it('records a local edit made outside any gesture as its own step', () => {
    const store = createMapStore([createNodeRecord({ id: 'n1', index: 'a0', x: 0 })]);
    const history = createHistory(store);
    store.update('n1', { x: 10 });
    expect(history.canUndo()).toBe(true);
    history.undo();
    expect(nodeIn(store, 'n1').x).toBe(0);
  });

  it('bailToMark reverts a gesture without creating a step', () => {
    const store = createMapStore([createNodeRecord({ id: 'n1', index: 'a0', x: 0 })]);
    const history = createHistory(store);
    const mark = history.mark();
    store.update('n1', { x: 99 });
    history.bailToMark(mark);
    expect(nodeIn(store, 'n1').x).toBe(0);
    expect(history.canUndo()).toBe(false);
  });

  it('bailing out of a creating gesture removes the record with no tombstone', () => {
    const store = createMapStore([]);
    const history = createHistory(store);
    const mark = history.mark();
    store.put([createNodeRecord({ id: 'n1', index: 'a0' })]);
    store.update('n1', { x: 50 });
    history.bailToMark(mark);
    expect(store.get('n1')).toBeUndefined();
    expect(history.canUndo()).toBe(false);
  });

  it('nests marks and squashes the outer gesture into one step', () => {
    const store = createMapStore([createNodeRecord({ id: 'n1', index: 'a0', x: 0 })]);
    const history = createHistory(store);
    const outer = history.mark();
    store.update('n1', { x: 10 });
    const inner = history.mark();
    store.update('n1', { x: 20 });
    history.squashToMark(inner);
    history.squashToMark(outer);
    history.undo();
    expect(nodeIn(store, 'n1').x).toBe(0);
    expect(history.canUndo()).toBe(false);
  });

  it('undoing a creation tombstones it and redo revives its content', () => {
    const store = createMapStore([]);
    const history = createHistory(store);
    const mark = history.mark();
    store.put([createNodeRecord({ id: 'n1', index: 'a0', label: 'fresh' })]);
    history.squashToMark(mark);
    history.undo();
    expect(store.get('n1')!.deleted).toEqual({ by: 'user' });
    history.redo();
    expect(store.get('n1')!.deleted).toBeNull();
    expect(nodeIn(store, 'n1').label).toBe('fresh');
  });

  it('undoing a delete revives the record with its content', () => {
    const store = createMapStore([createNodeRecord({ id: 'n1', index: 'a0', label: 'keep me' })]);
    const history = createHistory(store);
    const mark = history.mark();
    store.remove(['n1'], 'user');
    history.squashToMark(mark);
    history.undo();
    expect(store.get('n1')!.deleted).toBeNull();
    expect(nodeIn(store, 'n1').label).toBe('keep me');
  });

  it('undoing a delete restores the content captured at delete time after a merge cleared it', () => {
    const store = createMapStore([createNodeRecord({ id: 'n1', index: 'a0', label: 'keep me' })]);
    const history = createHistory(store);
    store.remove(['n1'], 'user');
    store.applyRemote({
      added: [],
      changed: [{ id: 'n1', field: 'label', from: 'keep me', to: '' }],
      discarded: [],
    });
    expect(history.undo()).toBe(true);
    expect(store.get('n1')!.deleted).toBeNull();
    expect(nodeIn(store, 'n1').label).toBe('keep me');
  });

  it('records nothing for a create and delete squashed together', () => {
    const store = createMapStore([createNodeRecord({ id: 'n1', index: 'a0', x: 0 })]);
    const history = createHistory(store);
    const first = history.mark();
    store.update('n1', { x: 10 });
    history.squashToMark(first);
    const second = history.mark();
    store.put([createNodeRecord({ id: 'n2', index: 'a1' })]);
    store.remove(['n2'], 'user');
    history.squashToMark(second);

    expect(history.undo()).toBe(true);
    expect(nodeIn(store, 'n1').x).toBe(0);
    expect(store.get('n2')!.deleted).toEqual({ by: 'user' });
    expect(history.canUndo()).toBe(false);
  });

  it('skips a field a remote merge changed and tries the previous step', () => {
    const store = createMapStore([
      createNodeRecord({ id: 'n1', index: 'a0', x: 0, label: 'start' }),
    ]);
    const history = createHistory(store);
    const first = history.mark();
    store.update('n1', { x: 10 });
    history.squashToMark(first);
    const second = history.mark();
    store.update('n1', { label: 'edited' });
    history.squashToMark(second);
    store.applyRemote({
      added: [],
      changed: [{ id: 'n1', field: 'label', from: 'edited', to: 'remote' }],
      discarded: [],
    });

    expect(history.undo()).toBe(true);
    expect(nodeIn(store, 'n1').label).toBe('remote');
    expect(nodeIn(store, 'n1').x).toBe(0);
  });

  it('undoing an edit of a generated record restores the value and keeps it touched', () => {
    const node = createNodeRecord({ id: 'g1', index: 'a0', label: 'Ch 1' });
    const store = createMapStore([{ ...node, origin: 'generated', genKey: 'ch1' }]);
    const history = createHistory(store);
    store.update('g1', { label: 'Renamed' });
    expect(history.undo()).toBe(true);
    expect(nodeIn(store, 'g1').label).toBe('Ch 1');
    expect(nodeIn(store, 'g1').touched).toEqual(['label']);
  });

  it('redo skips a field a remote merge changed after the undo and tries the next step', () => {
    const store = createMapStore([
      createNodeRecord({ id: 'n1', index: 'a0', x: 0, label: 'start' }),
    ]);
    const history = createHistory(store);
    store.update('n1', { x: 10 });
    store.update('n1', { label: 'edited' });
    history.undo();
    history.undo();
    store.applyRemote({
      added: [],
      changed: [{ id: 'n1', field: 'x', from: 0, to: 99 }],
      discarded: [],
    });

    expect(history.redo()).toBe(true);
    expect(nodeIn(store, 'n1').x).toBe(99);
    expect(nodeIn(store, 'n1').label).toBe('edited');
    expect(history.canRedo()).toBe(false);
  });

  it('never records generated diffs', () => {
    const store = createMapStore([createNodeRecord({ id: 'n1', index: 'a0', label: '' })]);
    const history = createHistory(store);
    store.applyGenerated({
      added: [],
      changed: [{ id: 'n1', field: 'label', from: '', to: 'Chapter 1' }],
      discarded: [],
    });
    expect(history.undo()).toBe(false);
    expect(nodeIn(store, 'n1').label).toBe('Chapter 1');
  });

  it('stops listening after dispose', () => {
    const store = createMapStore([createNodeRecord({ id: 'n1', index: 'a0', x: 0 })]);
    const history = createHistory(store);
    history.dispose();
    store.update('n1', { x: 10 });
    expect(history.canUndo()).toBe(false);
  });
});
