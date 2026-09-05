import { downloadFile } from '@/libs/storage';
import { getFileExtFromMimeType } from '@/libs/document';
import { getFileExtFromPath } from '@/app/opds/utils/opdsUtils';
import { probeFilename } from '@/app/opds/utils/opdsReq';
import { useLibraryStore } from '@/store/libraryStore';
import { ImportError } from '@/services/errors';
import type { Book } from '@/types/book';
import type { AppService } from '@/types/system';

export type DownloadProgress = (progress: { progress: number; total: number }) => void;

export interface DownloadAndImportParams {
  appService: AppService;
  /** Canonical source URL; names the cached file. */
  url: string;
  /** What to actually fetch (a proxied form of `url`); defaults to `url`. */
  downloadUrl?: string;
  headers?: Record<string, string>;
  mediaType?: string;
  onProgress?: DownloadProgress;
  /** Pure replacement for the imported book, applied before the library is persisted. */
  decorate?: (book: Book) => Book;
  /** Side effects that need the imported book before the library is persisted. */
  onImported?: (book: Book) => Promise<void> | void;
}

const cacheFilenameFor = (url: string, mediaType?: string): string => {
  const pathname = decodeURIComponent(new URL(url).pathname);
  const ext = getFileExtFromMimeType(mediaType) || getFileExtFromPath(pathname);
  const basename = pathname.replaceAll('/', '_');
  return ext ? `${basename}.${ext}` : basename;
};

const downloadToCache = async (params: DownloadAndImportParams): Promise<string> => {
  const { appService, url, downloadUrl, headers, mediaType, onProgress } = params;
  const dstFilePath = await appService.resolveFilePath(cacheFilenameFor(url, mediaType), 'Cache');
  const responseHeaders = await downloadFile({
    appService,
    dst: dstFilePath,
    cfp: '',
    url: downloadUrl ?? url,
    headers,
    singleThreaded: true,
    skipSslVerification: true,
    onProgress,
  });
  const probedFilename = await probeFilename(responseHeaders);
  if (!probedFilename) return dstFilePath;
  const renamedPath = await appService.resolveFilePath(probedFilename, 'Cache');
  await appService.copyFile(dstFilePath, 'None', renamedPath, 'None');
  await appService.deleteFile(dstFilePath, 'None');
  return renamedPath;
};

const replaceBook = (library: Book[], previous: Book, next: Book): Book[] => {
  const idx = library.indexOf(previous);
  if (idx < 0) return library;
  return [...library.slice(0, idx), next, ...library.slice(idx + 1)];
};

export const downloadAndImportBook = async (
  params: DownloadAndImportParams,
): Promise<Book | null> => {
  const { appService, decorate, onImported } = params;
  const filePath = await downloadToCache(params);
  const { library, setLibrary } = useLibraryStore.getState();
  let imported: Book | null;
  try {
    imported = await appService.importBook(filePath, library);
  } catch (importError) {
    console.error('Import error:', importError);
    throw new ImportError(importError);
  }
  if (!imported) return null;
  const book = decorate ? decorate(imported) : imported;
  await onImported?.(book);
  const newLibrary = book === imported ? library : replaceBook(library, imported, book);
  setLibrary(newLibrary);
  await appService.saveLibraryBooks(newLibrary);
  return book;
};
