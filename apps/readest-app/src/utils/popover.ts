import { Position, Rect } from '@/utils/sel';

export const POPOVER_EDGE_PADDING = 8;
const ANCHOR_GAP = 6;

export const getToolbarAnchorPosition = (anchorRect: Rect, gap: number = ANCHOR_GAP): Position => ({
  dir: 'down',
  point: {
    x: (anchorRect.left + anchorRect.right) / 2,
    y: anchorRect.bottom + gap,
  },
});
