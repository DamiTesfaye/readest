import React from 'react';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const riveMock = vi.hoisted(() => {
  const hover = { value: false };
  const instances: Array<{ play: ReturnType<typeof vi.fn> }> = [];
  class Rive {
    play = vi.fn();
    cleanup = vi.fn();
    resizeDrawingSurfaceToCanvas = vi.fn();
    viewModelInstance = {
      boolean: (name: string) => (name === 'hover' ? hover : null),
      color: () => ({ rgb: vi.fn() }),
    };
    constructor(options: Record<string, unknown>) {
      instances.push(this);
      queueMicrotask(() => (options['onLoad'] as () => void)());
    }
  }
  return { Rive, hover, instances };
});
const { dispatch } = vi.hoisted(() => ({ dispatch: vi.fn() }));
let themeColor = 'default';
let isDarkMode = false;

vi.mock('@rive-app/canvas', () => ({
  Rive: riveMock.Rive,
  Layout: class {},
  Fit: { Contain: 'contain' },
  Alignment: { Center: 'center' },
  RuntimeLoader: { setWasmUrl: vi.fn(), setWasmFallbackUrl: vi.fn() },
}));
vi.mock('@/hooks/useTranslation', () => ({ useTranslation: () => (s: string) => s }));
vi.mock('@/context/EnvContext', () => ({ useEnv: () => ({ envConfig: { env: 'test' } }) }));
vi.mock('@/store/themeStore', () => ({ useThemeStore: () => ({ themeColor, isDarkMode }) }));
vi.mock('@/store/readerStore', () => ({
  useReaderStore: () => ({ getViewSettings: () => ({ readingRulerEnabled: false }) }),
}));
vi.mock('@/helpers/settings', () => ({ saveViewSettings: vi.fn() }));
vi.mock('@/utils/event', () => ({ eventDispatcher: { dispatch } }));
vi.mock('@/components/ToolbarPopover', () => ({
  default: ({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) =>
    isOpen ? <div>{children}</div> : null,
}));

import MorePopover from '@/app/reader/components/MorePopover';

const popover = (overrides: Partial<React.ComponentProps<typeof MorePopover>> = {}) => (
  <MorePopover
    bookKey='book-1'
    isOpen
    anchorEl={document.body}
    onClose={vi.fn()}
    onGoHome={vi.fn()}
    onOpenThemeFonts={vi.fn()}
    onOpenBooknotes={vi.fn()}
    onOpenAnnotations={vi.fn()}
    {...overrides}
  />
);

const tile = () => screen.getByRole('button', { name: 'Moving Pictures' });

beforeEach(() => {
  riveMock.instances.length = 0;
  riveMock.hover.value = false;
  themeColor = 'default';
  isDarkMode = false;
  dispatch.mockReset();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })),
  );
  document.documentElement.removeAttribute('data-ui-anim');
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('MorePopover Moving Pictures tile', () => {
  it('sits right of Reading Ruler in Reading Tools with the art, the label and the beta tag', () => {
    render(popover());
    const row = screen.getByText('Reading Tools').nextElementSibling as HTMLElement;
    const buttons = Array.from(row.querySelectorAll('button'));
    expect(buttons.map((b) => b.textContent)).toEqual(['Reading Ruler', 'Moving Pictures']);
    expect(tile().querySelector('img[src="/images/toolbar/moving-pictures.svg"]')).toBeTruthy();
    expect(tile().querySelector('img[src="/images/toolbar/beta-tag.svg"]')).toBeTruthy();
    expect(screen.getByText('Moving Pictures').className).toContain('popover-action-label');
  });

  it('loads and plays the animation when the popover opens, not before', async () => {
    const { rerender } = render(popover({ isOpen: false }));
    expect(riveMock.instances).toHaveLength(0);
    rerender(popover({ isOpen: true }));
    await waitFor(() => expect(riveMock.instances[0]?.play).toHaveBeenCalledTimes(1));
    expect(fetch).toHaveBeenCalledWith('/rive/moving-pictures.riv');
  });

  it('bounces while the mouse or pen is over the tile and ignores touch', async () => {
    render(popover());
    await waitFor(() => expect(riveMock.instances[0]?.play).toHaveBeenCalled());
    fireEvent.pointerEnter(tile(), { pointerType: 'touch' });
    expect(riveMock.hover.value).toBe(false);
    fireEvent.pointerEnter(tile(), { pointerType: 'mouse' });
    expect(riveMock.hover.value).toBe(true);
    fireEvent.pointerLeave(tile(), { pointerType: 'mouse' });
    expect(riveMock.hover.value).toBe(false);
    fireEvent.pointerEnter(tile(), { pointerType: 'pen' });
    expect(riveMock.hover.value).toBe(true);
  });

  it('does not start hovered when the popover reopens after closing under the pointer', async () => {
    const { rerender } = render(popover());
    await waitFor(() => expect(riveMock.instances[0]?.play).toHaveBeenCalled());
    fireEvent.pointerEnter(tile(), { pointerType: 'mouse' });
    rerender(popover({ isOpen: false }));
    rerender(popover({ isOpen: true }));
    await waitFor(() => expect(riveMock.instances[1]?.play).toHaveBeenCalled());
    expect(riveMock.hover.value).toBe(false);
  });

  it('uses the muted art and palette in muted themes', async () => {
    isDarkMode = true;
    render(popover());
    expect(
      tile().querySelector('img[src="/images/toolbar/moving-pictures-muted.svg"]'),
    ).toBeTruthy();
    await waitFor(() => expect(riveMock.instances[0]?.play).toHaveBeenCalled());
  });

  it('shows only the static art when motion is off', async () => {
    document.documentElement.setAttribute('data-ui-anim', 'off');
    render(popover());
    await Promise.resolve();
    expect(riveMock.instances).toHaveLength(0);
    expect(tile().querySelector('canvas')).toBeNull();
    expect(tile().querySelector('img[src="/images/toolbar/moving-pictures.svg"]')).toBeTruthy();
  });

  it('shows the coming soon toast and closes on click', () => {
    const onClose = vi.fn();
    render(popover({ onClose }));
    fireEvent.click(tile());
    expect(dispatch).toHaveBeenCalledWith('toast', { type: 'info', message: 'Coming soon' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
