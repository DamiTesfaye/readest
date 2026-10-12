import { beforeEach, describe, expect, it } from 'vitest';
import { NodeDatabaseService } from '@/services/database/nodeDatabaseService';
import { migrate } from '@/services/database/migrate';
import { getMigrations } from '@/services/database/migrations';
import type { DatabaseService } from '@/types/database';
import { MarginsStore } from '@/services/margins/store';
import type { Anchor } from '@/services/margins/types';

const op = (opId: string, createdAt: number) => ({
  opId,
  layerId: `lyr_${opId}`,
  method: 'POST' as const,
  body: { kind: 'note' },
  nextAt: 0,
  createdAt,
});

describe('MarginsStore', () => {
  let db: DatabaseService;
  let store: MarginsStore;
  beforeEach(async () => {
    db = await NodeDatabaseService.open(':memory:');
    await migrate(db, getMigrations('margins'));
    store = MarginsStore.from(db);
  });

  it('returns due ops in creation order, reschedules and acks', async () => {
    await store.enqueue(op('b', 20));
    await store.enqueue(op('a', 10));
    expect((await store.dueOps(100)).map((o) => o.opId)).toEqual(['a', 'b']);
    await store.reschedule('a', 500);
    const due = await store.dueOps(100);
    expect(due.map((o) => o.opId)).toEqual(['b']);
    expect(due[0]!.body).toEqual({ kind: 'note' });
    expect((await store.dueOps(500)).find((o) => o.opId === 'a')!.attempts).toBe(1);
    await store.ack('b');
    expect((await store.dueOps(1000)).map((o) => o.opId)).toEqual(['a']);
  });

  it('round-trips the text map', async () => {
    expect(await store.getTextMap('h')).toBeNull();
    const sections = [
      { runs: ['A', 'b'], breaks: [1], skip: false },
      { runs: [], breaks: [], skip: true },
    ];
    await store.putTextMap('h', sections);
    expect(await store.getTextMap('h')).toEqual(sections);
  });

  it('keeps text links, layers and the cursor', async () => {
    expect(await store.getTextLink('h')).toBeNull();
    await store.setTextLink('h', 'txt_1', 'en', 'fam_1');
    expect(await store.getTextLink('h')).toMatchObject({
      textId: 'txt_1',
      language: 'en',
      familyId: 'fam_1',
    });
    const anchor = { kind: 'span' } as unknown as Anchor;
    await store.putLayer({
      id: 'lyr_1',
      fileHash: 'h',
      textId: null,
      anchor,
      kind: 'note',
      payload: {},
      rev: null,
      deleted: false,
    });
    await store.markLayerError('lyr_1', 'excerpt_too_long');
    expect(await store.layersForFile('h')).toMatchObject([
      { id: 'lyr_1', anchor, error: 'excerpt_too_long', deleted: false },
    ]);
    expect(await store.getCursor()).toBe(0);
    await store.setCursor(42);
    expect(await store.getCursor()).toBe(42);
  });

  it('keeps unsynced rows across a later migration', async () => {
    await store.enqueue(op('a', 1));
    await store.enqueue(op('b', 2));
    await migrate(db, [
      ...getMigrations('margins'),
      {
        name: '2099010101_test_add_column',
        sql: 'ALTER TABLE margin_outbox ADD COLUMN note TEXT;',
      },
    ]);
    expect((await MarginsStore.from(db).dueOps(10)).map((o) => o.opId)).toEqual(['a', 'b']);
  });
});
