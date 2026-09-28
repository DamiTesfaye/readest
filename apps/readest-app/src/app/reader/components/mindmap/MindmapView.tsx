import clsx from 'clsx';
import React, { useEffect, useState } from 'react';
import ModalPortal from '@/components/ModalPortal';
import Spinner from '@/components/Spinner';
import { useEnv } from '@/context/EnvContext';
import { usePanelResize } from '@/hooks/usePanelResize';
import { useTranslation } from '@/hooks/useTranslation';
import { currentUserPlan } from '@/services/mindmap/entry';
import { mindmapFsFromAppService } from '@/services/mindmap/persist/mindmapFs';
import { type MindmapIndexEntry, loadMindmapIndex } from '@/services/mindmap/persist/mindmapIndex';
import { useMindmapStore } from '@/services/mindmap/persist/mindmapStore';
import type { MapSession } from '@/services/mindmap/persist/session';
import type { RecordAnchor } from '@/services/mindmap/schema/types';
import type { MindmapMode } from '@/services/mindmap/theme/presets';
import { type CanvasController, createCanvasController } from '@/services/mindmap/tools/controller';
import { useBookDataStore } from '@/store/bookDataStore';
import { useMindmapViewStore } from '@/store/mindmapViewStore';
import { useReaderStore } from '@/store/readerStore';
import { useThemeStore } from '@/store/themeStore';
import type { UserPlan } from '@/types/quota';
import { eventDispatcher } from '@/utils/event';
import { getPanelTopInset } from '@/utils/insets';
import MindmapCanvas from './MindmapCanvas';
import NewMapSheet from './NewMapSheet';
import TopBar from './TopBar';
import { useMediaQuery } from './useMediaQuery';
import { type SessionState, useMindmapSession } from './useMindmapSession';

export const DOCK_MEDIA_QUERY = '(min-width: 1024px)';
export const CAMERA_SAVE_DELAY_MS = 500;
const MIN_DOCK_WIDTH = 0.25;
const MAX_DOCK_WIDTH = 0.75;

interface WorkspaceProps {
  bookKey: string;
  bookHash: string;
  mapId: string;
  session: MapSession;
  docked: boolean;
  canDock: boolean;
}

const useCanvasController = (session: MapSession): CanvasController | null => {
  const [controller, setController] = useState<CanvasController | null>(null);
  useEffect(() => {
    const created = createCanvasController({
      store: session.store,
      camera: session.meta().camera,
      readOnly: session.readOnly,
    });
    let timer: ReturnType<typeof setTimeout> | null = null;
    const saveCamera = (): void => {
      timer = null;
      session.updateMeta({ camera: created.camera.get() });
    };
    const unsubscribe = created.camera.subscribe(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(saveCamera, CAMERA_SAVE_DELAY_MS);
    });
    setController(created);
    return () => {
      unsubscribe();
      if (timer) {
        clearTimeout(timer);
        saveCamera();
      }
      created.dispose();
    };
  }, [session]);
  return controller;
};

const useMapList = (bookHash: string, session: MapSession): MindmapIndexEntry[] => {
  const { appService } = useEnv();
  const [maps, setMaps] = useState<MindmapIndexEntry[]>([]);
  useEffect(() => {
    if (!appService) return;
    const fs = mindmapFsFromAppService(appService);
    const refresh = (): void => {
      loadMindmapIndex(fs, bookHash)
        .then(setMaps)
        .catch((error: unknown) => console.error('mindmap: failed to list maps', error));
    };
    refresh();
    return session.listenSaved(refresh);
  }, [appService, bookHash, session]);
  return maps;
};

const MapWorkspace: React.FC<WorkspaceProps> = ({
  bookKey,
  bookHash,
  mapId,
  session,
  docked,
  canDock,
}) => {
  const _ = useTranslation();
  const view = useMindmapViewStore();
  const { isDarkMode, safeAreaInsets, systemUIVisible, statusBarHeight } = useThemeStore();
  const { getView, getViewSettings, getProgress } = useReaderStore();
  const bookTitle = useBookDataStore((state) => state.getBookData(bookKey)?.book?.title ?? '');
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const [meta, setMeta] = useState(session.meta());
  const [plan, setPlan] = useState<UserPlan>('free');
  const maps = useMapList(bookHash, session);
  const controller = useCanvasController(session);
  const eink = getViewSettings(bookKey)?.isEink ?? false;
  const mode: MindmapMode = eink ? 'eink' : isDarkMode ? 'dark' : 'light';
  const topInset = docked
    ? 0
    : getPanelTopInset({
        isMobile: false,
        isFullHeightInMobile: true,
        systemUIVisible,
        statusBarHeight,
        safeAreaInsets,
      });
  const bottomInset = docked ? 0 : safeAreaInsets?.bottom || 0;

  useEffect(() => session.listenMeta(setMeta), [session]);
  useEffect(() => {
    currentUserPlan()
      .then(setPlan)
      .catch((error: unknown) => console.error('mindmap: failed to read the plan', error));
  }, []);

  useEffect(() => {
    if (session.restoredFromBackup) {
      eventDispatcher.dispatch('toast', {
        type: 'info',
        message: _('This map was restored from its backup'),
      });
    }
    if (session.readOnly) {
      eventDispatcher.dispatch('toast', {
        type: 'warning',
        message: _('This map opened read-only and changes will not be saved'),
      });
    }
  }, [session, _]);

  const jumpToBook = (anchor: RecordAnchor): void => {
    getView(bookKey)?.goTo(anchor.cfi);
    if (!docked) view.close();
  };

  const deleteMap = async (): Promise<void> => {
    try {
      await useMindmapStore.getState().moveToTrash(mapId);
      const next = maps.find((entry) => entry.mapId !== mapId);
      if (next) view.showMap(bookKey, next.mapId);
      else view.close();
    } catch (error) {
      console.error('mindmap: failed to delete the map', error);
      eventDispatcher.dispatch('toast', {
        type: 'error',
        message: _('Could not delete the mind map'),
      });
    }
  };

  return (
    <>
      <TopBar
        mapId={mapId}
        topInset={topInset}
        meta={meta}
        maps={maps}
        plan={plan}
        bookTitle={bookTitle}
        page={(getProgress(bookKey)?.pageinfo?.current ?? 0) + 1}
        eink={eink}
        readOnly={session.readOnly}
        docked={docked}
        canDock={canDock}
        wheelZooms={view.wheelZooms}
        onBack={view.close}
        onSwitchMap={(next) => view.showMap(bookKey, next)}
        onNewMap={() => view.showSheet(bookKey)}
        onRename={(title) => session.updateMeta({ title })}
        onStyle={(style) => session.updateMeta({ style })}
        onToggleDock={() => view.setLayout(docked ? 'fullscreen' : 'docked')}
        onToggleWheelZooms={() => view.setWheelZooms(!view.wheelZooms)}
        onDelete={() => void deleteMap()}
      />
      <div className='relative min-h-0 flex-1'>
        {controller && (
          <MindmapCanvas
            controller={controller}
            title={meta.title}
            mapStyle={meta.style}
            mode={mode}
            animate={!eink && !reducedMotion}
            wheelZooms={view.wheelZooms}
            autoFocus={!docked}
            reveal={view.reveal}
            announcement={view.announcement}
            onJumpToBook={jumpToBook}
            bottomInset={bottomInset}
          />
        )}
      </div>
    </>
  );
};

