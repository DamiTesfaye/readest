import clsx from 'clsx';
import { forwardRef } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import type { Placement } from '@/services/margins/painter';
import type { Envelope } from '@/services/margins/payload';
import type { LayerRow } from '@/services/margins/store';
import {
  ElementView,
  frameStyle,
  GROUND_STYLE,
  MarginsMotionStyle,
  motionClass,
} from './ElementView';

export interface MarginCardProps {
  row: LayerRow;
  placement: Placement | undefined;
  quoteText: string | null;
  expanded?: boolean;
  onGoTo?(): void;
  onOpen?(): void;
  onEdit(): void;
  onDelete(): void;
  onRetry?(): void;
  onKeepHere?(): void;
  onPlay?(): void;
}

const QUOTA_ERRORS = ['excerpt_too_long', 'excerpt_quota_exceeded'];
const ART_ERRORS = [
  'svg_too_complex',
  'asset_too_large',
  'image_undecodable',
  'unsupported_media_type',
];

export const storedQuote = (row: LayerRow): string => {
  const q = row.anchor.quote;
  return 'exact' in q ? q.exact : `${q.head} … ${q.tail}`;
};

export const isEnvelope = (p: unknown): p is Envelope =>
  !!p && typeof p === 'object' && Array.isArray((p as Envelope).elements);

export const useErrorCopy = () => {
  const _ = useTranslation();
  return (code: string) =>
    QUOTA_ERRORS.includes(code)
      ? _(
          "Not synced: you've reached the quote limit for this book on another device. Edit or delete a Margin to sync.",
        )
      : ART_ERRORS.includes(code)
        ? _('This image is too large or complex. Try a smaller file.')
        : code === 'asset_quota_exceeded'
          ? _("You've used your space for Margin art. Delete some art to add more.")
          : _("This Margin couldn't sync. Edit it to try again.");
};

const MarginCard = forwardRef<HTMLDivElement, MarginCardProps>(function MarginCard(
  {
    row,
    placement,
    quoteText,
    expanded,
    onGoTo,
    onOpen,
    onEdit,
    onDelete,
    onRetry,
    onKeepHere,
    onPlay,
  },
  ref,
) {
  const _ = useTranslation();
  const errorCopy = useErrorCopy();
  const envelope = isEnvelope(row.payload) ? row.payload : null;
  const quote = quoteText ?? storedQuote(row);
  const fuzzy = placement?.kind === 'placed' && placement.step === 3;
  const button = 'btn btn-ghost btn-xs';

  return (
    <div
      ref={ref}
      role='article'
      aria-label={_('Margin')}
      tabIndex={-1}
      className='flex flex-col gap-2 rounded-lg p-3 outline-none focus:ring-2 focus:ring-[#5B3DF5]'
    >
      {!(expanded && envelope) && (
        <p className='text-base-content/85 line-clamp-3 font-serif text-xs leading-relaxed'>
          {quote}
        </p>
      )}
      {expanded && envelope && (
        <div
          className='relative w-full overflow-hidden rounded-lg'
          style={{ aspectRatio: '4 / 5', ...GROUND_STYLE[envelope.ground] }}
        >
          <MarginsMotionStyle />
          <blockquote className='font-serif text-xs' style={frameStyle(envelope.quote.frame)}>
            {quote}
          </blockquote>
          {envelope.elements.map((e) => (
            <div key={e.id} className={motionClass(e)} style={frameStyle(e.frame)}>
              <ElementView element={e} selected={false} editable={false} onPlay={onPlay} />
            </div>
          ))}
        </div>
      )}
      {fuzzy && (
        <p className='text-base-content/70 text-xs'>
          {_('This Margin moved slightly.')}{' '}
          {onKeepHere && (
            <button type='button' className='link' onClick={onKeepHere}>
              {_('Keep here')}
            </button>
          )}
        </p>
      )}
      {row.error && (
        <p role='status' className='text-error text-xs'>
          {errorCopy(row.error)}
        </p>
      )}
      <div className='flex flex-wrap items-center gap-1'>
        {onGoTo && (
          <button type='button' className={clsx(button, 'text-[#5B3DF5]')} onClick={onGoTo}>
            {_('Go to passage')}
          </button>
        )}
        {onOpen && (
          <button type='button' className={button} onClick={onOpen}>
            {_('Open card')}
          </button>
        )}
        <button type='button' className={button} onClick={onEdit}>
          {_('Edit')}
        </button>
        {row.error && onRetry && (
          <button type='button' className={button} onClick={onRetry}>
            {_('Retry')}
          </button>
        )}
        <button type='button' className={button} onClick={onDelete}>
          {_('Delete')}
        </button>
      </div>
    </div>
  );
});

export default MarginCard;
