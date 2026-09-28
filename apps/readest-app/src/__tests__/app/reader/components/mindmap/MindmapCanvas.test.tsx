import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createNodeRecord } from '@/services/mindmap/records/defaults';
import { PRESET_TOKENS } from '@/services/mindmap/theme/presets';
import { renderCanvas } from './canvasFixture';

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

const canvas = () => screen.getByTestId('mindmap-canvas');

const key = (init: KeyboardEventInit, target: Element = canvas()) => {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('MindmapCanvas', () => {
  it('is a labelled, focusable application root marked for the reader shortcut guard', () => {
    renderCanvas([]);
    const root = screen.getByRole('application', { name: 'Mind map: Pride and Prejudice' });
    expect(root.hasAttribute('data-mindmap-root')).toBe(true);
    expect(root.getAttribute('tabindex')).toBe('0');
    expect(root.className).toContain('touch-none');
  });

  it('focuses itself on open when asked', () => {
    renderCanvas([], { autoFocus: true });
    expect(document.activeElement).toBe(canvas());
  });

  it('writes every theme token for the mode on the root and switches mode without filters', () => {
    const { rerender } = renderCanvas([elizabeth]);
    expect(canvas().style.getPropertyValue('--mm-terracotta-fill')).toBe(
      PRESET_TOKENS.light.terracotta.fill,
    );
    expect(canvas().style.getPropertyValue('--mm-select')).not.toBe('');
    rerender({ mode: 'dark' });
    expect(canvas().dataset['mmMode']).toBe('dark');
    expect(canvas().style.getPropertyValue('--mm-terracotta-fill')).toBe(
      PRESET_TOKENS.dark.terracotta.fill,
    );
    expect(canvas().style.filter).toBe('');
    const record = screen.getByTestId('mm-record-e');
    expect(record.innerHTML).toContain('var(--mm-terracotta-fill)');
    expect(record.innerHTML).not.toContain(PRESET_TOKENS.dark.terracotta.fill);
  });

  it('forces Ink & margin and renders no animation on e-ink', () => {
    const { controller } = renderCanvas([elizabeth], { mode: 'eink', animate: false });
    expect(canvas().dataset['mmStyle']).toBe('ink');
    act(() => {
      controller.store.put([createNodeRecord({ id: 'n', index: 'a5', label: 'New' })]);
    });
    expect(screen.getByTestId('mm-world').innerHTML).not.toContain('animate-');
  });

  it('fits the records when the map opens with the default camera', () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1000);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(700);
    const { controller } = renderCanvas([elizabeth, darcy]);
    expect(controller.viewport.get()).toEqual({ width: 1000, height: 700 });
    expect(controller.camera.screenToPage({ x: 500, y: 350 })).toEqual({ x: 280, y: 32 });
  });

  it('keeps a stored camera instead of fitting', () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1000);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(700);
    const { controller } = renderCanvas([elizabeth], {}, { x: 5, y: 6, z: 2 });
    expect(controller.camera.get()).toEqual({ x: 5, y: 6, z: 2 });
  });

  it('announces tool changes and outside announcements politely', () => {
    const { controller, rerender } = renderCanvas([]);
    const region = screen.getByTestId('mm-live-region');
    act(() => controller.setTool('pen'));
    expect(region.textContent).toBe('Pen tool');
    rerender({ announcement: '3 new nodes revealed' });
    expect(region.textContent).toBe('3 new nodes revealed');
  });

  it('shows the reveal chip only when reveal data is provided', () => {
    const { rerender } = renderCanvas([]);
    expect(screen.queryByTestId('mm-reveal-chip')).toBeNull();
    rerender({ reveal: { chapter: 6, revealed: 24, total: 42, newCount: 3 } });
    expect(screen.getByTestId('mm-reveal-chip').textContent).toContain('3 new');
  });

  it('adds a child with Tab, commits its label with Enter and returns focus to the map', () => {
    const { controller } = renderCanvas([elizabeth]);
    act(() => controller.selection.set(['e']));
    key({ key: 'Tab' });
    const editor = screen.getByTestId('mm-label-editor') as HTMLTextAreaElement;
    expect(document.activeElement).toBe(editor);
    fireEvent.change(editor, { target: { value: 'Jane' } });
    fireEvent.keyDown(editor, { key: 'Enter' });
    const child = controller.selection.get()[0]!;
    expect(controller.store.get(child)).toMatchObject({ label: 'Jane' });
    expect(screen.queryByTestId('mm-label-editor')).toBeNull();
    expect(document.activeElement).toBe(canvas());
    expect(
      screen.getByRole('button', { name: 'Elizabeth, Character, linked to Jane' }),
    ).toBeTruthy();
  });

  it('moves DOM focus to the record the arrow keys land on', () => {
    const { controller } = renderCanvas([elizabeth, darcy]);
    act(() => controller.selection.set(['e']));
    key({ key: 'ArrowRight' });
    expect(document.activeElement).toBe(screen.getByTestId('mm-record-d'));
  });

  it('opens the record menu on right click and closes it on the next press elsewhere', () => {
    const { controller } = renderCanvas([elizabeth]);
    fireEvent.contextMenu(canvas(), { clientX: 10, clientY: 10 });
    expect(controller.selection.get()).toEqual(['e']);
    expect(screen.getByRole('menu', { name: 'Record actions' })).toBeTruthy();
    fireEvent.pointerDown(canvas(), {
      clientX: 700,
      clientY: 500,
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
    });
    expect(screen.queryByRole('menu', { name: 'Record actions' })).toBeNull();
    fireEvent.contextMenu(canvas(), { clientX: 10, clientY: 10 });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    expect(controller.store.get('e')!.deleted).toEqual({ by: 'user' });
  });

  it('ignores a right click on empty canvas', () => {
    renderCanvas([elizabeth]);
    fireEvent.contextMenu(canvas(), { clientX: 900, clientY: 600 });
    expect(screen.queryByRole('menu', { name: 'Record actions' })).toBeNull();
  });

  it('ignores a right click on empty canvas even with a record already selected', () => {
    const { controller } = renderCanvas([elizabeth]);
    act(() => controller.selection.set(['e']));
    fireEvent.contextMenu(canvas(), { clientX: 900, clientY: 600 });
    expect(screen.queryByRole('menu', { name: 'Record actions' })).toBeNull();
  });

  it('leaves the browser menu alone for a right click while editing a label', () => {
    const { controller } = renderCanvas([elizabeth]);
    act(() => controller.selection.set(['e']));
    key({ key: 'Tab' });
    const editor = screen.getByTestId('mm-label-editor');
    const event = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: 10,
      clientY: 10,
    });
    act(() => {
      editor.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(false);
    expect(screen.queryByRole('menu', { name: 'Record actions' })).toBeNull();
  });
});
