import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, act, waitFor } from '@testing-library/react';

const riveMock = vi.hoisted(() => {
  const hover = { value: false };
  const colors: Record<string, { rgb: ReturnType<typeof vi.fn> }> = {
    ball: { rgb: vi.fn() },
    puff: { rgb: vi.fn() },
    marks: { rgb: vi.fn() },
  };
  const instances: Array<{
    options: Record<string, unknown>;
    play: ReturnType<typeof vi.fn>;
    cleanup: ReturnType<typeof vi.fn>;
    resizeDrawingSurfaceToCanvas: ReturnType<typeof vi.fn>;
    drawFrame: ReturnType<typeof vi.fn>;
  }> = [];
  class Rive {
    options: Record<string, unknown>;
    play = vi.fn();
    cleanup = vi.fn();
    resizeDrawingSurfaceToCanvas = vi.fn();
    drawFrame = vi.fn();
    viewModelInstance = {
      boolean: (name: string) => (name === 'hover' ? hover : null),
      color: (name: string) => colors[name] ?? null,
    };
    constructor(options: Record<string, unknown>) {
      this.options = options;
      instances.push(this);
      queueMicrotask(() => (options['onLoad'] as () => void)());
    }
  }
  return { Rive, hover, colors, instances };
});

vi.mock('@rive-app/canvas', () => ({
  Rive: riveMock.Rive,
  Layout: class {},
  Fit: { Contain: 'contain' },
  Alignment: { Center: 'center' },
  RuntimeLoader: { setWasmUrl: vi.fn(), setWasmFallbackUrl: vi.fn() },
}));

import TextInMotionArt from '@/components/motionrive/TextInMotionArt';

const resizeObservers: Array<{ callback: () => void; target: Element | null }> = [];

class ResizeObserverStub {
  entry: { callback: () => void; target: Element | null };
  constructor(callback: () => void) {
    this.entry = { callback, target: null };
    resizeObservers.push(this.entry);
  }
  observe(target: Element) {
    this.entry.target = target;
  }
  disconnect() {
    this.entry.target = null;
  }
}

const renderArt = (props: Partial<React.ComponentProps<typeof TextInMotionArt>> = {}) =>
  render(<TextInMotionArt themeName='default' isDarkMode={false} hovered={false} {...props} />);

const loadedInstance = async () => {
  await waitFor(() =>
    expect(screen.getByTestId('text-in-motion-canvas').className).toContain('opacity-100'),
  );
  return riveMock.instances[0]!;
};

const expectPalette = (ball: number[], marks: number[]) => {
  expect(riveMock.colors['ball']!.rgb).toHaveBeenLastCalledWith(...ball);
  expect(riveMock.colors['puff']!.rgb).toHaveBeenLastCalledWith(...ball);
  expect(riveMock.colors['marks']!.rgb).toHaveBeenLastCalledWith(...marks);
};

