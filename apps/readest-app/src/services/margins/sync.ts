import {
  AmpleReadSignedOutError,
  amplereadFetch,
  getSession,
} from '@/services/ampleread/auth/session';
import type { MarginsStore, OutboxMethod, OutboxOp, TextLink } from './store';
import { AssetRetryError, errorCode, uploadAssets } from './assets';
import { ensureTexts } from './texts';
import type { Anchor } from './types';

export const MARGINS_LOCAL_FIRST = true;

const MAX_BACKOFF_MS = 15 * 60_000;
let lastQueuedAt = 0;

export interface LayerView {
  id: string;
  textId: string;
  anchor: Anchor;
  kind: string;
  payload: unknown;
  rev: number;
  createdAt: string;
  deletedAt: string | null;
}

const changeListeners = new Set<() => void>();

export const onMarginsChanged = (listener: () => void): (() => void) => {
  changeListeners.add(listener);
  return () => changeListeners.delete(listener);
};

export const notifyMarginsChanged = (): void => {
  for (const listener of [...changeListeners]) listener();
};

const linkCache = new Map<string, Pick<TextLink, 'textId' | 'familyId'>>();
export const familyCache = new Map<string, string>();

export const cachedLink = (fileHash: string) => linkCache.get(fileHash) ?? null;

export const saveLink = async (
  store: MarginsStore,
  fileHash: string,
  textId: string,
  language: string,
  familyId: string | null,
): Promise<void> => {
  await store.setTextLink(fileHash, textId, language, familyId);
  linkCache.set(fileHash, { textId, familyId });
  if (familyId) familyCache.set(textId, familyId);
};

export const loadLink = async (store: MarginsStore, fileHash: string) => {
  const link = await store.getTextLink(fileHash);
  if (link) {
    linkCache.set(fileHash, link);
    if (link.familyId) familyCache.set(link.textId, link.familyId);
  }
  return link;
};

const currentUserId = async () => (await getSession())?.me.id ?? null;

const backoff = (attempts: number) =>
  Math.min(2 ** attempts * 1000, MAX_BACKOFF_MS) * (0.8 + Math.random() * 0.4);

export const queueLayerWrite = async (
  store: MarginsStore,
  op: { layerId: string; method: OutboxMethod; body: unknown },
): Promise<void> => {
  const userId = await currentUserId();
  if (!MARGINS_LOCAL_FIRST && !userId) throw new AmpleReadSignedOutError();
  const now = (lastQueuedAt = Math.max(Date.now(), lastQueuedAt + 1));
  await store.enqueue({ ...op, opId: crypto.randomUUID(), nextAt: now, createdAt: now, userId });
};

const withTextId = (body: unknown, textId: string | null) => {
  const anchor = (body as { anchor?: Anchor } | null)?.anchor;
  if (!anchor || anchor.textId) return body;
  return textId ? { ...(body as object), anchor: { ...anchor, textId } } : null;
};

const applyLayer = async (store: MarginsStore, view: LayerView, userId: string) => {
  const local = await store.getLayer(view.id);
  if (local?.rev != null && local.rev >= view.rev) return;
  const fileHash =
    local?.fileHash ??
    (await store.fileForText(view.textId)) ??
    view.anchor.hint?.file?.fileHash ??
    '';
  const link = fileHash ? await store.getTextLink(fileHash) : null;
  if (local && link && link.textId !== view.textId) {
    await saveLink(store, fileHash, view.textId, link.language, link.familyId);
  }
  await store.putLayer({
    id: view.id,
    fileHash,
    textId: view.textId,
    anchor: view.anchor,
    kind: view.kind,
    payload: view.payload,
    rev: view.rev,
    deleted: view.deletedAt !== null,
    error: null,
    userId,
    createdAt: Date.parse(view.createdAt) || undefined,
  });
};

