import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import GridLayer, {
  gridDotRadius,
  gridLevelOpacity,
} from '@/app/reader/components/mindmap/GridLayer';
import LiveLayer from '@/app/reader/components/mindmap/LiveLayer';
import OverlayLayer from '@/app/reader/components/mindmap/OverlayLayer';
import { POP_CLASS } from '@/app/reader/components/mindmap/RecordView';
import WorldLayer from '@/app/reader/components/mindmap/WorldLayer';
import { createLinkRecord, createNodeRecord } from '@/services/mindmap/records/defaults';
import type { MapRecord } from '@/services/mindmap/schema/types';
import { createMapStore } from '@/services/mindmap/store/mapStore';
import { createCanvasController } from '@/services/mindmap/tools/controller';
import { IDLE_LIVE } from '@/services/mindmap/tools/types';

const elizabeth = createNodeRecord({
  id: 'e',
  index: 'a1',
  x: 0,
  y: 0,
  label: 'Elizabeth',
  kind: 'character',
});
const darcy = createNodeRecord({
  id: 'd',
  index: 'a2',
  x: 400,
  y: 0,
  label: 'Mr Darcy',
  kind: 'character',
});
const slights = createLinkRecord({
  id: 'l',
  index: 'a3',
  fromId: 'e',
  toId: 'd',
  label: 'slights',
});

const controllerFor = (records: MapRecord[]) =>
  createCanvasController({ store: createMapStore(records), camera: { x: 0, y: 0, z: 1 } });

afterEach(cleanup);

describe('WorldLayer', () => {
  it('renders live records with aria labels and skips deleted ones', () => {
    const controller = controllerFor([elizabeth, { ...darcy, deleted: { by: 'user' } }, slights]);
    render(<WorldLayer controller={controller} mapStyle='sticker' animate />);
    expect(screen.getByRole('button', { name: 'Elizabeth, Character' })).toBeTruthy();
    expect(screen.queryByTestId('mm-record-d')).toBeNull();
    expect(screen.queryByTestId('mm-link-l')).toBeNull();
  });

  it('draws links in a non-interactive svg that scales with the world', () => {
    const controller = controllerFor([elizabeth, darcy, slights]);
    render(<WorldLayer controller={controller} mapStyle='sticker' animate />);
    const links = screen.getByTestId('mm-links');
    expect(links.getAttribute('class')).toContain('pointer-events-none');
    expect(links.getAttribute('class')).toContain('overflow-visible');
    const world = screen.getByTestId('mm-world');
    expect(world.contains(links)).toBe(true);
    expect(world.textContent).toContain('slights');
    act(() => controller.camera.set({ x: 10, y: 20, z: 2 }));
    expect(world.style.transform).toBe('translate(10px, 20px) scale(2)');
    expect(world.style.transformOrigin).toBe('0 0');
  });

  it('writes the camera transform without re-rendering records', () => {
    const controller = controllerFor([elizabeth]);
    render(<WorldLayer controller={controller} mapStyle='sticker' animate />);
    const record = screen.getByTestId('mm-record-e');
    const html = record.outerHTML;
    act(() => controller.camera.panBy(50, 0));
    expect(screen.getByTestId('mm-record-e')).toBe(record);
    expect(record.outerHTML).toBe(html);
  });

  it('culls off-screen records on the rendered element and never unmounts them', () => {
    const far = createNodeRecord({ id: 'far', index: 'a4', x: 5000, y: 5000, label: 'Far' });
    const controller = controllerFor([elizabeth, far]);
    render(<WorldLayer controller={controller} mapStyle='sticker' animate />);
    act(() => controller.viewport.set({ width: 800, height: 600 }));
    const element = screen.getByTestId('mm-record-far');
    expect(element.style.display).toBe('none');
    expect(screen.getByTestId('mm-record-e').style.display).toBe('');
    act(() => controller.camera.set({ x: -4800, y: -4800, z: 1 }));
    expect(screen.getByTestId('mm-record-far')).toBe(element);
    expect(element.style.display).toBe('');
    expect(screen.getByTestId('mm-record-e').style.display).toBe('none');
  });

  it('keeps a selected off-screen record visible so focus can land on it before the camera catches up', () => {
    const far = createNodeRecord({ id: 'far', index: 'a4', x: 5000, y: 5000, label: 'Far' });
    const controller = controllerFor([elizabeth, far]);
    render(<WorldLayer controller={controller} mapStyle='sticker' animate />);
    act(() => controller.viewport.set({ width: 800, height: 600 }));
    expect(screen.getByTestId('mm-record-far').style.display).toBe('none');
    act(() => controller.selection.set(['far']));
    expect(screen.getByTestId('mm-record-far').style.display).toBe('');
  });

  it('pops in records created after the map opened, and never when animation is off', () => {
    const controller = controllerFor([elizabeth]);
    const { rerender } = render(<WorldLayer controller={controller} mapStyle='sticker' animate />);
    act(() => {
      controller.store.put([createNodeRecord({ id: 'n', index: 'a5', label: 'New' })]);
    });
    expect(screen.getByTestId('mm-record-n').innerHTML).toContain(POP_CLASS);
    expect(screen.getByTestId('mm-record-e').innerHTML).not.toContain(POP_CLASS);
    rerender(<WorldLayer controller={controller} mapStyle='sticker' animate={false} />);
    expect(screen.getByTestId('mm-world').innerHTML).not.toContain('animate-');
  });
});

