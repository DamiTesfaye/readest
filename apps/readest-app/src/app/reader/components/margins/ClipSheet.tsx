import clsx from 'clsx';
import { Overlayer } from 'foliate-js/overlayer.js';
import { useEffect, useMemo, useState } from 'react';
import { useEnv } from '@/context/EnvContext';
import { useTranslation } from '@/hooks/useTranslation';
import { getSession } from '@/services/ampleread/auth/session';
import { createAnchor } from '@/services/margins/anchorBridge';
import {
  type ClipUnit,
  clipTooLong,
  type QuotaState,
  quotaState,
  snapClip,
  usedOn,
} from '@/services/margins/clip';
import { marginsContext, refreshCapped } from '@/services/margins/context';
import { hiddenMargins } from '@/services/margins/margins';
import { QUOTE_MAX, scalars } from '@/services/margins/payload';
import { openMarginsStore } from '@/services/margins/store';
import { cachedLink } from '@/services/margins/sync';
import type { Anchor } from '@/services/margins/types';
import { useBookDataStore } from '@/store/bookDataStore';
import { useReaderStore } from '@/store/readerStore';
import { eventDispatcher } from '@/utils/event';
import { CLIP_PREVIEW_KEY } from '../../hooks/useMarginsPainter';

export interface ClipCompose {
  range: Range;
  anchor: Promise<Anchor>;
  unit: ClipUnit;
  prefillNote?: string;
  capped: boolean;
  used: number;
}

export interface ClipSheetProps {
  bookKey: string;
  range: Range;
  index: number;
  prefillNote?: string;
  onClose(): void;
  onCompose(o: ClipCompose): void;
}

export const MARGINS_OPEN_PANEL_EVENT = 'margins-open-panel';
const PREVIEW_COLOR = '#5B3DF5';

type Quota = { capped: boolean; used: number };

export const useMarginsQuota = (bookKey: string, excludeId?: string): Quota | null => {
  const { appService } = useEnv();
  const view = useReaderStore((s) => s.getView(bookKey));
  const bookData = useBookDataStore((s) => s.getBookData(bookKey));
  const [quota, setQuota] = useState<Quota | null>(null);
  useEffect(() => {
    const book = bookData?.book;
    const bookDoc = bookData?.bookDoc;
    if (!appService || !view || !book || !bookDoc) return;
    let live = true;
    (async () => {
      const store = await openMarginsStore(appService);
      const ctx = marginsContext({ view, book, bookDoc, store });
      const capped = await refreshCapped(ctx, store);
      const textId = cachedLink(book.hash)?.textId ?? null;
      const userId = (await getSession())?.me.id ?? null;
      const hidden = hiddenMargins();
      const rows = (await store.layersForReader(book.hash, textId ? [textId] : [], userId)).filter(
        (r) => !hidden.has(r.id) && (r.textId === textId || r.textId === null),
      );
      if (live) setQuota({ capped, used: usedOn(rows, capped, excludeId) });
    })().catch(() => console.error('Margins: quota read failed'));
    return () => {
      live = false;
    };
  }, [appService, view, bookData, excludeId]);
  return quota;
};

