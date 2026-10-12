import type { BookDoc } from '@/libs/document';
import { installFetch } from '@/services/ampleread';
import { AmpleReadHttpError, amplereadFetch, getSession } from '@/services/ampleread/auth/session';
import type { Book } from '@/types/book';
import type { AppService } from '@/types/system';
import { getPrimaryLanguage } from '@/utils/book';
import { getMarginsCore } from './marginsClient';
import { openMarginsStore, type MarginsStore } from './store';
import { cachedLink, familyCache, loadLink, saveLink, syncMargins } from './sync';
import { buildTextMap } from './textMap';

type Fingerprint = (string[] | null)[];
type TextMatch = { textId: string; confidence: number; relation: string; familyId: string };

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

const link = async (
  store: MarginsStore,
  book: Book,
  bookDoc: BookDoc,
  sections: Fingerprint,
  signedIn: boolean,
) => {
  if (await loadLink(store, book.hash)) return;
  const language = getPrimaryLanguage(bookDoc.metadata.language);
  const { matches } = await post<{ matches: TextMatch[] }>(
    '/v1/texts/match',
    { sections, language },
    signedIn,
  );
  for (const m of matches) familyCache.set(m.textId, m.familyId);
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
  });
  await saveLink(store, book.hash, textId, language, version?.familyId ?? textId);
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
    const signedIn = !!(await getSession());
    await memo(linking, `${book.hash}:${signedIn}`, () =>
      link(store, book, bookDoc, sections, signedIn),
    );
    if (signedIn) await syncMargins(store);
  } catch (error) {
    console.error('Margins: book open failed', error);
  }
};
