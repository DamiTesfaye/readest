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
  userId: string | null;
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
  contract?: string;
  payload: unknown;
  rev: number | null;
  deleted: boolean;
  error?: string | null;
  userId?: string | null;
  createdAt?: number;
  updatedAt?: number;
}

export interface MarginText {
  textId: string;
  familyId: string | null;
  capped: boolean;
  language: string | null;
  title: string | null;
  author: string | null;
  fetchedAt: number;
}

export interface MarginAsset {
  localId: string;
  userId: string | null;
  remoteId: string | null;
  mime: string;
  data: string | null;
  sha256: string;
  width: number;
  height: number;
  createdAt: number;
}

type TextRecord = {
  text_id: string;
  family_id: string | null;
  capped: number;
  language: string | null;
  title: string | null;
  author: string | null;
  fetched_at: number;
};

type AssetRecord = {
  local_id: string;
  user_id: string | null;
  remote_id: string | null;
  mime: string;
  data: string | null;
  sha256: string;
  width: number;
  height: number;
  created_at: number;
};

type OutboxRecord = {
  op_id: string;
  layer_id: string;
  method: OutboxMethod;
  body: string;
  attempts: number;
  next_at: number;
  created_at: number;
  user_id: string | null;
};

type LayerRecord = {
  user_id: string | null;
  id: string;
  file_hash: string;
  text_id: string | null;
  anchor: string;
  kind: string;
  contract: string;
  payload: string;
  rev: number | null;
  deleted: number;
  error: string | null;
  created_at: number | null;
  updated_at: number;
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

  async allTextIds(): Promise<string[]> {
    const rows = await this.db.select<{ text_id: string }>(
      'SELECT DISTINCT text_id FROM margin_text_links',
    );
    return rows.map((r) => r.text_id);
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
      `INSERT INTO margin_layers (id, file_hash, text_id, anchor, kind, payload, rev, deleted, error, updated_at, user_id, created_at, contract)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET file_hash = excluded.file_hash, text_id = excluded.text_id,
         anchor = excluded.anchor, kind = excluded.kind, payload = excluded.payload, rev = excluded.rev,
         contract = excluded.contract,
         deleted = excluded.deleted, error = excluded.error, updated_at = excluded.updated_at,
         user_id = excluded.user_id,
         created_at = coalesce(margin_layers.created_at, excluded.created_at)`,
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
        row.userId ?? null,
        row.createdAt ?? Date.now(),
        row.contract ?? 'overlay',
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

  async getLayer(id: string): Promise<LayerRow | null> {
    return (await this.layersWhere('id = ?', [id]))[0] ?? null;
  }

  async fileForText(textId: string): Promise<string | null> {
    const rows = await this.db.select<{ file_hash: string }>(
      'SELECT file_hash FROM margin_text_links WHERE text_id = ? ORDER BY updated_at DESC LIMIT 1',
      [textId],
    );
    return rows[0]?.file_hash ?? null;
  }

  layersForFile(fileHash: string, userId: string | null): Promise<LayerRow[]> {
    return this.layersWhere('file_hash = ? AND (user_id IS ? OR user_id IS NULL)', [
      fileHash,
      userId,
    ]);
  }

  layersForReader(fileHash: string, textIds: string[], userId: string | null): Promise<LayerRow[]> {
    const texts = textIds.length ? ` OR text_id IN (${textIds.map(() => '?').join(', ')})` : '';
    return this.layersWhere(`(file_hash = ?${texts}) AND (user_id IS ? OR user_id IS NULL)`, [
      fileHash,
      ...textIds,
      userId,
    ]);
  }

  allLayers(userId: string | null): Promise<LayerRow[]> {
    return this.layersWhere(
      'deleted = 0 AND (user_id IS ? OR user_id IS NULL)',
      [userId],
      'coalesce(created_at, updated_at) DESC',
    );
  }

  private async layersWhere(
    where: string,
    values: (string | null)[],
    orderBy?: string,
  ): Promise<LayerRow[]> {
    const rows = await this.db.select<LayerRecord>(
      `SELECT id, file_hash, text_id, anchor, kind, contract, payload, rev, deleted, error, user_id, created_at, updated_at
       FROM margin_layers WHERE ${where}${orderBy ? ` ORDER BY ${orderBy}` : ''}`,
      values,
    );
    return rows.map((r) => ({
      id: r.id,
      fileHash: r.file_hash,
      textId: r.text_id,
      anchor: JSON.parse(r.anchor),
      kind: r.kind,
      contract: r.contract,
      payload: JSON.parse(r.payload),
      rev: r.rev === null ? null : Number(r.rev),
      deleted: Number(r.deleted) === 1,
      error: r.error,
      userId: r.user_id,
      createdAt: r.created_at === null ? undefined : Number(r.created_at),
      updatedAt: Number(r.updated_at),
    }));
  }

  async enqueue(op: Omit<OutboxOp, 'attempts'>): Promise<void> {
    await this.db.execute(
      'INSERT INTO margin_outbox (op_id, layer_id, method, body, next_at, created_at, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [op.opId, op.layerId, op.method, JSON.stringify(op.body), op.nextAt, op.createdAt, op.userId],
    );
  }

  async dueOps(now: number, userId: string | null): Promise<OutboxOp[]> {
    const rows = await this.db.select<OutboxRecord>(
      `SELECT op_id, layer_id, method, body, attempts, next_at, created_at, user_id FROM margin_outbox o
       WHERE next_at <= ? AND user_id IS ? AND NOT EXISTS (
         SELECT 1 FROM margin_outbox e WHERE e.layer_id = o.layer_id AND e.next_at > ?
           AND (e.created_at < o.created_at OR (e.created_at = o.created_at AND e.op_id < o.op_id)))
       ORDER BY created_at, op_id`,
      [now, userId, now],
    );
    return rows.map((r) => ({
      opId: r.op_id,
      layerId: r.layer_id,
      method: r.method,
      body: JSON.parse(r.body),
      attempts: Number(r.attempts),
      nextAt: Number(r.next_at),
      createdAt: Number(r.created_at),
      userId: r.user_id,
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

  async replaceQueuedPost(layerId: string, body: unknown): Promise<boolean> {
    const result = await this.db.execute(
      "UPDATE margin_outbox SET body = ? WHERE layer_id = ? AND method = 'POST'",
      [JSON.stringify(body), layerId],
    );
    return result.rowsAffected > 0;
  }

  async queuedBody(opId: string): Promise<unknown> {
    const rows = await this.db.select<{ body: string }>(
      'SELECT body FROM margin_outbox WHERE op_id = ?',
      [opId],
    );
    return rows[0] ? JSON.parse(rows[0].body) : undefined;
  }

  async dropQueued(layerId: string): Promise<void> {
    await this.db.execute('DELETE FROM margin_outbox WHERE layer_id = ?', [layerId]);
  }

  async claimUnowned(userId: string): Promise<void> {
    await this.db.execute('UPDATE margin_layers SET user_id = ? WHERE user_id IS NULL', [userId]);
    await this.db.execute('UPDATE margin_outbox SET user_id = ? WHERE user_id IS NULL', [userId]);
    await this.db.execute('UPDATE margin_assets SET user_id = ? WHERE user_id IS NULL', [userId]);
  }

  async putText(t: MarginText): Promise<void> {
    await this.db.execute(
      `INSERT INTO margin_texts (text_id, family_id, capped, language, title, author, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (text_id) DO UPDATE SET family_id = excluded.family_id, capped = excluded.capped,
         language = excluded.language, title = excluded.title, author = excluded.author,
         fetched_at = excluded.fetched_at`,
      [t.textId, t.familyId, t.capped ? 1 : 0, t.language, t.title, t.author, t.fetchedAt],
    );
  }

  async getText(textId: string): Promise<MarginText | null> {
    const rows = await this.db.select<TextRecord>(
      'SELECT text_id, family_id, capped, language, title, author, fetched_at FROM margin_texts WHERE text_id = ?',
      [textId],
    );
    const r = rows[0];
    return r
      ? {
          textId: r.text_id,
          familyId: r.family_id,
          capped: Number(r.capped) === 1,
          language: r.language,
          title: r.title,
          author: r.author,
          fetchedAt: Number(r.fetched_at),
        }
      : null;
  }

  async familyTextIds(familyId: string): Promise<string[]> {
    const rows = await this.db.select<{ text_id: string }>(
      'SELECT text_id FROM margin_texts WHERE family_id = ?',
      [familyId],
    );
    return rows.map((r) => r.text_id);
  }

  async putAsset(a: MarginAsset): Promise<void> {
    await this.db.execute(
      `INSERT INTO margin_assets (local_id, user_id, remote_id, mime, data, sha256, width, height, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (local_id) DO UPDATE SET user_id = excluded.user_id, remote_id = excluded.remote_id,
         mime = excluded.mime, data = excluded.data, sha256 = excluded.sha256,
         width = excluded.width, height = excluded.height`,
      [a.localId, a.userId, a.remoteId, a.mime, a.data, a.sha256, a.width, a.height, a.createdAt],
    );
  }

  getAsset(localId: string): Promise<MarginAsset | null> {
    return this.assetWhere('local_id = ?', localId);
  }

  assetByRemote(remoteId: string): Promise<MarginAsset | null> {
    return this.assetWhere('remote_id = ?', remoteId);
  }

  async setAssetRemote(localId: string, remoteId: string): Promise<void> {
    await this.db.execute('UPDATE margin_assets SET remote_id = ? WHERE local_id = ?', [
      remoteId,
      localId,
    ]);
  }

  private async assetWhere(where: string, value: string): Promise<MarginAsset | null> {
    const rows = await this.db.select<AssetRecord>(
      `SELECT local_id, user_id, remote_id, mime, data, sha256, width, height, created_at
       FROM margin_assets WHERE ${where}`,
      [value],
    );
    const r = rows[0];
    return r
      ? {
          localId: r.local_id,
          userId: r.user_id,
          remoteId: r.remote_id,
          mime: r.mime,
          data: r.data,
          sha256: r.sha256,
          width: Number(r.width),
          height: Number(r.height),
          createdAt: Number(r.created_at),
        }
      : null;
  }

  async getCursor(userId: string): Promise<number> {
    const rows = await this.db.select<{ cursor: number }>(
      'SELECT cursor FROM margin_sync WHERE user_id = ?',
      [userId],
    );
    return rows[0] ? Number(rows[0].cursor) : 0;
  }

  async setCursor(userId: string, rev: number): Promise<void> {
    await this.db.execute(
      'INSERT INTO margin_sync (user_id, cursor) VALUES (?, ?) ON CONFLICT (user_id) DO UPDATE SET cursor = excluded.cursor',
      [userId, rev],
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
