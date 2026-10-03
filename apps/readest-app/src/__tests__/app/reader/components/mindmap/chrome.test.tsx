import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ContextPill, { RecordMenu } from '@/app/reader/components/mindmap/ContextPill';
import LiveRegion from '@/app/reader/components/mindmap/LiveRegion';
import RevealChip from '@/app/reader/components/mindmap/RevealChip';
import ToolDock from '@/app/reader/components/mindmap/ToolDock';
import ZoomControl from '@/app/reader/components/mindmap/ZoomControl';
import {
  createNodeRecord,
  createStickyRecord,
  createTextRecord,
} from '@/services/mindmap/records/defaults';
import type { MapRecord, NodeRecord } from '@/services/mindmap/schema/types';
import { createMapStore } from '@/services/mindmap/store/mapStore';
import { createCanvasController } from '@/services/mindmap/tools/controller';
import { IDLE_LIVE } from '@/services/mindmap/tools/types';

const anchor = { cfi: 'epubcfi(/6/4)', section: 2, progress: 0.2 };
const node = (id: string, extra: Partial<NodeRecord> = {}): NodeRecord => ({
  ...createNodeRecord({ id, index: 'a1', x: 0, y: 200, label: id }),
  ...extra,
});

const controllerFor = (records: MapRecord[], readOnly = false) => {
  let next = 0;
  return createCanvasController({
    store: createMapStore(records),
    camera: { x: 0, y: 0, z: 1 },
    readOnly,
    createId: () => {
      next += 1;
      return `new${next}`;
    },
  });
};

afterEach(cleanup);

