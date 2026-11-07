import {
  AmpleReadSignedOutError,
  amplereadFetch,
  getSession,
} from '@/services/ampleread/auth/session';
import type { MarginAsset, MarginsStore } from './store';

export class AssetRetryError extends Error {
  constructor(public retryAfterMs?: number) {
    super('Margins: asset upload deferred');
  }
}

const LOCAL = 'local:';
const STORED_MAX_PX = 2048;
const RASTERS = ['image/png', 'image/jpeg'];
const urls = new Map<string, string>();

export const errorCode = async (res: Response): Promise<string> =>
  ((await res.json().catch(() => null)) as { error?: string } | null)?.error ??
  `http_${res.status}`;

const toBase64 = (bytes: Uint8Array) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
};

const fromBase64 = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

const sha256 = async (bytes: Uint8Array<ArrayBuffer>) =>
  Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');

export const keepLocalAsset = async (
  store: MarginsStore,
  asset: Omit<MarginAsset, 'data' | 'sha256'>,
  blob: Blob,
) => {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  await store.putAsset({ ...asset, data: toBase64(bytes), sha256: await sha256(bytes) });
};

export const addLocalAsset = async (
  store: MarginsStore,
  blob: Blob,
  size: { width: number; height: number },
): Promise<string> => {
  const localId = `${LOCAL}${crypto.randomUUID()}`;
  await keepLocalAsset(
    store,
    {
      localId,
      userId: (await getSession())?.me.id ?? null,
      remoteId: null,
      mime: blob.type,
      ...size,
      createdAt: Date.now(),
    },
    blob,
  );
  return localId;
};

type ArtBody = { payload?: { elements?: { kind?: string; asset?: unknown }[] } };

const localRefs = (body: unknown) =>
  new Set(
    ((body as ArtBody | null)?.payload?.elements ?? [])
      .map((e) => (e?.kind === 'artwork' ? e.asset : null))
      .filter((a): a is string => typeof a === 'string' && a.startsWith(LOCAL)),
  );

const upload = async (asset: MarginAsset): Promise<{ id: string } | { error: string }> => {
  let res: Response;
  try {
    res = await amplereadFetch('/v1/layer-assets', {
      method: 'POST',
      headers: { 'content-type': asset.mime },
      body: fromBase64(asset.data!),
    });
  } catch (error) {
    if (error instanceof AmpleReadSignedOutError) throw error;
    throw new AssetRetryError();
  }
  if (res.status === 429 || res.status >= 500) {
    const retryAfter = Number(res.headers.get('retry-after'));
    throw new AssetRetryError(res.status === 429 && retryAfter > 0 ? retryAfter * 1000 : undefined);
  }
  if (!res.ok) return { error: await errorCode(res) };
  return { id: ((await res.json()) as { id: string }).id };
};

const remoteIdFor = async (
  store: MarginsStore,
  ref: string,
  userId: string,
): Promise<{ id: string } | { error: string }> => {
  const asset = await store.getAsset(ref);
  if (!asset || asset.userId !== userId) return { error: 'unknown_asset' };
  if (asset.remoteId) return { id: asset.remoteId };
  if (!asset.data) return { error: 'unknown_asset' };
  const uploaded = await upload(asset);
  if ('id' in uploaded && !(await store.assetByRemote(uploaded.id))) {
    await store.setAssetRemote(ref, uploaded.id);
  }
  return uploaded;
};

export const uploadLocalAsset = remoteIdFor;

export const localAssetBytes = async (
  store: MarginsStore,
  ref: string,
): Promise<Uint8Array | null> => {
  const asset = await store.getAsset(ref);
  return asset?.data ? fromBase64(asset.data) : null;
};

export const uploadAssets = async (
  store: MarginsStore,
  body: unknown,
  userId: string,
): Promise<{ body: unknown } | { error: string }> => {
  const refs = localRefs(body);
  if (refs.size === 0) return { body };
  const remote = new Map<string, string>();
  for (const ref of refs) {
    const found = await remoteIdFor(store, ref, userId);
    if ('error' in found) return found;
    remote.set(ref, found.id);
  }
  const art = body as Required<ArtBody>;
  return {
    body: {
      ...art,
      payload: {
        ...art.payload,
        elements: art.payload.elements?.map((e) =>
          e?.kind === 'artwork' && typeof e.asset === 'string' && remote.has(e.asset)
            ? { ...e, asset: remote.get(e.asset) }
            : e,
        ),
      },
    },
  };
};

const blobOf = (asset: MarginAsset) => new Blob([fromBase64(asset.data!)], { type: asset.mime });

const download = async (store: MarginsStore, ref: string) => {
  try {
    const res = await amplereadFetch(`/v1/layer-assets/${encodeURIComponent(ref)}`);
    if (!res.ok) return null;
    const blob = await res.blob();
    const mime = res.headers.get('content-type') ?? blob.type;
    await keepLocalAsset(
      store,
      {
        localId: ref,
        userId: (await getSession())?.me.id ?? null,
        remoteId: ref,
        mime,
        width: 0,
        height: 0,
        createdAt: Date.now(),
      },
      blob,
    );
    return new Blob([blob], { type: mime });
  } catch {
    return null;
  }
};

export const assetUrl = async (store: MarginsStore, ref: string): Promise<string | null> => {
  const cached = urls.get(ref);
  if (cached) return cached;
  const isLocal = ref.startsWith(LOCAL);
  const local = isLocal ? await store.getAsset(ref) : await store.assetByRemote(ref);
  const blob = local?.data ? blobOf(local) : isLocal ? null : await download(store, ref);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  urls.set(ref, url);
  return url;
};

const loadImage = (url: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Margins: image could not be read'));
    img.src = url;
  });

export const downscale = async (
  file: File,
  maxPx = STORED_MAX_PX,
): Promise<{ blob: Blob; width: number; height: number }> => {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const width = img.naturalWidth || 1;
    const height = img.naturalHeight || 1;
    const scale = Math.min(1, maxPx / Math.max(width, height));
    if (file.type === 'image/svg+xml' || (scale === 1 && RASTERS.includes(file.type))) {
      return { blob: file, width, height };
    }
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const type = file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png';
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.9));
    if (!blob) throw new Error('Margins: image could not be resized');
    return { blob, width: canvas.width, height: canvas.height };
  } finally {
    URL.revokeObjectURL(url);
  }
};
