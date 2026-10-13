import type { BookDoc } from '@/libs/document';
import { installFetch } from '@/services/ampleread';
import { AmpleReadHttpError, amplereadFetch, getSession } from '@/services/ampleread/auth/session';
import type { Book } from '@/types/book';
import type { AppService } from '@/types/system';
import { getPrimaryLanguage } from '@/utils/book';
import { getMarginsCore } from './marginsClient';
import { openMarginsStore, type MarginsStore } from './store';
import { publicApi } from './public/api';
import { requestPostOpen, takePendingOpen } from './public/openPost';
import { cachedLink, familyCache, loadLink, saveLink, syncMargins } from './sync';
import { buildTextMap } from './textMap';
import { rememberMatches } from './texts';

type Fingerprint = (string[] | null)[];
type TextMatch = {
  textId: string;
  confidence: number;
  relation: string;
  familyId: string;
  capped: boolean;
};

const prepared = new Map<string, Promise<Fingerprint>>();
const linking = new Map<string, Promise<void>>();
const pendingFamily = new Map<string, string>();
const ready = new Map<string, { promise: Promise<void>; resolve: () => void }>();

const readyFor = (fileHash: string) => {
  let entry = ready.get(fileHash);
  if (!entry) {
    let resolve!: () => void;
    const promise = new Promise<void>((r) => (resolve = r));
    ready.set(fileHash, (entry = { promise, resolve }));
  }
  return entry;
};

export const marginsBookReady = (fileHash: string): Promise<void> => readyFor(fileHash).promise;

export const inMarginsFamily =
  (fileHash: string) =>
  (textId: string | null): boolean => {
    const link = cachedLink(fileHash);
    const familyId = link?.familyId ?? pendingFamily.get(fileHash);
    return (
      !!textId && !!familyId && textId !== link?.textId && familyCache.get(textId) === familyId
    );
  };

const memo = <T>(cache: Map<string, Promise<T>>, key: string, run: () => Promise<T>) => {
  let pending = cache.get(key);
  if (!pending) {
    const started = run();
    cache.set(key, (pending = started));
    started.catch(() => {
      if (cache.get(key) === started) cache.delete(key);
    });
  }
  return pending;
};

const prepare = (store: MarginsStore, book: Book, bookDoc: BookDoc) =>
  memo(prepared, book.hash, async () => {
    const core = getMarginsCore();
    await core.loadBook(book.hash, await buildTextMap(bookDoc, book, store));
    readyFor(book.hash).resolve();
    return core.fingerprint(book.hash);
  });

const post = async <T>(path: string, body: unknown, signedIn = true): Promise<T> => {
  const res = await (signedIn ? amplereadFetch : installFetch)(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new AmpleReadHttpError(
      res.status,
      await res.json().catch(() => null),
      Number(res.headers.get('retry-after')) || null,
    );
  }
  return res.json() as Promise<T>;
};

const reportedKey = (fileHash: string, userId: string) =>
  `margins-lengths-reported:${fileHash}:${userId}`;

const link = async (
  store: MarginsStore,
  book: Book,
  bookDoc: BookDoc,
  sections: Fingerprint,
  userId: string | null,
) => {
  const signedIn = userId !== null;
  const language = getPrimaryLanguage(bookDoc.metadata.language);
  const sectionLengths = () => getMarginsCore().sectionLengths(book.hash, sections.length);
  if (await loadLink(store, book.hash)) {
    if (!userId || localStorage.getItem(reportedKey(book.hash, userId))) return;
    await post('/v1/texts/match', { sections, language, sectionLengths: await sectionLengths() });
    localStorage.setItem(reportedKey(book.hash, userId), '1');
    return;
  }
  const lengths = await sectionLengths();
  const { matches } = await post<{ matches: TextMatch[] }>(
    '/v1/texts/match',
    { sections, language, sectionLengths: lengths },
    signedIn,
  );
  if (userId) localStorage.setItem(reportedKey(book.hash, userId), '1');
  for (const m of matches) familyCache.set(m.textId, m.familyId);
  await rememberMatches(store, matches);
  const top = matches[0];
  if (top?.relation === 'same') {
    await saveLink(store, book.hash, top.textId, language, top.familyId);
    return;
  }
  const version = top?.relation === 'version' ? top : null;
  if (!signedIn) {
    // Registering needs an account; a later signed-in open re-matches and registers.
    if (version) pendingFamily.set(book.hash, version.familyId);
    return;
  }
  const { textId } = await post<{ textId: string }>('/v1/texts', {
    sections,
    language,
    meta: { title: book.title, author: book.author },
    versionOf: version?.textId ?? null,
    sectionLengths: lengths,
  });
  await saveLink(store, book.hash, textId, language, version?.familyId ?? textId);
  await store.putText({
    textId,
    familyId: version?.familyId ?? textId,
    capped: true,
    language,
    title: book.title,
    author: book.author,
    fetchedAt: Date.now(),
  });
  pendingFamily.delete(book.hash);
};

export const onMarginsBookOpen = async (
  appService: AppService,
  book: Book,
  bookDoc: BookDoc,
): Promise<void> => {
  if (book.format === 'PDF') return;
  try {
    const store = await openMarginsStore(appService);
    const sections = await prepare(store, book, bookDoc);
    const userId = (await getSession())?.me.id ?? null;
    await memo(linking, `${book.hash}:${userId}`, () =>
      link(store, book, bookDoc, sections, userId),
    );
    if (userId) await syncMargins(store);
    const textId = cachedLink(book.hash)?.textId;
    const postId = textId ? takePendingOpen(textId) : null;
    if (postId) {
      const post = await publicApi.post(postId);
      if ('author' in post) requestPostOpen(book.hash, post);
    }
  } catch (error) {
    console.error('Margins: book open failed', error);
  }
};
