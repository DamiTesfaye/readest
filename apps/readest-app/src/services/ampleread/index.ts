import { isTauriAppPlatform } from '@/services/environment';
import type { ClientEvent, EditionView, ExploreResponse, WorkDetail } from './types';

export type {
  AssetView,
  AuthorRef,
  Capabilities,
  ClientEvent,
  ClientEventKind,
  EditionView,
  ExploreResponse,
  Shelf,
  WorkCard,
  WorkDetail,
} from './types';

const DEFAULT_API_BASE = 'https://api.ampleread.com';

export const getApiBase = (): string =>
  process.env['NEXT_PUBLIC_AMPLEREAD_API_BASE'] ?? DEFAULT_API_BASE;

const invokeTauri = async <T>(command: string, args?: Record<string, unknown>): Promise<T> => {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(command, args);
};

const fetchJson = async <T>(path: string): Promise<T> => {
  const response = await fetch(`${getApiBase()}${path}`);
  if (!response.ok) {
    throw new Error(`AmpleRead request failed: ${response.status} ${path}`);
  }
  return (await response.json()) as T;
};

export const getExplore = async (): Promise<ExploreResponse> => {
  if (isTauriAppPlatform()) {
    return invokeTauri<ExploreResponse>('ampleread_explore');
  }
  return fetchJson<ExploreResponse>('/v1/explore');
};

export const getWorkDetail = async (id: string): Promise<WorkDetail> => {
  if (isTauriAppPlatform()) {
    return invokeTauri<WorkDetail>('ampleread_work_detail', { id });
  }
  return fetchJson<WorkDetail>(`/v1/works/${encodeURIComponent(id)}`);
};

export const refresh = async (scope: string): Promise<void> => {
  if (isTauriAppPlatform()) {
    await invokeTauri<void>('ampleread_refresh', { scope });
    return;
  }
  // Web is a passthrough over standard HTTP caching (decision): getExplore
  // and getWorkDetail always hit the network directly, so there is no local
  // mirror to reconcile here.
};

const NOT_FOUND_PATTERN = /not found|\b404\b/i;

export const isNotFoundError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  return NOT_FOUND_PATTERN.test(message);
};

/// Zero-asset editions can report `canDownload: true` (a purged audio
/// edition stays published with no files), so the affordance is gated on
/// the asset list, not the capability alone.
export const canDownloadEdition = (edition: EditionView): boolean =>
  edition.assets.length > 0 && edition.capabilities.canDownload;

export const trackEvent = async (event: ClientEvent): Promise<void> => {
  if (!isTauriAppPlatform()) {
    // Events need the install token the Tauri engine holds; the web
    // passthrough has none, so it records nothing.
    return;
  }
  await invokeTauri<void>('ampleread_track_event', {
    kind: event.kind,
    workId: event.workId,
    editionId: event.editionId,
    props: event.props,
  });
};

export const flushEvents = async (): Promise<number> => {
  if (!isTauriAppPlatform()) {
    return 0;
  }
  return invokeTauri<number>('ampleread_flush_events');
};

export const getDownloadUrl = async (workId: string, assetId: string): Promise<string> => {
  if (isTauriAppPlatform()) {
    return invokeTauri<string>('ampleread_download_url', { workId, assetId });
  }
  return `${getApiBase()}/v1/assets/${encodeURIComponent(assetId)}/download`;
};

const INSTALL_TOKEN_KEY = 'ampleread-install-token';
const INSTALL_HEADER = 'x-ampleread-install';

const mintInstallToken = async (): Promise<string> => {
  const { installToken } = await fetchJson<{ installToken?: string }>('/v1/bootstrap');
  if (!installToken) throw new Error('AmpleRead bootstrap did not mint an install token');
  localStorage.setItem(INSTALL_TOKEN_KEY, installToken);
  return installToken;
};

const getInstallToken = async (fresh: boolean): Promise<string> => {
  if (isTauriAppPlatform()) return invokeTauri<string>('ampleread_install_token', { fresh });
  return (!fresh && localStorage.getItem(INSTALL_TOKEN_KEY)) || mintInstallToken();
};

/// Signed-out calls (text matching) identify the install, not a user. A 401
/// means the server pruned the token, so mint a fresh one and retry once.
export const installFetch = async (path: string, init: RequestInit = {}): Promise<Response> => {
  const send = (token: string) => {
    const headers = new Headers(init.headers);
    headers.set(INSTALL_HEADER, token);
    return fetch(`${getApiBase()}${path}`, { ...init, headers });
  };
  const first = await send(await getInstallToken(false));
  return first.status === 401 ? send(await getInstallToken(true)) : first;
};
