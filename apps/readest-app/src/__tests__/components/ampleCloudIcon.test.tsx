import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act, waitFor } from '@testing-library/react';
import AmpleCloudIcon from '@/app/reader/components/AmpleCloudIcon';

const riveMock = vi.hoisted(() => {
  const flags: Record<string, { value: boolean }> = {
    hover: { value: false },
    loading: { value: false },
  };
  const colors: Record<string, { rgb: ReturnType<typeof vi.fn> }> = {
    color: { rgb: vi.fn() },
  };
  const instances: Array<{
    options: Record<string, unknown>;
    play: ReturnType<typeof vi.fn>;
    pause: ReturnType<typeof vi.fn>;
    cleanup: ReturnType<typeof vi.fn>;
  }> = [];
  class Rive {
    options: Record<string, unknown>;
    play = vi.fn();
    pause = vi.fn();
    cleanup = vi.fn();
    resizeDrawingSurfaceToCanvas = vi.fn();
    viewModelInstance = {
      boolean: (name: string) => flags[name] ?? null,
      color: (name: string) => colors[name] ?? null,
    };
    constructor(options: Record<string, unknown>) {
      this.options = options;
      instances.push(this);
      queueMicrotask(() => (options['onLoad'] as () => void)());
    }
  }
  return { Rive, flags, colors, instances };
});

vi.mock('@rive-app/canvas', () => ({
  Rive: riveMock.Rive,
  Layout: class {},
  Fit: { Contain: 'contain' },
  Alignment: { Center: 'center' },
  RuntimeLoader: { setWasmUrl: vi.fn(), setWasmFallbackUrl: vi.fn() },
}));

type IntersectionCallback = (entries: Array<{ isIntersecting: boolean }>) => void;

const intersection = { callbacks: new Set<IntersectionCallback>() };

class IntersectionObserverStub {
  constructor(private callback: IntersectionCallback) {
    intersection.callbacks.add(callback);
  }
  observe() {
    this.callback([{ isIntersecting: true }]);
  }
  disconnect() {
    intersection.callbacks.delete(this.callback);
  }
}

const setOnScreen = (isIntersecting: boolean) => {
  for (const callback of intersection.callbacks) callback([{ isIntersecting }]);
};

const setPageVisibility = (state: DocumentVisibilityState) => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
};

const renderIcon = (props: Partial<React.ComponentProps<typeof AmpleCloudIcon>> = {}) =>
  render(<AmpleCloudIcon themeName='default' isDarkMode={false} visible {...props} />);

const loadedInstance = async () => {
  await waitFor(() =>
    expect(screen.getByTestId('ample-cloud-canvas').className).toContain('opacity-100'),
  );
  return riveMock.instances[0]!;
};

