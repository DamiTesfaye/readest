import { installFetch } from '@/services/ampleread';
import {
  AmpleReadSignedOutError,
  amplereadFetch,
  getSession,
} from '@/services/ampleread/auth/session';
import type { Anchor } from '../types';

export interface PostAuthor {
  handle: string;
  displayName: string;
}

export interface PostBook {
  title: string | null;
  author: string | null;
  workId: string | null;
  capped: boolean;
  findUrl: string | null;
}

export type Display = 'quote' | 'shape' | 'art';

export interface Citation {
  publisher?: string;
  year?: number;
  isbn?: string;
  page?: string;
  chapter?: string;
  percent: number;
}

export type PostAnchor =
  | Anchor
  | (Omit<Anchor, 'quote' | 'context'> & { quote: null; context: null });

export interface PostView {
  id: string;
  layerId: string | null;
  author: PostAuthor;
  textId: string;
  version: number;
  section: number;
  sectionLen: number;
  start: number;
  end: number;
  quote: string | null;
  anchor: PostAnchor;
  payload: unknown;
  cardUrl: string | null;
  language: string;
  status: 'live' | 'hidden';
  book: PostBook;
  mine: boolean;
  display: Display;
  citation: Citation | Record<string, never>;
  sceneAsset: string | null;
  coverAsset: string | null;
  feedEligible: boolean;
  following: boolean;
  createdAt: string;
  updatedAt: string;
}

export type PostLookup =
  | PostView
  | { id: string; status: 'hidden' }
  | { id: string; status: 'gone' };

export interface PostPage {
  posts: PostView[];
  nextCursor: string | null;
}

export interface PostCount {
  start: number;
  end: number;
  count: number;
}

export interface QuoteBudget {
  capped: boolean;
  covered: [number, number][];
  sectionLimit: number;
  sectionCovered: number;
  textLimit: number;
  textCovered: number;
}

export interface MyPost {
  id: string;
  layerId: string;
  version: number;
  layerRev: number;
  status: 'live' | 'hidden' | 'removed' | 'unpublished';
  reason: string | null;
  statusChangedAt: string;
  appealUntil: string | null;
  counterNoticeUntil: string | null;
  cardUrl: string | null;
  appealState: 'none' | 'pending' | 'denied';
  noticeWork: string | null;
}

export interface Profile {
  handle: string;
  displayName: string;
  handleChangedAt: string;
}

export interface PublishBody {
  layerId: string;
  layerRev: number;
  cardAsset: string | null;
  section: number;
  start: number;
  end: number;
  sectionLen: number;
  display?: Display;
  citation?: Citation;
  sceneAsset?: string;
  coverAsset?: string;
}

export interface CounterNoticeBody {
  name: string;
  email: string;
  phone: string;
  address: string;
  statement: string;
  consent: boolean;
  signature: string;
}

export interface TrendingRequest {
  cursor?: string;
  lang: string;
  salt: string;
  owned: string[];
}

export interface QueueReport {
  reason: string;
  text: string | null;
  established: boolean;
  createdAt: string;
}

export interface QueueNotice {
  id: string;
  work: string;
  claimantName: string;
  claimantEmail: string;
  state: string;
  restoreAfter: string | null;
  counter: Record<string, unknown> | null;
}

export interface QueueItem {
  kind: 'csam' | 'notice' | 'appeal' | 'report' | 'none';
  post: PostView | null;
  postId: string;
  status: string;
  cardAsset: string | null;
  reports: QueueReport[];
  notices: QueueNotice[];
  appeal: string | null;
  creator: {
    handle: string;
    posts: number;
    upheldReports: number;
    accountAgeDays: number;
    suspensions: number;
  };
  text: { title: string | null; titleVerified: boolean; capped: boolean; license: string | null };
  createdAt: string;
}

export interface AdminAction {
  action: string;
  reason?: string;
  days?: number | null;
}

export const REPORT_REASONS = [
  'spam',
  'harassment',
  'sexual',
  'violence_self_harm',
  'misinformation',
  'impersonation',
  'other',
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export class PublicApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | null,
    readonly detail: Record<string, unknown> | null,
    readonly retryAfter: number | null,
  ) {
    super(code ?? `AmpleRead request failed: ${status}`);
  }
}

type ErrorJson = { error?: string; detail?: Record<string, unknown> } | null;

const send = async (path: string, init: RequestInit, signedOutOk: boolean) => {
  if (await getSession()) return amplereadFetch(path, init);
  if (!signedOutOk) throw new AmpleReadSignedOutError();
  return installFetch(path, init);
};

