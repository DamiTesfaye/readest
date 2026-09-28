import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import type { Point } from '@/services/mindmap/records/geometry';
import type { MapStyle, RecordAnchor } from '@/services/mindmap/schema/types';
import { isLive } from '@/services/mindmap/spatial/spatialIndex';
import { type MindmapMode, mindmapCssVars } from '@/services/mindmap/theme/presets';
import type { CanvasController } from '@/services/mindmap/tools/controller';
import { HIT_TOLERANCE_PX } from '@/services/mindmap/tools/types';
import ContextPill, { RecordMenu } from './ContextPill';
import GridLayer from './GridLayer';
import LiveLayer from './LiveLayer';
import LiveRegion from './LiveRegion';
import OverlayLayer from './OverlayLayer';
import RevealChip, { type RevealSummary } from './RevealChip';
import ToolDock from './ToolDock';
import WorldLayer from './WorldLayer';
import ZoomControl from './ZoomControl';
import { toolLabels } from './toolLabels';
import { useCanvasInput } from './useCanvasInput';
import { useAtomValue } from './useCanvasStores';
import { useMindmapShortcuts } from './useMindmapShortcuts';

export interface MindmapCanvasProps {
  controller: CanvasController;
  title: string;
  mapStyle: MapStyle;
  mode: MindmapMode;
  animate: boolean;
  wheelZooms: boolean;
  autoFocus: boolean;
  reveal: RevealSummary | null;
  announcement: string;
  announcementId?: number;
  onJumpToBook: (anchor: RecordAnchor) => void;
  canJumpToBook?: (anchor: RecordAnchor) => boolean;
  onResetPosition?: (id: string) => void;
  bottomInset?: number;
  worldChildren?: React.ReactNode;
}

const REPEAT_MARK = '\u00a0';
const STACKED_CHROME_BELOW_PX = 800;
const DOCK_ROW_PX = 60;

const markRepeats = (message: string, id: number): string =>
  id % 2 === 0 ? `${message}${REPEAT_MARK}` : message;

const isDefaultCamera = ({ x, y, z }: { x: number; y: number; z: number }): boolean =>
  x === 0 && y === 0 && z === 1;

