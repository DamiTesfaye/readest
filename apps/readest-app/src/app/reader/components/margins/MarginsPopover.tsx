import clsx from 'clsx';
import { PiPlayCircle } from 'react-icons/pi';
import { useCallback, useEffect, useRef, useState } from 'react';
import PopoverTitleBar from '@/components/PopoverTitleBar';
import ToolbarPopover from '@/components/ToolbarPopover';
import { useEnv } from '@/context/EnvContext';
import { saveViewSettings } from '@/helpers/settings';
import { useTranslation } from '@/hooks/useTranslation';
import { getSession } from '@/services/ampleread/auth/session';
import { createAnchor, liveRange } from '@/services/margins/anchorBridge';
import { marginsContext } from '@/services/margins/context';
import {
  editMargin,
  hiddenMargins,
  onMarginsChanged,
  retryMargin,
  scheduleDelete,
} from '@/services/margins/margins';
import type { Placement } from '@/services/margins/painter';
import { type Envelope, quoteCost } from '@/services/margins/payload';
import { type LayerRow, type MarginsStore, openMarginsStore } from '@/services/margins/store';
import { cachedLink } from '@/services/margins/sync';
import { readerTextIds } from '@/services/margins/texts';
import type { Anchor } from '@/services/margins/types';
import { useBookDataStore } from '@/store/bookDataStore';
import { useReaderStore } from '@/store/readerStore';
import type { MarginsDisplay } from '@/types/book';
import { eventDispatcher } from '@/utils/event';
import type { PopoverPlacement } from '@/utils/popover';
import type { Rect } from '@/utils/sel';
import { getMarginsPainter, MARGINS_PLACED_EVENT } from '../../hooks/useMarginsPainter';
import { useMarginsQuota } from './ClipSheet';
import ComposeSurface from './ComposeSurface';
import MarginCard, { isEnvelope, storedQuote } from './MarginCard';

export const MARGINS_POPOVER_WIDTH = 340;
const MAX_POPOVER_HEIGHT = 520;
const UNDO_MS = 5000;

interface MarginsPopoverProps {
  bookKey: string;
  isOpen: boolean;
  anchorEl: HTMLElement | null;
  getPlacement?: (anchorRect: Rect, viewport: Rect) => PopoverPlacement;
  focusId?: string | null;
  onClose: () => void;
}

type Placed = Extract<Placement, { kind: 'placed' }>;

export const EditMargin = ({
  bookKey,
  row,
  anchor,
  onDone,
}: {
  bookKey: string;
  row: LayerRow;
  anchor: Promise<Anchor>;
  onDone(): void;
}) => {
  const { appService } = useEnv();
  const quota = useMarginsQuota(bookKey, row.id);
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
      onSave={async (envelope: Envelope) => {
        if (!appService) return;
        await editMargin(await openMarginsStore(appService), row.id, { envelope });
        onDone();
      }}
    />
  );
};

