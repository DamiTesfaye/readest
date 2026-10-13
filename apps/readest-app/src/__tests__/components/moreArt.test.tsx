import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';

import LibraryArt from '@/components/moreart/LibraryArt';
import ThemeFontsArt from '@/components/moreart/ThemeFontsArt';
import AnnotationsCupArt from '@/components/moreart/AnnotationsCupArt';
import BookmarksNotesArt from '@/components/moreart/BookmarksNotesArt';
import ReadingRulerArt from '@/components/moreart/ReadingRulerArt';
import HomeArt from '@/components/moreart/HomeArt';
import { useSettingsStore } from '@/store/settingsStore';
import type { SystemSettings } from '@/types/settings';

interface ArtProps {
  colored: boolean;
  hovered: boolean;
  openDelayMs: number;
}

const stubMedia = ({ hover = true, reducedMotion = false } = {}) => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches:
      (query === '(hover: hover)' && hover) ||
      (query === '(prefers-reduced-motion: reduce)' && reducedMotion),
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
};

const setUIAnimations = (uiAnimationsEnabled: boolean | undefined) => {
  useSettingsStore.setState({ settings: { uiAnimationsEnabled } as SystemSettings });
};

const readSvg = (file: string) =>
  fs.readFileSync(path.join(process.cwd(), 'public/images', file), 'utf8');

const svgShapes = (file: string) =>
  [...readSvg(file).matchAll(/<path\b[^>]*?\sd="([^"]+)"[^>]*?fill="([^"]+)"/g)].map(
    ([, d, fill]) => [d, fill],
  );

const svgViewBox = (file: string) => readSvg(file).match(/viewBox="([^"]+)"/)?.[1];

const renderedShapes = (element: Element) =>
  [...element.querySelectorAll('path')].map((node) => [
    node.getAttribute('d'),
    node.getAttribute('fill'),
  ]);

const root = (name: string) => screen.getByTestId(`more-art-${name}`);
const animated = (name: string) =>
  [...root(name).querySelectorAll<HTMLElement>('[data-part]')].filter(
    (node) => node.style.animationName !== '',
  );

const endCycle = (name: string) => {
  const part = root(name).querySelector('[data-part]');
  if (!part) throw new Error(`no animated part in ${name}`);
  for (const type of ['animationiteration', 'webkitAnimationIteration']) {
    fireEvent(part, new Event(type, { bubbles: true }));
  }
};

