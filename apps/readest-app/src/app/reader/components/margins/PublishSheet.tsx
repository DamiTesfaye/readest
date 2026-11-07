import clsx from 'clsx';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useEnv } from '@/context/EnvContext';
import { useTranslation } from '@/hooks/useTranslation';
import { getSession } from '@/services/ampleread/auth/session';
import { assetUrl, keepLocalAsset, localAssetBytes } from '@/services/margins/assets';
import type { ArtworkElement } from '@/services/margins/payload';
import { allowance } from '@/services/margins/public/allowance';
import {
  type Display,
  type MyPost,
  type PostView,
  type Profile,
  PublicApiError,
  publicApi,
  type QuoteBudget,
} from '@/services/margins/public/api';
import { renderCard, uploadAsset } from '@/services/margins/public/card';
import { citationFor, formatCitation } from '@/services/margins/public/citation';
import { defaultDisplay } from '@/services/margins/public/display';
import type { ScalarSpan } from '@/services/margins/public/offsets';
import { publishSpan } from '@/services/margins/public/publishSpan';
import { renderCover } from '@/services/margins/replay/cover';
import { loadReplay } from '@/services/margins/replay/engine';
import { packScene, SCENE_MIME, unpackScene } from '@/services/margins/replay/scene';
import type { ReplayCtor, Scene } from '@/services/margins/replay/types';
import { type LayerRow, type MarginsStore, openMarginsStore } from '@/services/margins/store';
import { syncMargins } from '@/services/margins/sync';
import { eventDispatcher } from '@/utils/event';
import { hashText } from '@/utils/homeRowVariant';
import { navigateToLibrary } from '@/utils/nav';
import { GROUND_STYLE } from './ElementView';
import HandleSheet, { SHEET_CLASS } from './HandleSheet';
import { isEnvelope, storedQuote } from './MarginCard';

export const MARGINS_PUBLISH_EVENT = 'margins-publish';
export const MARGINS_SHORTEN_EVENT = 'margins-shorten';

export interface PublishSheetProps {
  row: LayerRow;
  existing: MyPost | null;
  onClose(): void;
  onPublished(post: PostView): void;
}

type Problem =
  | 'sync'
  | 'open'
  | 'long'
  | 'changed'
  | 'limit'
  | 'suspended'
  | 'failed'
  | 'quotesOff'
  | 'quota'
  | 'scene'
  | 'invalidScene';

type Recording = { scene: Scene; Replay: ReplayCtor; end: number };

const PROBLEM_OF: Record<string, Problem> = {
  excerpt_too_long: 'long',
  invalid_anchor: 'changed',
  publish_limit: 'limit',
  publishing_suspended: 'suspended',
  quotes_off: 'quotesOff',
  asset_quota_exceeded: 'quota',
  invalid_scene: 'invalidScene',
};

const RETRYABLE: (Problem | null)[] = [null, 'failed', 'quotesOff', 'quota'];
const PREVIEW = { width: 160, height: 284 };
const MB = 1024 * 1024;

const sceneRef = (layerId: string) => `scene-${layerId}`;

const readRecording = async (store: MarginsStore, layerId: string): Promise<Recording | null> => {
  const bytes = await localAssetBytes(store, sceneRef(layerId));
  const scene = bytes && unpackScene(bytes);
  if (!scene) return null;
  const Replay = await loadReplay();
  const replay = new Replay(JSON.stringify(scene));
  try {
    return { scene, Replay, end: replay.end() };
  } finally {
    replay.free();
  }
};

const reread = async (store: MarginsStore, row: LayerRow) => {
  const userId = (await getSession())?.me.id ?? null;
  return (await store.allLayers(userId)).find((r) => r.id === row.id) ?? row;
};

const artBlobs = async (store: MarginsStore, row: LayerRow): Promise<Blob[]> => {
  const art = isEnvelope(row.payload)
    ? row.payload.elements.find((e): e is ArtworkElement => e.kind === 'artwork')
    : undefined;
  const url = art ? await assetUrl(store, art.asset) : null;
  return url ? [await (await fetch(url)).blob()] : [];
};

