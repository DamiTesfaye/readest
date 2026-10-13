import clsx from 'clsx';
import React, { useEffect, useRef, useState } from 'react';
import ModalPortal from '@/components/ModalPortal';
import { usePanelResize } from '@/hooks/usePanelResize';
import { useTranslation } from '@/hooks/useTranslation';
import { currentUserPlan } from '@/services/mindmap/entry';
import { type JumpTarget, resolveJumpTarget } from '@/services/mindmap/generate/anchors';
import type { MapSession } from '@/services/mindmap/persist/session';
import type { RecordAnchor } from '@/services/mindmap/schema/types';
import type { MindmapMode } from '@/services/mindmap/theme/presets';
import { type CanvasController, createCanvasController } from '@/services/mindmap/tools/controller';
import { registerCanvasController } from '@/services/mindmap/tools/controllerRegistry';
import { useBookDataStore } from '@/store/bookDataStore';
import { useMindmapViewStore } from '@/store/mindmapViewStore';
import { useReaderStore } from '@/store/readerStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useThemeStore } from '@/store/themeStore';
import type { UserPlan } from '@/types/quota';
import { resolveUIAnimationsEnabled } from '@/utils/animation';
import { eventDispatcher } from '@/utils/event';
import { getPanelTopInset } from '@/utils/insets';
import FogLayer from './FogLayer';
import { ChapterStartsContext } from './chapterStarts';
import MindmapCanvas from './MindmapCanvas';
import NewMapSheet from './NewMapSheet';
import SessionFallback from './SessionFallback';
import TopBar from './TopBar';
import { useDeleteMap, useMapList, useRemoteMapDelete } from './useBookMaps';
import { useBookLocator, useMapReconcile } from './useMapReconcile';
import { useMapReveal } from './useMapReveal';
import { useMediaQuery } from './useMediaQuery';
import { useMindmapSession } from './useMindmapSession';

export const DOCK_MEDIA_QUERY = '(min-width: 1024px)';
export const CAMERA_SAVE_DELAY_MS = 500;
const MIN_DOCK_WIDTH = 0.25;
const noticedSessions = new WeakSet<MapSession>();
const MAX_DOCK_WIDTH = 0.75;
const KEEP_INTERACTIVE = '.toast, [aria-live], [role="alert"], [role="status"]';

const inertOutside = (element: HTMLElement): (() => void) => {
  const changed: HTMLElement[] = [];
  for (
    let node = element;
    node.parentElement && node !== document.body;
    node = node.parentElement
  ) {
    for (const sibling of node.parentElement.children) {
      if (sibling === node || !(sibling instanceof HTMLElement)) continue;
      if (sibling.inert || sibling.matches(KEEP_INTERACTIVE)) continue;
      sibling.inert = true;
      changed.push(sibling);
    }
  }
  return () => {
    for (const sibling of changed) sibling.inert = false;
  };
};

export interface MindmapViewProps {
  onExport?: (mapId: string) => void;
  onResetPosition?: (mapId: string, recordId: string) => void;
}

interface WorkspaceProps extends MindmapViewProps {
  bookKey: string;
  bookHash: string;
  mapId: string;
  session: MapSession;
  docked: boolean;
  canDock: boolean;
}

const useCanvasController = (session: MapSession, mapId: string): CanvasController | null => {
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
    const saveNow = (): void => {
      if (timer) {
        clearTimeout(timer);
        saveCamera();
      }
      void session.flush();
    };
    const saveWhenHidden = (): void => {
      if (document.visibilityState === 'hidden') saveNow();
    };
    window.addEventListener('pagehide', saveNow);
    document.addEventListener('visibilitychange', saveWhenHidden);
    const unregister = registerCanvasController(mapId, created);
    setController(created);
    return () => {
      window.removeEventListener('pagehide', saveNow);
      document.removeEventListener('visibilitychange', saveWhenHidden);
      unregister();
      unsubscribe();
      if (timer) {
        clearTimeout(timer);
        saveCamera();
      }
      created.dispose();
    };
  }, [session, mapId]);
  return controller;
};

