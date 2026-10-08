import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import SearchBarRive, { YAY_DURATION_MS } from '@/app/reader/components/sidebar/SearchBarRive';

const riveMock = vi.hoisted(() => {
  const inputs = {
    searchHover: { name: 'searchHover', value: false },
    tap: { name: 'tap', fire: vi.fn() },
    pressed: { name: 'pressed', value: false },
    empty: { name: 'empty', value: true },
  };
  const missing: string[] = [];
  const instances: Array<{ options: Record<string, unknown>; cleanup: () => void }> = [];
  class Rive {
    options: Record<string, unknown>;
    cleanup = vi.fn();
    resizeDrawingSurfaceToCanvas = vi.fn();
    stateMachineInputs = () => Object.values(inputs).filter((i) => !missing.includes(i.name));
    constructor(options: Record<string, unknown>) {
      this.options = options;
      instances.push(this);
      queueMicrotask(() => (options['onLoad'] as () => void)());
    }
  }
  return { Rive, inputs, instances, missing };
});

vi.mock('@rive-app/canvas', () => ({
  Rive: riveMock.Rive,
  Layout: class {},
  Fit: { Contain: 'contain' },
  Alignment: { BottomCenter: 'bottomCenter' },
  RuntimeLoader: { setWasmUrl: vi.fn(), setWasmFallbackUrl: vi.fn() },
}));

class ResizeObserverStub {
  observe() {}
  disconnect() {}
}

