import clsx from 'clsx';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useEnv } from '@/context/EnvContext';
import { useTranslation } from '@/hooks/useTranslation';
import { getSession } from '@/services/ampleread/auth/session';
import { addLocalAsset, downscale, uploadAssets } from '@/services/margins/assets';
import { useTranslator } from '@/hooks/useTranslator';
import { quotaState } from '@/services/margins/clip';
import {
  type ComposeController,
  createComposeController,
} from '@/services/margins/compose/controller';
import { builtinTools, type ComposeIO, newElementId } from '@/services/margins/compose/registry';
import {
  type ArtworkElement,
  type Element,
  type Envelope,
  envelopeBytes,
  type Frame,
  leadKind,
  PAYLOAD_MAX,
  quoteCost as costOf,
  scalars,
  type TranslationElement,
  translationMax,
  validatePayload,
} from '@/services/margins/payload';
import { openMarginsStore } from '@/services/margins/store';
import type { Anchor, Quote } from '@/services/margins/types';
import DrawingPad from './DrawingPad';
import {
  basicStickers,
  ElementView,
  frameStyle,
  GROUND_STYLE,
  MarginsMotionStyle,
  motionClass,
  stickerSrc,
} from './ElementView';
import PlainToolbar from './PlainToolbar';

export interface ComposeSurfaceProps {
  initial: Envelope;
  quote: Quote | null;
  liveQuoteText: string | null;
  capped: boolean;
  quoteCost: number;
  used: number;
  anchor: Promise<Anchor>;
  toolbar?: (controller: ComposeController) => React.ReactNode;
  onSave(envelope: Envelope, anchor: Anchor): Promise<void>;
  onDiscard(): void;
}

const NUDGE = 0.01;
const NUDGE_FAR = 0.05;
const PREPARE_TIMEOUT_MS = 20_000;
const NEW_FRAME: Frame = { x: 0.5, y: 0.78, w: 0.7, r: 0 };
const STICKER_FRAME: Frame = { x: 0.8, y: 0.2, w: 0.2, r: 0 };
const ART_FRAME: Frame = { x: 0.5, y: 0.7, w: 0.5, r: 0 };
const IMAGE_TYPES = 'image/png,image/jpeg,image/svg+xml';
const TOO_COMPLEX = [
  'svg_too_complex',
  'asset_too_large',
  'image_undecodable',
  'unsupported_media_type',
];

const chooseFile = () =>
  new Promise<File | null>((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = IMAGE_TYPES;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });

const round = (v: number) => Math.round(v * 1e4) / 1e4;
const clamp = (v: number, lo: number, hi: number) => round(Math.min(hi, Math.max(lo, v)));

export const quoteText = (quote: Quote | null, live: string | null): string =>
  live ?? (!quote ? '' : 'exact' in quote ? quote.exact : `${quote.head} … ${quote.tail}`);

type Drag = {
  id: string;
  mode: 'move' | 'scale' | 'rotate';
  x: number;
  y: number;
  frame: Frame;
  rect: DOMRect;
};

const isTyping = (target: EventTarget) =>
  target instanceof HTMLElement && !!target.closest('textarea, input');