const MapWorkspace: React.FC<WorkspaceProps> = ({
  bookKey,
  bookHash,
  mapId,
  session,
  docked,
  canDock,
  onExport,
  onResetPosition,
}) => {
  const _ = useTranslation();
  const view = useMindmapViewStore();
  const { isDarkMode, safeAreaInsets, systemUIVisible, statusBarHeight } = useThemeStore();
  const { getView, getViewSettings, getProgress } = useReaderStore();
  const bookTitle = useBookDataStore((state) => state.getBookData(bookKey)?.book?.title ?? '');
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const uiAnimations = useSettingsStore((state) => resolveUIAnimationsEnabled(state.settings));
  const [meta, setMeta] = useState(session.meta());
  const [plan, setPlan] = useState<UserPlan | null>(null);
  const maps = useMapList(bookHash);
  const controller = useCanvasController(session, mapId);
  const eink = getViewSettings(bookKey)?.isEink ?? false;
  const mode: MindmapMode = eink ? 'eink' : isDarkMode ? 'dark' : 'light';
  const animate = !eink && uiAnimations && !reducedMotion;
  const locator = useBookLocator(bookKey);
  useMapReconcile({ bookKey, session, controller, locator, source: meta.source });
  const reveal = useMapReveal({ bookKey, session, controller, meta, locator, animate });
  const topInset = getPanelTopInset({
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
    if (noticedSessions.has(session)) return;
    noticedSessions.add(session);
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

  const jumpTarget = (anchor: RecordAnchor): JumpTarget | null => {
    const bookView = getView(bookKey);
    if (!bookView) return null;
    const sections = bookView.book?.sections.length ?? 0;
    return resolveJumpTarget(anchor, sections, (cfi) => {
      const index = bookView.resolveNavigation(cfi)?.index;
      return index !== undefined && index >= 0 && index < sections;
    });
  };

  const jumpToBook = (anchor: RecordAnchor): void => {
    const bookView = getView(bookKey);
    const target = jumpTarget(anchor);
    if (!bookView || !target) return;
    if (target.kind === 'cfi') bookView.goTo(target.cfi);
    else bookView.goToFraction(target.fraction);
    if (!docked) view.close();
  };

  const deleteMap = useDeleteMap(bookKey, bookHash, mapId, maps);

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
        onExport={onExport && (() => onExport(mapId))}
      />
      <div className='relative min-h-0 flex-1'>
        {controller && reveal.ready && (
          <ChapterStartsContext.Provider value={reveal.chapterStarts}>
            <MindmapCanvas
              controller={controller}
              title={meta.title}
              mapStyle={meta.style}
              mode={mode}
              animate={animate}
              wheelZooms={view.wheelZooms}
              autoFocus={!docked}
              reveal={view.reveal}
              announcement={view.announcement}
              announcementId={view.announcementId}
              onJumpToBook={jumpToBook}
              canJumpToBook={(anchor) => jumpTarget(anchor) !== null}
              onResetPosition={onResetPosition && ((id) => onResetPosition(mapId, id))}
              bottomInset={bottomInset}
              worldChildren={<FogLayer clusters={reveal.clusters} redacted={reveal.redacted} />}
            />
          </ChapterStartsContext.Provider>
        )}
      </div>
    </>
  );
};

const MindmapView: React.FC<MindmapViewProps> = ({ onExport, onResetPosition }) => {
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
  useRemoteMapDelete(bookKey, bookHash, mapId);
  const canDock = useMediaQuery(DOCK_MEDIA_QUERY);
  const docked = layout === 'docked' && canDock;
  const sectionRef = useRef<HTMLElement>(null);
  const fullscreen = Boolean(bookKey && mapId && bookHash) && !docked;
  useEffect(() => {
    if (!fullscreen || !sectionRef.current) return;
    return inertOutside(sectionRef.current);
  }, [fullscreen]);
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
          ref={sectionRef}
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
              onExport={onExport}
              onResetPosition={onResetPosition}
            />
          ) : (
            <SessionFallback state={session} bookKey={bookKey} bookHash={bookHash} mapId={mapId} />
          )}
        </section>
      )}
    </>
  );
};

export default MindmapView;
