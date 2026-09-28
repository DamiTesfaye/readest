import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import type { Point } from '@/services/mindmap/records/geometry';
import type { MapStyle, RecordAnchor } from '@/services/mindmap/schema/types';
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
  onJumpToBook: (anchor: RecordAnchor) => void;
  onResetPosition?: (id: string) => void;
  bottomInset?: number;
}

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
  onJumpToBook,
  onResetPosition,
  bottomInset,
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

  useCanvasInput(rootRef, controller, wheelZooms);
  useMindmapShortcuts(rootRef, controller, focusRecord, animate);

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
    if (announcement) setMessage(announcement);
  }, [announcement]);

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
    if (controller.editing.get() !== null) return;
    event.preventDefault();
    controller.pointerCancel();
    const rect = event.currentTarget.getBoundingClientRect();
    const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    const hit = controller.spatial.hitTest(
      controller.camera.screenToPage(point),
      HIT_TOLERANCE_PX / controller.camera.get().z,
    );
    if (hit && !controller.selection.get().includes(hit)) controller.selection.set([hit]);
    setMenu(hit ? point : null);
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
      className='focus-visible:ring-base-content/15 relative h-full w-full touch-none select-none overflow-hidden outline-none focus-visible:ring-2'
      style={{ ...cssVars, background: 'var(--mm-canvas)' } as React.CSSProperties}
      onContextMenu={openMenu}
      onPointerDownCapture={(event) => {
        if (menu && !(event.target instanceof Element && event.target.closest('[role="menu"]')))
          setMenu(null);
      }}
    >
      <GridLayer camera={controller.camera} eink={eink} />
      <WorldLayer controller={controller} mapStyle={effectiveStyle} animate={animate} />
      <LiveLayer controller={controller} />
      <OverlayLayer controller={controller} eink={eink} />
      <ContextPill
        controller={controller}
        onJumpToBook={onJumpToBook}
        onResetPosition={onResetPosition}
      />
      {menu && (
        <RecordMenu
          controller={controller}
          at={menu}
          onClose={() => setMenu(null)}
          onJumpToBook={onJumpToBook}
          onResetPosition={onResetPosition}
        />
      )}
      <ToolDock controller={controller} bottomInset={bottomInset} />
      <ZoomControl controller={controller} animate={animate} bottomInset={bottomInset} />
      {reveal && <RevealChip {...reveal} />}
      <LiveRegion message={message} />
    </div>
  );
};

export default MindmapCanvas;