describe('ToolDock', () => {
  it('shows every tool with its shortcut letter and marks the active one', () => {
    const controller = controllerFor([]);
    render(<ToolDock controller={controller} />);
    const dock = screen.getByRole('toolbar', { name: 'Tools' });
    expect(dock.className).toContain('nodrag');
    expect(screen.getByRole('button', { name: 'Select' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(screen.getByRole('button', { name: 'Section' }).getAttribute('aria-keyshortcuts')).toBe(
      'Shift+S',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Pen' }));
    expect(controller.tool.get()).toBe('pen');
    expect(screen.getByRole('button', { name: 'Pen' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Pen' }).textContent).toBe('P');
  });

  it('offers only viewing tools in a read-only map', () => {
    render(<ToolDock controller={controllerFor([], true)} />);
    expect(screen.getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual([
      'Select',
      'Hand',
    ]);
  });
});

describe('ZoomControl', () => {
  it('shows the zoom level, zooms around the centre and fits on click', () => {
    const controller = controllerFor([node('a')]);
    controller.viewport.set({ width: 800, height: 600 });
    render(<ZoomControl controller={controller} animate={false} />);
    expect(screen.getByTestId('mm-zoom-level').textContent).toBe('100%');
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(screen.getByTestId('mm-zoom-level').textContent).toBe('120%');
    fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }));
    expect(controller.camera.get().z).toBeCloseTo(1, 5);
    const fit = vi.spyOn(controller, 'fitView');
    fireEvent.click(screen.getByRole('button', { name: 'Fit to screen' }));
    expect(fit).toHaveBeenCalledWith(false);
  });
});

describe('ContextPill', () => {
  it('floats above the selection with colours, kind and Jump to book', () => {
    const controller = controllerFor([node('a', { anchor })]);
    const onJumpToBook = vi.fn();
    render(<ContextPill controller={controller} onJumpToBook={onJumpToBook} />);
    expect(screen.queryByTestId('mm-context-pill')).toBeNull();
    act(() => controller.selection.set(['a']));
    expect(screen.getByTestId('mm-context-pill').style.top).toBe('144px');
    fireEvent.click(screen.getByRole('button', { name: 'Sky' }));
    expect(controller.store.get('a')).toMatchObject({ color: 'sky' });
    expect(screen.getByRole('button', { name: 'Sky' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.change(screen.getByRole('combobox', { name: 'Node kind' }), {
      target: { value: 'place' },
    });
    expect(controller.store.get('a')).toMatchObject({ kind: 'place' });
    fireEvent.click(screen.getByRole('button', { name: 'Jump to book' }));
    expect(onJumpToBook).toHaveBeenCalledWith(anchor);
  });

  it('drops below the selection when there is no room above', () => {
    const controller = controllerFor([node('a', { y: 0 })]);
    render(<ContextPill controller={controller} onJumpToBook={vi.fn()} />);
    act(() => controller.selection.set(['a']));
    expect(screen.getByTestId('mm-context-pill').style.top).toBe('76px');
  });

  it('hides while editing or dragging and hides edits in read-only maps', () => {
    const controller = controllerFor([
      node('a'),
      createTextRecord({ id: 't', index: 'a2', x: 0, y: 400 }),
    ]);
    render(<ContextPill controller={controller} onJumpToBook={vi.fn()} />);
    act(() => controller.selection.set(['t']));
    expect(screen.queryByRole('button', { name: 'Sky' })).toBeNull();
    act(() => controller.selection.set(['a']));
    act(() => controller.editing.set('a'));
    expect(screen.queryByTestId('mm-context-pill')).toBeNull();
    act(() => {
      controller.editing.set(null);
      controller.live.set({ ...IDLE_LIVE, guides: [{ x1: 0, y1: 0, x2: 0, y2: 1 }] });
    });
    expect(screen.queryByTestId('mm-context-pill')).toBeNull();
    cleanup();
    const readOnly = controllerFor([node('a')], true);
    render(<ContextPill controller={readOnly} onJumpToBook={vi.fn()} />);
    act(() => readOnly.selection.set(['a']));
    expect(screen.queryByRole('button', { name: 'Sky' })).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Node kind' })).toBeNull();
  });

  it('offers no colour swatches for a sticky, which always stays yellow', () => {
    const controller = controllerFor([createStickyRecord({ id: 's', index: 'a1', x: 0, y: 200 })]);
    render(<ContextPill controller={controller} onJumpToBook={vi.fn()} />);
    act(() => controller.selection.set(['s']));
    expect(screen.queryByRole('button', { name: 'Sky' })).toBeNull();
    act(() => controller.setColor('sky'));
    expect(controller.store.get('s')).toMatchObject({ color: 'mustard' });
  });

  it('opens the record menu for restacking, duplicating and deleting', () => {
    const controller = controllerFor([node('a')]);
    render(<ContextPill controller={controller} onJumpToBook={vi.fn()} />);
    act(() => controller.selection.set(['a']));
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Bring to front',
      'Send to back',
      'Duplicate',
      'Delete',
    ]);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Duplicate' }));
    expect(controller.store.all()).toHaveLength(2);
    expect(screen.queryByRole('menu')).toBeNull();
  });
});

describe('RecordMenu', () => {
  it('offers Reset position only for generated records when the layout seam is provided', () => {
    const controller = controllerFor([node('g', { origin: 'generated', anchor })]);
    controller.selection.set(['g']);
    const onResetPosition = vi.fn();
    const onClose = vi.fn();
    render(
      <RecordMenu
        controller={controller}
        at={{ x: 10, y: 20 }}
        onClose={onClose}
        onJumpToBook={vi.fn()}
        onResetPosition={onResetPosition}
      />,
    );
    expect(screen.getByRole('menu').style.left).toBe('10px');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Reset position' }));
    expect(onResetPosition).toHaveBeenCalledWith('g');
    expect(onClose).toHaveBeenCalled();
    expect(screen.getByRole('menuitem', { name: 'Jump to book' })).toBeTruthy();
  });

  it('deletes the selection', () => {
    const controller = controllerFor([node('a')]);
    controller.selection.set(['a']);
    render(
      <RecordMenu
        controller={controller}
        at={{ x: 0, y: 0 }}
        onClose={vi.fn()}
        onJumpToBook={vi.fn()}
      />,
    );
    expect(screen.queryByRole('menuitem', { name: 'Reset position' })).toBeNull();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    expect(controller.store.get('a')!.deleted).toEqual({ by: 'user' });
  });
});

describe('RevealChip and LiveRegion', () => {
  it('shows reveal progress and the new count', () => {
    render(<RevealChip chapter={6} revealed={24} total={42} newCount={3} />);
    const chip = screen.getByTestId('mm-reveal-chip');
    expect(chip.textContent).toContain('Revealed to ch. 6');
    expect(chip.textContent).toContain('24 of 42');
    expect(chip.textContent).toContain('3 new');
    expect(screen.getByRole('progressbar', { name: 'Revealed nodes' }).getAttribute('value')).toBe(
      '24',
    );
  });

  it('omits the new count at zero and names an unchaptered reveal', () => {
    render(<RevealChip chapter={null} revealed={5} total={5} newCount={0} />);
    expect(screen.getByTestId('mm-reveal-chip').textContent).not.toContain('new');
    expect(screen.getByTestId('mm-reveal-chip').textContent).toContain('Revealed so far');
  });

  it('lifts above the bottom inset like the tool dock and zoom control', () => {
    render(<RevealChip chapter={6} revealed={24} total={42} newCount={3} bottomInset={20} />);
    expect(screen.getByTestId('mm-reveal-chip').style.bottom).toBe('calc(20px + 1rem)');
  });

  it('announces politely', () => {
    render(<LiveRegion message='Pen tool' />);
    const region = screen.getByRole('status');
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region.textContent).toBe('Pen tool');
  });
});