const SessionFallback: React.FC<{ state: SessionState; mapId: string }> = ({ state, mapId }) => {
  const _ = useTranslation();
  const { close } = useMindmapViewStore();
  if (state.status === 'loading') {
    return (
      <div className='flex flex-1 items-center justify-center'>
        <Spinner loading />
      </div>
    );
  }
  return (
    <div
      data-testid='mm-error'
      className='flex flex-1 flex-col items-center justify-center gap-4 p-6 text-sm'
    >
      <p>
        {state.status === 'already-open'
          ? _('This map is already open in another window')
          : _('This map could not be opened')}
      </p>
      <div className='flex gap-2'>
        <button type='button' className='btn btn-ghost' onClick={close}>
          {_('Close')}
        </button>
        {state.status === 'unreadable' && (
          <button
            type='button'
            className='btn btn-error'
            onClick={() => {
              useMindmapStore
                .getState()
                .moveToTrash(mapId)
                .then(close)
                .catch((error: unknown) =>
                  console.error('mindmap: failed to delete the map', error),
                );
            }}
          >
            {_('Delete map')}
          </button>
        )}
      </div>
    </div>
  );
};

const MindmapView: React.FC = () => {
  const _ = useTranslation();
  const { bookKey, mapId, sheetOpen, layout, dockWidth, setDockWidth, close } =
    useMindmapViewStore();
  const { bookKeys } = useReaderStore();
  const bookHash = useBookDataStore((state) =>
    bookKey ? (state.getBookData(bookKey)?.book?.hash ?? null) : null,
  );
  useEffect(() => {
    if (bookKey && !bookKeys.includes(bookKey)) close();
  }, [bookKey, bookKeys, close]);
  const session = useMindmapSession(mapId ? bookHash : null, mapId);
  const canDock = useMediaQuery(DOCK_MEDIA_QUERY);
  const docked = layout === 'docked' && canDock;
  const { handleResizeStart, handleResizeKeyDown } = usePanelResize({
    side: 'end',
    minWidth: MIN_DOCK_WIDTH,
    maxWidth: MAX_DOCK_WIDTH,
    getWidth: () => dockWidth,
    onResize: setDockWidth,
  });
  if (!bookKey) return null;
  return (
    <>
      {sheetOpen && (
        <ModalPortal showOverlay={false}>
          <NewMapSheet bookKey={bookKey} />
        </ModalPortal>
      )}
      {mapId && bookHash && (
        <section
          data-testid='mm-view'
          data-mindmap-view
          data-layout={docked ? 'docked' : 'fullscreen'}
          aria-label={_('Mind map')}
          className={clsx(
            'bg-base-200 flex flex-col',
            docked ? 'border-base-300 relative h-full shrink-0 border-s' : 'fixed inset-0 z-[100]',
          )}
          style={docked ? { width: dockWidth } : undefined}
        >
          {docked && (
            <div
              role='slider'
              tabIndex={0}
              aria-label={_('Resize mind map')}
              aria-orientation='horizontal'
              aria-valuenow={parseFloat(dockWidth)}
              className='drag-bar absolute -start-2 top-0 z-10 h-full w-0.5 cursor-col-resize bg-transparent p-2'
              onMouseDown={handleResizeStart}
              onTouchStart={handleResizeStart}
              onKeyDown={handleResizeKeyDown}
            />
          )}
          {session.status === 'open' ? (
            <MapWorkspace
              key={mapId}
              bookKey={bookKey}
              bookHash={bookHash}
              mapId={mapId}
              session={session.session}
              docked={docked}
              canDock={canDock}
            />
          ) : (
            <SessionFallback state={session} mapId={mapId} />
          )}
        </section>
      )}
    </>
  );
};

export default MindmapView;
