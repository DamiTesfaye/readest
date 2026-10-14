import clsx from 'clsx';
import { useEffect, useState } from 'react';
import { useEnv } from '@/context/EnvContext';
import { useTranslation } from '@/hooks/useTranslation';
import { assetUrl } from '@/services/margins/assets';
import type {
  ArtworkElement,
  Element,
  Frame,
  Ground,
  QuoteFont,
  QuoteStyle,
  NoteElement,
  StickerElement,
  TranslationElement,
} from '@/services/margins/payload';
import { type PlayElement, validatePlayElement } from '@/services/margins/play/element';
import { openMarginsStore } from '@/services/margins/store';
import stickers from '../../../../../public/margins/stickers/basic.json';

export interface ElementViewProps {
  element: Element;
  selected: boolean;
  editable: boolean;
  onChange?(patch: Partial<Element>): void;
  onPlay?(): void;
}

export const GROUND_STYLE: Record<Ground, { background: string; color: string }> = {
  paper: { background: '#F7F3EA', color: '#15151A' },
  ink: { background: '#15151A', color: '#F7F3EA' },
  lime: { background: '#C8F135', color: '#15151A' },
};

export const MARGINS_MOTION_CSS = `
@keyframes margins-rise { from { translate: 0 8%; opacity: .6 } to { translate: 0 0; opacity: 1 } }
@keyframes margins-drift { 0%, 100% { translate: -2% 0 } 50% { translate: 2% 0 } }
@keyframes margins-breathe { 0%, 100% { scale: 1 } 50% { scale: 1.04 } }
@media (prefers-reduced-motion: no-preference) {
  .margins-motion-rise { animation: margins-rise 1.2s ease-out both }
  .margins-motion-drift { animation: margins-drift 6s ease-in-out infinite }
  .margins-motion-breathe { animation: margins-breathe 4s ease-in-out infinite }
}`;

export const MarginsMotionStyle = () => <style>{MARGINS_MOTION_CSS}</style>;

const percent = (v: number) => `${+(v * 100).toFixed(2)}%`;

export const frameStyle = (frame: Frame): React.CSSProperties => ({
  position: 'absolute',
  left: percent(frame.x),
  top: percent(frame.y),
  width: percent(frame.w),
  transform: `translate(-50%, -50%) rotate(${frame.r}deg)`,
});

export const QUOTE_FONT: Record<QuoteFont, string> = {
  serif: 'ui-serif, Georgia, serif',
  sans: 'ui-sans-serif, system-ui, sans-serif',
  mono: 'ui-monospace, Menlo, monospace',
  hand: "'Bradley Hand', 'Segoe Print', 'Chalkboard SE', cursive",
};

export const quoteStyle = (quote: QuoteStyle): React.CSSProperties => ({
  ...frameStyle(quote.frame),
  fontFamily: QUOTE_FONT[quote.font ?? 'serif'],
  fontWeight: quote.weight === 'bold' ? 700 : 400,
  fontStyle: quote.italic ? 'italic' : 'normal',
});

export const motionClass = (element: Element) =>
  element.motion ? `margins-motion-${element.motion}` : undefined;

const STICKER_PACK = 'basic';

export const stickerSrc = (id: string) => {
  const [pack, name] = id.split('/');
  return `/margins/stickers/${pack}/${name}.svg`;
};

const stickerLabel = (id: string) => {
  const [pack, name] = id.split('/');
  return pack === STICKER_PACK ? stickers.find((s) => s.name === name)?.label : undefined;
};

export const basicStickers = stickers.map((s) => ({
  id: `${STICKER_PACK}/${s.name}`,
  label: s.label,
}));

export const useMarginAssetUrl = (ref: string | null) => {
  const { appService } = useEnv();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!appService || !ref) return;
    let live = true;
    openMarginsStore(appService)
      .then((store) => assetUrl(store, ref))
      .then((u) => live && setUrl(u))
      .catch(() => console.error('Margins: art could not load'));
    return () => {
      live = false;
    };
  }, [appService, ref]);
  return url;
};

const Artwork = ({ element }: { element: ArtworkElement }) => {
  const _ = useTranslation();
  const url = useMarginAssetUrl(element.asset);
  return url ? (
    <img src={url} alt={element.alt} className='block w-full' draggable={false} />
  ) : (
    <div
      role='img'
      aria-label={element.alt || _('Image')}
      className='bg-base-content/10 flex aspect-square w-full items-center justify-center text-xs'
    >
      {element.alt || _('Image')}
    </div>
  );
};

const textClass = 'w-full bg-transparent text-sm leading-snug';

const Play = ({ element, onPlay }: { element: PlayElement; onPlay?(): void }) => {
  const _ = useTranslation();
  return (
    <div
      role='group'
      aria-label={element.alt}
      className='bg-base-100/80 flex items-center gap-2 rounded p-2 text-xs'
    >
      <span className='badge badge-sm shrink-0'>{_('Play')}</span>
      <span className='line-clamp-2 flex-1'>{element.alt}</span>
      {onPlay && (
        <button type='button' className='btn btn-xs shrink-0' onClick={onPlay}>
          {_('Play')}
        </button>
      )}
    </div>
  );
};

const NeedsNewer = ({ ring }: { ring: string }) => {
  const _ = useTranslation();
  return (
    <p className={clsx('rounded border border-dashed p-2 text-xs opacity-70', ring)}>
      {_('This part needs a newer AmpleRead')}
    </p>
  );
};

export function ElementView({ element, selected, editable, onChange, onPlay }: ElementViewProps) {
  const _ = useTranslation();
  const ring = clsx(selected && 'ring-2 ring-[#5B3DF5] ring-offset-1');
  switch (element.kind) {
    case 'note': {
      const e = element as NoteElement;
      return editable ? (
        <textarea
          aria-label={_('Note')}
          className={clsx(textClass, 'resize-none', ring)}
          value={e.text}
          rows={3}
          onChange={(ev) => onChange?.({ text: ev.target.value } as Partial<Element>)}
        />
      ) : (
        <p className={clsx(textClass, 'whitespace-pre-wrap', ring)}>{e.text}</p>
      );
    }
    case 'translation': {
      const e = element as TranslationElement;
      return (
        <div className={ring} lang={e.lang}>
          {editable ? (
            <textarea
              aria-label={e.mode === 'gloss' ? _('Gloss') : _('Translation')}
              className={clsx(textClass, 'resize-none italic')}
              value={e.text}
              rows={3}
              onChange={(ev) =>
                onChange?.({ text: ev.target.value, source: 'hand' } as Partial<Element>)
              }
            />
          ) : (
            <p className={clsx(textClass, 'whitespace-pre-wrap italic')}>{e.text}</p>
          )}
          {e.source === 'mt' && (
            <span className='text-[10px] opacity-60'>{_('machine-assisted')}</span>
          )}
        </div>
      );
    }
    case 'artwork':
      return (
        <div className={ring}>
          <Artwork element={element as ArtworkElement} />
        </div>
      );
    case 'sticker': {
      const e = element as StickerElement;
      const label = stickerLabel(e.sticker);
      return (
        <img
          className={clsx('block w-full', ring)}
          src={stickerSrc(e.sticker)}
          alt={label ? _(label) : _('Sticker')}
          draggable={false}
        />
      );
    }
    case 'play':
      return validatePlayElement(element, Infinity) === 'unknown' ? (
        <NeedsNewer ring={ring} />
      ) : (
        <div className={ring}>
          <Play element={element as unknown as PlayElement} onPlay={onPlay} />
        </div>
      );
    default:
      return <NeedsNewer ring={ring} />;
  }
}

export default ElementView;
