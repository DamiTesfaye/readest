import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import ComposeSurface from '@/app/reader/components/margins/ComposeSurface';
import { isEnvelope, PublicStatus, storedQuote } from '@/app/reader/components/margins/MarginCard';
import { MARGINS_PUBLISH_EVENT } from '@/app/reader/components/margins/PublishSheet';
import { useEnv } from '@/context/EnvContext';
import { useTranslation } from '@/hooks/useTranslation';
import { usedOn } from '@/services/margins/clip';
import { editMargin, scheduleDelete } from '@/services/margins/margins';
import { type ArtworkElement, quoteCost } from '@/services/margins/payload';
import { publicStateOf, unpublishPost, useMyPosts } from '@/services/margins/public/myPosts';
import { type LayerRow, type MarginsStore, openMarginsStore } from '@/services/margins/store';
import { eventDispatcher } from '@/utils/event';
import { useKindLabel, useYourMargins, type YourMargin } from './MarginsRail';

export interface MarginsViewProps {
  onOpenMargin(row: LayerRow, bookHash: string): void;
}

const UNDO_MS = 5000;

const LibraryEdit = ({
  row,
  rows,
  onDone,
}: {
  row: LayerRow;
  rows: LayerRow[];
  onDone(): void;
}) => {
  const { appService } = useEnv();
  const [quota, setQuota] = useState<{ capped: boolean; used: number } | null>(null);
  const [anchor] = useState(() => Promise.resolve(row.anchor));
  useEffect(() => {
    if (!appService) return;
    let live = true;
    openMarginsStore(appService)
      .then(async (store) => {
        const capped = !row.textId || ((await store.getText(row.textId))?.capped ?? true);
        const same = rows.filter((r) =>
          row.textId ? r.textId === row.textId : r.fileHash === row.fileHash && !r.textId,
        );
        if (live) setQuota({ capped, used: usedOn(same, capped, row.id) });
      })
      .catch(() => console.error('Margins: quota read failed'));
    return () => {
      live = false;
    };
  }, [appService, row, rows]);
  if (!quota || !isEnvelope(row.payload)) return null;
  return (
    <ComposeSurface
      initial={row.payload}
      quote={row.anchor.quote}
      liveQuoteText={null}
      capped={quota.capped}
      quoteCost={quoteCost(row.anchor.quote)}
      used={quota.used}
      anchor={anchor}
      onDiscard={onDone}
      onSave={async (envelope) => {
        if (!appService) return;
        await editMargin(await openMarginsStore(appService), row.id, { envelope });
        onDone();
      }}
    />
  );
};

const localBytes = async (store: MarginsStore, row: LayerRow) => {
  const art = isEnvelope(row.payload)
    ? row.payload.elements
        .filter((e): e is ArtworkElement => e.kind === 'artwork')
        .map((e) => e.asset)
    : [];
  const assets = await Promise.all([`scene-${row.id}`, ...art].map((ref) => store.getAsset(ref)));
  return assets.reduce((n, a) => n + ((a?.data?.length ?? 0) * 3) / 4, 0);
};

const groupByFamily = (entries: YourMargin[]) => {
  const groups = new Map<string, YourMargin[]>();
  for (const e of entries) groups.set(e.familyKey, [...(groups.get(e.familyKey) ?? []), e]);
  return [...groups.values()];
};