const ClipSheet: React.FC<ClipSheetProps> = ({
  bookKey,
  range,
  index,
  prefillNote,
  onClose,
  onCompose,
}) => {
  const _ = useTranslation();
  const { appService } = useEnv();
  const view = useReaderStore((s) => s.getView(bookKey));
  const progress = useReaderStore((s) => s.getProgress(bookKey));
  const bookData = useBookDataStore((s) => s.getBookData(bookKey));
  const quota = useMarginsQuota(bookKey);
  const [unit, setUnit] = useState<ClipUnit>('passage');

  const snapped = useMemo(() => snapClip(range, unit), [range, unit]);
  const text = snapped?.toString() ?? '';
  const quoteChars = scalars(text);
  const tooLong = !!snapped && clipTooLong(snapped);
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const state: QuotaState | null = quota
    ? quotaState({ ...quota, cost: Math.min(quoteChars, QUOTE_MAX), quoteChars })
    : null;

  useEffect(() => {
    const overlayer = view?.renderer.getContents().find((c) => c.index === index)?.overlayer as
      | Overlayer
      | undefined;
    if (!overlayer || !snapped) return;
    overlayer.add(CLIP_PREVIEW_KEY, snapped, Overlayer.highlight, { color: PREVIEW_COLOR });
    return () => overlayer.remove(CLIP_PREVIEW_KEY);
  }, [view, index, snapped]);

  const units: [ClipUnit, string][] = [
    ['passage', _('Passage')],
    ['line', _('Line')],
    ['word', _('Word')],
  ];
  const unitLabel = units.find(([u]) => u === unit)![1];
  const location = [
    bookData?.book?.title,
    progress?.sectionLabel,
    progress?.pageinfo ? _('p. {{page}}', { page: progress.pageinfo.current + 1 }) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const meta = (() => {
    if (tooLong) return _('Choose a shorter passage (up to about 3,000 characters).');
    switch (state?.kind) {
      case 'long':
        return _(
          'Long passage. We keep its first and last 150 characters; the whole passage shows whenever you open your copy.',
        );
      case 'near':
        return _(
          "You've used {{used}} of the 3,000 characters you can quote or translate from this book.",
          { used: state.used.toLocaleString() },
        );
      case 'over':
        return _(
          'This would pass the 3,000 characters you can quote from this book. Clip less, or delete a Margin to make room.',
        );
      default:
        return _('{{unit}} · {{count}} words', { unit: unitLabel, count: words });
    }
  })();

  const canCompose = !!snapped && !tooLong && !!quota && state?.kind !== 'over';

  const compose = async () => {
    const book = bookData?.book;
    const bookDoc = bookData?.bookDoc;
    if (!snapped || !view || !book || !bookDoc || !appService || !quota) return;
    const store = await openMarginsStore(appService);
    const ctx = marginsContext({ view, book, bookDoc, store });
    const anchor = createAnchor(ctx, snapped, index);
    anchor.catch(() => console.error('Margins: anchor failed'));
    onCompose({ range: snapped, anchor, unit, prefillNote, ...quota });
  };

  return (
    <div
      role='dialog'
      aria-label={_('Margin')}
      className={clsx(
        'bg-base-100 text-base-content border-base-content/10 fixed z-50 flex flex-col gap-3 border p-4 shadow-xl',
        'inset-x-0 bottom-0 rounded-t-2xl',
        'sm:inset-x-auto sm:bottom-auto sm:right-6 sm:top-16 sm:w-96 sm:rounded-2xl',
      )}
    >
      <blockquote className='max-h-40 overflow-y-auto font-serif text-sm leading-relaxed'>
        {text}
      </blockquote>
      {location && <p className='text-base-content/60 truncate text-xs'>{location}</p>}
      <div role='radiogroup' aria-label={_('Clip')} className='join'>
        {units.map(([u, label]) => (
          <button
            key={u}
            type='button'
            role='radio'
            aria-checked={unit === u}
            className={clsx('btn btn-xs join-item', unit === u && 'btn-active')}
            onClick={() => setUnit(u)}
          >
            {label}
          </button>
        ))}
      </div>
      <p className='text-base-content/70 text-xs' aria-live='polite'>
        {meta}
      </p>
      {state?.kind === 'over' && !tooLong && (
        <button
          type='button'
          className='btn btn-ghost btn-xs self-start'
          onClick={() => eventDispatcher.dispatch(MARGINS_OPEN_PANEL_EVENT, { bookKey })}
        >
          {_('Manage Margins')}
        </button>
      )}
      <div className='flex justify-end gap-2'>
        <button type='button' className='btn btn-ghost btn-sm' onClick={onClose}>
          {_('Cancel')}
        </button>
        <button
          type='button'
          className='btn btn-primary btn-sm'
          disabled={!canCompose}
          onClick={() => void compose()}
        >
          {_('Compose')}
        </button>
      </div>
    </div>
  );
};

export default ClipSheet;
