import { describe, it, expect } from 'vitest';
import { getToolbarAnchorPosition, POPOVER_EDGE_PADDING } from '@/utils/popover';
import { getPopupPosition } from '@/utils/sel';

const viewport = { left: 0, top: 0, right: 1280, bottom: 800 };

describe('getToolbarAnchorPosition', () => {
  it('points down from the anchor center with a gap below the anchor', () => {
    const anchor = { left: 100, top: 8, right: 132, bottom: 40 };
    const pos = getToolbarAnchorPosition(anchor);
    expect(pos.dir).toBe('down');
    expect(pos.point.x).toBe(116);
    expect(pos.point.y).toBeGreaterThan(40);
  });
});

describe('toolbar popover placement', () => {
  it('keeps the pointer over a right-edge anchor while the body clamps inside the viewport', () => {
    const anchor = { left: 1240, top: 8, right: 1272, bottom: 40 };
    const tri = getToolbarAnchorPosition(anchor);
    const body = getPopupPosition(tri, viewport, 264, 0, POPOVER_EDGE_PADDING);
    expect(body.point.x + 264).toBeLessThanOrEqual(viewport.right - POPOVER_EDGE_PADDING);
    expect(tri.point.x).toBeGreaterThan(body.point.x);
    expect(tri.point.x).toBeLessThan(body.point.x + 264);
  });

  it('keeps the pointer over a left-edge anchor while the body clamps inside the viewport', () => {
    const anchor = { left: 4, top: 8, right: 36, bottom: 40 };
    const tri = getToolbarAnchorPosition(anchor);
    const body = getPopupPosition(tri, viewport, 264, 0, POPOVER_EDGE_PADDING);
    expect(body.point.x).toBeGreaterThanOrEqual(POPOVER_EDGE_PADDING);
    expect(tri.point.x).toBeGreaterThan(body.point.x);
    expect(tri.point.x).toBeLessThan(body.point.x + 264);
  });

  it('centers the body under a mid-toolbar anchor', () => {
    const anchor = { left: 624, top: 8, right: 656, bottom: 40 };
    const tri = getToolbarAnchorPosition(anchor);
    const body = getPopupPosition(tri, viewport, 264, 0, POPOVER_EDGE_PADDING);
    expect(body.point.x).toBe(640 - 132);
  });
});
