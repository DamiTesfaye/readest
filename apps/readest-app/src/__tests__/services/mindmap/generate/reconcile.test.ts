import { describe, expect, it } from 'vitest';
import { type ReconcileDeps, reconcile } from '@/services/mindmap/generate/reconcile';
import type { GenLink, GenNode, GenRecord } from '@/services/mindmap/generate/types';
import { createLinkRecord, createNodeRecord } from '@/services/mindmap/records/defaults';
import type { LinkRecord, MapRecord, NodeRecord } from '@/services/mindmap/schema/types';
import { type Diff, createMapStore } from '@/services/mindmap/store/mapStore';

const anchor = (progress: number) => ({ cfi: `cfi-${progress}`, section: 2, progress });

const chapter = (genKey: string, label: string, progress = 0.2): GenNode => ({
  type: 'node',
  genKey,
  kind: 'chapter',
  label,
  color: 'sky',
  anchor: anchor(progress),
  revealAt: progress,
  parentGenKey: null,
});

const link = (genKey: string, fromGenKey: string, toGenKey: string): GenLink => ({
  type: 'link',
  genKey,
  fromGenKey,
  toGenKey,
  label: '',
});

const generatedNode = (
  id: string,
  genKey: string,
  extra: Partial<NodeRecord> = {},
): NodeRecord => ({
  ...createNodeRecord({
    id,
    index: 'a0',
    x: 480,
    y: 320,
    label: 'Old',
    kind: 'chapter',
    color: 'sky',
  }),
  origin: 'generated',
  genKey,
  anchor: anchor(0.2),
  revealAt: 0.2,
  ...extra,
});

const generatedLink = (
  id: string,
  genKey: string,
  fromId: string,
  toId: string,
  extra: Partial<LinkRecord> = {},
): LinkRecord => ({
  ...createLinkRecord({ id, index: 'a1', fromId, toId }),
  origin: 'generated',
  genKey,
  ...extra,
});

const deps = (): ReconcileDeps => {
  let next = 0;
  return {
    createId: () => `fresh-${(next += 1)}`,
    place: (nodes) => new Map(nodes.map((node, i) => [node.genKey, { x: 16 * i, y: 800 }])),
  };
};

const run = (existing: MapRecord[], generated: GenRecord[]): Diff =>
  reconcile(existing, generated, deps());

const changesOf = (diff: Diff, id: string) =>
  Object.fromEntries(diff.changed.filter((change) => change.id === id).map((c) => [c.field, c.to]));

const EMPTY: Diff = { added: [], changed: [], discarded: [] };

