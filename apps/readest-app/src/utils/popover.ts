import React from 'react';
import { Position, Rect, getPopupPosition } from '@/utils/sel';

export const POPOVER_EDGE_PADDING = 8;
const ANCHOR_GAP = 6;
const SIDE_PANEL_GAP = 12;
const SIDE_PANEL_POINTER_INSET = 110;
const SIDE_PANEL_POINTER_TOP_INSET = 64;

export interface PopoverPlacement {
  body: Position;
  pointer: Position;
}

export const forwardBackdropClickToToolbar = (
  event: React.MouseEvent<HTMLElement>,
  excludeEl?: HTMLElement | null,
) => {
  const backdrop = event.currentTarget;
  const underlying = document
    .elementsFromPoint(event.clientX, event.clientY)
    .find((el) => el !== backdrop && !el.contains(backdrop) && !backdrop.contains(el));
  const button = underlying?.closest<HTMLButtonElement>(
    '.header-bar button, .popup-container button',
  );
  if (!button || button.disabled) return;
  if (excludeEl && (excludeEl === button || excludeEl.contains(button))) return;
  button.click();
};

export const getToolbarAnchorPosition = (anchorRect: Rect, gap: number = ANCHOR_GAP): Position => ({
  dir: 'down',
  point: {
    x: (anchorRect.left + anchorRect.right) / 2,
    y: anchorRect.bottom + gap,
  },
});

export const getToolbarStackedPanelPlacement = (
  rowRect: Rect,
  viewport: Rect,
  panelWidth: number,
): PopoverPlacement => {
  const pointer = getToolbarAnchorPosition(rowRect);
  const body = getPopupPosition(pointer, viewport, panelWidth, 0, POPOVER_EDGE_PADDING);
  return { body, pointer };
};

export const getToolbarSidePanelPlacement = (
  anchorRect: Rect,
  viewport: Rect,
  anchorPopoverWidth: number,
  panelWidth: number,
  pointerY?: number,
): PopoverPlacement => {
  const anchorPointer = getToolbarAnchorPosition(anchorRect);
  const anchorBody = getPopupPosition(
    anchorPointer,
    viewport,
    anchorPopoverWidth,
    0,
    POPOVER_EDGE_PADDING,
  );
  const x = Math.max(POPOVER_EDGE_PADDING, anchorBody.point.x - SIDE_PANEL_GAP - panelWidth);
  const top = anchorBody.point.y;
  const y = pointerY == null ? top : Math.max(top, pointerY - SIDE_PANEL_POINTER_TOP_INSET);
  return {
    body: { dir: 'down', point: { x, y } },
    pointer: {
      dir: 'left',
      point: { x: x + panelWidth, y: pointerY ?? y + SIDE_PANEL_POINTER_INSET },
    },
  };
};