beforeEach(() => {
  stubMedia();
  setUIAnimations(undefined);
  document.documentElement.removeAttribute('data-ui-anim');
  document.documentElement.removeAttribute('data-eink');
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const INLINE_ARTS: Array<{
  name: string;
  Art: React.FC<ArtProps>;
  colored: string;
  muted: string;
}> = [
  {
    name: 'library',
    Art: LibraryArt,
    colored: 'toolbar/library.svg',
    muted: 'toolbar/library-muted.svg',
  },
  {
    name: 'annotations-cup',
    Art: AnnotationsCupArt,
    colored: 'toolbar/annotations-cup.svg',
    muted: 'toolbar/annotations-cup-muted.svg',
  },
  {
    name: 'bookmarks-notes',
    Art: BookmarksNotesArt,
    colored: 'toolbar/bookmarks-notes.svg',
    muted: 'toolbar/bookmarks-notes-muted.svg',
  },
];

const IMAGE_ARTS: Array<{
  name: string;
  Art: React.FC<ArtProps>;
  colored: string[];
  muted: string[];
}> = [
  {
    name: 'theme-fonts',
    Art: ThemeFontsArt,
    colored: ['/images/theme-fonts/paper-small.svg', '/images/theme-fonts/paper-large.svg'],
    muted: ['/images/theme-fonts/muted-small.svg', '/images/theme-fonts/muted-large.svg'],
  },
  {
    name: 'reading-ruler',
    Art: ReadingRulerArt,
    colored: ['/images/toolbar/reading-ruler.svg'],
    muted: ['/images/toolbar/reading-ruler-muted.svg'],
  },
];

const GoHomeArt: React.FC<ArtProps> = (props) => <HomeArt icon='go-home' {...props} />;
const SpaceBaseArt: React.FC<ArtProps> = (props) => <HomeArt icon='space-base' {...props} />;

const ALL_ARTS: Array<{ name: string; Art: React.FC<ArtProps> }> = [
  ...INLINE_ARTS,
  ...IMAGE_ARTS,
  { name: 'go-home', Art: GoHomeArt },
  { name: 'space-base', Art: SpaceBaseArt },
];

describe.each(INLINE_ARTS)('$name art rest pose', ({ name, Art, colored, muted }) => {
  it('draws the colored icon path for path with its exact fills', () => {
    render(<Art colored hovered={false} openDelayMs={0} />);
    expect(renderedShapes(root(name))).toEqual(svgShapes(colored));
    expect(root(name).getAttribute('viewBox')).toBe(svgViewBox(colored));
  });

  it('draws the muted icon path for path with its exact fills', () => {
    render(<Art colored={false} hovered={false} openDelayMs={0} />);
    expect(renderedShapes(root(name))).toEqual(svgShapes(muted));
    expect(root(name).getAttribute('viewBox')).toBe(svgViewBox(muted));
  });

  it('keeps every part still at rest', () => {
    render(<Art colored hovered={false} openDelayMs={0} />);
    expect(root(name).getAttribute('data-animating')).toBe('false');
    expect(animated(name)).toEqual([]);
  });
});

describe.each(IMAGE_ARTS)('$name art rest pose', ({ name, Art, colored, muted }) => {
  const sources = () =>
    [...root(name).querySelectorAll('img')].map((img) => new URL(img.src).pathname);

  it('shows the colored icon images', () => {
    render(<Art colored hovered={false} openDelayMs={0} />);
    expect(sources()).toEqual(colored);
  });

  it('shows the muted icon images', () => {
    render(<Art colored={false} hovered={false} openDelayMs={0} />);
    expect(sources()).toEqual(muted);
  });

  it('keeps the images still at rest', () => {
    render(<Art colored hovered={false} openDelayMs={0} />);
    expect(animated(name)).toEqual([]);
  });
});

describe.each([
  { icon: 'go-home', Art: GoHomeArt },
  { icon: 'space-base', Art: SpaceBaseArt },
])('$icon home art rest pose', ({ icon, Art }) => {
  const image = () => root(icon).querySelector('img');
  const lights = () => [...root(icon).querySelectorAll('[data-part] > *')];

  it('shows the colored icon with every light off', () => {
    render(<Art colored hovered={false} openDelayMs={0} />);
    expect(new URL(image()?.src ?? '').pathname).toBe(`/images/toolbar/${icon}.svg`);
    expect(lights().length).toBeGreaterThan(0);
    expect(animated(icon)).toEqual([]);
    expect(root(icon).querySelector('[data-part]')?.getAttribute('opacity')).toBe('0');
  });

  it('shows the muted icon with muted lights', () => {
    render(<Art colored={false} hovered={false} openDelayMs={0} />);
    expect(new URL(image()?.src ?? '').pathname).toBe(`/images/toolbar/${icon}-muted.svg`);
    const fills = lights().map((node) => node.getAttribute('fill'));
    expect(fills.every((fill) => fill === '#FCFCFC')).toBe(true);
  });

  it('lights up warm in the colored art', () => {
    render(<Art colored hovered={false} openDelayMs={0} />);
    const fills = new Set(lights().map((node) => node.getAttribute('fill')));
    expect(fills.has('#FCFCFC')).toBe(false);
    expect(fills.has('#FFE23A')).toBe(true);
  });

  it('matches the icon viewBox so the lights sit on the drawing', () => {
    render(<Art colored hovered={false} openDelayMs={0} />);
    expect(root(icon).querySelector('svg')?.getAttribute('viewBox')).toBe(
      svgViewBox(`toolbar/${icon}.svg`),
    );
  });
});

describe.each(ALL_ARTS)('$name art playback', ({ name, Art }) => {
  it('plays while hovered on hover devices', () => {
    render(<Art colored hovered openDelayMs={0} />);
    expect(root(name).getAttribute('data-animating')).toBe('true');
    expect(animated(name).length).toBeGreaterThan(0);
    for (const part of animated(name)) {
      expect(part.style.animationIterationCount).toBe('infinite');
    }
  });

  it('finishes the current cycle after the pointer leaves, then rests', () => {
    const { rerender } = render(<Art colored hovered openDelayMs={0} />);
    rerender(<Art colored hovered={false} openDelayMs={0} />);
    expect(animated(name).length).toBeGreaterThan(0);
    endCycle(name);
    expect(animated(name)).toEqual([]);
    expect(root(name).getAttribute('data-animating')).toBe('false');
  });

  it('keeps playing across cycles while still hovered', () => {
    render(<Art colored hovered openDelayMs={0} />);
    endCycle(name);
    expect(animated(name).length).toBeGreaterThan(0);
  });

  it('plays once after its stagger delay on touch devices and ignores hover', () => {
    vi.useFakeTimers();
    stubMedia({ hover: false });
    render(<Art colored hovered openDelayMs={300} />);
    expect(animated(name)).toEqual([]);
    act(() => vi.advanceTimersByTime(300));
    expect(animated(name).length).toBeGreaterThan(0);
    act(() => vi.advanceTimersByTime(2000));
    endCycle(name);
    expect(animated(name)).toEqual([]);
  });

  it('stays still when UI animations are off', () => {
    setUIAnimations(false);
    render(<Art colored hovered openDelayMs={0} />);
    expect(animated(name)).toEqual([]);
  });

  it('stays still when the OS asks for reduced motion', () => {
    stubMedia({ reducedMotion: true });
    render(<Art colored hovered openDelayMs={0} />);
    expect(animated(name)).toEqual([]);
  });

  it('stays still on e-ink screens', () => {
    document.documentElement.setAttribute('data-eink', 'true');
    render(<Art colored hovered openDelayMs={0} />);
    expect(animated(name)).toEqual([]);
  });

  it('stops as soon as the user turns motion off', () => {
    render(<Art colored hovered openDelayMs={0} />);
    act(() => setUIAnimations(false));
    expect(animated(name)).toEqual([]);
  });
});
