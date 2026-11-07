import { describe, it, expect, afterEach } from 'vitest';
import {
  PREDEFINED_TEXTURES,
  layersToStyle,
  mountBackgroundTexture,
  unmountBackgroundTexture,
} from '@/styles/textures';

afterEach(() => {
  unmountBackgroundTexture(document);
});

const mountedCss = () => document.getElementById('background-texture')?.textContent ?? '';

describe('mountBackgroundTexture', () => {
  it('covers the scrolled-mode notch mask so the top inset strip is textured (#4486)', () => {
    mountBackgroundTexture(document, {
      id: 'paper',
      name: 'Paper',
      url: '/images/paper-texture.png',
    });

    expect(mountedCss()).toContain('.notch-masked::before');
  });

  it('keeps single-image textures on multiply blend and the user size', () => {
    mountBackgroundTexture(document, { id: 'paper', name: 'Paper', url: '/images/p.png' });
    const css = mountedCss();
    expect(css).toContain('url("/images/p.png")');
    expect(css).toContain('background-size: var(--bg-texture-size, cover)');
    expect(css).toContain('mix-blend-mode: var(--bg-texture-blend-mode, multiply)');
  });

  it('stacks LooseLeaf layers at their own sizes with normal blend', () => {
    const paper = PREDEFINED_TEXTURES.find((t) => t.id === 'looseleaf-paper')!;
    mountBackgroundTexture(document, paper);
    const css = mountedCss();
    expect(css).toContain(
      'background-image: url("/images/looseleaf/fibre.png"), url("/images/looseleaf/relief.png"), url("/images/looseleaf/cloud.png")',
    );
    expect(css).toContain('background-size: 240px 240px, 192px 192px, 720px 720px');
    expect(css).toContain('mix-blend-mode: normal');
  });

  it('marks the root while a texture is mounted so the Neue Paper default steps aside', () => {
    mountBackgroundTexture(document, { id: 'paper', name: 'Paper', url: '/images/p.png' });
    expect(document.documentElement.getAttribute('data-bg-texture')).toBe('paper');
    unmountBackgroundTexture(document);
    expect(document.documentElement.hasAttribute('data-bg-texture')).toBe(false);
  });
});

describe('LooseLeaf predefined textures', () => {
  it('ships every layered stock with layers and a thumbnail style', () => {
    for (const id of ['looseleaf-paper', 'looseleaf-fine', 'looseleaf-kraft', 'looseleaf-desk']) {
      const t = PREDEFINED_TEXTURES.find((p) => p.id === id);
      expect(t?.layers?.length, id).toBeGreaterThan(1);
      expect(layersToStyle(t!.layers!).backgroundImage).toContain('/images/looseleaf/');
    }
  });
});
