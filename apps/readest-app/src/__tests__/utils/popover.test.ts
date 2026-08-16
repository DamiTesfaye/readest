import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  POPOVER_EDGE_PADDING,
  forwardBackdropClickToToolbar,
  getToolbarSidePanelPlacement,
  getToolbarStackedPanelPlacement,
} from '@/utils/popover';

describe('forwardBackdropClickToToolbar', () => {
  let tocButton: HTMLButtonElement;
  let tocIcon: HTMLImageElement;
  let libraryButton: HTMLButtonElement;
  let contentButton: HTMLButtonElement;
  let portalWrapper: HTMLDivElement;
  let backdrop: HTMLDivElement;

  const makeEvent = () =>
    ({
      clientX: 100,
      clientY: 20,
      currentTarget: backdrop,
    }) as unknown as React.MouseEvent<HTMLElement>;

  const stubStack = (stack: Element[]) => {
    document.elementsFromPoint = vi.fn().mockReturnValue(stack);
  };

  beforeEach(() => {
    document.body.innerHTML = `
      <div class="header-bar">
        <button id="toc"><img id="toc-icon" alt="" /></button>
        <button id="library"></button>
      </div>
      <main id="content"><button id="content-btn"></button></main>
      <div id="portal">
        <div id="backdrop"></div>
      </div>
    `;
    tocButton = document.getElementById('toc') as HTMLButtonElement;
    tocIcon = document.getElementById('toc-icon') as HTMLImageElement;
    libraryButton = document.getElementById('library') as HTMLButtonElement;
    contentButton = document.getElementById('content-btn') as HTMLButtonElement;
    portalWrapper = document.getElementById('portal') as HTMLDivElement;
    backdrop = document.getElementById('backdrop') as HTMLDivElement;
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('forwards the click to a toolbar button under the backdrop', () => {
    const onClick = vi.fn();
    tocButton.addEventListener('click', onClick);
    stubStack([backdrop, portalWrapper, tocIcon, tocButton, document.body]);

    forwardBackdropClickToToolbar(makeEvent(), libraryButton);

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not forward when the underlying button is the excluded anchor', () => {
    const onClick = vi.fn();
    libraryButton.addEventListener('click', onClick);
    stubStack([backdrop, portalWrapper, libraryButton, document.body]);

    forwardBackdropClickToToolbar(makeEvent(), libraryButton);

    expect(onClick).not.toHaveBeenCalled();
  });

  it('forwards the click to a popover row button under the backdrop', () => {
    const popup = document.createElement('div');
    popup.className = 'popup-container';
    popup.innerHTML = '<button id="row"><span id="row-label"></span></button>';
    document.body.appendChild(popup);
    const rowButton = popup.querySelector('#row') as HTMLButtonElement;
    const rowLabel = popup.querySelector('#row-label') as HTMLElement;
    const onClick = vi.fn();
    rowButton.addEventListener('click', onClick);
    stubStack([backdrop, portalWrapper, rowLabel, rowButton, popup, document.body]);

    forwardBackdropClickToToolbar(makeEvent(), libraryButton);

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not forward clicks landing outside the header bar', () => {
    const onClick = vi.fn();
    contentButton.addEventListener('click', onClick);
    stubStack([backdrop, portalWrapper, contentButton, document.body]);

    forwardBackdropClickToToolbar(makeEvent());

    expect(onClick).not.toHaveBeenCalled();
  });

  it('does not forward to disabled toolbar buttons', () => {
    const onClick = vi.fn();
    tocButton.disabled = true;
    tocButton.addEventListener('click', onClick);
    stubStack([backdrop, portalWrapper, tocButton, document.body]);

    forwardBackdropClickToToolbar(makeEvent());

    expect(onClick).not.toHaveBeenCalled();
  });

  it('ignores the backdrop and its full-screen ancestors when hit-testing', () => {
    const onClick = vi.fn();
    tocButton.addEventListener('click', onClick);
    stubStack([backdrop, portalWrapper, document.body, document.documentElement]);

    forwardBackdropClickToToolbar(makeEvent());

    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('getToolbarSidePanelPlacement', () => {
  const viewport = { left: 0, top: 0, right: 1400, bottom: 800 };
  const anchorRect = { left: 1360, right: 1392, top: 8, bottom: 40 };

  it('places the panel to the left of the anchored popover, tops aligned', () => {
    const { body } = getToolbarSidePanelPlacement(anchorRect, viewport, 300, 300);
    const anchorPopoverLeft = 1400 - POPOVER_EDGE_PADDING - 300;
    expect(body.point.x).toBeLessThan(anchorPopoverLeft);
    expect(body.point.x + 300).toBeLessThanOrEqual(anchorPopoverLeft);
    expect(body.point.y).toBe(40 + 6 + 6);
  });

  it('points the pointer right, at the panel edge facing the anchored popover', () => {
    const { body, pointer } = getToolbarSidePanelPlacement(anchorRect, viewport, 300, 300);
    expect(pointer.dir).toBe('left');
    expect(pointer.point.x).toBe(body.point.x + 300);
    expect(pointer.point.y).toBeGreaterThan(body.point.y);
  });

  it('aligns the pointer with the triggering row and drops the panel top near it', () => {
    const { body, pointer } = getToolbarSidePanelPlacement(anchorRect, viewport, 300, 300, 360);
    expect(pointer.point.y).toBe(360);
    expect(body.point.y).toBe(360 - 64);
  });

  it('keeps the panel top-aligned when the row sits near the popover top', () => {
    const { body, pointer } = getToolbarSidePanelPlacement(anchorRect, viewport, 300, 300, 80);
    expect(pointer.point.y).toBe(80);
    expect(body.point.y).toBe(40 + 6 + 6);
  });

  it('clamps the panel inside the viewport on narrow screens', () => {
    const narrow = { left: 0, top: 0, right: 600, bottom: 800 };
    const { body } = getToolbarSidePanelPlacement(anchorRect, narrow, 300, 300);
    expect(body.point.x).toBe(POPOVER_EDGE_PADDING);
  });
});

describe('getToolbarStackedPanelPlacement', () => {
  const viewport = { left: 0, top: 0, right: 1400, bottom: 800 };
  const rowRect = { left: 1000, right: 1200, top: 300, bottom: 360 };

  it('drops the panel below the row with an up pointer at the row center', () => {
    const { body, pointer } = getToolbarStackedPanelPlacement(rowRect, viewport, 320);
    expect(pointer.dir).toBe('down');
    expect(pointer.point).toEqual({ x: 1100, y: 366 });
    expect(body.point).toEqual({ x: 940, y: 372 });
  });

  it('clamps the panel inside the viewport near the right edge', () => {
    const edgeRow = { left: 1250, right: 1390, top: 300, bottom: 360 };
    const { body, pointer } = getToolbarStackedPanelPlacement(edgeRow, viewport, 320);
    expect(body.point.x).toBe(1400 - POPOVER_EDGE_PADDING - 320);
    expect(pointer.point.x).toBe(1320);
  });
});