const sendOp = async (store: MarginsStore, op: OutboxOp, userId: string) => {
  const layer = await store.getLayer(op.layerId);
  const link = layer ? await store.getTextLink(layer.fileHash) : null;
  const linked = op.method === 'DELETE' ? undefined : withTextId(op.body, link?.textId ?? null);
  if (linked === null) return null;
  const prepared =
    linked === undefined ? { body: undefined } : await uploadAssets(store, linked, userId);
  if ('error' in prepared) return prepared;
  const { body } = prepared;
  const path = op.method === 'POST' ? '/v1/layers' : `/v1/layers/${encodeURIComponent(op.layerId)}`;
  return amplereadFetch(path, {
    method: op.method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
};

const settle = async (store: MarginsStore, op: OutboxOp, view: LayerView, userId: string) => {
  const current = op.method === 'POST' ? await store.queuedBody(op.opId) : op.body;
  if (current === undefined) {
    await queueLayerWrite(store, { layerId: op.layerId, method: 'DELETE', body: null });
    return;
  }
  if (JSON.stringify(current) === JSON.stringify(op.body)) {
    await applyLayer(store, view, userId);
    await store.ack(op.opId);
    return;
  }
  const local = await store.getLayer(op.layerId);
  if (local) await store.putLayer({ ...local, rev: view.rev });
  const { id: _id, ...patch } = current as { id: string };
  await store.ack(op.opId);
  await queueLayerWrite(store, { layerId: op.layerId, method: 'PATCH', body: patch });
};

export const flushOutbox = async (store: MarginsStore, now = Date.now()): Promise<number> => {
  const userId = await currentUserId();
  if (!userId) return 0;
  await store.claimUnowned(userId);
  let sent = 0;
  let marked = 0;
  const held = new Set<string>();
  for (const op of await store.dueOps(now, userId)) {
    if (held.has(op.layerId)) continue;
    if ((await currentUserId()) !== userId) break;
    let res: Awaited<ReturnType<typeof sendOp>>;
    try {
      res = await sendOp(store, op, userId);
    } catch (error) {
      if (!(error instanceof AmpleReadSignedOutError)) {
        const wait = error instanceof AssetRetryError ? error.retryAfterMs : undefined;
        await store.reschedule(op.opId, now + (wait ?? backoff(op.attempts)));
      }
      break;
    }
    if (!res) {
      held.add(op.layerId);
    } else if ('error' in res) {
      await store.markLayerError(op.layerId, res.error);
      await store.ack(op.opId);
      marked++;
    } else if (res.ok) {
      await settle(store, op, (await res.json()) as LayerView, userId);
      sent++;
    } else if (res.status === 429 || res.status >= 500) {
      const retryAfter = Number(res.headers.get('retry-after'));
      const delay = res.status === 429 && retryAfter > 0 ? retryAfter * 1000 : backoff(op.attempts);
      await store.reschedule(op.opId, now + delay);
      break;
    } else {
      await store.markLayerError(op.layerId, await errorCode(res));
      await store.ack(op.opId);
      marked++;
    }
  }
  if (sent + marked > 0) notifyMarginsChanged();
  return sent;
};

export const pullChanges = async (store: MarginsStore): Promise<number> => {
  const userId = await currentUserId();
  if (!userId) return 0;
  let pulled = 0;
  const textIds: string[] = [];
  let since: number | null = await store.getCursor(userId);
  while (since !== null) {
    const res = await amplereadFetch(`/v1/layers/changes?since=${since}`);
    if (!res.ok) throw new Error(`margins pull failed: ${res.status}`);
    const page = (await res.json()) as { layers: LayerView[]; nextCursor: number | null };
    if ((await currentUserId()) !== userId) return pulled;
    for (const view of page.layers) {
      await applyLayer(store, view, userId);
      textIds.push(view.textId);
    }
    const last = page.layers.at(-1)?.rev;
    if (last !== undefined) await store.setCursor(userId, last);
    pulled += page.layers.length;
    since = page.nextCursor;
  }
  await ensureTexts(store, textIds);
  if (pulled > 0) notifyMarginsChanged();
  return pulled;
};

let syncing: Promise<void> | null = null;

export const syncMargins = (store: MarginsStore): Promise<void> =>
  (syncing ??= (async () => {
    try {
      await flushOutbox(store);
      await pullChanges(store);
    } finally {
      syncing = null;
    }
  })());