describe('GridLayer', () => {
  it('fades step levels by zoom and grows dots within a clamp', () => {
    expect(gridLevelOpacity(4, 1)).toBe(0);
    expect(gridLevelOpacity(16, 1)).toBe(0.5);
    expect(gridLevelOpacity(64, 1)).toBe(1);
    expect(gridDotRadius(0.1)).toBe(0.6);
    expect(gridDotRadius(10)).toBe(1.5);
  });

  it('follows the camera', () => {
    const controller = controllerFor([]);
    render(<GridLayer camera={controller.camera} eink={false} />);
    const before = screen.getByTestId('mm-grid-64').getAttribute('x');
    act(() => controller.camera.panBy(10, 0));
    expect(screen.getByTestId('mm-grid-64').getAttribute('x')).not.toBe(before);
    act(() => controller.camera.set({ x: 0, y: 0, z: 4 }));
    expect(screen.getByTestId('mm-grid-4')).toBeTruthy();
  });

  it('shows one coarse level without fades on e-ink', () => {
    const controller = controllerFor([]);
    render(<GridLayer camera={controller.camera} eink />);
    expect(screen.getByTestId('mm-grid-64')).toBeTruthy();
    expect(screen.queryByTestId('mm-grid-16')).toBeNull();
    for (const dot of screen.getByTestId('mm-grid').querySelectorAll('circle')) {
      expect(dot.getAttribute('opacity')).toBe('1');
    }
  });
});

describe('LiveLayer', () => {
  it('previews the stroke, draft shape and link being drawn', () => {
    const controller = controllerFor([]);
    render(<LiveLayer controller={controller} />);
    act(() =>
      controller.live.set({
        ...IDLE_LIVE,
        ink: {
          points: [
            [0, 0, 0.5],
            [40, 10, 0.5],
          ],
          count: 2,
          pen: false,
        },
        draft: { tool: 'ellipse', box: { x: 0, y: 0, w: 100, h: 50 } },
        link: { from: { x: 0, y: 0 }, to: { x: 50, y: 50 } },
      }),
    );
    expect(screen.getByTestId('mm-live-ink').getAttribute('d')).toMatch(/^M.*Z$/);
    expect(screen.getByTestId('mm-live-draft').tagName.toLowerCase()).toBe('ellipse');
    expect(screen.getByTestId('mm-live-link').getAttribute('x2')).toBe('50');
  });
});

describe('OverlayLayer', () => {
  it('rings the selection in screen space and offers grabbable connect and resize handles', () => {
    const controller = controllerFor([elizabeth]);
    render(<OverlayLayer controller={controller} eink={false} />);
    act(() => {
      controller.camera.set({ x: 100, y: 50, z: 2 });
      controller.selection.set(['e']);
    });
    const ring = screen.getByTestId('mm-selection-ring');
    expect(ring.style.left).toBe('97px');
    expect(ring.style.width).toBe('326px');
    const handles = document.querySelectorAll('[data-connect-handle]');
    expect(handles).toHaveLength(4);
    for (const handle of handles) expect(handle.className).toContain('pointer-events-auto');
    expect(document.querySelector('[data-resize-handle]')!.getAttribute('data-record-id')).toBe(
      'e',
    );
  });

  it('shows handles on hover but not on e-ink', () => {
    const controller = controllerFor([elizabeth]);
    const { rerender } = render(<OverlayLayer controller={controller} eink={false} />);
    act(() => controller.hover.set('e'));
    expect(document.querySelectorAll('[data-connect-handle]')).toHaveLength(4);
    rerender(<OverlayLayer controller={controller} eink />);
    expect(document.querySelectorAll('[data-connect-handle]')).toHaveLength(0);
  });

  it('draws snap guides and the brush rectangle', () => {
    const controller = controllerFor([]);
    render(<OverlayLayer controller={controller} eink={false} />);
    act(() =>
      controller.live.set({
        ...IDLE_LIVE,
        brush: { x: 10, y: 10, w: 50, h: 40 },
        guides: [{ x1: 0, y1: 0, x2: 0, y2: 100 }],
      }),
    );
    expect(screen.getByTestId('mm-brush').style.width).toBe('50px');
    expect(screen.getAllByTestId('mm-snap-guide')).toHaveLength(1);
  });

  it('edits a label in place and commits it once', () => {
    const controller = controllerFor([elizabeth]);
    render(<OverlayLayer controller={controller} eink={false} />);
    act(() => controller.editing.set('e'));
    const editor = within(screen.getByTestId('mm-overlay')).getByRole('textbox', {
      name: 'Edit label',
    }) as HTMLTextAreaElement;
    expect(editor.value).toBe('Elizabeth');
    fireEvent.change(editor, { target: { value: 'Lizzy' } });
    fireEvent.keyDown(editor, { key: 'Enter' });
    fireEvent.blur(editor);
    expect(controller.store.get('e')).toMatchObject({ label: 'Lizzy' });
    expect(controller.editing.get()).toBeNull();
    controller.history.undo();
    expect(controller.store.get('e')).toMatchObject({ label: 'Elizabeth' });
    expect(controller.history.canUndo()).toBe(false);
  });
});
