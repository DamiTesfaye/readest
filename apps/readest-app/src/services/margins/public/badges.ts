import { eventDispatcher } from '@/utils/event';
import { getMarginsCore, type MarginsCore } from '../marginsClient';
import { POSTS_KEY_PREFIX, type PostCluster } from '../painter';
import { publicApi } from './api';
import { byteAt, scalarAt, sectionBytes } from './offsets';

export const MARGINS_OPEN_PASSAGE_EVENT = 'margins-open-passage';

export interface BadgeSource {
  textId: string;
  fileHash: string;
}

export interface OpenPassage {
  bookKey: string;
  textId: string;
  section: number;
  sectionLen: number;
  start: number;
  end: number;
}

const MEMO_MS = 60_000;
const memo = new Map<string, { at: number; clusters: Promise<PostCluster[]> }>();

export const loadClusters = (
  src: BadgeSource,
  core: MarginsCore,
  section: number,
): Promise<PostCluster[]> => {
  const id = `${src.textId}:${src.fileHash}:${section}`;
  const hit = memo.get(id);
  if (hit && Date.now() - hit.at < MEMO_MS) return hit.clusters;
  const clusters = (async () => {
    const bytes = await sectionBytes(core, src.fileHash, section);
    const counts = await publicApi.counts(src.textId, section, scalarAt(bytes, bytes.length));
    return counts.map((c) => ({
      start: byteAt(bytes, c.start),
      end: byteAt(bytes, c.end),
      count: c.count,
      key: `${POSTS_KEY_PREFIX}${section}:${c.start}:${c.end}`,
    }));
  })();
  memo.set(id, { at: Date.now(), clusters });
  clusters.catch(() => memo.delete(id));
  return clusters;
};

export const parsePostsKey = (key: string) => {
  if (!key.startsWith(POSTS_KEY_PREFIX)) return null;
  const parts = key.slice(POSTS_KEY_PREFIX.length).split(':').map(Number);
  if (parts.length !== 3 || !parts.every(Number.isInteger)) return null;
  const [section, start, end] = parts as [number, number, number];
  return { section, start, end };
};

export const openPassage = async (
  src: BadgeSource & { bookKey: string },
  key: string,
): Promise<void> => {
  const span = parsePostsKey(key);
  if (!span) return;
  const bytes = await sectionBytes(getMarginsCore(), src.fileHash, span.section);
  const detail: OpenPassage = {
    bookKey: src.bookKey,
    textId: src.textId,
    sectionLen: scalarAt(bytes, bytes.length),
    ...span,
  };
  await eventDispatcher.dispatch(MARGINS_OPEN_PASSAGE_EVENT, detail);
};
