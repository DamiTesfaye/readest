import { describe, expect, it, vi } from 'vitest';
import { createNodeRecord } from '@/services/mindmap/records/defaults';
import type { NodeRecord } from '@/services/mindmap/schema/types';
import {
  type MapStore,
  type RecordPatch,
  createMapStore,
  diffRecords,
  emptyDiff,
  fieldsEqual,
} from '@/services/mindmap/store/mapStore';

const nodeIn = (store: MapStore, id: string): NodeRecord => store.get(id) as NodeRecord;

const generated = (node: NodeRecord): NodeRecord => ({
  ...node,
  origin: 'generated',
  genKey: 'ch1',
});

describe('createMapStore', () => {
  it('put on a new id produces an added diff and is retrievable', () => {
    const store = createMapStore([]);
    const node = createNodeRecord({ id: 'n1', index: 'a0' });
    expect(store.put([node])).toEqual({ added: [node], changed: [], discarded: [] });
    expect(store.get('n1')).toEqual(node);
    expect(store.all()).toEqual([node]);
  });

  it('put on an existing id produces field-level changes', () => {
    const node = createNodeRecord({ id: 'n1', index: 'a0', label: 'old' });
    const store = createMapStore([node]);
    expect(store.put([{ ...node, label: 'new' }])).toEqual({
      added: [],
      changed: [{ id: 'n1', field: 'label', from: 'old', to: 'new' }],
      discarded: [],
    });
  });

  it('returns the same all() array until the records change', () => {
    const store = createMapStore([createNodeRecord({ id: 'n1', index: 'a0' })]);
    const first = store.all();
    expect(store.all()).toBe(first);
    store.update('n1', { label: 'x' });
    expect(store.all()).not.toBe(first);
  });

  it('emits nothing for an unknown id, an unchanged value or an undefined value', () => {
    const store = createMapStore([createNodeRecord({ id: 'n1', index: 'a0', label: 'same' })]);
    const listener = vi.fn();
    store.listen(listener);
    expect(store.update('missing', { label: 'x' })).toEqual(emptyDiff());
    expect(store.update('n1', { label: 'same' })).toEqual(emptyDiff());
    expect(store.update('n1', { label: undefined } as RecordPatch)).toEqual(emptyDiff());
    expect(listener).not.toHaveBeenCalled();
  });

  it('update patches a field and notifies with source local', () => {
    const store = createMapStore([createNodeRecord({ id: 'n1', index: 'a0', label: 'old' })]);
    const listener = vi.fn();
    store.listen(listener);
    const diff = store.update('n1', { label: 'new' });
    expect(diff.changed).toEqual([{ id: 'n1', field: 'label', from: 'old', to: 'new' }]);
    expect(nodeIn(store, 'n1').label).toBe('new');
    expect(listener).toHaveBeenCalledWith(diff, 'local');
  });

  it('remove tombstones a record, keeps its content and skips deleted records', () => {
    const node = createNodeRecord({ id: 'n1', index: 'a0', label: 'keep' });
    const store = createMapStore([node]);
    expect(store.remove(['n1', 'missing'], 'user')).toEqual({
      added: [],
      changed: [{ id: 'n1', field: 'deleted', from: null, to: { by: 'user' } }],
      discarded: [],
    });
    expect(store.get('n1')).toEqual({ ...node, deleted: { by: 'user' } });
    expect(store.remove(['n1'], 'gen')).toEqual(emptyDiff());
  });

  it('discard drops a record without a tombstone', () => {
    const store = createMapStore([createNodeRecord({ id: 'n1', index: 'a0' })]);
    expect(store.discard(['n1', 'missing'])).toEqual({ added: [], changed: [], discarded: ['n1'] });
    expect(store.get('n1')).toBeUndefined();
  });

  it('applyRemote applies changes to known records only and tags them remote', () => {
    const store = createMapStore([createNodeRecord({ id: 'n1', index: 'a0', label: 'mine' })]);
    const listener = vi.fn();
    store.listen(listener);
    store.applyRemote({
      added: [],
      changed: [
        { id: 'n1', field: 'label', from: 'stale', to: 'theirs' },
        { id: 'missing', field: 'label', from: '', to: 'x' },
      ],
      discarded: [],
    });
    expect(nodeIn(store, 'n1').label).toBe('theirs');
    expect(store.get('missing')).toBeUndefined();
    expect(listener).toHaveBeenCalledWith(
      {
        added: [],
        changed: [{ id: 'n1', field: 'label', from: 'mine', to: 'theirs' }],
        discarded: [],
      },
      'remote',
    );
  });

  it('applyGenerated tags diffs generated and turns an added existing id into field changes', () => {
    const node = createNodeRecord({ id: 'n1', index: 'a0', label: 'old' });
    const store = createMapStore([node]);
    const listener = vi.fn();
    store.listen(listener);
    store.applyGenerated({ added: [{ ...node, label: 'new' }], changed: [], discarded: [] });
    expect(listener).toHaveBeenCalledWith(
      { added: [], changed: [{ id: 'n1', field: 'label', from: 'old', to: 'new' }], discarded: [] },
      'generated',
    );
  });

  it('adds the fields a local edit changes on a generated record to touched', () => {
    const store = createMapStore([
      generated(createNodeRecord({ id: 'g1', index: 'a0', label: 'Ch 1' })),
      createNodeRecord({ id: 'u1', index: 'a1', label: 'mine' }),
    ]);
    const diff = store.update('g1', { label: 'Renamed', x: 40 });
    store.update('g1', { label: 'Again' });
    store.update('u1', { label: 'still mine' });
    expect(nodeIn(store, 'g1').touched).toEqual(['label', 'x']);
    expect(diff.changed).toContainEqual({
      id: 'g1',
      field: 'touched',
      from: [],
      to: ['label', 'x'],
    });
    expect(nodeIn(store, 'u1').touched).toEqual([]);
  });

  it('leaves touched alone for deletes, remote and generated diffs and local writes to touched', () => {
    const store = createMapStore([generated(createNodeRecord({ id: 'g1', index: 'a0' }))]);
    store.applyGenerated({
      added: [],
      changed: [{ id: 'g1', field: 'label', from: '', to: 'Ch 1' }],
      discarded: [],
    });
    store.applyRemote({
      added: [],
      changed: [{ id: 'g1', field: 'x', from: 0, to: 9 }],
      discarded: [],
    });
    store.setFields([{ id: 'g1', field: 'touched', from: [], to: ['label'] }]);
    store.remove(['g1'], 'user');
    expect(nodeIn(store, 'g1').touched).toEqual([]);
  });

  it('listen returns an unsubscribe function', () => {
    const store = createMapStore([]);
    const listener = vi.fn();
    const unsubscribe = store.listen(listener);
    unsubscribe();
    store.put([createNodeRecord({ id: 'n1', index: 'a0' })]);
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('fieldsEqual', () => {
  it('compares nested values regardless of key order', () => {
    expect(fieldsEqual({ a: 1, b: { c: [1, 2] } }, { b: { c: [1, 2] }, a: 1 })).toBe(true);
    expect(fieldsEqual({ a: 1 }, { a: 2 })).toBe(false);
    expect(fieldsEqual([1, 2], { 0: 1, 1: 2 })).toBe(false);
    expect(fieldsEqual(null, {})).toBe(false);
  });
});

describe('diffRecords', () => {
  it('reports added, changed and discarded records between two snapshots', () => {
    const a = createNodeRecord({ id: 'a', index: 'a0', label: 'x' });
    const b = createNodeRecord({ id: 'b', index: 'a1' });
    const c = createNodeRecord({ id: 'c', index: 'a2' });
    expect(diffRecords([a, b], [{ ...a, label: 'y' }, c])).toEqual({
      added: [c],
      changed: [{ id: 'a', field: 'label', from: 'x', to: 'y' }],
      discarded: ['b'],
    });
  });
});
