import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act, waitFor } from '@testing-library/react';
import ThemeSceneArt from '@/components/themescene/ThemeSceneArt';
import { getSceneAnimation, isSceneMotionAllowed } from '@/components/themescene/sceneAnimations';
import { SCENE_TAP_PLAY_MS, useSceneMotion } from '@/components/themescene/useSceneMotion';
import { useSettingsStore } from '@/store/settingsStore';
import type { SystemSettings } from '@/types/settings';

const riveMock = vi.hoisted(() => {
  const hoverFlag = { value: false };
  const instances: Array<{
    options: Record<string, unknown>;
    play: ReturnType<typeof vi.fn>;
    reset: ReturnType<typeof vi.fn>;
    cleanup: ReturnType<typeof vi.fn>;
  }> = [];
  class Rive {
    options: Record<string, unknown>;
    play = vi.fn();
    reset = vi.fn();
    cleanup = vi.fn();
    resizeDrawingSurfaceToCanvas = vi.fn();
    viewModelInstance = {
      boolean: (name: string) => (name === 'hover' ? hoverFlag : null),
    };
    constructor(options: Record<string, unknown>) {
      this.options = options;
      instances.push(this);
      queueMicrotask(() => (options['onLoad'] as () => void)());
    }
  }
  return { Rive, hoverFlag, instances };
});

vi.mock('@rive-app/canvas', () => ({
  Rive: riveMock.Rive,
  Layout: class {},
  Fit: { Cover: 'cover' },
  Alignment: { Center: 'center' },
  RuntimeLoader: { setWasmUrl: vi.fn(), setWasmFallbackUrl: vi.fn() },
}));

class ResizeObserverStub {
  observe() {}
  disconnect() {}
}

beforeEach(() => {
  riveMock.instances.length = 0;
  riveMock.hoverFlag.value = false;
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    })),
  );
  document.documentElement.removeAttribute('data-ui-anim');
  document.documentElement.removeAttribute('data-eink');
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('scene animation config', () => {
  it('maps the five scene themes to their Rive files and leaves paper static', () => {
    for (const name of [
      'desert-sunset',
      'starry-night',
      'forest-pond',
      'ocean-wave',
      'cherry-bloom',
    ]) {
      expect(getSceneAnimation(name)?.src).toBe(`/rive/theme-cards/${name}.riv`);
    }
    expect(getSceneAnimation('paper')).toBeNull();
    expect(getSceneAnimation('starry-night')?.hoverProperty).toBe('hover');
  });

  it('disallows motion when UI animations are off or in e-ink mode', () => {
    expect(isSceneMotionAllowed()).toBe(true);
    document.documentElement.setAttribute('data-ui-anim', 'off');
    expect(isSceneMotionAllowed()).toBe(false);
    document.documentElement.removeAttribute('data-ui-anim');
    document.documentElement.setAttribute('data-eink', 'true');
    expect(isSceneMotionAllowed()).toBe(false);
  });

  it('lets the user setting override the OS reduce motion preference', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }));
    expect(isSceneMotionAllowed()).toBe(false);
    useSettingsStore.setState({ settings: { uiAnimationsEnabled: true } as SystemSettings });
    expect(isSceneMotionAllowed()).toBe(true);
    useSettingsStore.setState({ settings: {} as SystemSettings });
  });
});

const MotionProbe = () => {
  const motion = useSceneMotion();
  return (
    <button data-active={String(motion.active)} {...motion.handlers} onClick={motion.onSelect}>
      card
    </button>
  );
};

const probe = () => screen.getByRole('button', { name: 'card' });

describe('useSceneMotion', () => {
  it('is active while a mouse hovers and stops on leave', () => {
    render(<MotionProbe />);
    fireEvent.pointerEnter(probe(), { pointerType: 'mouse' });
    expect(probe().dataset['active']).toBe('true');
    fireEvent.pointerLeave(probe(), { pointerType: 'mouse' });
    expect(probe().dataset['active']).toBe('false');
  });

  it('ignores touch as hover but plays a timed burst on tap', () => {
    vi.useFakeTimers();
    render(<MotionProbe />);
    fireEvent.pointerEnter(probe(), { pointerType: 'touch' });
    expect(probe().dataset['active']).toBe('false');
    fireEvent.pointerDown(probe(), { pointerType: 'touch' });
    fireEvent.click(probe());
    expect(probe().dataset['active']).toBe('true');
    act(() => vi.advanceTimersByTime(SCENE_TAP_PLAY_MS));
    expect(probe().dataset['active']).toBe('false');
  });

  it('plays a burst on keyboard selection but not on a mouse click', () => {
    render(<MotionProbe />);
    fireEvent.pointerDown(probe(), { pointerType: 'mouse' });
    fireEvent.click(probe());
    expect(probe().dataset['active']).toBe('false');
    fireEvent.click(probe());
    expect(probe().dataset['active']).toBe('true');
  });

  it('stays still when motion is disallowed', () => {
    document.documentElement.setAttribute('data-ui-anim', 'off');
    render(<MotionProbe />);
    fireEvent.pointerEnter(probe(), { pointerType: 'mouse' });
    fireEvent.click(probe());
    expect(probe().dataset['active']).toBe('false');
  });
});

describe('ThemeSceneArt', () => {
  it('renders only the static art for themes without an animation', () => {
    const { container } = render(<ThemeSceneArt themeName='paper' active />);
    expect(container.querySelector('img')?.getAttribute('src')).toBe(
      '/images/theme-cards/paper.svg',
    );
    expect(screen.queryByTestId('theme-scene-canvas')).toBeNull();
  });

  it('does not load the Rive file until the card is first activated', () => {
    render(<ThemeSceneArt themeName='ocean-wave' active={false} />);
    expect(screen.getByTestId('theme-scene-canvas')).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('plays while active and rewinds to rest after release', async () => {
    const { rerender } = render(<ThemeSceneArt themeName='starry-night' active />);
    await waitFor(() => expect(riveMock.instances[0]?.play).toHaveBeenCalled());
    const rive = riveMock.instances[0]!;
    expect(fetch).toHaveBeenCalledWith('/rive/theme-cards/starry-night.riv');
    expect(rive.options['autoplay']).toBe(false);
    expect(rive.options['stateMachines']).toBe('Hover');
    expect(riveMock.hoverFlag.value).toBe(true);
    expect(screen.getByTestId('theme-scene-canvas').className).toContain('opacity-100');

    vi.useFakeTimers();
    rerender(<ThemeSceneArt themeName='starry-night' active={false} />);
    expect(riveMock.hoverFlag.value).toBe(false);
    expect(screen.getByTestId('theme-scene-canvas').className).toContain('opacity-0');
    act(() => vi.advanceTimersByTime(300));
    expect(rive.reset).toHaveBeenCalledWith({
      stateMachines: 'Hover',
      autoplay: false,
      autoBind: true,
    });
  });
});
