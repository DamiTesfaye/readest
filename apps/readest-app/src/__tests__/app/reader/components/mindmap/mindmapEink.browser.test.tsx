import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import MindmapCanvas from '@/app/reader/components/mindmap/MindmapCanvas';
import { createNodeRecord } from '@/services/mindmap/records/defaults';
import { createMapStore } from '@/services/mindmap/store/mapStore';
import { createCanvasController } from '@/services/mindmap/tools/controller';
import '@/styles/globals.css';
import { contrast, parseColor } from './colorProbe';

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (value: string, options?: Record<string, string | number>) =>
    value.replace(/{{(\w+)}}/g, (_, name: string) => String(options?.[name] ?? '')),
}));

const mount = () => {
  const controller = createCanvasController({
    store: createMapStore([
      createNodeRecord({ id: 'a', index: 'a1', x: 200, y: 200, label: 'Elizabeth', color: 'sky' }),
      {
        ...createNodeRecord({ id: 'q', index: 'a2', x: 500, y: 200, w: 200, h: 90, label: 'Q' }),
        kind: 'quote',
      },
    ]),
    camera: { x: 0, y: 0, z: 1 },
  });
  render(
    <div style={{ position: 'absolute', left: 0, top: 0, width: 1000, height: 700 }}>
      <MindmapCanvas
        controller={controller}
        title='E-ink map'
        mapStyle='sticker'
        mode='eink'
        animate={false}
        wheelZooms={false}
        autoFocus={false}
        reveal={null}
        announcement=''
        onJumpToBook={vi.fn()}
      />
    </div>,
  );
  return controller;
};

beforeEach(async () => {
  await page.viewport(1280, 900);
  document.documentElement.setAttribute('data-theme', 'default-light');
  document.documentElement.setAttribute('data-eink', 'true');
});

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute('data-eink');
  document.documentElement.removeAttribute('data-theme');
});

describe('mind map chrome on e-ink', () => {
  it('keeps the active tool icon visible on its inverted fill', async () => {
    const controller = mount();
    act(() => controller.setTool('hand'));
    await new Promise((resolve) => setTimeout(resolve, 300));
    const style = getComputedStyle(screen.getByRole('button', { name: 'Hand' }));
    expect(
      contrast(parseColor(style.color), parseColor(style.backgroundColor)),
    ).toBeGreaterThanOrEqual(3);
  });

  it('hides the colour swatches that e-ink draws all white', () => {
    const controller = mount();
    act(() => controller.selection.set(['a']));
    const pill = screen.getByTestId('mm-context-pill');
    expect(pill.querySelectorAll('button[aria-pressed]')).toHaveLength(0);
  });

  it('draws quote notes without ruled grey lines', () => {
    mount();
    const note = screen.getByTestId('mm-record-q').firstElementChild!
      .firstElementChild as HTMLElement;
    const colors = getComputedStyle(note).backgroundImage.match(/(rgba?|color)\([^)]*\)/g) ?? [];
    expect(colors.filter((css) => parseColor(css)[3] > 0)).toEqual([]);
  });
});
