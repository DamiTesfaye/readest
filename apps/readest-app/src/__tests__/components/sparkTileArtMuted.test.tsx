import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';

const riveMock = vi.hoisted(() => {
  const instances: Array<{
    options: Record<string, unknown>;
    colors: Record<string, string[]>;
    cleanup: ReturnType<typeof vi.fn>;
  }> = [];
  class Rive {
    options: Record<string, unknown>;
    colors: Record<string, string[]> = {};
    cleanup = vi.fn();
    play = vi.fn();
    pause = vi.fn();
    resizeDrawingSurfaceToCanvas = vi.fn();
    viewModelInstance = {
      boolean: () => null,
      trigger: () => null,
      color: (name: string) => ({
        rgb: (r: number, g: number, b: number) => {
          const hex = [r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('');
          this.colors[name] ??= [];
          this.colors[name].push(hex.toUpperCase());
        },
      }),
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

import SparkTileArt from '@/components/sparkrive/SparkTileArt';
import { getSparkAnimation } from '@/components/sparkrive/sparkAnimations';

const ICONS = ['mood-modes', 'summarise', 'discuss', 'margins', 'mindmap', 'tts'];
const RIVE_ICONS = ['mood-modes', 'summarise', 'discuss'];

class ResizeObserverStub {
  observe() {}
  disconnect() {}
}

const stubMedia = ({ reducedMotion = false } = {}) => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches:
      query === '(hover: hover)' || (query === '(prefers-reduced-motion: reduce)' && reducedMotion),
  }));
};

const tileArt = (icon: string, colored: boolean) => (
  <SparkTileArt icon={icon} imgClassName='h-14' hovered={false} openDelayMs={0} colored={colored} />
);

const lastColors = (): Record<string, string | undefined> => {
  const rive = riveMock.instances.at(-1);
  if (!rive) return {};
  return Object.fromEntries(Object.entries(rive.colors).map(([name, set]) => [name, set.at(-1)]));
};

const toHex = (rgb: readonly number[]) =>
  rgb
    .map((c) => c.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();

const isTinted = (hex: string) => {
  const channels = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return Math.max(...channels) - Math.min(...channels) > 24;
};

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
  vi.unstubAllGlobals();
});

describe('muted spark art assets', () => {
  it.each(ICONS)('ships a greyscale %s-muted.svg', (icon) => {
    const svg = fs.readFileSync(
      path.join(process.cwd(), `public/images/spark/${icon}-muted.svg`),
      'utf8',
    );
    const tinted = [...svg.matchAll(/(?:fill|stroke|stop-color)="#([0-9A-Fa-f]{6})"/g)]
      .map(([, hex]) => hex ?? '')
      .filter(isTinted);
    const desaturated = /<feColorMatrix[^>]*type="saturate"[^>]*values="0"/.test(svg);
    expect(desaturated || tinted.length === 0).toBe(true);
  });
});

describe('SparkTileArt static fallback', () => {
  it.each(ICONS)('uses the muted %s svg when not coloured', (icon) => {
    stubMedia({ reducedMotion: true });
    const { container, rerender } = render(tileArt(icon, false));
    expect(container.querySelector('img')?.getAttribute('src')).toBe(
      `/images/spark/${icon}-muted.svg`,
    );
    rerender(tileArt(icon, true));
    expect(container.querySelector('img')?.getAttribute('src')).toBe(`/images/spark/${icon}.svg`);
  });

  it.each(['mood-modes', 'margins'])('places the muted %s svg under the canvas', (icon) => {
    const { container } = render(tileArt(icon, false));
    expect(container.querySelector('img')?.getAttribute('src')).toBe(
      `/images/spark/${icon}-muted.svg`,
    );
  });
});

describe('SparkTileArt rive palette', () => {
  it.each(RIVE_ICONS)('binds the view model and paints %s muted on load', async (icon) => {
    const palette = getSparkAnimation(icon)?.palette;
    expect(palette).toBeDefined();
    const expected = Object.fromEntries(
      Object.entries(palette?.muted ?? {}).map(([name, rgb]) => [name, toHex(rgb)]),
    );
    render(tileArt(icon, false));
    await waitFor(() => expect(lastColors()).toEqual(expected));
    expect(riveMock.instances.at(-1)?.options['autoBind']).toBe(true);
    expect(Object.values(expected).filter(isTinted)).toEqual([]);
  });

  it('switches palettes live without reloading the file', async () => {
    const { rerender } = render(tileArt('mood-modes', false));
    await waitFor(() => expect(lastColors()['yellow']).toBe('CCCCCC'));
    rerender(tileArt('mood-modes', true));
    await waitFor(() => expect(lastColors()['yellow']).toBe('F4B008'));
    rerender(tileArt('mood-modes', false));
    await waitFor(() => expect(lastColors()['yellow']).toBe('CCCCCC'));
    expect(riveMock.instances).toHaveLength(1);
    expect(riveMock.instances[0]?.cleanup).not.toHaveBeenCalled();
  });

  it('greys the margins canvas, which has too many colours for a palette', async () => {
    const { rerender } = render(tileArt('margins', false));
    const canvasBox = () => screen.getByTestId('spark-canvas-margins').parentElement;
    await waitFor(() => expect(canvasBox()?.className).toContain('opacity-100'));
    expect(canvasBox()?.className).toContain('grayscale');
    rerender(tileArt('margins', true));
    expect(canvasBox()?.className).not.toContain('grayscale');
    expect(riveMock.instances).toHaveLength(1);
  });
});
