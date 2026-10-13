import { useEffect, useReducer, useRef, useState, type ReactNode } from 'react';
import { useEnv } from '@/context/EnvContext';
import { useTranslation } from '@/hooks/useTranslation';
import { marginsContext } from '@/services/margins/context';
import { PLAY_ALT_MAX } from '@/services/margins/play/element';
import type { PlayKeepResult, PlayTools } from '@/services/margins/play/session';
import {
  enterPlay,
  PlayUnavailable,
  type PlaySession,
} from '@/services/margins/play/surfaceSession';
import { playTools, type PlayTool } from '@/services/margins/play/tools';
import { openMarginsStore } from '@/services/margins/store';
import { useBookDataStore } from '@/store/bookDataStore';
import { useCustomFontStore } from '@/store/customFontStore';
import { useReaderStore } from '@/store/readerStore';
import { useReaderProgressStore } from '@/store/readerProgressStore';
import { eventDispatcher } from '@/utils/event';
import { MARGINS_OPEN_PANEL_EVENT } from '../margins/ClipSheet';

const PREPARING_DELAY_MS = 150;

interface PlaySurfaceProps {
  bookKey: string;
  toolbar?: (play: PlayTools, tools: readonly PlayTool[]) => ReactNode;
}

const PlainToolbar = ({ play, tools }: { play: PlayTools; tools: readonly PlayTool[] }) => {
  const _ = useTranslation();
  const [, bump] = useReducer((n: number) => n + 1, 0);
  return (
    <div
      role='toolbar'
      aria-label={_('Play tools')}
      className='absolute bottom-4 left-1/2 z-50 flex -translate-x-1/2 flex-wrap justify-center gap-1'
    >
      {tools.map((t) => (
        <button
          key={t.id}
          type='button'
          className='btn btn-xs'
          disabled={!t.enabled(play.state)}
          aria-pressed={t.active ? t.active(play.state) : undefined}
          onClick={async () => {
            await t.run(play);
            bump();
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
};

const toast = (message: string) => eventDispatcher.dispatch('toast', { type: 'info', message });

const KeepDialog = ({
  bookKey,
  play,
  onDone,
}: {
  bookKey: string;
  play: PlayTools;
  onDone: () => void;
}) => {
  const _ = useTranslation();
  const [alt, setAlt] = useState('');
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const length = [...alt.trim()].length;
  const copy: Record<string, string> = {
    quota: _(
      'This would pass the 3,000 characters you can quote from this book. Clip less, or delete a Margin to make room.',
    ),
    size: _('This play is too detailed to keep. Remove a shape or some points.'),
    empty: _('Add a shape or knock some words loose first.'),
    invalid: _("This play couldn't be kept."),
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || length < 1 || length > PLAY_ALT_MAX) return;
    setBusy(true);
    const result: PlayKeepResult = await play
      .keep(alt.trim())
      .catch(() => ({ ok: false, reason: 'invalid' }) as const);
    setBusy(false);
    if (!result.ok) return setRefused(result.reason);
    toast(_('Kept as a private Margin.'));
    if (result.dropped)
      toast(_("Some loose words were outside the kept passage and won't replay."));
    onDone();
  };
  return (
    <form
      role='dialog'
      aria-modal='true'
      aria-label={_('Keep this play')}
      className='bg-base-100 absolute left-1/2 top-1/3 z-50 flex w-80 -translate-x-1/2 flex-col gap-2 rounded-lg p-4 shadow-lg'
      onSubmit={submit}
      onKeyDown={(e) => e.key === 'Escape' && onDone()}
    >
      <label className='flex flex-col gap-1 text-sm'>
        {_('Describe this play for screen readers')}
        <textarea
          className='textarea textarea-bordered textarea-sm'
          required
          rows={2}
          value={alt}
          autoFocus
          onChange={(e) => setAlt(e.target.value)}
        />
      </label>
      {length > PLAY_ALT_MAX && (
        <p className='text-error text-xs'>{_('Keep the description under 300 characters.')}</p>
      )}
      {refused && (
        <p role='status' className='text-error text-xs'>
          {copy[refused]}
        </p>
      )}
      {refused === 'quota' && (
        <button
          type='button'
          className='btn btn-ghost btn-xs self-start'
          onClick={() => eventDispatcher.dispatch(MARGINS_OPEN_PANEL_EVENT, { bookKey })}
        >
          {_('Manage Margins')}
        </button>
      )}
      <div className='flex justify-end gap-2'>
        <button type='button' className='btn btn-ghost btn-sm' onClick={onDone}>
          {_('Cancel')}
        </button>
        <button
          type='submit'
          className='btn btn-primary btn-sm'
          disabled={busy || length < 1 || length > PLAY_ALT_MAX}
        >
          {_('Keep')}
        </button>
      </div>
    </form>
  );
};

const PlaySurface = ({ bookKey, toolbar }: PlaySurfaceProps) => {
  const _ = useTranslation();
  const { appService } = useEnv();
  const [session, setSession] = useState<PlaySession | null>(null);
  const [standInSeen, setStandInSeen] = useState(false);
  const [keeping, setKeeping] = useState(false);
  const sessionRef = useRef<PlaySession | null>(null);
  const entering = useRef(false);

  useEffect(() => {
    const reasons: Record<string, string> = {
      vertical: _('vertical text'),
      'fixed-layout': _('fixed layout'),
      ruby: _('ruby annotations'),
      table: _('tables'),
      svg: _('inline images'),
      math: _('math'),
      script: _('this script'),
      font: _('this font'),
      engine: _('the play engine could not start'),
      'not-placed': _("this Margin's passage isn't in this copy"),
    };
    const start = async (layerId?: string) => {
      const view = useReaderStore.getState().getView(bookKey);
      const data = useBookDataStore.getState().getBookData(bookKey);
      const progress = useReaderProgressStore.getState().progresses[bookKey];
      const host = view?.parentElement;
      if (!view || !host || !data?.book || !data.bookDoc || !appService || !progress?.range)
        throw new PlayUnavailable('range');
      const store = await openMarginsStore(appService);
      const ctx = marginsContext({ view, book: data.book, bookDoc: data.bookDoc, store });
      const preparing = setTimeout(() => toast(_('Preparing…')), PREPARING_DELAY_MS);
      await ctx.ready.finally(() => clearTimeout(preparing));
      return enterPlay({
        host,
        renderer: view.renderer,
        ctx,
        index: progress.index,
        range: progress.range,
        reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
        customFonts: useCustomFontStore.getState().getLoadedFonts(),
        layerId,
        store,
        onExit: () => {
          sessionRef.current = null;
          setSession(null);
          setKeeping(false);
        },
      });
    };
    const onEnter = async (event: CustomEvent) => {
      if (event.detail?.bookKey !== bookKey || entering.current || sessionRef.current) return;
      entering.current = true;
      try {
        const next = await start(event.detail?.layerId);
        sessionRef.current = next;
        setSession(next);
      } catch (error) {
        const reason = error instanceof PlayUnavailable ? reasons[error.reason] : undefined;
        toast(
          reason
            ? `${_("Play isn't available on this page yet")}: ${reason}`
            : _("Play isn't available on this page"),
        );
      } finally {
        entering.current = false;
      }
    };
    const onExit = (event: CustomEvent) => {
      if (event.detail?.bookKey === bookKey) sessionRef.current?.exit();
    };
    eventDispatcher.on('margins-play-enter', onEnter);
    eventDispatcher.on('margins-play-exit', onExit);
    return () => {
      eventDispatcher.off('margins-play-enter', onEnter);
      eventDispatcher.off('margins-play-exit', onExit);
    };
  }, [bookKey, appService, _]);

  useEffect(() => () => sessionRef.current?.exit(), []);

  if (!session) return null;
  const tools = playTools(_).map((t) =>
    t.id === 'play.keep' ? { ...t, run: () => setKeeping(true) } : t,
  );
  const showStandIn = session.tools.state.font === 'standIn' && !standInSeen;
  return (
    <>
      {showStandIn && (
        <div
          role='status'
          className='bg-base-200 absolute left-1/2 top-4 z-50 flex -translate-x-1/2 items-center gap-2 rounded px-3 py-1 text-xs'
        >
          {_('Play uses a stand-in font')}
          <button
            type='button'
            className='btn btn-ghost btn-xs'
            onClick={() => setStandInSeen(true)}
          >
            {_('Dismiss')}
          </button>
        </div>
      )}
      {keeping && (
        <KeepDialog bookKey={bookKey} play={session.tools} onDone={() => setKeeping(false)} />
      )}
      {toolbar ? (
        toolbar(session.tools, tools)
      ) : (
        <PlainToolbar play={session.tools} tools={tools} />
      )}
    </>
  );
};

export default PlaySurface;
