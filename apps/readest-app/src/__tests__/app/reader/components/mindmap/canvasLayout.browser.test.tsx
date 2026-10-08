import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cdp, page, userEvent } from 'vitest/browser';
import MindmapCanvas from '@/app/reader/components/mindmap/MindmapCanvas';
import TopBar, { type TopBarProps } from '@/app/reader/components/mindmap/TopBar';
import { createNodeRecord } from '@/services/mindmap/records/defaults';
import { DEFAULT_MAP_META } from '@/services/mindmap/schema/types';
import { createMapStore } from '@/services/mindmap/store/mapStore';
import { createCanvasController } from '@/services/mindmap/tools/controller';
import '@/styles/globals.css';
import { type CdpSession, frames } from './cdpCanvas';

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (value: string, options?: Record<string, string | number>) =>
    value.replace(/{{(\w+)}}/g, (_, name: string) => String(options?.[name] ?? '')),
}));

const mountCanvas = (width: number, height: number) => {
  const controller = createCanvasController({
    store: createMapStore([
      createNodeRecord({ id: 'a', index: 'a1', x: 40, y: 40, label: 'Alpha' }),
    ]),
    camera: { x: 0, y: 0, z: 1 },
  });
  render(
    <div style={{ position: 'absolute', left: 0, top: 0, width, height }}>
      <MindmapCanvas
        controller={controller}
        title='Layout map'
        mapStyle='sticker'
        mode='light'
        animate={false}
        wheelZooms={false}
        autoFocus={false}
        reveal={{ chapter: 6, revealed: 24, total: 42, newCount: 3 }}
        announcement=''
        onJumpToBook={vi.fn()}
      />
    </div>,
  );
  return controller;
};

const topBarProps = (): TopBarProps => ({
  mapId: 'a',
  meta: { ...DEFAULT_MAP_META, title: 'People' },
  maps: [],
  plan: 'free',
  bookTitle: 'Emma',
  page: 12,
  eink: false,
  readOnly: false,
  docked: false,
  canDock: true,
  wheelZooms: false,
  onBack: vi.fn(),
  onSwitchMap: vi.fn(),
  onNewMap: vi.fn(),
  onRename: vi.fn(),
  onStyle: vi.fn(),
  onToggleDock: vi.fn(),
  onToggleWheelZooms: vi.fn(),
  onDelete: vi.fn(),
});

const overlaps = (a: DOMRect, b: DOMRect) =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

const chromeRects = () => ({
  dock: screen.getByRole('toolbar').getBoundingClientRect(),
  zoom: screen.getByTestId('mm-zoom-level').parentElement!.getBoundingClientRect(),
  chip: screen.getByTestId('mm-reveal-chip').getBoundingClientRect(),
});

const touchEmulation = async (enabled: boolean) => {
  const session = cdp() as unknown as CdpSession;
  await session.send('Emulation.setTouchEmulationEnabled', { enabled, maxTouchPoints: 1 });
  await session.send('Emulation.setEmitTouchEventsForMouse', {
    enabled,
    configuration: 'mobile',
  });
};

beforeEach(() => {
  document.documentElement.setAttribute('data-theme', 'default-light');
});

afterEach(async () => {
  cleanup();
  await touchEmulation(false);
  document.documentElement.removeAttribute('data-theme');
});

describe('mind map chrome layout in real Chromium', () => {
  for (const [label, width, height] of [
    ['a 360 px phone', 360, 692],
    ['the 410 px docked pane', 410, 700],
  ] as const) {
    it(`keeps the tool dock inside ${label} and clear of the zoom control and reveal chip`, async () => {
      await page.viewport(Math.max(width, 360), 740);
      mountCanvas(width, height);
      await frames();
      const { dock, zoom, chip } = chromeRects();
      expect({
        inside: dock.left >= 0 && dock.right <= width,
        overZoom: overlaps(dock, zoom),
        overChip: overlaps(dock, chip),
        zoomOverChip: overlaps(zoom, chip),
      }).toEqual({ inside: true, overZoom: false, overChip: false, zoomOverChip: false });
      const toolbar = screen.getByRole('toolbar');
      expect(toolbar.scrollWidth).toBeGreaterThan(toolbar.clientWidth);
      const section = screen.getByRole('button', { name: 'Section' });
      section.focus();
      await frames();
      const rect = section.getBoundingClientRect();
      expect(rect.right).toBeLessThanOrEqual(dock.right + 1);
    });
  }

  it('keeps the chrome on one row when the canvas is wide', async () => {
    await page.viewport(1280, 900);
    mountCanvas(1000, 700);
    await frames();
    const { dock, zoom } = chromeRects();
    expect(Math.round(dock.bottom)).toBe(Math.round(zoom.bottom));
  });

  it('names the Back button on a phone-width screen', async () => {
    await page.viewport(375, 740);
    render(<TopBar {...topBarProps()} />);
    await expect.element(page.getByRole('button', { name: 'Back to page 12' })).toBeInTheDocument();
  });

  it('returns focus to the options button when a map option runs', async () => {
    await page.viewport(1280, 900);
    render(<TopBar {...topBarProps()} />);
    const options = screen.getByRole('button', { name: 'Map options' });
    await userEvent.click(options);
    expect(document.activeElement?.getAttribute('role')).toMatch(/^menuitem/);
    await userEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Scroll wheel zooms' }));
    expect(document.activeElement).toBe(options);
    await userEvent.click(options);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(options);
  });

  it('gives top bar icons and colour swatches 44 px targets on touch screens', async () => {
    await page.viewport(1280, 900);
    await touchEmulation(true);
    expect(window.matchMedia('(pointer: coarse)').matches).toBe(true);
    render(<TopBar {...topBarProps()} />);
    for (const name of ['Back to page 12', 'Dock beside book', 'Map options']) {
      const button = screen.getByRole('button', { name });
      const size = Math.min(button.offsetWidth, button.offsetHeight);
      expect({ name, size: size >= 44 }).toEqual({ name, size: true });
    }
    cleanup();
    const controller = mountCanvas(1000, 700);
    act(() => controller.selection.set(['a']));
    const pill = screen.getByTestId('mm-context-pill');
    const swatches = [...pill.querySelectorAll<HTMLButtonElement>('button[aria-pressed]')];
    expect(swatches.length).toBeGreaterThan(0);
    for (const target of [...swatches, screen.getByRole('button', { name: 'More actions' })]) {
      const name = target.getAttribute('aria-label');
      const size = Math.min(target.offsetWidth, target.offsetHeight);
      expect({ name, size: size >= 44 }).toEqual({ name, size: true });
    }
    const node = screen.getByTestId('mm-record-a').getBoundingClientRect();
    expect(pill.getBoundingClientRect().bottom).toBeLessThanOrEqual(node.top);
  });
});
