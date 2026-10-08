import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';

vi.hoisted(() => {
  if (!('AnimationEvent' in window))
    Object.assign(window, { AnimationEvent: class extends Event {} });
});

import SparkTileArt from '@/components/sparkrive/SparkTileArt';

const stubMedia = ({ hover = true, reducedMotion = false } = {}) => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches:
      (query === '(hover: hover)' && hover) ||
      (query === '(prefers-reduced-motion: reduce)' && reducedMotion),
  }));
};

const ttsArt = (hovered = false, openDelayMs = 0) => (
  <SparkTileArt icon='tts' imgClassName='h-[4.5rem]' hovered={hovered} openDelayMs={openDelayMs} />
);

const styleOf = (testId: string) => (screen.getByTestId(testId) as unknown as SVGElement).style;
const playState = (testId: string) => styleOf(testId).animationPlayState;
const ear = () => screen.getByTestId('spark-tts-ear');
const isListening = () => ear().getAttribute('data-listening') === 'true';

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

describe('TTS spark art', () => {
  it('draws the same artwork as the static svg', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'public/images/spark/tts.svg'), 'utf8');
    const sourcePaths = [...source.matchAll(/<path d="([^"]+)" fill="([^"]+)"/g)].map(
      ([, d, fill]) => `${fill} ${d}`,
    );
    const { container } = render(ttsArt());
    const renderedPaths = [...container.querySelectorAll('path')].map(
      (node) => `${node.getAttribute('fill')} ${node.getAttribute('d')}`,
    );
    expect(renderedPaths).toEqual(sourcePaths);
    expect(container.querySelector('img')).toBeNull();
  });

  it('keeps mask and clip ids unique per tile', () => {
    const { container } = render(
      <>
        {ttsArt()}
        {ttsArt()}
      </>,
    );
    const ids = [...container.querySelectorAll('mask, clipPath')].map((node) => node.id);
    expect(new Set(ids).size).toBe(4);
  });
});

describe('TTS spark art on hover devices', () => {
  it('turns the rings slowly while idle and holds the ear still', () => {
    render(ttsArt());
    expect(styleOf('spark-tts-lilac').animationName).toBe('spark-tts-spin');
    expect(playState('spark-tts-lilac')).toBe('');
    expect(playState('spark-tts-lilac-boost')).toBe('paused');
    expect(playState('spark-tts-sun-boost')).toBe('paused');
    expect(isListening()).toBe(false);
  });

  it('speeds the rings up and pulses the ear while hovered', () => {
    const { rerender } = render(ttsArt());
    rerender(ttsArt(true));
    expect(playState('spark-tts-lilac-boost')).toBe('running');
    expect(playState('spark-tts-sun-boost')).toBe('running');
    expect(isListening()).toBe(true);
    expect(styleOf('spark-tts-ear').animationName).toBe('spark-tts-listen');
  });

  it('eases the rings back at once and lets the ear finish its pulse on leave', () => {
    const { rerender } = render(ttsArt(true));
    rerender(ttsArt(false));
    expect(playState('spark-tts-lilac-boost')).toBe('paused');
    expect(isListening()).toBe(true);
    fireEvent.animationIteration(ear());
    expect(isListening()).toBe(false);
  });

  it('keeps pulsing when the pointer comes back before the pulse ends', () => {
    const { rerender } = render(ttsArt(true));
    rerender(ttsArt(false));
    rerender(ttsArt(true));
    fireEvent.animationIteration(ear());
    expect(isListening()).toBe(true);
  });
});

describe('TTS spark art on touch devices', () => {
  it('plays one listening pulse after the open delay', async () => {
    stubMedia({ hover: false });
    vi.useFakeTimers();
    render(ttsArt(false, 450));
    expect(isListening()).toBe(false);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(450);
    });
    expect(isListening()).toBe(true);
    expect(playState('spark-tts-sun-boost')).toBe('running');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(playState('spark-tts-sun-boost')).toBe('paused');
    fireEvent.animationIteration(ear());
    expect(isListening()).toBe(false);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(isListening()).toBe(false);
  });

  it('ignores the hover flag', () => {
    stubMedia({ hover: false });
    render(ttsArt(true));
    expect(isListening()).toBe(false);
    expect(playState('spark-tts-lilac-boost')).toBe('paused');
  });
});

describe('TTS spark art without motion', () => {
  it.each([
    ['UI animations are off', () => document.documentElement.setAttribute('data-ui-anim', 'off')],
    ['e-ink is on', () => document.documentElement.setAttribute('data-eink', 'true')],
    ['reduced motion is requested', () => stubMedia({ reducedMotion: true })],
  ])('shows the static svg when %s', (_label, disableMotion) => {
    disableMotion();
    const { container } = render(ttsArt(true));
    expect(screen.queryByTestId('spark-art-tts')).toBeNull();
    expect(container.querySelector('img')?.getAttribute('src')).toBe('/images/spark/tts.svg');
  });
});
