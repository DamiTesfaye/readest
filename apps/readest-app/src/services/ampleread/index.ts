import { isTauriAppPlatform } from '@/services/environment';
import type { ExploreResponse, WorkDetail } from './types';

export type { ExploreResponse, WorkDetail, Shelf, WorkCard, AuthorRef } from './types';

const DEFAULT_API_BASE = 'https://api.ampleread.com';

const getApiBase = (): string => process.env['NEXT_PUBLIC_AMPLEREAD_API_BASE'] ?? DEFAULT_API_BASE;

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
