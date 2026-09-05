import { isTauriAppPlatform } from '@/services/environment';
import { downloadAndImportBook } from '@/services/bookDownload';
import type { Book } from '@/types/book';
import type { AppService } from '@/types/system';
import { getDownloadUrl, trackEvent } from './index';
import type { AssetView, EditionView } from './types';

const ASSET_MEDIA_TYPES: Record<string, string> = {
  epub: 'application/epub+zip',
  pdf: 'application/pdf',
  mobi: 'application/x-mobipocket-ebook',
  azw3: 'application/vnd.amazon.mobi8-ebook',
};

export const pickDownloadAsset = (edition: EditionView): AssetView | undefined =>
  edition.assets.find((asset) => asset.kind === 'epub') ?? edition.assets[0];

export interface DownloadEditionParams {
  appService: AppService;
  workId: string;
  edition: EditionView;
}

/// Resolves the edition's download URL and hands it to the shared
/// download-and-import path, stamping the book with its AmpleRead origin
/// and recording download + save. Returns null when nothing was imported
/// (no asset, or the web passthrough, which only opens the route).
/// A not-found rejection from getDownloadUrl propagates to the caller.
export const downloadEdition = async ({
  appService,
  workId,
  edition,
}: DownloadEditionParams): Promise<Book | null> => {
  const asset = pickDownloadAsset(edition);
  if (!asset) return null;
  const url = await getDownloadUrl(workId, asset.id);
  if (!isTauriAppPlatform()) {
    window.open(url, '_blank');
    return null;
  }
  const provenance = { workId, editionId: edition.id };
  const book = await downloadAndImportBook({
    appService,
    url,
    mediaType: ASSET_MEDIA_TYPES[asset.kind],
    decorate: (imported) => ({ ...imported, ampleread: provenance }),
  });
  if (!book) return null;
  await trackEvent({ kind: 'download', ...provenance });
  await trackEvent({ kind: 'save', ...provenance });
  return book;
};