beforeEach(() => {
  riveMock.instances.length = 0;
  resizeObservers.length = 0;
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  riveMock.hover.value = false;
  for (const color of Object.values(riveMock.colors)) color.rgb.mockClear();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })),
  );
  document.documentElement.removeAttribute('data-ui-anim');
  document.documentElement.removeAttribute('data-eink');
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('TextInMotionArt', () => {
  it('loads the file with its own listeners disabled and plays once the colours are set', async () => {
    renderArt();
    const rive = await loadedInstance();
    expect(fetch).toHaveBeenCalledWith('/rive/moving-pictures.riv');
    expect(rive.options['stateMachines']).toBe('Motion');
    expect(rive.options['autoBind']).toBe(true);
    expect(rive.options['autoplay']).toBe(false);
    expect(rive.options['shouldDisableRiveListeners']).toBe(true);
    expect(rive.play).toHaveBeenCalledTimes(1);
    expect(riveMock.colors['ball']!.rgb.mock.invocationCallOrder[0]).toBeLessThan(
      rive.play.mock.invocationCallOrder[0]!,
    );
    expect(riveMock.hover.value).toBe(false);
  });

  it('shows the static svg until the file loads', async () => {
    const { container } = renderArt();
    expect(container.querySelector('img')?.getAttribute('src')).toBe(
      '/images/toolbar/moving-pictures.svg',
    );
    expect(screen.getByTestId('text-in-motion-canvas').className).toContain('opacity-0');
    await loadedInstance();
    expect(container.querySelector('img')?.className).toContain('invisible');
  });

  it('keeps the static svg when the file fails to load', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 404 })),
    );
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { container } = renderArt();
    await waitFor(() => expect(warn).toHaveBeenCalled());
    expect(riveMock.instances).toHaveLength(0);
    expect(screen.getByTestId('text-in-motion-canvas').className).toContain('opacity-0');
    expect(container.querySelector('img')?.className).not.toContain('invisible');
    warn.mockRestore();
  });

  it('sets the hover property when hovered changes', async () => {
    const { rerender } = renderArt();
    await loadedInstance();
    rerender(<TextInMotionArt themeName='default' isDarkMode={false} hovered />);
    expect(riveMock.hover.value).toBe(true);
    rerender(<TextInMotionArt themeName='default' isDarkMode={false} hovered={false} />);
    expect(riveMock.hover.value).toBe(false);
  });

  it('applies hover requested before the file finished loading', async () => {
    renderArt({ hovered: true });
    await loadedInstance();
    expect(riveMock.hover.value).toBe(true);
  });

  it('uses the coloured palette in coloured themes', async () => {
    renderArt();
    await loadedInstance();
    expectPalette([0x00, 0x7a, 0xff], [0x02, 0x02, 0x88]);
  });

  it('uses the muted palette and the muted svg in muted themes', async () => {
    const { container } = renderArt({ themeName: 'sepia', isDarkMode: true });
    expect(container.querySelector('img')?.getAttribute('src')).toBe(
      '/images/toolbar/moving-pictures-muted.svg',
    );
    const rive = await loadedInstance();
    expectPalette([0xfc, 0xfc, 0xfc], [0x99, 0x99, 0x99]);
    expect(rive.play).toHaveBeenCalled();
  });

  it('switches the palette live without reloading the file', async () => {
    const { rerender, container } = renderArt();
    const rive = await loadedInstance();
    rerender(<TextInMotionArt themeName='default' isDarkMode hovered={false} />);
    expectPalette([0xfc, 0xfc, 0xfc], [0x99, 0x99, 0x99]);
    expect(container.querySelector('img')?.getAttribute('src')).toBe(
      '/images/toolbar/moving-pictures-muted.svg',
    );
    rerender(<TextInMotionArt themeName='paper' isDarkMode={false} hovered={false} />);
    expectPalette([0x00, 0x7a, 0xff], [0x02, 0x02, 0x88]);
    expect(riveMock.instances).toHaveLength(1);
    expect(rive.cleanup).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('cleans the instance up on unmount', async () => {
    const { unmount } = renderArt();
    const rive = await loadedInstance();
    unmount();
    expect(rive.cleanup).toHaveBeenCalled();
  });

  it.each([
    ['ui animations are off', () => document.documentElement.setAttribute('data-ui-anim', 'off')],
    ['e-ink is on', () => document.documentElement.setAttribute('data-eink', 'true')],
    [
      'reduced motion is preferred',
      () =>
        vi.stubGlobal('matchMedia', (query: string) => ({
          matches: query.includes('reduce'),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        })),
    ],
  ])('shows only the static svg when %s', async (_label, applyGate) => {
    applyGate();
    const { container } = renderArt();
    await act(async () => {});
    expect(screen.queryByTestId('text-in-motion-canvas')).toBeNull();
    expect(riveMock.instances).toHaveLength(0);
    expect(fetch).not.toHaveBeenCalled();
    expect(container.querySelector('img')?.getAttribute('src')).toBe(
      '/images/toolbar/moving-pictures.svg',
    );
  });

  it('resizes and redraws the drawing surface when the canvas size changes after load', async () => {
    renderArt();
    const rive = await loadedInstance();
    const canvas = screen.getByTestId('text-in-motion-canvas');
    const observer = resizeObservers.find((entry) => entry.target === canvas);
    expect(observer).toBeDefined();
    rive.resizeDrawingSurfaceToCanvas.mockClear();
    act(() => observer!.callback());
    expect(rive.resizeDrawingSurfaceToCanvas).toHaveBeenCalledTimes(1);
    expect(rive.drawFrame).toHaveBeenCalledTimes(1);
  });

  it('sizes the canvas box from the art aspect so it is never zero wide before the svg decodes', () => {
    renderArt();
    expect(screen.getByTestId('text-in-motion-canvas').parentElement?.className).toContain(
      'aspect-[45/31]',
    );
  });
});