const useAnchor = (anchor: Promise<Anchor>) => {
  const [state, setState] = useState<{ value?: Anchor; slow?: boolean; failed?: boolean }>({});
  useEffect(() => {
    let live = true;
    setState({});
    const timer = setTimeout(() => {
      if (live) setState((s) => (s.value ? s : { ...s, slow: true }));
    }, PREPARE_TIMEOUT_MS);
    anchor.then(
      (value) => live && setState({ value }),
      () => live && setState({ failed: true }),
    );
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [anchor]);
  return state;
};

function ComposeSurface({
  initial,
  quote,
  liveQuoteText,
  capped,
  quoteCost,
  used,
  anchor,
  toolbar,
  onSave,
  onDiscard,
}: ComposeSurfaceProps) {
  const _ = useTranslation();
  const { appService } = useEnv();
  const { translate } = useTranslator({});
  const io = useRef<ComposeIO>(null!);
  const [controller] = useState(() =>
    createComposeController(initial, {
      capped,
      quoteCost,
      tools: builtinTools(_, {
        pickImage: () => io.current.pickImage(),
        startDrawing: () => io.current.startDrawing(),
        addNote: () => io.current.addNote(),
        addTranslation: (mode) => io.current.addTranslation(mode),
        pickSticker: () => io.current.pickSticker(),
      }),
    }),
  );
  const state = useSyncExternalStore(
    controller.subscribe,
    () => controller.state,
    () => controller.state,
  );
  const { envelope, selection } = state;
  const anchorState = useAnchor(anchor);
  const cardRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [picker, setPicker] = useState<'sticker' | 'draw' | null>(null);
  const [artError, setArtError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [saving, setSaving] = useState(false);
  const [suggesting, setSuggesting] = useState(false);

  const add = (element: Element) => {
    controller.dispatch({ type: 'add', element });
    controller.dispatch({ type: 'select', ids: [element.id] });
  };
  const update = (id: string, patch: Partial<Element>) =>
    controller.dispatch({ type: 'update', id, patch });

  io.current = {
    addNote: () => add({ id: newElementId(), kind: 'note', frame: NEW_FRAME, text: '' }),
    addTranslation: (mode) =>
      add({
        id: newElementId(),
        kind: 'translation',
        frame: NEW_FRAME,
        mode,
        lang: (typeof navigator !== 'undefined' && navigator.language) || 'en',
        text: '',
        source: 'hand',
      }),
    pickSticker: () => setPicker('sticker'),
    pickImage: async () => {
      const file = await chooseFile();
      if (file) await addArt(file, 'upload').catch(() => setArtError(tooComplex));
      return file;
    },
    startDrawing: () => setPicker('draw'),
  };

  const tooComplex = _('This image is too large or complex. Try a smaller file.');

  const uploadNow = async (ref: string) => {
    const userId = (await getSession())?.me.id;
    if (!userId || !appService) return;
    const store = await openMarginsStore(appService);
    const body = { payload: { elements: [{ kind: 'artwork', asset: ref }] } };
    const result = await uploadAssets(store, body, userId).catch(() => null);
    if (!result || !('error' in result)) return;
    if (TOO_COMPLEX.includes(result.error)) setArtError(tooComplex);
    else if (result.error === 'asset_quota_exceeded') {
      setArtError(_("You've used your space for Margin art. Delete some art to add more."));
    }
  };

  const addArt = async (
    file: Blob,
    source: 'upload' | 'drawing',
    size?: { width: number; height: number },
  ) => {
    if (!appService) return;
    setArtError(null);
    const store = await openMarginsStore(appService);
    const sized = size ? { blob: file, ...size } : await downscale(file as File);
    const asset = await addLocalAsset(store, sized.blob, {
      width: sized.width,
      height: sized.height,
    });
    add({ id: newElementId(), kind: 'artwork', frame: ART_FRAME, asset, alt: '', source });
    void uploadNow(asset);
  };

  const live = quoteText(quote, liveQuoteText);
  const cost = anchorState.value ? costOf(anchorState.value.quote) : quoteCost;
  const translations = envelope.elements
    .filter((e): e is TranslationElement => e.kind === 'translation')
    .reduce((sum, e) => sum + scalars(e.text), 0);
  const quota = quotaState({
    capped,
    used,
    cost: cost + (capped ? translations : 0),
    quoteChars: cost,
  });
  const tooBig = envelopeBytes(envelope) > PAYLOAD_MAX;
  const missingAlt = envelope.elements.some(
    (e) => e.kind === 'artwork' && !(e as ArtworkElement).alt.trim(),
  );
  const valid = validatePayload(envelope, leadKind(envelope), cost, capped, false).ok;

  const blocker = tooBig
    ? _('This Margin is too long to keep. Shorten a note or translation.')
    : missingAlt
      ? _('Describe each image before saving.')
      : quota.kind === 'over'
        ? _(
            'This would pass the 3,000 characters you can quote from this book. Clip less, or delete a Margin to make room.',
          )
        : !valid
          ? _('Fill in or remove the empty parts of this Margin.')
          : null;
  const waiting =
    anchorState.slow || anchorState.failed
      ? _("We're still reading this book. Your Margin is kept here; try Save again in a moment.")
      : null;

  const save = async () => {
    if (!anchorState.value || blocker) return;
    setSaving(true);
    try {
      await onSave(envelope, anchorState.value);
    } finally {
      setSaving(false);
    }
  };

  const discard = () => (envelope === initial ? onDiscard() : setConfirmDiscard(true));

  const nudge = (dx: number, dy: number) => {
    controller.dispatch({ type: 'begin' });
    for (const e of envelope.elements) {
      if (!selection.includes(e.id)) continue;
      const { frame } = e;
      update(e.id, {
        frame: { ...frame, x: clamp(frame.x + dx, 0, 1), y: clamp(frame.y + dy, 0, 1) },
      });
    }
    controller.dispatch({ type: 'commit' });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (isTyping(e.target)) return;
    const mod = e.metaKey || e.ctrlKey;
    const step = e.shiftKey ? NUDGE_FAR : NUDGE;
    const arrows: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const arrow = arrows[e.key];
    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) controller.redo();
      else controller.undo();
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && selection.length) {
      e.preventDefault();
      controller.dispatch({ type: 'remove', ids: selection });
    } else if (arrow && selection.length) {
      e.preventDefault();
      nudge(...arrow);
    }
  };

  const startDrag = (e: React.PointerEvent, element: Element, mode: Drag['mode']) => {
    e.stopPropagation();
    controller.dispatch({ type: 'select', ids: [element.id] });
    if (mode === 'move' && isTyping(e.target)) return;
    const rect = cardRef.current?.getBoundingClientRect() ?? new DOMRect();
    drag.current = { id: element.id, mode, x: e.clientX, y: e.clientY, frame: element.frame, rect };
    controller.dispatch({ type: 'begin' });
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const moveDrag = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const width = d.rect.width || 1;
    const height = d.rect.height || 1;
    const f = d.frame;
    let frame: Frame;
    if (d.mode === 'move') {
      const x = clamp(f.x + (e.clientX - d.x) / width, 0, 1);
      frame = { ...f, x, y: clamp(f.y + (e.clientY - d.y) / height, 0, 1) };
    } else if (d.mode === 'scale') {
      frame = { ...f, w: clamp(f.w + (2 * (e.clientX - d.x)) / width, 0.05, 1) };
    } else {
      const cx = d.rect.left + f.x * width;
      const cy = d.rect.top + f.y * height;
      const deg = (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI;
      frame = { ...f, r: clamp(deg, -180, 180) };
    }
    update(d.id, { frame });
  };

  const endDrag = () => {
    if (!drag.current) return;
    drag.current = null;
    controller.dispatch({ type: 'commit' });
  };

  const selected =
    selection.length === 1 ? envelope.elements.find((e) => e.id === selection[0]) : undefined;

  const suggest = async (e: TranslationElement) => {
    setSuggesting(true);
    try {
      const [text] = await translate([live], { target: e.lang });
      if (text) update(e.id, { text, source: 'mt' } as Partial<Element>);
    } catch {
      console.error('Margins: suggest failed');
    } finally {
      setSuggesting(false);
    }
  };

  const inspector = (() => {
    if (selected?.kind === 'artwork') {
      const e = selected as ArtworkElement;
      return (
        <input
          className='input input-bordered input-sm w-full'
          aria-label={_('Describe this image')}
          placeholder={_('Describe this image')}
          autoFocus={!e.alt}
          value={e.alt}
          onChange={(ev) => update(e.id, { alt: ev.target.value } as Partial<Element>)}
        />
      );
    }
    if (selected?.kind === 'translation') {
      const e = selected as TranslationElement;
      return (
        <div className='flex flex-col gap-1'>
          <div className='flex items-center gap-2'>
            <input
              className='input input-bordered input-sm w-28'
              aria-label={_('Language')}
              value={e.lang}
              onChange={(ev) => update(e.id, { lang: ev.target.value } as Partial<Element>)}
            />
            <button
              type='button'
              className='btn btn-sm'
              disabled={suggesting || !live}
              onClick={() => void suggest(e)}
            >
              {_('Suggest')}
            </button>
            <span className='text-xs opacity-70'>
              {scalars(e.text)} / {translationMax(cost, capped)}
            </span>
          </div>
          {(quota.kind === 'near' || quota.kind === 'over') && (
            <p className='text-xs opacity-70'>
              {_(
                "You've used {{used}} of the 3,000 characters you can quote or translate from this book.",
                { used: (used + translations).toLocaleString() },
              )}
            </p>
          )}
        </div>
      );
    }
    return null;
  })();

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/40'>
      <MarginsMotionStyle />
      <div
        role='dialog'
        aria-modal='true'
        aria-label={_('Compose Margin')}
        className='bg-base-100 text-base-content flex h-full w-full flex-col gap-3 overflow-y-auto p-4 sm:h-auto sm:max-h-[95vh] sm:max-w-lg sm:rounded-2xl'
      >
        {(toolbar ?? ((c) => <PlainToolbar controller={c} />))(controller)}
        <div
          role='application'
          aria-label={_('Margin card')}
          tabIndex={0}
          onKeyDown={onKeyDown}
          onPointerDown={() => controller.dispatch({ type: 'select', ids: [] })}
          className='outline-none'
        >
          <div
            ref={cardRef}
            className='relative mx-auto w-full max-w-sm overflow-hidden rounded-xl shadow'
            style={{ aspectRatio: '4 / 5', ...GROUND_STYLE[envelope.ground] }}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            <blockquote
              className={clsx(
                'font-serif leading-snug',
                { s: 'text-xs', m: 'text-sm', l: 'text-base' }[envelope.quote.size],
              )}
              style={frameStyle(envelope.quote.frame)}
            >
              {live}
            </blockquote>
            {envelope.elements.map((element) => {
              const isSelected = selection.includes(element.id);
              return (
                <div
                  key={element.id}
                  data-element-id={element.id}
                  className={clsx('touch-none', motionClass(element))}
                  style={frameStyle(element.frame)}
                  onPointerDown={(e) => startDrag(e, element, 'move')}
                  onBlur={() => controller.dispatch({ type: 'commit' })}
                >
                  <ElementView
                    element={element}
                    selected={isSelected}
                    editable
                    onChange={(patch) => {
                      controller.dispatch({ type: 'begin' });
                      update(element.id, patch);
                    }}
                  />
                  {isSelected && (
                    <>
                      <span
                        aria-hidden='true'
                        className='absolute -right-2 -top-2 h-4 w-4 cursor-grab rounded-full bg-[#5B3DF5]'
                        onPointerDown={(e) => startDrag(e, element, 'rotate')}
                      />
                      <span
                        aria-hidden='true'
                        className='absolute -bottom-2 -right-2 h-4 w-4 cursor-nwse-resize rounded-sm bg-[#5B3DF5]'
                        onPointerDown={(e) => startDrag(e, element, 'scale')}
                      />
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        {inspector}
        {picker === 'sticker' && (
          <div role='group' aria-label={_('Stickers')} className='grid grid-cols-6 gap-2'>
            {basicStickers.map((s) => (
              <button
                key={s.id}
                type='button'
                className='btn btn-ghost btn-sm h-12 p-1'
                onClick={() => {
                  setPicker(null);
                  add({ id: newElementId(), kind: 'sticker', frame: STICKER_FRAME, sticker: s.id });
                }}
              >
                <img src={stickerSrc(s.id)} alt={_(s.label)} className='h-full' />
              </button>
            ))}
          </div>
        )}
        {picker === 'draw' && (
          <DrawingPad
            onCancel={() => setPicker(null)}
            onDone={(svg, size) => {
              setPicker(null);
              addArt(new Blob([svg], { type: 'image/svg+xml' }), 'drawing', size).catch(() =>
                setArtError(tooComplex),
              );
            }}
          />
        )}
        {(blocker || waiting || artError) && (
          <p className='text-xs opacity-80' aria-live='polite'>
            {blocker ?? waiting ?? artError}
          </p>
        )}
        {confirmDiscard ? (
          <div
            role='alertdialog'
            aria-label={_('Discard this Margin?')}
            className='flex items-center justify-end gap-2'
          >
            <span className='mr-auto text-sm'>{_('Discard this Margin?')}</span>
            <button
              type='button'
              className='btn btn-ghost btn-sm'
              onClick={() => setConfirmDiscard(false)}
            >
              {_('Keep editing')}
            </button>
            <button type='button' className='btn btn-error btn-sm' onClick={onDiscard}>
              {_('Discard Margin')}
            </button>
          </div>
        ) : (
          <div className='flex justify-end gap-2'>
            <button type='button' className='btn btn-ghost btn-sm' onClick={discard}>
              {_('Discard')}
            </button>
            <button
              type='button'
              className='btn btn-primary btn-sm'
              disabled={!anchorState.value || !!blocker || saving}
              onClick={() => void save()}
            >
              {anchorState.value ? _('Save') : _('Preparing…')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default ComposeSurface;