const PublishSheet: React.FC<PublishSheetProps> = ({
  row: initial,
  existing,
  onClose,
  onPublished,
}) => {
  const _ = useTranslation();
  const router = useRouter();
  const { appService } = useEnv();
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [row, setRow] = useState(initial);
  const [span, setSpan] = useState<ScalarSpan | null>(null);
  const [budget, setBudget] = useState<QuoteBudget | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [until, setUntil] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [display, setDisplay] = useState<Display>(() => defaultDisplay(initial.payload));
  const [capHit, setCapHit] = useState(false);
  const [usage, setUsage] = useState<{ used: number; quota: number } | null>(null);
  const [recording, setRecording] = useState<Recording | null>(null);
  const [coverStep, setCoverStep] = useState(0);
  const [preview, setPreview] = useState<string | null>(null);
  const card = useRef<string | null>(null);

  const textId = initial.anchor.textId ?? initial.textId;
  const existingId = existing?.id;
  const play = defaultDisplay(initial.payload) === 'shape';
  const fallback: Display = play ? 'shape' : 'art';
  const ground = GROUND_STYLE[isEnvelope(row.payload) ? row.payload.ground : 'paper'];

  useEffect(() => {
    if (!appService) return;
    let live = true;
    (async () => {
      const store = await openMarginsStore(appService);
      const me = await publicApi.profile();
      if (!live) return;
      setProfile(me);
      await syncMargins(store);
      const current = await reread(store, initial);
      if (!live) return;
      setRow(current);
      if (current.rev === null) return setProblem('sync');
      const s = textId ? await publishSpan(store, current) : null;
      if (!live) return;
      if (!s) return setProblem('open');
      setSpan(s);
      if (play) {
        const rec = await readRecording(store, current.id);
        if (!live) return;
        if (!rec) return setProblem('scene');
        setRecording(rec);
        setCoverStep(rec.scene.cover_step);
      }
      const b = await publicApi.budget(textId!, s.section, s.sectionLen, existingId);
      if (live) setBudget(b);
    })()
      .catch(() => live && setProblem('failed'))
      .finally(() => live && setBusy(false));
    return () => {
      live = false;
    };
  }, [appService, initial, textId, existingId, play]);

  useEffect(() => {
    if (!recording) return;
    let live = true;
    let url: string | null = null;
    renderCover({
      scene: recording.scene,
      Replay: recording.Replay,
      step: coverStep,
      ...PREVIEW,
      color: ground.color,
      ground: ground.background,
    })
      .then((blob) => {
        if (!live) return;
        url = URL.createObjectURL(blob);
        setPreview(url);
      })
      .catch(() => live && setPreview(null));
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [recording, coverStep, ground.color, ground.background]);

  const quoted = display === 'quote';
  const long = quoted && !!budget?.capped && 'head' in row.anchor.quote;
  const allowed =
    quoted && budget && span && !long ? allowance(budget, span.start, span.end) : null;
  const shown = long ? 'long' : problem;
  const quoteRefused = quoted && (!!allowed?.over || long || capHit);

  const playMedia = async (store: MarginsStore) => {
    if (!recording) return {};
    const scene = { ...recording.scene, cover_step: coverStep };
    const packed = packScene(scene);
    if (!packed) throw new PublicApiError(422, 'invalid_scene', null, null);
    const blob = new Blob([packed as Uint8Array<ArrayBuffer>], { type: SCENE_MIME });
    await keepLocalAsset(
      store,
      {
        localId: sceneRef(row.id),
        userId: (await getSession())?.me.id ?? null,
        remoteId: null,
        mime: SCENE_MIME,
        width: 0,
        height: 0,
        createdAt: Date.now(),
      },
      blob,
    );
    const cover = await renderCover({
      scene,
      Replay: recording.Replay,
      step: coverStep,
      color: ground.color,
      ground: ground.background,
    });
    return { sceneAsset: await uploadAsset(blob), coverAsset: await uploadAsset(cover) };
  };

  const fail = async (e: unknown, store: MarginsStore, s: ScalarSpan) => {
    const code = e instanceof PublicApiError ? e.code : null;
    if (code === 'crowd_cap_reached') {
      setCapHit(true);
      setBudget(await publicApi.budget(textId!, s.section, s.sectionLen, existingId));
      return;
    }
    if (code === 'quotes_off') setDisplay(fallback);
    if (code === 'asset_quota_exceeded') {
      const d = (e as PublicApiError).detail;
      setUsage(
        typeof d?.['used'] === 'number' && typeof d?.['quota'] === 'number'
          ? { used: d['used'], quota: d['quota'] }
          : null,
      );
    }
    if (code === 'post_stale') {
      await syncMargins(store);
      setRow(await reread(store, row));
      return;
    }
    if (code === 'publishing_suspended') {
      const at = (e as PublicApiError).detail?.['until'];
      setUntil(typeof at === 'string' ? at : null);
    }
    if (!code) console.error('Margins: publish failed');
    setProblem((code && PROBLEM_OF[code]) || 'failed');
  };

  const publish = async (as: Display = display) => {
    if (!appService || !span || !profile || row.rev === null) return;
    setBusy(true);
    setProblem(null);
    const store = await openMarginsStore(appService);
    try {
      const text = textId ? await store.getText(textId) : null;
      const citation = await citationFor(store, row, span);
      card.current ??= await uploadAsset(
        await renderCard({
          handle: profile.handle,
          bookTitle: text?.title ?? null,
          citation: formatCitation(citation, {
            title: text?.title ?? null,
            author: text?.author ?? null,
          }),
          ground: isEnvelope(row.payload) ? row.payload.ground : 'paper',
          art: await artBlobs(store, row),
          seed: hashText(row.id),
        }),
      );
      const body = {
        layerId: row.id,
        layerRev: row.rev,
        cardAsset: card.current,
        ...span,
        display: as,
        citation,
        ...(await playMedia(store)),
      };
      const post = existing
        ? await publicApi.republish(existing.id, body)
        : await publicApi.publish(body);
      onPublished(post);
      onClose();
    } catch (e) {
      await fail(e, store, span).catch(() => setProblem('failed'));
    } finally {
      setBusy(false);
    }
  };

  const shorten = () => {
    onClose();
    eventDispatcher.dispatch(MARGINS_SHORTEN_EVENT, { layerId: row.id });
  };

  const publishAs = (as: Display) => {
    setDisplay(as);
    void publish(as);
  };

  const openYourMargins = () => {
    onClose();
    navigateToLibrary(router, 'margins=true&sort=size');
  };

  if (profile === null) return <HandleSheet onDone={setProfile} onClose={onClose} />;

  const copy: Record<Problem, string> = {
    sync: _('Sync this Margin before publishing.'),
    open: _('Open this book to publish this Margin.'),
    long: _('Public Margins quote at most 300 characters. Shorten the Clip.'),
    changed: _("This Margin's passage changed. Open the book and save it again."),
    limit: _("You've reached today's publishing limit."),
    suspended: until
      ? _('Publishing is suspended on this account until {{date}}.', {
          date: new Date(until).toLocaleDateString(),
        })
      : _('Publishing is suspended on this account permanently.'),
    failed: _("This Margin couldn't be published. Try again."),
    quotesOff: _('Quotes are turned off for this book.'),
    quota: usage
      ? _("You've used {{used}} MB of {{quota}} MB", {
          used: Math.round(usage.used / MB),
          quota: Math.round(usage.quota / MB),
        })
      : _("You've used your space for Margin art."),
    scene: _('Open this Play and keep it again to publish it.'),
    invalidScene: _("This Play couldn't be saved for replay"),
  };
  const options: [Display, string][] = [
    ['quote', _('Quote')],
    ...(play ? [['shape', _('Page shape')] as [Display, string]] : []),
    ['art', _('Art only')],
  ];
  const left = allowed ? Math.max(0, allowed.left - allowed.cost) : 0;
  const blocked =
    busy ||
    !span ||
    !profile ||
    !!allowed?.over ||
    !RETRYABLE.includes(shown) ||
    (capHit && quoted);

  return (
    <div role='dialog' aria-label={_('Publish Margin')} className={SHEET_CLASS}>
      <blockquote className='line-clamp-4 font-serif text-sm leading-relaxed'>
        {storedQuote(row)}
      </blockquote>
      <fieldset className='flex flex-wrap gap-3 text-sm'>
        <legend className='sr-only'>{_('Show as')}</legend>
        {options.map(([value, label]) => (
          <label key={value} className='flex items-center gap-1'>
            <input
              type='radio'
              name='display'
              className='radio radio-xs'
              checked={display === value}
              onChange={() => setDisplay(value)}
            />
            {label}
          </label>
        ))}
      </fieldset>
      {recording && (
        <div className='flex items-center gap-3'>
          {preview && (
            <img
              src={preview}
              alt={_('Cover frame')}
              width={PREVIEW.width}
              height={PREVIEW.height}
              className='h-[142px] w-[80px] rounded object-cover'
            />
          )}
          <input
            type='range'
            aria-label={_('Cover frame')}
            className='range range-xs flex-1'
            min={0}
            max={recording.end}
            value={coverStep}
            onChange={(e) => setCoverStep(Number(e.target.value))}
          />
        </div>
      )}
      {allowed && (
        <p className={clsx('text-xs', allowed.over ? 'text-error' : 'text-base-content/70')}>
          {allowed.scope === 'book'
            ? _('{{count}} characters left on this book', { count: left })
            : _('{{count}} characters left on this chapter', { count: left })}
        </p>
      )}
      {allowed?.over && !shown && (
        <p role='status' className='text-xs'>
          {_(
            "This passage would go over the book's public quote limit. Choose a shorter or already-quoted passage.",
          )}
        </p>
      )}
      {shown && (
        <p role='status' className='text-xs'>
          {copy[shown]}
        </p>
      )}
      {shown === 'quota' && (
        <p className='flex flex-wrap items-center gap-2 text-xs'>
          {_('Deleted Margins free their space within a day.')}
          <button type='button' className='link' onClick={openYourMargins}>
            {_('Your Margins')}
          </button>
        </p>
      )}
      {quoteRefused && (
        <div className='flex flex-wrap gap-2'>
          <button type='button' className='btn btn-ghost btn-xs' onClick={shorten}>
            {_('Shorten the Clip')}
          </button>
          <button
            type='button'
            className='btn btn-ghost btn-xs'
            disabled={busy}
            onClick={() => publishAs(fallback)}
          >
            {play ? _('Publish as page shape') : _('Publish as art only')}
          </button>
        </div>
      )}
      <div className='flex justify-end gap-2'>
        <button type='button' className='btn btn-ghost btn-sm' onClick={onClose}>
          {_('Cancel')}
        </button>
        {shown !== 'invalidScene' && (
          <button
            type='button'
            className='btn btn-primary btn-sm'
            disabled={blocked}
            onClick={() => void publish()}
          >
            {existing ? _('Republish') : _('Publish')}
          </button>
        )}
      </div>
    </div>
  );
};

export default PublishSheet;
