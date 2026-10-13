import clsx from 'clsx';
import { useEffect, useRef, useState } from 'react';
import { useEnv } from '@/context/EnvContext';
import { useTranslation } from '@/hooks/useTranslation';
import { getSession } from '@/services/ampleread/auth/session';
import { assetUrl } from '@/services/margins/assets';
import type { ArtworkElement } from '@/services/margins/payload';
import { allowance } from '@/services/margins/public/allowance';
import {
  type MyPost,
  type PostView,
  type Profile,
  PublicApiError,
  publicApi,
  type QuoteBudget,
} from '@/services/margins/public/api';
import { renderCard, uploadCard } from '@/services/margins/public/card';
import type { ScalarSpan } from '@/services/margins/public/offsets';
import { publishSpan } from '@/services/margins/public/publishSpan';
import { type LayerRow, type MarginsStore, openMarginsStore } from '@/services/margins/store';
import { syncMargins } from '@/services/margins/sync';
import { eventDispatcher } from '@/utils/event';
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

type Problem = 'sync' | 'open' | 'long' | 'changed' | 'limit' | 'suspended' | 'failed';

const PROBLEM_OF: Record<string, Problem> = {
  excerpt_too_long: 'long',
  invalid_anchor: 'changed',
  publish_limit: 'limit',
  publishing_suspended: 'suspended',
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
  const { appService } = useEnv();
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [row, setRow] = useState(initial);
  const [span, setSpan] = useState<ScalarSpan | null>(null);
  const [budget, setBudget] = useState<QuoteBudget | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [until, setUntil] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const card = useRef<string | null>(null);

  const textId = initial.anchor.textId ?? initial.textId;
  const existingId = existing?.id;

  useEffect(() => {
    if (!appService) return;
    let live = true;
    (async () => {
      const store = await openMarginsStore(appService);
      const me = await publicApi.profile();
      if (!live) return;
      setProfile(me);
      let current = initial;
      if (current.rev === null) {
        await syncMargins(store);
        current = await reread(store, current);
      }
      if (!live) return;
      setRow(current);
      if (current.rev === null) return setProblem('sync');
      const s = textId ? await publishSpan(store, current) : null;
      if (!live) return;
      if (!s) return setProblem('open');
      setSpan(s);
      const b = await publicApi.budget(textId!, s.section, s.sectionLen, existingId);
      if (live) setBudget(b);
    })()
      .catch(() => live && setProblem('failed'))
      .finally(() => live && setBusy(false));
    return () => {
      live = false;
    };
  }, [appService, initial, textId, existingId]);

  const long = !!budget?.capped && 'head' in row.anchor.quote;
  const allowed = budget && span && !long ? allowance(budget, span.start, span.end) : null;
  const shown = long ? 'long' : problem;

  const fail = async (e: unknown, store: MarginsStore, s: ScalarSpan) => {
    const code = e instanceof PublicApiError ? e.code : null;
    if (code === 'crowd_cap_reached') {
      setBudget(await publicApi.budget(textId!, s.section, s.sectionLen, existingId));
      return;
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

  const publish = async () => {
    if (!appService || !span || !profile || row.rev === null) return;
    setBusy(true);
    setProblem(null);
    const store = await openMarginsStore(appService);
    try {
      card.current ??= await uploadCard(
        await renderCard({
          quote: storedQuote(row),
          handle: profile.handle,
          bookTitle: textId ? ((await store.getText(textId))?.title ?? null) : null,
          ground: isEnvelope(row.payload) ? row.payload.ground : 'paper',
          art: await artBlobs(store, row),
        }),
      );
      const body = { layerId: row.id, layerRev: row.rev, cardAsset: card.current, ...span };
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
  };
  const left = allowed ? Math.max(0, allowed.left - allowed.cost) : 0;
  const blocked = busy || !span || !profile || !!allowed?.over || (!!shown && shown !== 'failed');

  return (
    <div role='dialog' aria-label={_('Publish Margin')} className={SHEET_CLASS}>
      <blockquote className='line-clamp-4 font-serif text-sm leading-relaxed'>
        {storedQuote(row)}
      </blockquote>
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
      {(allowed?.over || shown === 'long') && (
        <button type='button' className='btn btn-ghost btn-xs self-start' onClick={shorten}>
          {_('Shorten the Clip')}
        </button>
      )}
      <div className='flex justify-end gap-2'>
        <button type='button' className='btn btn-ghost btn-sm' onClick={onClose}>
          {_('Cancel')}
        </button>
        <button
          type='button'
          className='btn btn-primary btn-sm'
          disabled={blocked}
          onClick={() => void publish()}
        >
          {existing ? _('Republish') : _('Publish')}
        </button>
      </div>
    </div>
  );
};

export default PublishSheet;
