import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import MindmapCanvas from '@/app/reader/components/mindmap/MindmapCanvas';
import {
  createInkRecord,
  createLinkRecord,
  createNodeRecord,
  createSectionRecord,
  createShapeRecord,
  createStickyRecord,
  createTextRecord,
} from '@/services/mindmap/records/defaults';
import type { MapRecord, MapStyle } from '@/services/mindmap/schema/types';
import { createMapStore } from '@/services/mindmap/store/mapStore';
import { PRESET_COLORS } from '@/services/mindmap/theme/presets';
import { createCanvasController } from '@/services/mindmap/tools/controller';
import { themes } from '@/styles/themes';
import '@/styles/globals.css';
import { type RGBA, contrast, hex, over, parseColor, shadowColor } from './colorProbe';

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (value: string, options?: Record<string, string | number>) =>
    value.replace(/{{(\w+)}}/g, (_, name: string) => String(options?.[name] ?? '')),
}));

const TEXT_AA = 4.5;
const UI_AA = 3;
const STYLES: MapStyle[] = ['sticker', 'paper', 'ink'];

const records = (): MapRecord[] => [
  ...PRESET_COLORS.map((color, i) =>
    createNodeRecord({
      id: `n-${color}`,
      index: `a${i}`,
      x: 20,
      y: 20 + i * 80,
      label: color,
      color,
    }),
  ),
  ...PRESET_COLORS.map((color, i) =>
    createShapeRecord({ id: `s-${color}`, index: `c${i}`, x: 760, y: 20 + i * 60, color }),
  ),
  ...PRESET_COLORS.map((color, i) =>
    createInkRecord({
      id: `i-${color}`,
      index: `d${i}`,
      x: 880,
      y: 20 + i * 60,
      w: 40,
      h: 40,
      points: '0,0,0.5 40,40,0.5',
      color,
    }),
  ),
  createTextRecord({ id: 't', index: 'b1', x: 300, y: 20, text: 'Free text' }),
  createStickyRecord({ id: 'sticky', index: 'b2', x: 300, y: 80, text: 'Sticky' }),
  {
    ...createNodeRecord({ id: 'q', index: 'b3', x: 300, y: 300, w: 200, h: 90, label: 'Quote' }),
    kind: 'quote',
  },
  createSectionRecord({ id: 'sec', index: 'b4', x: 520, y: 40, title: 'Section', color: 'sky' }),
  createLinkRecord({ id: 'l', index: 'b5', fromId: 'n-terracotta', toId: 't', label: 'rel' }),
];

const color = (
  element: Element,
  prop: 'color' | 'backgroundColor' | 'borderTopColor' | 'stroke' | 'fill',
): RGBA => parseColor(getComputedStyle(element)[prop]);

const body = (id: string): HTMLElement =>
  screen.getByTestId(`mm-record-${id}`).firstElementChild!.firstElementChild as HTMLElement;

const ringOf = (element: Element): RGBA => {
  const shadow = shadowColor(getComputedStyle(element).boxShadow);
  return shadow ? parseColor(shadow) : [0, 0, 0, 0];
};

type Row = { what: string; ratio: number; need: number; fg: string; bg: string };