beforeEach(() => {
  riveMock.instances.length = 0;
  riveMock.flags['hover']!.value = false;
  riveMock.colors['color']!.rgb.mockClear();
  intersection.callbacks.clear();
  vi.stubGlobal('IntersectionObserver', IntersectionObserverStub);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })),
  );
  setPageVisibility('visible');
  document.documentElement.removeAttribute('data-ui-anim');
  document.documentElement.removeAttribute('data-eink');
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('AmpleCloudIcon', () => {
  it('loads the cloud file with its own listeners disabled and plays while visible', async () => {
    renderIcon();
    const rive = await loadedInstance();
    expect(fetch).toHaveBeenCalledWith('/rive/ample-cloud.riv');
    expect(rive.options['stateMachines']).toBe('Cloud');
    expect(rive.options['autoBind']).toBe(true);
    expect(rive.options['shouldDisableRiveListeners']).toBe(true);
    expect(rive.play).toHaveBeenCalled();
    expect(riveMock.flags['loading']!.value).toBe(false);
  });

  it('does not load the file until the header is first shown', async () => {
    const { rerender } = renderIcon({ visible: false });
    await act(async () => {});
    expect(riveMock.instances).toHaveLength(0);
    rerender(<AmpleCloudIcon themeName='default' isDarkMode={false} visible />);
    const rive = await loadedInstance();
    expect(rive.play).toHaveBeenCalled();
  });

  it('pauses when the header hides and resumes when it shows again', async () => {
    const { rerender } = renderIcon();
    const rive = await loadedInstance();
    rive.play.mockClear();
    rerender(<AmpleCloudIcon themeName='default' isDarkMode={false} visible={false} />);
    expect(rive.pause).toHaveBeenCalled();
    rerender(<AmpleCloudIcon themeName='default' isDarkMode={false} visible />);
    expect(rive.play).toHaveBeenCalled();
  });

  it('pauses when the page is hidden', async () => {
    renderIcon();
    const rive = await loadedInstance();
    act(() => setPageVisibility('hidden'));
    expect(rive.pause).toHaveBeenCalled();
    rive.play.mockClear();
    act(() => setPageVisibility('visible'));
    expect(rive.play).toHaveBeenCalled();
  });

  it('pauses while the button is laid out off screen', async () => {
    renderIcon();
    const rive = await loadedInstance();
    act(() => setOnScreen(false));
    expect(rive.pause).toHaveBeenCalled();
  });

  it('drives hover from mouse pointers and ignores touch', async () => {
    renderIcon();
    await loadedInstance();
    const target = screen.getByTestId('ample-cloud');
    fireEvent.pointerEnter(target, { pointerType: 'touch' });
    expect(riveMock.flags['hover']!.value).toBe(false);
    fireEvent.pointerEnter(target, { pointerType: 'mouse' });
    expect(riveMock.flags['hover']!.value).toBe(true);
    fireEvent.pointerLeave(target, { pointerType: 'mouse' });
    expect(riveMock.flags['hover']!.value).toBe(false);
  });

  it('keeps the static svg until the file loads', async () => {
    const { container } = renderIcon();
    expect(container.querySelector('img')?.getAttribute('src')).toBe('/images/toolbar/amply.svg');
    expect(screen.getByTestId('ample-cloud-canvas').className).toContain('opacity-0');
    await loadedInstance();
  });

  it.each([
    ['ui animations are off', () => document.documentElement.setAttribute('data-ui-anim', 'off')],
    ['e-ink is on', () => document.documentElement.setAttribute('data-eink', 'true')],
    [
      'reduced motion is preferred',
      () => vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce') })),
    ],
  ])('shows only the static svg when %s', async (_label, applyGate) => {
    applyGate();
    renderIcon();
    await act(async () => {});
    expect(screen.queryByTestId('ample-cloud-canvas')).toBeNull();
    expect(riveMock.instances).toHaveLength(0);
  });

  it('colours the cloud orange in coloured themes before the first frame', async () => {
    renderIcon();
    const rive = await loadedInstance();
    const { rgb } = riveMock.colors['color']!;
    expect(rgb).toHaveBeenLastCalledWith(0xf4, 0x68, 0x31);
    expect(rgb.mock.invocationCallOrder[0]).toBeLessThan(rive.play.mock.invocationCallOrder[0]!);
  });

  it('animates in muted themes with the muted colour and the muted svg as fallback', async () => {
    const { container } = renderIcon({ themeName: 'sepia', isDarkMode: true });
    expect(container.querySelector('img')?.getAttribute('src')).toBe(
      '/images/toolbar/amply-muted.svg',
    );
    const rive = await loadedInstance();
    expect(rive.play).toHaveBeenCalled();
    expect(riveMock.colors['color']!.rgb).toHaveBeenLastCalledWith(0xfc, 0xfc, 0xfc);
  });

  it('switches the colour live when the theme changes without reloading the file', async () => {
    const { rerender, container } = renderIcon();
    const rive = await loadedInstance();
    const { rgb } = riveMock.colors['color']!;
    rerender(<AmpleCloudIcon themeName='default' isDarkMode visible />);
    expect(rgb).toHaveBeenLastCalledWith(0xfc, 0xfc, 0xfc);
    expect(container.querySelector('img')?.getAttribute('src')).toBe(
      '/images/toolbar/amply-muted.svg',
    );
    rerender(<AmpleCloudIcon themeName='paper' isDarkMode={false} visible />);
    expect(rgb).toHaveBeenLastCalledWith(0xf4, 0x68, 0x31);
    expect(riveMock.instances).toHaveLength(1);
    expect(rive.cleanup).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
