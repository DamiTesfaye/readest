import React from 'react';
import { Position, Rect } from '@/utils/sel';

export const POPOVER_EDGE_PADDING = 8;
const ANCHOR_GAP = 6;

export const forwardBackdropClickToToolbar = (
  event: React.MouseEvent<HTMLElement>,
  excludeEl?: HTMLElement | null,
) => {
  const backdrop = event.currentTarget;
  const underlying = document
    .elementsFromPoint(event.clientX, event.clientY)
    .find((el) => el !== backdrop && !el.contains(backdrop) && !backdrop.contains(el));
  const button = underlying?.closest<HTMLButtonElement>('.header-bar button');
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