export const call = async (path: string, init: RequestInit = {}, signedOutOk = false) => {
  const res = await send(path, init, signedOutOk);
  if (res.ok) return res;
  const body = (await res.json().catch(() => null)) as ErrorJson;
  throw new PublicApiError(
    res.status,
    body?.error ?? null,
    body?.detail ?? null,
    Number(res.headers.get('retry-after')) || null,
  );
};

const callJson = async <T>(path: string, init?: RequestInit, signedOutOk?: boolean) =>
  (await (await call(path, init, signedOutOk)).json()) as T;

const withBody = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

const seg = encodeURIComponent;

const query = (params: Record<string, string | number | undefined>) =>
  new URLSearchParams(
    Object.entries(params).flatMap(([k, v]) => (v === undefined ? [] : [[k, String(v)]])),
  ).toString();

const sectionPath = (textId: string, section: number) =>
  `/v1/texts/${seg(textId)}/sections/${section}`;

const orNullOn = async <T>(status: number, run: () => Promise<T>): Promise<T | null> => {
  try {
    return await run();
  } catch (error) {
    if (error instanceof PublicApiError && error.status === status) return null;
    throw error;
  }
};

const assetUrls = new Map<string, string>();

export const publicApi = {
  profile: () => orNullOn(404, () => callJson<Profile>('/v1/me/profile')),
  saveProfile: (handle: string, displayName: string) =>
    callJson<Profile>('/v1/me/profile', withBody('PUT', { handle, displayName })),
  publish: (body: PublishBody) => callJson<PostView>('/v1/posts', withBody('POST', body)),
  republish: (postId: string, body: PublishBody) =>
    callJson<PostView>(`/v1/posts/${seg(postId)}`, withBody('PUT', body)),
  unpublish: (postId: string) =>
    callJson<PostView>(`/v1/posts/${seg(postId)}`, { method: 'DELETE' }),
  budget: (textId: string, section: number, len: number, postId?: string) =>
    callJson<QuoteBudget>(
      `${sectionPath(textId, section)}/quote-budget?${query({ len, post: postId })}`,
      {},
      true,
    ),
  counts: (textId: string, section: number, len: number) =>
    callJson<PostCount[]>(
      `${sectionPath(textId, section)}/post-counts?${query({ len })}`,
      {},
      true,
    ),
  passages: (
    textId: string,
    section: number,
    len: number,
    start: number,
    end: number,
    cursor?: string,
  ) =>
    callJson<PostPage>(
      `${sectionPath(textId, section)}/passages?${query({ start, end, len, cursor })}`,
      {},
      true,
    ),
  trending: (o: TrendingRequest) =>
    callJson<PostPage>('/v1/feed/trending', withBody('POST', o), true),
  familyFeed: (textId: string, order: 'ranked' | 'book', cursor?: string) =>
    callJson<PostPage>(`/v1/families/${seg(textId)}/feed?${query({ order, cursor })}`, {}, true),
  post: async (postId: string): Promise<PostLookup> =>
    (await orNullOn(410, () => callJson<PostLookup>(`/v1/posts/${seg(postId)}`, {}, true))) ?? {
      id: postId,
      status: 'gone',
    },
  myPosts: () => callJson<MyPost[]>('/v1/me/posts'),
  report: async (postId: string, reason: ReportReason, text?: string) => {
    await call(`/v1/posts/${seg(postId)}/reports`, withBody('POST', { reason, text }), true);
  },
  mute: async (handle: string) => {
    await call(`/v1/me/mutes/${seg(handle)}`, { method: 'PUT' });
  },
  unmute: async (handle: string) => {
    await call(`/v1/me/mutes/${seg(handle)}`, { method: 'DELETE' });
  },
  counterNotice: (postId: string, body: CounterNoticeBody) =>
    callJson<MyPost>(`/v1/posts/${seg(postId)}/counter-notice`, withBody('POST', body)),
  appeal: (postId: string, text: string) =>
    callJson<MyPost>(`/v1/posts/${seg(postId)}/appeal`, withBody('POST', { text })),
  adminQueue: () => callJson<QueueItem[]>('/v1/admin/queue'),
  adminAction: (postId: string, body: AdminAction) =>
    callJson<QueueItem>(`/v1/admin/posts/${seg(postId)}/actions`, withBody('POST', body)),
  postAsset: async (postId: string, assetRef: string): Promise<Blob | null> => {
    const res = await orNullOn(404, () =>
      call(`/v1/posts/${seg(postId)}/assets/${seg(assetRef)}`, {}, true),
    );
    return res ? res.blob() : null;
  },
  postAssetUrl: async (postId: string, assetRef: string): Promise<string | null> => {
    const key = `${postId}/${assetRef}`;
    const cached = assetUrls.get(key);
    if (cached) return cached;
    const blob = await publicApi.postAsset(postId, assetRef);
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    assetUrls.set(key, url);
    return url;
  },
};