const MarginsPopover: React.FC<MarginsPopoverProps> = ({
  bookKey,
  isOpen,
  anchorEl,
  getPlacement,
  focusId,
  onClose,
}) => {
  const _ = useTranslation();
  const { envConfig, appService } = useEnv();
  const view = useReaderStore((s) => s.getView(bookKey));
  const saved = useReaderStore((s) => s.getViewSettings(bookKey)?.marginsDisplay) ?? 'full';
  const bookData = useBookDataStore((s) => s.getBookData(bookKey));
  const [display, setDisplay] = useState<MarginsDisplay>(saved);
  const [rows, setRows] = useState<LayerRow[]>([]);
  const [placements, setPlacements] = useState<ReadonlyMap<string, Placement>>(new Map());
  const [signedIn, setSignedIn] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [announce, setAnnounce] = useState('');
  const [deleted, setDeleted] = useState<{ undo(): void } | null>(null);
  const [editing, setEditing] = useState<{ row: LayerRow; anchor: Promise<Anchor> } | null>(null);
  const cards = useRef(new Map<string, HTMLDivElement>());

  useEffect(() => setDisplay(saved), [saved]);

  const load = useCallback(async () => {
    const book = bookData?.book;
    if (!appService || !book) return;
    const store = await openMarginsStore(appService);
    const session = await getSession();
    const textIds = await readerTextIds(store, cachedLink(book.hash)?.textId ?? null);
    const hidden = hiddenMargins();
    const all = await store.layersForReader(book.hash, textIds, session?.me.id ?? null);
    setRows(all.filter((r) => !r.deleted && !hidden.has(r.id)));
    setPlacements(new Map(getMarginsPainter(bookKey)?.placements() ?? []));
    setSignedIn(!!session);
  }, [appService, bookData, bookKey]);

  useEffect(() => {
    if (!isOpen) return;
    const reload = () => {
      load().catch(() => console.error('Margins: panel read failed'));
    };
    const onPlaced = (e: CustomEvent) => {
      if (e.detail?.bookKey === bookKey) reload();
    };
    reload();
    const unsubscribe = onMarginsChanged(reload);
    eventDispatcher.on(MARGINS_PLACED_EVENT, onPlaced);
    return () => {
      unsubscribe();
      eventDispatcher.off(MARGINS_PLACED_EVENT, onPlaced);
    };
  }, [isOpen, load, bookKey]);

  useEffect(() => {
    if (isOpen && focusId) setOpenId(focusId);
  }, [isOpen, focusId]);

  useEffect(() => {
    if (openId) cards.current.get(openId)?.focus();
  }, [openId, rows]);

  useEffect(() => {
    if (!deleted) return;
    const timer = setTimeout(() => setDeleted(null), UNDO_MS);
    return () => clearTimeout(timer);
  }, [deleted]);

  const placedRange = async (p: Placed) => {
    const book = bookData?.book;
    const bookDoc = bookData?.bookDoc;
    if (!appService || !view || !book || !bookDoc) return null;
    const store = await openMarginsStore(appService);
    const ctx = marginsContext({ view, book, bookDoc, store });
    await view.goTo(p.section);
    return { store, ctx, range: await liveRange(ctx, p.section, p.start, p.end) };
  };

  const openCard = (row: LayerRow) => {
    setOpenId(row.id);
    setAnnounce(_('Margin: {{quote}}', { quote: storedQuote(row) }));
  };

  const goTo = async (row: LayerRow, p: Placed) => {
    const found = await placedRange(p);
    if (found?.range && view) await view.goTo(view.getCFI(p.section, found.range));
    openCard(row);
  };

  const keepHere = async (row: LayerRow, p: Placed) => {
    const found = await placedRange(p);
    if (!found?.range) return;
    const anchor = await createAnchor(found.ctx, found.range, p.section);
    await editMargin(found.store, row.id, { anchor });
  };

  const withStore = (run: (store: MarginsStore) => unknown) => {
    if (!appService) return;
    openMarginsStore(appService)
      .then(run)
      .catch(() => console.error('Margins: panel action failed'));
  };

  const chooseDisplay = (d: MarginsDisplay) => {
    setDisplay(d);
    saveViewSettings(envConfig, bookKey, 'marginsDisplay', d, false, false);
  };

  const placedOf = (row: LayerRow) => placements.get(row.id);
  const order = (a: LayerRow, b: LayerRow) => {
    const pa = placedOf(a) as Placed;
    const pb = placedOf(b) as Placed;
    return pa.section - pb.section || pa.start - pb.start;
  };
  const placedRows = rows.filter((r) => placedOf(r)?.kind === 'placed').sort(order);
  const pendingRows = rows.filter((r) => !placedOf(r));
  const otherRows = rows.filter((r) => ['gap', 'elsewhere'].includes(placedOf(r)?.kind ?? ''));
  const lostRows = rows.filter((r) => placedOf(r)?.kind === 'detached');

  const card = (row: LayerRow) => {
    const p = placedOf(row);
    const placed = p?.kind === 'placed' ? p : null;
    const fail = () => console.error('Margins: panel action failed');
    return (
      <li key={row.id}>
        {p?.kind === 'detached' && (
          <p className='text-base-content/60 px-3 pt-2 text-xs'>
            {_("We couldn't find this passage in your copy.")}
          </p>
        )}
        <MarginCard
          ref={(el) => {
            if (el) cards.current.set(row.id, el);
            else cards.current.delete(row.id);
          }}
          row={row}
          placement={p}
          quoteText={null}
          expanded={openId === row.id}
          onGoTo={placed ? () => void goTo(row, placed).catch(fail) : undefined}
          onOpen={placed ? undefined : () => openCard(row)}
          onEdit={() => setEditing({ row, anchor: Promise.resolve(row.anchor) })}
          onDelete={() => withStore((store) => setDeleted(scheduleDelete(store, row.id)))}
          onRetry={() => withStore((store) => retryMargin(store, row.id))}
          onKeepHere={placed ? () => void keepHere(row, placed).catch(fail) : undefined}
          onPlay={
            placed
              ? () => {
                  onClose();
                  eventDispatcher.dispatch('margins-play-enter', { bookKey, layerId: row.id });
                }
              : undefined
          }
        />
      </li>
    );
  };

  const displays: [MarginsDisplay, string][] = [
    ['full', _('Full')],
    ['markers', _('Markers')],
    ['quiet', _('Quiet')],
  ];

  return (
    <>
      <ToolbarPopover
        isOpen={isOpen}
        anchorEl={anchorEl}
        width={MARGINS_POPOVER_WIDTH}
        maxHeight={MAX_POPOVER_HEIGHT}
        getPlacement={getPlacement}
        className='!overflow-hidden'
        onClose={onClose}
      >
        <div className='flex max-h-full flex-col'>
          <div className='bg-base-200 flex shrink-0 flex-col gap-2 px-4 pb-2 pt-4'>
            <PopoverTitleBar title={_('Margins')} showDivider />
            <div className='flex items-center justify-between gap-2'>
              <div role='radiogroup' aria-label={_('Show Margins')} className='join'>
                {displays.map(([d, label]) => (
                  <button
                    key={d}
                    type='button'
                    role='radio'
                    aria-checked={display === d}
                    className={clsx('btn btn-xs join-item', display === d && 'btn-active')}
                    onClick={() => chooseDisplay(d)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <button
                type='button'
                className='btn btn-ghost btn-xs gap-1'
                onClick={() => {
                  onClose();
                  eventDispatcher.dispatch('margins-play-enter', { bookKey });
                }}
              >
                <PiPlayCircle aria-hidden className='h-4 w-4' />
                {_('Play')}
              </button>
            </div>
          </div>
          <div className='no-scrollbar flex min-h-0 flex-col gap-2 overflow-y-auto overscroll-contain px-3 pb-4 pt-2'>
            {!signedIn && (
              <p className='bg-base-200 rounded-lg p-3 text-xs'>
                {_('Sign in to keep your Margins on all your devices.')}
              </p>
            )}
            {deleted && (
              <p role='status' className='flex items-center gap-2 px-1 text-xs'>
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
            {rows.length === 0 && (
              <p className='text-base-content/60 p-3 text-center text-xs'>
                {_('Select a passage and choose Margin to make your first one.')}
              </p>
            )}
            <ul className='flex flex-col gap-1'>{[...placedRows, ...pendingRows].map(card)}</ul>
            {otherRows.length > 0 && (
              <section className='flex flex-col gap-1'>
                <h3 className='popover-title px-1 text-sm'>{_('From another edition')}</h3>
                <p className='text-base-content/60 px-1 text-xs'>
                  {otherRows.length === 1
                    ? _('1 Margin on a passage not in your edition')
                    : _('{{count}} Margins on passages not in your edition', {
                        count: otherRows.length,
                      })}
                </p>
                <ul className='flex flex-col gap-1'>{otherRows.map(card)}</ul>
              </section>
            )}
            {lostRows.length > 0 && (
              <section className='flex flex-col gap-1'>
                <h3 className='popover-title px-1 text-sm'>{_("Couldn't place")}</h3>
                <ul className='flex flex-col gap-1'>{lostRows.map(card)}</ul>
              </section>
            )}
          </div>
          <p aria-live='polite' className='sr-only'>
            {announce}
          </p>
        </div>
      </ToolbarPopover>
      {editing && (
        <EditMargin
          bookKey={bookKey}
          row={editing.row}
          anchor={editing.anchor}
          onDone={() => setEditing(null)}
        />
      )}
    </>
  );
};

export default MarginsPopover;
