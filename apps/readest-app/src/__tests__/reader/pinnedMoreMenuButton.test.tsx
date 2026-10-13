import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PinnedMoreMenuButton from '@/app/reader/components/PinnedMoreMenuButton';

vi.mock('@/hooks/useTranslation', () => ({ useTranslation: () => (s: string) => s }));

global.ResizeObserver = class ResizeObserver {
  observe() {}
  disconnect() {}
  unobserve() {}
};

const rectAt = (left: number, top: number) =>
  ({ left, top, right: left + 32, bottom: top + 32, width: 32, height: 32 }) as DOMRect;

const renderPinned = (props: { isHeaderVisible: boolean; isReadingRulerActive: boolean }) => {
  const container = document.createElement('div');
  const anchor = document.createElement('button');
  container.getBoundingClientRect = () => rectAt(100, 20);
  anchor.getBoundingClientRect = () => rectAt(860, 26);
  const onToggleMore = vi.fn();
  const onCloseReadingRuler = vi.fn();
  const element = (next: typeof props) => (
    <PinnedMoreMenuButton
      containerRef={{ current: container }}
      anchorRef={{ current: anchor }}
      iconColor='#D9D9D9'
      onToggleMore={onToggleMore}
      onCloseReadingRuler={onCloseReadingRuler}
      {...next}
    />
  );
  const view = render(element(props));
  return {
    onToggleMore,
    onCloseReadingRuler,
    rerender: (next: typeof props) => view.rerender(element(next)),
    layer: () => view.container.firstElementChild as HTMLElement,
  };
};

describe('PinnedMoreMenuButton', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('pins the close button over the menu button while the header is hidden', () => {
    const { layer, onCloseReadingRuler } = renderPinned({
      isHeaderVisible: false,
      isReadingRulerActive: true,
    });

    expect(layer().dataset['visible']).toBe('true');
    expect(layer().style.left).toBe('760px');
    expect(layer().style.top).toBe('6px');

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onCloseReadingRuler).toHaveBeenCalledTimes(1);
  });

  it('hands over to the header button while the header is visible', () => {
    const { layer } = renderPinned({ isHeaderVisible: true, isReadingRulerActive: true });

    expect(layer().dataset['visible']).toBe('false');
    expect(layer().getAttribute('aria-hidden')).toBe('true');
  });

  it('stays hidden when the reading ruler is off', () => {
    const { layer } = renderPinned({ isHeaderVisible: false, isReadingRulerActive: false });

    expect(layer().dataset['visible']).toBe('false');
  });

  it('morphs back to the menu shape before fading out after the ruler closes', () => {
    const { layer, rerender } = renderPinned({
      isHeaderVisible: false,
      isReadingRulerActive: true,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    rerender({ isHeaderVisible: false, isReadingRulerActive: false });

    expect(layer().dataset['visible']).toBe('true');
    expect(screen.getByRole('button', { name: 'More', hidden: true }).dataset['shape']).toBe(
      'menu',
    );

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(layer().dataset['visible']).toBe('false');
  });
});
