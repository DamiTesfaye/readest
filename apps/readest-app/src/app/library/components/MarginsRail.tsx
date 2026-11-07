import { useEffect, useState } from 'react';
import { storedQuote } from '@/app/reader/components/margins/MarginCard';
import { useEnv } from '@/context/EnvContext';
import { useTranslation } from '@/hooks/useTranslation';
import { getSession } from '@/services/ampleread/auth/session';
import { hiddenMargins, onMarginsChanged } from '@/services/margins/margins';
import { type LayerRow, openMarginsStore } from '@/services/margins/store';
import { useLibraryStore } from '@/store/libraryStore';
import type { Book } from '@/types/book';
import TrendingRail from './TrendingRail';

export const RAIL_LIMIT = 8;

export interface MarginsRailProps {
  onSeeAll(): void;
  onOpenMargin(row: LayerRow, bookHash: string): void;
}

export interface YourMargin {
  row: LayerRow;
  book: Book | null;
  title: string | null;
  familyKey: string;
}

export const useKindLabel = () => {
  const _ = useTranslation();
  const labels: Record<string, string> = {
    clip: _('Clip'),
    note: _('Note'),
    translation: _('Translation'),
    artwork: _('Art'),
    sticker: _('Sticker'),
  };
  return (kind: string) => labels[kind] ?? _('Margin');
};

export const useYourMargins = (limit?: number) => {
  const { appService } = useEnv();
  const library = useLibraryStore((s) => s.library);
  const [state, setState] = useState<{ entries: YourMargin[]; signedIn: boolean } | null>(null);

  useEffect(() => {
    if (!appService) return;
    let live = true;
    const load = async () => {
      const store = await openMarginsStore(appService);
      const session = await getSession();
      const hidden = hiddenMargins();
      const rows = (await store.allLayers(session?.me.id ?? null))
        .filter((r) => !hidden.has(r.id))
        .slice(0, limit);
      const byHash = new Map(library.filter((b) => !b.deletedAt).map((b) => [b.hash, b]));
      const entries = await Promise.all(
        rows.map(async (row) => {
          const text = row.textId ? await store.getText(row.textId) : null;
          const linked = row.textId ? await store.fileForText(row.textId) : null;
          const book = byHash.get(row.fileHash) ?? (linked ? byHash.get(linked) : null) ?? null;
          return {
            row,
            book,
            title: book?.title ?? text?.title ?? null,
            familyKey: text?.familyId ?? row.textId ?? row.fileHash,
          };
        }),
      );
      if (live) setState({ entries, signedIn: !!session });
    };
    const reload = () => {
      load().catch(() => console.error('Margins: library read failed'));
    };
    reload();
    const off = onMarginsChanged(reload);
    return () => {
      live = false;
      off();
    };
  }, [appService, library, limit]);

  return state;
};

export function MarginsRail({ onSeeAll, onOpenMargin }: MarginsRailProps) {
  const _ = useTranslation();
  const kindLabel = useKindLabel();
  const state = useYourMargins(RAIL_LIMIT);
  const entries = state?.entries ?? [];

  return (
    <aside aria-label={_('Your Margins')} className='flex flex-col gap-3 p-4'>
      <h2 className='text-base-content text-base font-semibold'>{_('Your Margins')}</h2>
      {state && entries.length === 0 && (
        <p className='text-base-content/60 text-sm'>
          {_('Your Margins show up here. Select a passage in a book and choose Margin.')}
        </p>
      )}
      {entries.length > 0 && (
        <ul className='flex flex-col gap-1'>
          {entries.map(({ row, book, title }) => (
            <li key={row.id}>
              <button
                type='button'
                aria-disabled={book ? undefined : 'true'}
                className='hover:bg-base-200 flex w-full flex-col gap-1 rounded-lg p-2 text-start aria-disabled:opacity-60'
                onClick={() => book && onOpenMargin(row, book.hash)}
              >
                {title && <span className='text-base-content/60 truncate text-xs'>{title}</span>}
                <span className='line-clamp-2 font-serif text-sm'>{storedQuote(row)}</span>
                <span className='text-xs text-[#5B3DF5]'>{kindLabel(row.kind)}</span>
              </button>
              {!book && (
                <p className='text-base-content/50 px-2 text-xs'>
                  {_('Add this book to your library to see the full passage.')}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
      {entries.length > 0 && (
        <button type='button' className='link self-start text-sm' onClick={onSeeAll}>
          {_('See all')}
        </button>
      )}
      {state && !state.signedIn && (
        <div className='bg-base-200 rounded-xl p-3 text-sm'>
          {_('Sign in to keep your Margins on all your devices.')}
        </div>
      )}
      <TrendingRail />
    </aside>
  );
}

export default MarginsRail;