describe('reconcile', () => {
  it('updates a live record only in the fields the reader has not touched', () => {
    const existing = generatedNode('r1', 'toc:a', { touched: ['label', 'x'] });
    const diff = run([existing], [chapter('toc:a', 'Renamed', 0.3)]);
    expect(changesOf(diff, 'r1')).toEqual({ anchor: anchor(0.3), revealAt: 0.3 });
  });

  it('compares anchors by value, so an unchanged book gives an empty diff', () => {
    const diff = run([generatedNode('r1', 'toc:a', { label: 'A' })], [chapter('toc:a', 'A')]);
    expect(diff).toEqual(EMPTY);
  });

  it('adds a new key under a fresh id at the placed position', () => {
    const diff = run([], [chapter('toc:a', 'A')]);
    expect(diff.added).toHaveLength(1);
    expect(diff.added[0]).toMatchObject({
      id: 'fresh-1',
      type: 'node',
      origin: 'generated',
      genKey: 'toc:a',
      label: 'A',
      kind: 'chapter',
      revealAt: 0.2,
      x: 0,
      y: 800,
      touched: [],
      deleted: null,
    });
  });

  it('links new and existing records by record id, never by key', () => {
    const quote: GenNode = { ...chapter('note:1', 'Quote'), kind: 'quote', parentGenKey: 'toc:a' };
    const diff = run(
      [generatedNode('r1', 'toc:a', { label: 'A' })],
      [chapter('toc:a', 'A'), quote, link('link:note:1', 'toc:a', 'note:1')],
    );
    const added = diff.added.find((record) => record.type === 'link') as LinkRecord;
    const quoteId = diff.added.find((record) => record.type === 'node')!.id;
    expect(added).toMatchObject({ fromId: 'r1', toId: quoteId, genKey: 'link:note:1' });
    expect(quoteId).not.toBe('note:1');
  });

  it('tombstones an untouched record whose key is gone and keeps its content', () => {
    const diff = run([generatedNode('r1', 'toc:gone')], []);
    expect(diff.changed).toEqual([{ id: 'r1', field: 'deleted', from: null, to: { by: 'gen' } }]);
    expect(diff.discarded).toEqual([]);
  });

  it('keeps a touched record whose key is gone as the reader own record', () => {
    const diff = run([generatedNode('r1', 'toc:gone', { touched: ['label'] })], []);
    expect(changesOf(diff, 'r1')).toEqual({ origin: 'user', genKey: null });
  });

  it('revives a generator tombstone and restores every generated field', () => {
    const tombstone = generatedNode('r1', 'toc:a', { label: '', deleted: { by: 'gen' } });
    const diff = run([tombstone], [chapter('toc:a', 'Back again', 0.4)]);
    expect(changesOf(diff, 'r1')).toEqual({
      label: 'Back again',
      anchor: anchor(0.4),
      revealAt: 0.4,
      deleted: null,
    });
    expect(diff.changed.at(-1)).toMatchObject({ field: 'deleted', to: null });
  });

  it('revives a generated link with its ends restored', () => {
    const records = [
      generatedNode('c1', 'toc:a', { label: 'A' }),
      generatedNode('q1', 'note:1', { label: 'Q', kind: 'quote' }),
      generatedLink('l1', 'link:note:1', '', '', { deleted: { by: 'gen' } }),
    ];
    const quote: GenNode = { ...chapter('note:1', 'Q'), kind: 'quote', parentGenKey: 'toc:a' };
    const diff = run(records, [
      chapter('toc:a', 'A'),
      quote,
      link('link:note:1', 'toc:a', 'note:1'),
    ]);
    expect(changesOf(diff, 'l1')).toEqual({ fromId: 'c1', toId: 'q1', deleted: null });
  });

  it('creates a fresh link to a chapter revived in the same pass', () => {
    const existing = generatedNode('c1', 'toc:a', { label: '', deleted: { by: 'gen' } });
    const quote: GenNode = { ...chapter('note:1', 'Quote'), kind: 'quote', parentGenKey: 'toc:a' };
    const diff = run(
      [existing],
      [chapter('toc:a', 'Back again'), quote, link('link:note:1', 'toc:a', 'note:1')],
    );
    expect(changesOf(diff, 'c1')).toMatchObject({ label: 'Back again', deleted: null });
    const added = diff.added.find((record) => record.type === 'link') as LinkRecord;
    const quoteId = diff.added.find((record) => record.type === 'node')!.id;
    expect(added).toMatchObject({ fromId: 'c1', toId: quoteId, genKey: 'link:note:1' });
  });

  it('skips creating a fresh link when the chapter end was deleted by the reader', () => {
    const existing = generatedNode('c1', 'toc:a', { deleted: { by: 'user' } });
    const quote: GenNode = { ...chapter('note:1', 'Quote'), kind: 'quote', parentGenKey: 'toc:a' };
    const diff = run(
      [existing],
      [chapter('toc:a', 'A'), quote, link('link:note:1', 'toc:a', 'note:1')],
    );
    expect(diff.added.some((record) => record.type === 'link')).toBe(false);
    expect(diff.added.some((record) => record.genKey === 'note:1')).toBe(true);
  });

  it('leaves a record the reader deleted deleted', () => {
    const deleted = generatedNode('r1', 'toc:a', { deleted: { by: 'user' } });
    expect(run([deleted], [chapter('toc:a', 'A')])).toEqual(EMPTY);
  });

  it('keeps one record per key when two devices generated the same key', () => {
    const diff = run(
      [generatedNode('b', 'toc:a', { label: 'A' }), generatedNode('a', 'toc:a', { label: 'A' })],
      [chapter('toc:a', 'A')],
    );
    expect(diff.changed).toEqual([{ id: 'b', field: 'deleted', from: null, to: { by: 'gen' } }]);
  });

  it('never moves or reorders an existing record', () => {
    const existing = [
      generatedNode('r1', 'toc:a'),
      generatedNode('r2', 'toc:gone'),
      generatedNode('r3', 'toc:b', { deleted: { by: 'gen' } }),
    ];
    const diff = run(existing, [
      chapter('toc:a', 'New'),
      chapter('toc:b', 'B'),
      chapter('toc:c', 'C'),
    ]);
    const layoutFields = ['x', 'y', 'w', 'h', 'index', 'parentId'];
    expect(diff.changed.filter((change) => layoutFields.includes(change.field))).toEqual([]);
    expect(diff.added.map((record) => record.genKey)).toEqual(['toc:c']);
  });

  it('applies to a store as generated changes that leave touched alone', () => {
    const store = createMapStore([generatedNode('r1', 'toc:a')]);
    const sources: string[] = [];
    store.listen((_diff, source) => sources.push(source));
    store.applyGenerated(run(store.all(), [chapter('toc:a', 'New')]));
    expect(sources).toEqual(['generated']);
    expect(store.get('r1')).toMatchObject({ label: 'New', touched: [] });
  });
});

describe('reconcile with keys the generator cannot vouch for', () => {
  it('leaves a missing record alone when its key is not proven gone', () => {
    const existing = [
      generatedNode('q', 'note:n1'),
      generatedNode('touched', 'note:n2', { touched: ['x'] }),
      generatedNode('c', 'toc:a'),
    ];
    const diff = reconcile(existing, [], {
      ...deps(),
      isGone: (genKey) => !genKey.startsWith('note:'),
    });
    expect(diff.changed).toEqual([{ id: 'c', field: 'deleted', from: null, to: { by: 'gen' } }]);
  });
});
