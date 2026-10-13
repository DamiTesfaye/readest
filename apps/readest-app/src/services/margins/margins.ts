import { getSession } from '@/services/ampleread/auth/session';
import { type Envelope, leadKind } from './payload';
import type { MarginsStore } from './store';
import { notifyMarginsChanged, queueLayerWrite } from './sync';
import type { Anchor } from './types';

export { onMarginsChanged } from './sync';

export interface MarginDraft {
  fileHash: string;
  anchor: Anchor;
  envelope: Envelope;
}

const DELETE_WINDOW_MS = 5000;
const hidden = new Set<string>();

export const newLayerId = (): string => `lyr_${crypto.randomUUID().replace(/-/g, '')}`;

export const hiddenMargins = (): ReadonlySet<string> => hidden;

export const saveMargin = async (store: MarginsStore, draft: MarginDraft): Promise<string> => {
  const id = newLayerId();
  const { anchor, envelope } = draft;
  const kind = leadKind(envelope);
  await store.putLayer({
    id,
    fileHash: draft.fileHash,
    textId: anchor.textId,
    anchor,
    kind,
    payload: envelope,
    rev: null,
    deleted: false,
    userId: (await getSession())?.me.id ?? null,
    createdAt: Date.now(),
  });
  await queueLayerWrite(store, {
    layerId: id,
    method: 'POST',
    body: { id, anchor, kind, payload: envelope },
  });
  notifyMarginsChanged();
  return id;
};

export const editMargin = async (
  store: MarginsStore,
  id: string,
  change: { anchor?: Anchor; envelope?: Envelope },
): Promise<void> => {
  const row = await store.getLayer(id);
  if (!row) return;
  const anchor = change.anchor ?? row.anchor;
  const payload = change.envelope ?? row.payload;
  const kind = change.envelope ? leadKind(change.envelope) : row.kind;
  await store.putLayer({ ...row, anchor, payload, kind, error: null });
  if (row.rev === null) {
    const body = { id, anchor, kind, payload };
    if (!(await store.replaceQueuedPost(id, body))) {
      await queueLayerWrite(store, { layerId: id, method: 'POST', body });
    }
  } else {
    await queueLayerWrite(store, {
      layerId: id,
      method: 'PATCH',
      body: {
        kind,
        ...(change.anchor && { anchor }),
        ...(change.envelope && { payload }),
      },
    });
  }
  notifyMarginsChanged();
};

export const retryMargin = async (store: MarginsStore, id: string): Promise<void> => {
  const row = await store.getLayer(id);
  if (!row) return;
  await editMargin(store, id, { anchor: row.anchor, envelope: row.payload as Envelope });
};

const deleteNow = async (store: MarginsStore, id: string) => {
  const row = await store.getLayer(id);
  if (row && !row.deleted) {
    await store.putLayer({ ...row, deleted: true });
    if (row.rev === null) await store.dropQueued(id);
    else await queueLayerWrite(store, { layerId: id, method: 'DELETE', body: null });
  }
  hidden.delete(id);
  notifyMarginsChanged();
};

export const scheduleDelete = (
  store: MarginsStore,
  id: string,
  ms = DELETE_WINDOW_MS,
): { undo(): void; flush(): Promise<void> } => {
  let done: Promise<void> | null = null;
  const flush = () => {
    clearTimeout(timer);
    done ??= deleteNow(store, id);
    return done;
  };
  const timer = setTimeout(() => {
    flush().catch(() => console.error('Margins: delete failed'));
  }, ms);
  hidden.add(id);
  notifyMarginsChanged();
  return {
    undo() {
      if (done) return;
      clearTimeout(timer);
      hidden.delete(id);
      notifyMarginsChanged();
    },
    flush,
  };
};
