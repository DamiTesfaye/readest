import { useEffect, useReducer, useRef, useState, type ReactNode } from 'react';
import { useEnv } from '@/context/EnvContext';
import { useTranslation } from '@/hooks/useTranslation';
import { marginsContext } from '@/services/margins/context';
import type { PlayTools } from '@/services/margins/play/session';
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

const PlaySurface = ({ bookKey, toolbar }: PlaySurfaceProps) => {
  const _ = useTranslation();
  const { appService } = useEnv();
  const [session, setSession] = useState<PlaySession | null>(null);
  const [standInSeen, setStandInSeen] = useState(false);
  const sessionRef = useRef<PlaySession | null>(null);
  const entering = useRef(false);

  useEffect(() => {
    const toast = (message: string) => eventDispatcher.dispatch('toast', { type: 'info', message });
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
        onExit: () => {
          sessionRef.current = null;
          setSession(null);
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
  const tools = playTools(_);
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
      {toolbar ? (
        toolbar(session.tools, tools)
      ) : (
        <PlainToolbar play={session.tools} tools={tools} />
      )}
    </>
  );
};

export default PlaySurface;