beforeEach(() => {
  riveMock.instances.length = 0;
  riveMock.missing.length = 0;
  riveMock.inputs.searchHover.value = false;
  riveMock.inputs.pressed.value = false;
  riveMock.inputs.empty.value = true;
  riveMock.inputs.tap.fire.mockClear();
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })),
  );
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('SearchBarRive', () => {
  it('loads the Christmas pup artboard from the Christmas search box file', async () => {
    render(<SearchBarRive hasResults={false} />);
    await screen.findByTestId('search-pup-hit-area');
    expect(fetch).toHaveBeenCalledWith('/rive/christmas-searchbox.riv');
    expect(riveMock.instances[0]!.options['artboard']).toBe('pup claude work  2');
    expect(riveMock.instances[0]!.options['stateMachines']).toBe('State Machine 1');
  });

  it('drives searchHover from hasResults', async () => {
    const { rerender } = render(<SearchBarRive hasResults={false} />);
    await screen.findByTestId('search-pup-hit-area');
    expect(riveMock.inputs.searchHover.value).toBe(false);

    rerender(<SearchBarRive hasResults />);
    expect(riveMock.inputs.searchHover.value).toBe(true);

    rerender(<SearchBarRive hasResults={false} />);
    expect(riveMock.inputs.searchHover.value).toBe(false);
  });

  it('applies hasResults that was already true when the file finishes loading', async () => {
    render(<SearchBarRive hasResults />);
    await screen.findByTestId('search-pup-hit-area');
    expect(riveMock.inputs.searchHover.value).toBe(true);
  });

  describe('short yay', () => {
    const advance = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

    const renderLoaded = async (hasResults: boolean) => {
      const view = render(<SearchBarRive hasResults={hasResults} />);
      await screen.findByTestId('search-pup-hit-area');
      vi.useFakeTimers();
      return view;
    };

    it('pulses searchHover true, then returns to idle on its own while the results stay', async () => {
      const { rerender } = await renderLoaded(false);
      rerender(<SearchBarRive hasResults />);
      expect(riveMock.inputs.searchHover.value).toBe(true);

      advance(YAY_DURATION_MS - 1);
      expect(riveMock.inputs.searchHover.value).toBe(true);
      advance(1);
      expect(riveMock.inputs.searchHover.value).toBe(false);
      advance(10 * YAY_DURATION_MS);
      expect(riveMock.inputs.searchHover.value).toBe(false);
    });

    it('lasts long enough for the yay to read and short enough to stay a flourish', () => {
      expect(YAY_DURATION_MS).toBeGreaterThanOrEqual(2000);
      expect(YAY_DURATION_MS).toBeLessThanOrEqual(3000);
    });

    it('plays again on the next successful search', async () => {
      const { rerender } = await renderLoaded(false);
      rerender(<SearchBarRive hasResults />);
      advance(YAY_DURATION_MS);
      expect(riveMock.inputs.searchHover.value).toBe(false);

      rerender(<SearchBarRive hasResults={false} />);
      rerender(<SearchBarRive hasResults />);
      expect(riveMock.inputs.searchHover.value).toBe(true);
      advance(YAY_DURATION_MS - 1);
      expect(riveMock.inputs.searchHover.value).toBe(true);
      advance(1);
      expect(riveMock.inputs.searchHover.value).toBe(false);
    });

    it('restarts the clock when a new search succeeds mid-yay', async () => {
      const { rerender } = await renderLoaded(false);
      rerender(<SearchBarRive hasResults />);
      advance(YAY_DURATION_MS - 500);
      rerender(<SearchBarRive hasResults={false} />);
      rerender(<SearchBarRive hasResults />);
      advance(YAY_DURATION_MS - 1);
      expect(riveMock.inputs.searchHover.value).toBe(true);
      advance(1);
      expect(riveMock.inputs.searchHover.value).toBe(false);
    });

    it('goes idle at once when the query changes and leaves no timer behind', async () => {
      const { rerender } = await renderLoaded(false);
      rerender(<SearchBarRive hasResults />);
      advance(500);
      rerender(<SearchBarRive hasResults={false} />);
      expect(riveMock.inputs.searchHover.value).toBe(false);
      expect(vi.getTimerCount()).toBe(0);
    });

    it('never yays without results', async () => {
      await renderLoaded(false);
      advance(10 * YAY_DURATION_MS);
      expect(riveMock.inputs.searchHover.value).toBe(false);
    });

    it('leaves no timer behind on unmount', async () => {
      const { rerender, unmount } = await renderLoaded(false);
      rerender(<SearchBarRive hasResults />);
      expect(vi.getTimerCount()).toBe(1);
      unmount();
      expect(vi.getTimerCount()).toBe(0);
    });

    it('starts the yay when results were already there as the file loads', async () => {
      render(<SearchBarRive hasResults />);
      await screen.findByTestId('search-pup-hit-area');
      expect(riveMock.inputs.searchHover.value).toBe(true);
      vi.useFakeTimers();
      expect(vi.getTimerCount()).toBe(0);
    });
  });

  describe('empty input', () => {
    it('follows isEmpty as the field fills and clears', async () => {
      const { rerender } = render(<SearchBarRive hasResults={false} isEmpty />);
      await screen.findByTestId('search-pup-hit-area');
      expect(riveMock.inputs.empty.value).toBe(true);

      rerender(<SearchBarRive hasResults={false} isEmpty={false} />);
      expect(riveMock.inputs.empty.value).toBe(false);

      rerender(<SearchBarRive hasResults={false} isEmpty />);
      expect(riveMock.inputs.empty.value).toBe(true);
    });

    it('applies an isEmpty that was already false when the file finishes loading', async () => {
      render(<SearchBarRive hasResults={false} isEmpty={false} />);
      await screen.findByTestId('search-pup-hit-area');
      expect(riveMock.inputs.empty.value).toBe(false);
    });

    it('defaults to an empty field', async () => {
      render(<SearchBarRive hasResults={false} />);
      await screen.findByTestId('search-pup-hit-area');
      expect(riveMock.inputs.empty.value).toBe(true);
    });

    it('works with a file that has no empty input', async () => {
      riveMock.missing.push('empty');
      render(<SearchBarRive hasResults={false} isEmpty={false} />);
      await screen.findByTestId('search-pup-hit-area');
      expect(riveMock.inputs.empty.value).toBe(true);
    });
  });

  it('fires tap and holds pressed while the pup is pressed', async () => {
    render(<SearchBarRive hasResults={false} />);
    const pup = await screen.findByTestId('search-pup-hit-area');

    fireEvent.pointerDown(pup);
    expect(riveMock.inputs.tap.fire).toHaveBeenCalledTimes(1);
    expect(riveMock.inputs.pressed.value).toBe(true);

    fireEvent.pointerUp(pup);
    expect(riveMock.inputs.pressed.value).toBe(false);

    fireEvent.pointerDown(pup);
    fireEvent.pointerCancel(pup);
    expect(riveMock.inputs.tap.fire).toHaveBeenCalledTimes(2);
    expect(riveMock.inputs.pressed.value).toBe(false);
  });

  it('keeps the canvas out of pointer hit testing and only the pup hit area interactive', async () => {
    const { container } = render(<SearchBarRive hasResults={false} />);
    const pup = await screen.findByTestId('search-pup-hit-area');
    expect(container.firstElementChild!.className).toContain('pointer-events-none');
    expect(pup.className).toContain('pointer-events-auto');
  });

  it('keeps the pup hit area above the search input', async () => {
    render(<SearchBarRive hasResults={false} />);
    const pup = await screen.findByTestId('search-pup-hit-area');
    expect(pup.className).toContain('z-10');
  });

  it('reports when the pup is loaded and when it goes away', async () => {
    const onLoadedChange = vi.fn();
    const { unmount } = render(
      <SearchBarRive hasResults={false} onLoadedChange={onLoadedChange} />,
    );
    await screen.findByTestId('search-pup-hit-area');
    expect(onLoadedChange).toHaveBeenLastCalledWith(true);

    unmount();
    expect(onLoadedChange).toHaveBeenLastCalledWith(false);
  });

  it('never reports a loaded pup when the file fails to load', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 404 })),
    );
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const onLoadedChange = vi.fn();
    render(<SearchBarRive hasResults onLoadedChange={onLoadedChange} />);
    await waitFor(() => expect(warn).toHaveBeenCalled());
    expect(onLoadedChange).not.toHaveBeenCalledWith(true);
    warn.mockRestore();
  });

  it('renders no hit area and cleans up when the file fails to load', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 404 })),
    );
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<SearchBarRive hasResults />);
    await waitFor(() => expect(warn).toHaveBeenCalled());
    expect(screen.queryByTestId('search-pup-hit-area')).toBeNull();
    expect(riveMock.instances).toHaveLength(0);
    warn.mockRestore();
  });
});