function MarginsView({ onOpenMargin }: MarginsViewProps) {
  const _ = useTranslation();
  const { appService } = useEnv();
  const kindLabel = useKindLabel();
  const state = useYourMargins();
  const bySize = useSearchParams()?.get('sort') === 'size';
  const [editing, setEditing] = useState<LayerRow | null>(null);
  const [deleted, setDeleted] = useState<{ undo(): void } | null>(null);
  const [sizes, setSizes] = useState<Map<string, number> | null>(null);
  const entries = state?.entries ?? [];
  const { posts } = useMyPosts();

  useEffect(() => {
    if (!bySize || !appService || !state) return;
    let live = true;
    openMarginsStore(appService)
      .then((store) =>
        Promise.all(
          state.entries.map(async (e) => [e.row.id, await localBytes(store, e.row)] as const),
        ),
      )
      .then((pairs) => live && setSizes(new Map(pairs)))
      .catch(() => console.error('Margins: size read failed'));
    return () => {
      live = false;
    };
  }, [bySize, appService, state]);

  const ordered =
    bySize && sizes
      ? [...entries].sort((a, b) => (sizes.get(b.row.id) ?? 0) - (sizes.get(a.row.id) ?? 0))
      : entries;

  useEffect(() => {
    if (!deleted) return;
    const timer = setTimeout(() => setDeleted(null), UNDO_MS);
    return () => clearTimeout(timer);
  }, [deleted]);

  const remove = (row: LayerRow) => {
    if (!appService) return;
    openMarginsStore(appService)
      .then((store) => setDeleted(scheduleDelete(store, row.id)))
      .catch(() => console.error('Margins: delete failed'));
  };

  const unpublish = (row: LayerRow) => {
    const post = publicStateOf(row, posts);
    if (!appService || !('post' in post)) return;
    unpublishPost(
      (m) => appService.ask(m),
      _('Remove this Margin from public view?'),
      post.post,
    ).catch(() => console.error('Margins: unpublish failed'));
  };

  return (
    <div className='mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-8'>
      <h1 className='text-xl font-semibold'>{_('Your Margins')}</h1>
      {state && !state.signedIn && (
        <p className='bg-base-200 rounded-xl p-3 text-sm'>
          {_('Sign in to keep your Margins on all your devices.')}
        </p>
      )}
      {deleted && (
        <p role='status' className='flex items-center gap-2 text-sm'>
          {_('Margin deleted.')}
          <button
            type='button'
            className='link'
            onClick={() => {
              deleted.undo();
              setDeleted(null);
            }}
          >
            {_('Undo')}
          </button>
        </p>
      )}
      {state && entries.length === 0 && (
        <p className='text-base-content/60 text-sm'>
          {_('Your Margins show up here. Select a passage in a book and choose Margin.')}
        </p>
      )}
      {groupByFamily(ordered).map((group) => {
        const lead = group.find((e) => e.book) ?? group[0]!;
        const title = lead.book?.title ?? lead.title ?? _('Unknown book');
        return (
          <section key={lead.familyKey} aria-label={title} className='flex flex-col gap-3'>
            <header className='flex items-center gap-3'>
              {lead.book?.coverImageUrl && (
                <img
                  src={lead.book.coverImageUrl}
                  alt=''
                  className='h-14 w-10 rounded object-cover'
                />
              )}
              <div className='flex flex-col'>
                <h2 className='font-semibold'>{title}</h2>
                <span className='text-base-content/60 text-xs'>
                  {group.length === 1
                    ? _('1 Margin')
                    : _('{{count}} Margins', { count: group.length })}
                </span>
              </div>
            </header>
            <ul className='flex flex-col gap-2'>
              {group.map(({ row, book }) => (
                <li key={row.id} className='bg-base-200/60 flex flex-col gap-2 rounded-xl p-3'>
                  <p className='line-clamp-3 font-serif text-sm'>{storedQuote(row)}</p>
                  <span className='text-xs text-[#5B3DF5]'>{kindLabel(row.kind)}</span>
                  <div className='flex flex-wrap items-center gap-1'>
                    <button
                      type='button'
                      className='btn btn-ghost btn-xs'
                      disabled={!book}
                      onClick={() => book && onOpenMargin(row, book.hash)}
                    >
                      {_('Open in book')}
                    </button>
                    <button
                      type='button'
                      className='btn btn-ghost btn-xs'
                      onClick={() => setEditing(row)}
                    >
                      {_('Edit')}
                    </button>
                    <button
                      type='button'
                      className='btn btn-ghost btn-xs'
                      onClick={() => remove(row)}
                    >
                      {_('Delete')}
                    </button>
                  </div>
                  <PublicStatus
                    state={publicStateOf(row, posts)}
                    onPublish={() =>
                      eventDispatcher.dispatch(MARGINS_PUBLISH_EVENT, { layerId: row.id })
                    }
                    onUnpublish={() => unpublish(row)}
                  />
                  {!book && (
                    <p className='text-base-content/50 text-xs'>
                      {_('Add this book to your library to see the full passage.')}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {editing && (
        <LibraryEdit
          row={editing}
          rows={entries.map((e) => e.row)}
          onDone={() => setEditing(null)}
        />
      )}
    </div>
  );
}

export default MarginsView;
