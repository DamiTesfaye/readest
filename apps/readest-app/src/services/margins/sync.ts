import {
  AmpleReadSignedOutError,
  amplereadFetch,
  getSession,
} from '@/services/ampleread/auth/session';
import type { MarginsStore, OutboxMethod, OutboxOp, TextLink } from './store';
import type { Anchor } from './types';

export const MARGINS_LOCAL_FIRST = true;

const MAX_BACKOFF_MS = 15 * 60_000;

export interface LayerView {
  id: string;
  textId: string;
  anchor: Anchor;
  kind: string;
  payload: unknown;
  rev: number;
  deletedAt: string | null;
}

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

const backoff = (attempts: number) =>
  Math.min(2 ** attempts * 1000, MAX_BACKOFF_MS) * (0.8 + Math.random() * 0.4);

const errorCode = async (res: Response) =>
  ((await res.json().catch(() => null)) as { error?: string } | null)?.error ??
  `http_${res.status}`;

export const queueLayerWrite = async (
  store: MarginsStore,
  op: { layerId: string; method: OutboxMethod; body: unknown },
): Promise<void> => {
  if (!MARGINS_LOCAL_FIRST && !(await getSession())) throw new AmpleReadSignedOutError();
  const now = Date.now();
  await store.enqueue({ ...op, opId: crypto.randomUUID(), nextAt: now, createdAt: now });
};

const withTextId = (body: unknown, textId: string | null) => {
  const anchor = (body as { anchor?: Anchor } | null)?.anchor;
  if (!anchor || anchor.textId) return body;
  return textId ? { ...(body as object), anchor: { ...anchor, textId } } : null;
};

const applyLayer = async (store: MarginsStore, view: LayerView) => {
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
  });
};

const sendOp = async (store: MarginsStore, op: OutboxOp) => {
  const layer = await store.getLayer(op.layerId);
  const link = layer ? await store.getTextLink(layer.fileHash) : null;
  const body = op.method === 'DELETE' ? undefined : withTextId(op.body, link?.textId ?? null);
  if (body === null) return null;
  const path = op.method === 'POST' ? '/v1/layers' : `/v1/layers/${encodeURIComponent(op.layerId)}`;
  return amplereadFetch(path, {
    method: op.method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
};

export const flushOutbox = async (store: MarginsStore, now = Date.now()): Promise<number> => {
  let sent = 0;
  const held = new Set<string>();
  for (const op of await store.dueOps(now)) {
    if (held.has(op.layerId)) continue;
    let res: Response | null;
    try {
      res = await sendOp(store, op);
    } catch (error) {
      if (error instanceof AmpleReadSignedOutError) return sent;
      await store.reschedule(op.opId, now + backoff(op.attempts));
      return sent;
    }
    if (!res) {
      held.add(op.layerId);
    } else if (res.ok) {
      await applyLayer(store, (await res.json()) as LayerView);
      await store.ack(op.opId);
      sent++;
    } else if (res.status === 429 || res.status >= 500) {
      const retryAfter = Number(res.headers.get('retry-after'));
      const delay = res.status === 429 && retryAfter > 0 ? retryAfter * 1000 : backoff(op.attempts);
      await store.reschedule(op.opId, now + delay);
      return sent;
    } else {
      await store.markLayerError(op.layerId, await errorCode(res));
      await store.ack(op.opId);
    }
  }
  return sent;
};

export const pullChanges = async (store: MarginsStore): Promise<number> => {
  let pulled = 0;
  let since: number | null = await store.getCursor();
  while (since !== null) {
    const res = await amplereadFetch(`/v1/layers/changes?since=${since}`);
    if (!res.ok) throw new Error(`margins pull failed: ${res.status}`);
    const page = (await res.json()) as { layers: LayerView[]; nextCursor: number | null };
    for (const view of page.layers) await applyLayer(store, view);
    const last = page.layers.at(-1)?.rev;
    if (last !== undefined) await store.setCursor(last);
    pulled += page.layers.length;
    since = page.nextCursor;
  }
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
