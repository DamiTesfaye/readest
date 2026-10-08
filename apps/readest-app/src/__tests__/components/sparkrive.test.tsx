import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act, waitFor } from '@testing-library/react';

const riveMock = vi.hoisted(() => {
  const instances: Array<{
    options: Record<string, unknown>;
    hoverHistory: boolean[];
    fired: string[];
    cleanup: ReturnType<typeof vi.fn>;
  }> = [];
  class Rive {
    options: Record<string, unknown>;
    hoverHistory: boolean[] = [];
    fired: string[] = [];
    cleanup = vi.fn();
    resizeDrawingSurfaceToCanvas = vi.fn();
    viewModelInstance = {
      boolean: (name: string) => {
        if (name !== 'hover') return null;
        const history = this.hoverHistory;
        return {
          get value() {
            return history.at(-1) ?? false;
          },
          set value(next: boolean) {
            history.push(next);
          },
        };
      },
      trigger: (name: string) => ({ trigger: () => this.fired.push(name) }),
    };
    constructor(options: Record<string, unknown>) {
      this.options = options;
      instances.push(this);
      queueMicrotask(() => (options['onLoad'] as () => void)());
    }
  }
  return { Rive, instances };
});

vi.mock('@rive-app/canvas', () => ({
  Rive: riveMock.Rive,
  Layout: class {},
  Fit: { Contain: 'contain' },
  Alignment: { Center: 'center' },
  RuntimeLoader: { setWasmUrl: vi.fn(), setWasmFallbackUrl: vi.fn() },
}));
vi.mock('@/hooks/useTranslation', () => ({ useTranslation: () => (s: string) => s }));
vi.mock('@/utils/event', () => ({ eventDispatcher: { dispatch: vi.fn() } }));
vi.mock('@/components/ToolbarPopover', () => ({
  default: ({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) =>
    isOpen ? <div>{children}</div> : null,
}));

import SparkPopover from '@/app/reader/components/SparkPopover';
import { getSparkAnimation } from '@/components/sparkrive/sparkAnimations';

class ResizeObserverStub {
  observe() {}
  disconnect() {}
}

const stubMedia = ({ hover = true, reducedMotion = false } = {}) => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches:
      (query === '(hover: hover)' && hover) ||
      (query === '(prefers-reduced-motion: reduce)' && reducedMotion),
  }));
};

const popoverWith = (isOpen: boolean) => (
  <SparkPopover
    bookKey='book-1'
    isOpen={isOpen}
    anchorEl={document.body}
    onClose={vi.fn()}
    onToggleTTS={vi.fn()}
  />
);
const popover = popoverWith(true);

const riveFor = (stateMachine: string) =>
  riveMock.instances.find((rive) => rive.options['stateMachines'] === stateMachine)!;

const tile = (name: RegExp) => screen.getByRole('button', { name });

const waitForAllLoaded = () =>
  waitFor(() => {
    expect(riveMock.instances).toHaveLength(4);
    expect(screen.getByTestId('spark-canvas-discuss').parentElement?.className).toContain(
      'opacity-100',
    );
  });

beforeEach(() => {
  riveMock.instances.length = 0;
  stubMedia();
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })),
  );
  document.documentElement.removeAttribute('data-ui-anim');
  document.documentElement.removeAttribute('data-eink');
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('spark animation config', () => {
  it('animates four tiles and leaves mindmap and TTS static', () => {
    expect(getSparkAnimation('mood-modes')?.src).toBe('/rive/spark/mood-n-mode-new.riv');
    expect(getSparkAnimation('summarise')?.src).toBe('/rive/spark/summarize.riv');
    expect(getSparkAnimation('discuss')?.src).toBe('/rive/spark/tim-n-fini.riv');
    expect(getSparkAnimation('margins')?.src).toBe('/rive/spark/margins.riv');
    expect(getSparkAnimation('mindmap')).toBeNull();
    expect(getSparkAnimation('tts')).toBeNull();
  });
});