const MindmapCanvas: React.FC<MindmapCanvasProps> = ({
  controller,
  title,
  mapStyle,
  mode,
  animate,
  wheelZooms,
  autoFocus,
  reveal,
  announcement,
  announcementId = 0,
  onJumpToBook,
  canJumpToBook,
  onResetPosition,
  bottomInset,
  worldChildren,
}) => {
  const _ = useTranslation();
  const rootRef = useRef<HTMLDivElement>(null);
  const [message, setMessage] = useState('');
  const [menu, setMenu] = useState<Point | null>(null);
  const eink = mode === 'eink';
  const effectiveStyle: MapStyle = eink ? 'ink' : mapStyle;
  const cssVars = useMemo(() => mindmapCssVars(mode), [mode]);

  const focusRecord = useCallback((id: string) => {
    rootRef.current
      ?.querySelector<HTMLElement>(`[data-record-id="${CSS.escape(id)}"]`)
      ?.focus({ preventScroll: true });
  }, []);

  const focusSelectionOrRoot = useCallback((): void => {
    const root = rootRef.current;
    if (!root) return;
    const selection = controller.selection.get();
    const id = selection.length === 1 ? selection[0]! : null;
    const target =
      id && isLive(controller.store.get(id))
        ? root.querySelector<HTMLElement>(`[data-record-id="${CSS.escape(id)}"]`)
        : null;
    (target ?? root).focus({ preventScroll: true });
  }, [controller]);

  const keepFocus = useCallback((): void => {
    requestAnimationFrame(() => {
      const active = document.activeElement;
      if (!active || active === document.body || !active.isConnected) focusSelectionOrRoot();
    });
  }, [focusSelectionOrRoot]);

  const closeMenu = useCallback(
    (returnFocus: boolean): void => {
      setMenu(null);
      if (!returnFocus) return;
      focusSelectionOrRoot();
      keepFocus();
    },
    [focusSelectionOrRoot, keepFocus],
  );

  const press = useRef(0);
  const menuPress = useRef(-1);
  const openMenuAt = useCallback(
    (point: Point): boolean => {
      if (controller.editing.get() !== null) return false;
      if (menuPress.current === press.current) return true;
      menuPress.current = press.current;
      controller.pointerCancel();
      const hit = controller.spatial.hitTest(
        controller.camera.screenToPage(point),
        HIT_TOLERANCE_PX / controller.camera.get().z,
      );
      if (hit && !controller.selection.get().includes(hit)) controller.selection.set([hit]);
      setMenu(hit ? point : null);
      return true;
    },
    [controller],
  );

  useCanvasInput(rootRef, controller, wheelZooms, openMenuAt);
  useMindmapShortcuts(rootRef, controller, focusRecord, animate, keepFocus);

  useEffect(() => {
    const root = rootRef.current!;
    let fitted = !isDefaultCamera(controller.camera.get());
    const measure = (): void => {
      controller.viewport.set({ width: root.clientWidth, height: root.clientHeight });
      if (!fitted && root.clientWidth > 0 && root.clientHeight > 0) {
        fitted = true;
        controller.fitView(false);
      }
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    return () => observer.disconnect();
  }, [controller]);

  useEffect(() => {
    if (autoFocus) rootRef.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  useEffect(() => {
    const labels = toolLabels(_);
    return controller.tool.subscribe(() => {
      setMessage(_('{{tool}} tool', { tool: labels[controller.tool.get()] }));
    });
  }, [controller, _]);

  useEffect(() => {
    if (announcement) setMessage(markRepeats(announcement, announcementId));
  }, [announcement, announcementId]);

  const viewport = useAtomValue(controller.viewport);
  const stacked = viewport.width > 0 && viewport.width < STACKED_CHROME_BELOW_PX;
  const cornerInset = (bottomInset || 0) + (stacked ? DOCK_ROW_PX : 0);

  const editing = useAtomValue(controller.editing);
  const wasEditing = useRef(false);
  useEffect(() => {
    const root = rootRef.current;
    const lostFocus = !document.activeElement || document.activeElement === document.body;
    if (wasEditing.current && editing === null && root && lostFocus)
      root.focus({ preventScroll: true });
    wasEditing.current = editing !== null;
  }, [editing]);

  const openMenu = (event: React.MouseEvent<HTMLDivElement>): void => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (openMenuAt({ x: event.clientX - rect.left, y: event.clientY - rect.top })) {
      event.preventDefault();
    }
  };

  return (
    <div
      ref={rootRef}
      data-mindmap-root
      data-testid='mindmap-canvas'
      data-mm-mode={mode}
      data-mm-style={effectiveStyle}
      role='application'
      aria-label={_('Mind map: {{title}}', { title: title || _('Untitled map') })}
      tabIndex={0}
      className='focus-visible:ring-base-content relative h-full w-full touch-none select-none overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-inset'
      style={{ ...cssVars, background: 'var(--mm-canvas)' } as React.CSSProperties}
      onContextMenu={openMenu}
      onKeyDownCapture={() => {
        press.current += 1;
      }}
      onPointerDownCapture={() => {
        press.current += 1;
      }}
    >
      <GridLayer camera={controller.camera} eink={eink} />
      <WorldLayer controller={controller} mapStyle={effectiveStyle} animate={animate}>
        {worldChildren}
      </WorldLayer>
      <LiveLayer controller={controller} />
      <OverlayLayer controller={controller} eink={eink} />
      <ContextPill
        controller={controller}
        onJumpToBook={onJumpToBook}
        canJumpToBook={canJumpToBook}
        onResetPosition={onResetPosition}
        onFocusLost={keepFocus}
        eink={eink}
      />
      {menu && (
        <RecordMenu
          controller={controller}
          at={menu}
          onClose={closeMenu}
          onJumpToBook={onJumpToBook}
          canJumpToBook={canJumpToBook}
          onResetPosition={onResetPosition}
        />
      )}
      <ToolDock controller={controller} bottomInset={bottomInset} />
      <ZoomControl controller={controller} animate={animate} bottomInset={cornerInset} />
      {reveal && <RevealChip {...reveal} bottomInset={cornerInset} />}
      <LiveRegion message={message} />
    </div>
  );
};

export default MindmapCanvas;