const measure = async (scheme: 'light' | 'dark', mapStyle: MapStyle): Promise<Row[]> => {
  const controller = createCanvasController({
    store: createMapStore(records()),
    camera: { x: 0, y: 0, z: 1 },
  });
  render(
    <div
      className='bg-base-200'
      style={{ position: 'absolute', left: 20, top: 20, width: 1000, height: 700 }}
    >
      <MindmapCanvas
        controller={controller}
        title='Contrast map'
        mapStyle={mapStyle}
        mode={scheme}
        animate={false}
        wheelZooms={false}
        autoFocus={false}
        reveal={null}
        announcement=''
        onJumpToBook={vi.fn()}
      />
    </div>,
  );
  const rows: Row[] = [];
  const add = (what: string, fg: RGBA, bg: RGBA, need: number): void => {
    rows.push({ what, ratio: +contrast(fg, bg).toFixed(2), need, fg: hex(fg), bg: hex(bg) });
  };
  const root = screen.getByTestId('mindmap-canvas');
  const canvas = color(root, 'backgroundColor');
  expect(canvas[3]).toBe(1);

  add('text label on canvas', color(body('t'), 'color'), canvas, TEXT_AA);
  add(
    'sticky text',
    color(body('sticky'), 'color'),
    color(body('sticky'), 'backgroundColor'),
    TEXT_AA,
  );
  const quote = body('q');
  add('quote text', color(quote, 'color'), over(color(quote, 'backgroundColor'), canvas), TEXT_AA);
  add('link stroke', color(screen.getByTestId('mm-link-l'), 'stroke'), canvas, UI_AA);
  add('section border', color(body('sec'), 'borderTopColor'), canvas, UI_AA);

  for (const preset of PRESET_COLORS) {
    const node = body(`n-${preset}`);
    if (mapStyle === 'sticker') {
      add(`${preset} sticker label`, color(node, 'color'), color(node, 'backgroundColor'), TEXT_AA);
    } else if (mapStyle === 'ink') {
      add(`${preset} ink label`, color(node, 'color'), canvas, TEXT_AA);
      add(`${preset} ink outline`, color(node, 'borderTopColor'), canvas, UI_AA);
    } else {
      add(`${preset} paper label`, color(node, 'color'), color(node, 'backgroundColor'), TEXT_AA);
      add(`${preset} paper card border`, color(node, 'borderTopColor'), canvas, UI_AA);
    }
    const shape = screen.getByTestId(`mm-record-s-${preset}`).querySelector('rect')!;
    add(`${preset} shape outline`, color(shape, 'stroke'), canvas, UI_AA);
    const ink = screen.getByTestId(`mm-record-i-${preset}`).querySelector('path')!;
    add(`${preset} pen ink`, color(ink, 'fill'), canvas, UI_AA);
  }
  if (mapStyle === 'sticker') {
    add('paper sticker outline', color(body('n-paper'), 'borderTopColor'), canvas, UI_AA);
  }

  act(() => controller.selection.set(['n-sky']));
  add(
    'selection ring',
    color(screen.getByTestId('mm-selection-ring'), 'borderTopColor'),
    canvas,
    UI_AA,
  );
  const handle = document.querySelector('[data-connect-handle="top"] span')!;
  add('connect glyph', color(handle, 'color'), color(handle, 'backgroundColor'), UI_AA);
  add('connect handle', color(handle, 'backgroundColor'), canvas, UI_AA);
  const pill = screen.getByTestId('mm-context-pill');
  const pillBg = color(pill, 'backgroundColor');
  for (const swatch of pill.querySelectorAll<HTMLButtonElement>('button[aria-pressed]')) {
    add(
      `swatch ${swatch.getAttribute('aria-label')} border`,
      color(swatch, 'borderTopColor'),
      pillBg,
      UI_AA,
    );
  }
  act(() => controller.selection.set([]));

  await page.elementLocator(root).click({ position: { x: 990, y: 5 } });
  root.focus();
  expect(root.matches(':focus-visible')).toBe(true);
  add('canvas focus ring', ringOf(root), canvas, UI_AA);
  const dockButton = screen.getByRole('button', { name: 'Hand' });
  dockButton.focus();
  add(
    'dock focus ring',
    ringOf(dockButton),
    color(screen.getByRole('toolbar'), 'backgroundColor'),
    UI_AA,
  );
  cleanup();
  return rows;
};

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute('data-theme');
});

describe('mind map colours in real Chromium', () => {
  it('meet WCAG AA for text and 3:1 for strokes in every theme, mode and style', async () => {
    await page.viewport(1280, 900);
    const failures: string[] = [];
    for (const theme of themes) {
      for (const scheme of ['light', 'dark'] as const) {
        document.documentElement.setAttribute('data-theme', `${theme.name}-${scheme}`);
        for (const mapStyle of STYLES) {
          for (const row of await measure(scheme, mapStyle)) {
            if (row.ratio < row.need) {
              failures.push(
                `${theme.name}-${scheme} [${mapStyle}] ${row.what}: ${row.ratio} (${row.fg} on ${row.bg})`,
              );
            }
          }
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it('draws the canvas focus ring inside the canvas', async () => {
    document.documentElement.setAttribute('data-theme', 'default-light');
    const controller = createCanvasController({
      store: createMapStore([]),
      camera: { x: 0, y: 0, z: 1 },
    });
    render(
      <div style={{ position: 'absolute', left: 0, top: 0, width: 400, height: 300 }}>
        <MindmapCanvas
          controller={controller}
          title='Ring map'
          mapStyle='sticker'
          mode='light'
          animate={false}
          wheelZooms={false}
          autoFocus={false}
          reveal={null}
          announcement=''
          onJumpToBook={vi.fn()}
        />
      </div>,
    );
    const root = screen.getByTestId('mindmap-canvas');
    await page.elementLocator(root).click({ position: { x: 390, y: 5 } });
    root.focus();
    expect(getComputedStyle(root).boxShadow).toContain('inset');
  });
});