describe('SparkPopover animations on hover devices', () => {
  it('plays each tile reaction while hovered and settles on leave', async () => {
    render(popover);
    await waitForAllLoaded();

    for (const [name, stateMachine] of [
      [/Summarise/, 'Summarise'],
      [/Discuss/, 'Hosts'],
    ] as const) {
      fireEvent.pointerEnter(tile(name), { pointerType: 'mouse' });
      expect(riveFor(stateMachine).hoverHistory.at(-1)).toBe(true);
      fireEvent.pointerLeave(tile(name), { pointerType: 'mouse' });
      expect(riveFor(stateMachine).hoverHistory.at(-1)).toBe(false);
    }
    expect(riveMock.instances.every((rive) => rive.fired.length === 0)).toBe(true);
  });

  it('does not carry a hover into the next open', async () => {
    const { rerender } = render(popover);
    await waitForAllLoaded();
    fireEvent.pointerEnter(tile(/Summarise/), { pointerType: 'mouse' });
    rerender(popoverWith(false));
    riveMock.instances.length = 0;
    rerender(popover);
    await waitForAllLoaded();
    expect(riveFor('Summarise').hoverHistory).toEqual([false]);
  });

  it('lets the mood faces handle their own pointer hover', async () => {
    render(popover);
    await waitForAllLoaded();
    expect(riveFor('Faces').options['shouldDisableRiveListeners']).toBe(false);
    expect(riveFor('Summarise').options['shouldDisableRiveListeners']).toBe(true);
    const moodLayer = screen.getByTestId('spark-canvas-mood-modes').parentElement!;
    expect(moodLayer.className).not.toContain('pointer-events-none');
  });

  it('shows the static art until the animation loads, then hides it', async () => {
    render(popover);
    const img = tile(/Summarise/).querySelector('img')!;
    expect(img.getAttribute('src')).toBe('/images/spark/summarise.svg');
    expect(img.className).not.toContain('opacity-0');
    await waitForAllLoaded();
    expect(img.className).toContain('opacity-0');
  });

  it('keeps the static art when the animation fails to load', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 404 })),
    );
    render(popover);
    await waitFor(() => expect(warn).toHaveBeenCalledTimes(4));
    expect(riveMock.instances).toHaveLength(0);
    expect(tile(/Summarise/).querySelector('img')?.className).not.toContain('opacity-0');
    warn.mockRestore();
  });
});

describe('SparkPopover animations on touch devices', () => {
  it('plays each reaction once when the popover opens', async () => {
    stubMedia({ hover: false });
    vi.useFakeTimers();
    const { rerender } = render(popover);
    await vi.waitFor(() => expect(riveMock.instances).toHaveLength(4));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(riveFor('Faces').options['shouldDisableRiveListeners']).toBe(true);
    expect(riveFor('Faces').fired).toEqual([
      'yellowTap',
      'blueTap',
      'purpleTap',
      'redTap',
      'greenTap',
    ]);
    expect(riveFor('Hosts').fired).toEqual(['laugh']);
    expect(riveFor('Summarise').hoverHistory).toEqual([true, false]);

    rerender(popover);
    fireEvent.pointerEnter(tile(/Summarise/), { pointerType: 'touch' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(riveFor('Hosts').fired).toEqual(['laugh']);
    expect(riveFor('Faces').fired).toHaveLength(5);
    expect(riveFor('Summarise').hoverHistory).toEqual([true, false]);
  });
});

describe('SparkPopover static fallback', () => {
  it('never animates mindmap or TTS', async () => {
    render(popover);
    await waitForAllLoaded();
    expect(screen.queryByTestId('spark-canvas-mindmap')).toBeNull();
    expect(screen.queryByTestId('spark-canvas-tts')).toBeNull();
    expect(tile(/Mindmap/).querySelector('[data-testid="spark-art-mindmap"]')).toBeTruthy();
  });

  it.each([
    ['UI animations are off', () => document.documentElement.setAttribute('data-ui-anim', 'off')],
    ['e-ink is on', () => document.documentElement.setAttribute('data-eink', 'true')],
    ['reduced motion is requested', () => stubMedia({ reducedMotion: true })],
  ])('shows only static art when %s', (_label, disableMotion) => {
    disableMotion();
    const { container } = render(popover);
    expect(screen.queryAllByTestId(/spark-canvas-/)).toHaveLength(0);
    expect(container.querySelectorAll('img')).toHaveLength(6);
    expect(fetch).not.toHaveBeenCalled();
  });
});
