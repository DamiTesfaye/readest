import type { DatabaseService } from '@/types/database';
import type { AppService } from '@/types/system';
import type { Anchor, SectionInput } from './types';

export type OutboxMethod = 'POST' | 'PATCH' | 'DELETE';

export interface OutboxOp {
  opId: string;
  layerId: string;
  method: OutboxMethod;
  body: unknown;
  attempts: number;
  nextAt: number;
  createdAt: number;
}

export interface TextLink {
  textId: string;
  familyId: string | null;
  language: string;
  updatedAt: number;
}

export interface LayerRow {
  id: string;
  fileHash: string;
  textId: string | null;
  anchor: Anchor;
  kind: string;
  payload: unknown;
  rev: number | null;
  deleted: boolean;
  error?: string | null;
}

type OutboxRecord = {
  op_id: string;
  layer_id: string;
  method: OutboxMethod;
  body: string;
  attempts: number;
  next_at: number;
  created_at: number;
};

type LayerRecord = {
  id: string;
  file_hash: string;
  text_id: string | null;
  anchor: string;
  kind: string;
  payload: string;
  rev: number | null;
  deleted: number;
  error: string | null;
};

export class MarginsStore {
  private textMapLock: Promise<void> = Promise.resolve();

  private constructor(private readonly db: DatabaseService) {}

  static from(db: DatabaseService): MarginsStore {
    return new MarginsStore(db);
  }

  async getTextLink(fileHash: string): Promise<TextLink | null> {
    const rows = await this.db.select<{
      text_id: string;
      family_id: string | null;
      language: string;
      updated_at: number;
    }>(
      'SELECT text_id, family_id, language, updated_at FROM margin_text_links WHERE file_hash = ?',
      [fileHash],
    );
    const row = rows[0];
    return row
      ? {
          textId: row.text_id,
          familyId: row.family_id,
          language: row.language,
          updatedAt: Number(row.updated_at),
        }
      : null;
  }

  async setTextLink(
    fileHash: string,
    textId: string,
    language: string,
    familyId: string | null = null,
  ): Promise<void> {
    await this.db.execute(
      `INSERT INTO margin_text_links (file_hash, text_id, family_id, language, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (file_hash) DO UPDATE SET text_id = excluded.text_id,
         family_id = excluded.family_id, language = excluded.language, updated_at = excluded.updated_at`,
      [fileHash, textId, familyId, language, Date.now()],
    );
  }

  async getTextMap(fileHash: string): Promise<SectionInput[] | null> {
    const rows = await this.db.select<{ runs: string; breaks: string; skip: number }>(
      'SELECT runs, breaks, skip FROM margin_text_map WHERE file_hash = ? ORDER BY section_idx',
      [fileHash],
    );
    if (rows.length === 0) return null;
    return rows.map((r) => ({
      runs: JSON.parse(r.runs),
      breaks: JSON.parse(r.breaks),
      skip: Number(r.skip) === 1,
    }));
  }

  putTextMap(fileHash: string, sections: SectionInput[]): Promise<void> {
    const run = this.textMapLock.then(async () => {
      await this.db.execute('BEGIN');
      try {
        await this.db.execute('DELETE FROM margin_text_map WHERE file_hash = ?', [fileHash]);
        for (const [i, s] of sections.entries()) {
          await this.db.execute(
            'INSERT INTO margin_text_map (file_hash, section_idx, runs, breaks, skip) VALUES (?, ?, ?, ?, ?)',
            [fileHash, i, JSON.stringify(s.runs), JSON.stringify(s.breaks), s.skip ? 1 : 0],
          );
        }
        await this.db.execute('COMMIT');
      } catch (error) {
        await this.db.execute('ROLLBACK');
        throw error;
      }
    });
    this.textMapLock = run.catch(() => {});
    return run;
  }

  async putLayer(row: LayerRow): Promise<void> {
    await this.db.execute(
      `INSERT INTO margin_layers (id, file_hash, text_id, anchor, kind, payload, rev, deleted, error, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET file_hash = excluded.file_hash, text_id = excluded.text_id,
         anchor = excluded.anchor, kind = excluded.kind, payload = excluded.payload, rev = excluded.rev,
         deleted = excluded.deleted, error = excluded.error, updated_at = excluded.updated_at`,
      [
        row.id,
        row.fileHash,
        row.textId,
        JSON.stringify(row.anchor),
        row.kind,
        JSON.stringify(row.payload),
        row.rev,
        row.deleted ? 1 : 0,
        row.error ?? null,
        Date.now(),
      ],
    );
  }

  async markLayerError(id: string, code: string): Promise<void> {
    await this.db.execute('UPDATE margin_layers SET error = ?, updated_at = ? WHERE id = ?', [
      code,
      Date.now(),
      id,
    ]);
  }

  async layersForFile(fileHash: string): Promise<LayerRow[]> {
    const rows = await this.db.select<LayerRecord>(
      'SELECT id, file_hash, text_id, anchor, kind, payload, rev, deleted, error FROM margin_layers WHERE file_hash = ?',
      [fileHash],
    );
    return rows.map((r) => ({
      id: r.id,
      fileHash: r.file_hash,
      textId: r.text_id,
      anchor: JSON.parse(r.anchor),
      kind: r.kind,
      payload: JSON.parse(r.payload),
      rev: r.rev === null ? null : Number(r.rev),
      deleted: Number(r.deleted) === 1,
      error: r.error,
    }));
  }

  async enqueue(op: Omit<OutboxOp, 'attempts'>): Promise<void> {
    await this.db.execute(
      'INSERT INTO margin_outbox (op_id, layer_id, method, body, next_at, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [op.opId, op.layerId, op.method, JSON.stringify(op.body), op.nextAt, op.createdAt],
    );
  }

  async dueOps(now: number): Promise<OutboxOp[]> {
    const rows = await this.db.select<OutboxRecord>(
      'SELECT op_id, layer_id, method, body, attempts, next_at, created_at FROM margin_outbox WHERE next_at <= ? ORDER BY created_at, op_id',
      [now],
    );
    return rows.map((r) => ({
      opId: r.op_id,
      layerId: r.layer_id,
      method: r.method,
      body: JSON.parse(r.body),
      attempts: Number(r.attempts),
      nextAt: Number(r.next_at),
      createdAt: Number(r.created_at),
    }));
  }

  async ack(opId: string): Promise<void> {
    await this.db.execute('DELETE FROM margin_outbox WHERE op_id = ?', [opId]);
  }

  async reschedule(opId: string, nextAt: number): Promise<void> {
    await this.db.execute(
      'UPDATE margin_outbox SET next_at = ?, attempts = attempts + 1 WHERE op_id = ?',
      [nextAt, opId],
    );
  }

  async getCursor(): Promise<number> {
    const rows = await this.db.select<{ cursor: number }>(
      'SELECT cursor FROM margin_sync WHERE id = 1',
    );
    return rows[0] ? Number(rows[0].cursor) : 0;
  }

  async setCursor(rev: number): Promise<void> {
    await this.db.execute(
      'INSERT INTO margin_sync (id, cursor) VALUES (1, ?) ON CONFLICT (id) DO UPDATE SET cursor = excluded.cursor',
      [rev],
    );
  }
}

let shared: Promise<MarginsStore> | null = null;

export const openMarginsStore = (appService: AppService): Promise<MarginsStore> => {
  if (!shared) {
    const opening = appService
      .openDatabase('margins', 'margins.db', 'Data')
      .then((db) => MarginsStore.from(db));
    shared = opening;
    void opening.catch(() => {
      if (shared === opening) shared = null;
    });
  }
  return shared;
};
