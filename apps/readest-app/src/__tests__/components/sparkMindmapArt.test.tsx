import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';

import SparkTileArt from '@/components/sparkrive/SparkTileArt';
import SparkMindmapArt from '@/components/sparkrive/SparkMindmapArt';

const stubMedia = ({ hover = true, reducedMotion = false } = {}) => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches:
      (query === '(hover: hover)' && hover) ||
      (query === '(prefers-reduced-motion: reduce)' && reducedMotion),
  }));
};

const art = (hovered: boolean, openDelayMs = 0) => (
  <SparkMindmapArt imgClassName='h-14' hovered={hovered} openDelayMs={openDelayMs} />
);

const piece = () => screen.getByTestId('spark-mindmap-piece');
const head = () => screen.getByTestId('spark-mindmap-head');

const swingName = () => piece().style.animationName;

const endCycle = () => {
  for (const type of ['animationiteration', 'webkitAnimationIteration']) {
    fireEvent(piece(), new Event(type, { bubbles: true }));
  }
};

beforeEach(() => {
  stubMedia();
  document.documentElement.removeAttribute('data-ui-anim');
  document.documentElement.removeAttribute('data-eink');
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('SparkMindmapArt on hover devices', () => {
  it('drifts gently while idle without swinging', () => {
    render(art(false));
    expect(swingName()).toBe('');
    expect(head().style.animationName).toBe('');
    expect(piece().parentElement?.style.animationName).toBe('spark-mindmap-drift');
    expect(head().parentElement?.style.animationName).toBe('spark-mindmap-breathe');
  });

  it('swings the piece and swells the head while hovered', () => {
    render(art(true));
    expect(swingName()).toBe('spark-mindmap-swing');
    expect(piece().style.animationDuration).toBe('3s');
    expect(piece().style.animationIterationCount).toBe('infinite');
    expect(head().style.animationName).toBe('spark-mindmap-swell');
  });

  it('finishes the current swing after the pointer leaves, then rests', () => {
    const { rerender } = render(art(true));
    rerender(art(false));
    expect(screen.getByTestId('spark-art-mindmap').getAttribute('data-active')).toBe('false');
    expect(swingName()).toBe('spark-mindmap-swing');
    endCycle();
    expect(swingName()).toBe('');
    expect(head().style.animationName).toBe('');
  });

  it('keeps swinging across cycles while still hovered', () => {
    render(art(true));
    endCycle();
    expect(swingName()).toBe('spark-mindmap-swing');
  });
});

describe('SparkMindmapArt on touch devices', () => {
  it('plays one swing after the open delay and ignores hover', () => {
    stubMedia({ hover: false });
    vi.useFakeTimers();
    const { rerender } = render(art(false, 240));
    expect(swingName()).toBe('');

    act(() => {
      vi.advanceTimersByTime(240);
    });
    expect(swingName()).toBe('spark-mindmap-swing');

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(swingName()).toBe('spark-mindmap-swing');
    endCycle();
    expect(swingName()).toBe('');

    rerender(art(true, 240));
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(swingName()).toBe('');
  });
});

describe('SparkTileArt mindmap', () => {
  const tileArt = (
    <SparkTileArt icon='mindmap' imgClassName='h-14' hovered={false} openDelayMs={0} />
  );

  it('renders the animated mindmap art when motion is allowed', () => {
    const { container } = render(tileArt);
    expect(screen.getByTestId('spark-art-mindmap').getAttribute('class')).toContain('h-14');
    expect(container.querySelector('img')).toBeNull();
  });

  it.each([
    ['UI animations are off', () => document.documentElement.setAttribute('data-ui-anim', 'off')],
    ['e-ink is on', () => document.documentElement.setAttribute('data-eink', 'true')],
    ['reduced motion is requested', () => stubMedia({ reducedMotion: true })],
  ])('shows the static svg when %s', (_label, disableMotion) => {
    disableMotion();
    const { container } = render(tileArt);
    expect(screen.queryByTestId('spark-art-mindmap')).toBeNull();
    expect(container.querySelector('img')?.getAttribute('src')).toBe('/images/spark/mindmap.svg');
  });
});
