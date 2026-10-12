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
  userId: 'usr_a',
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
    expect((await store.dueOps(100, 'usr_a')).map((o) => o.opId)).toEqual(['a', 'b']);
    await store.reschedule('a', 500);
    const due = await store.dueOps(100, 'usr_a');
    expect(due.map((o) => o.opId)).toEqual(['b']);
    expect(due[0]!.body).toEqual({ kind: 'note' });
    expect((await store.dueOps(500, 'usr_a')).find((o) => o.opId === 'a')!.attempts).toBe(1);
    await store.ack('b');
    expect((await store.dueOps(1000, 'usr_a')).map((o) => o.opId)).toEqual(['a']);
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
    expect(await store.layersForFile('h', 'usr_a')).toMatchObject([
      { id: 'lyr_1', anchor, error: 'excerpt_too_long', deleted: false },
    ]);
    expect(await store.getCursor('usr_a')).toBe(0);
    await store.setCursor('usr_a', 42);
    expect(await store.getCursor('usr_a')).toBe(42);
    expect(await store.getCursor('usr_b')).toBe(0);
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
    expect((await MarginsStore.from(db).dueOps(10, 'usr_a')).map((o) => o.opId)).toEqual([
      'a',
      'b',
    ]);
  });

  it('scopes layers and ops to their account, showing unclaimed rows to anyone', async () => {
    const anchor = { kind: 'span' } as unknown as Anchor;
    const layer = (id: string, userId: string | null) =>
      store.putLayer({
        id,
        fileHash: 'h',
        textId: null,
        anchor,
        kind: 'note',
        payload: {},
        rev: null,
        deleted: false,
        userId,
      });
    await layer('lyr_a', 'usr_a');
    await layer('lyr_b', 'usr_b');
    await layer('lyr_free', null);
    const ids = async (userId: string | null) =>
      (await store.layersForFile('h', userId)).map((l) => l.id).sort();
    expect(await ids('usr_a')).toEqual(['lyr_a', 'lyr_free']);
    expect(await ids('usr_b')).toEqual(['lyr_b', 'lyr_free']);
    expect(await ids(null)).toEqual(['lyr_free']);

    await store.enqueue(op('a', 1));
    await store.enqueue({ ...op('free', 2), userId: null });
    expect((await store.dueOps(10, 'usr_b')).map((o) => o.opId)).toEqual([]);
    await store.claimUnowned('usr_b');
    expect((await store.dueOps(10, 'usr_b')).map((o) => o.opId)).toEqual(['free']);
    expect(await ids('usr_a')).toEqual(['lyr_a']);
    expect(await ids('usr_b')).toEqual(['lyr_b', 'lyr_free']);
  });

  it('keeps unsynced rows and drops ownerless synced ones when going per-account', async () => {
    const legacy = await NodeDatabaseService.open(':memory:');
    await migrate(legacy, getMigrations('margins').slice(0, 1));
    const insertLayer = (id: string, rev: number | null) =>
      legacy.execute(
        `INSERT INTO margin_layers (id, file_hash, text_id, anchor, kind, payload, rev, deleted, updated_at)
         VALUES (?, 'h', 'txt', '{}', 'note', '{}', ?, 0, 0)`,
        [id, rev],
      );
    await insertLayer('lyr_local', null);
    await insertLayer('lyr_synced', 3);
    await insertLayer('lyr_synced_edited', 4);
    await legacy.execute(
      `INSERT INTO margin_outbox (op_id, layer_id, method, body, next_at, created_at)
       VALUES ('op1', 'lyr_local', 'POST', '{}', 0, 1), ('op2', 'lyr_synced_edited', 'PATCH', '{}', 0, 2)`,
    );
    await legacy.execute('INSERT INTO margin_sync (id, cursor) VALUES (1, 4)');

    await migrate(legacy, getMigrations('margins'));
    const migrated = MarginsStore.from(legacy);
    expect((await migrated.layersForFile('h', null)).map((l) => l.id).sort()).toEqual([
      'lyr_local',
      'lyr_synced_edited',
    ]);
    expect((await migrated.dueOps(10, null)).map((o) => o.opId)).toEqual(['op1', 'op2']);
    expect(await migrated.getCursor('usr_a')).toBe(0);
  });
});
