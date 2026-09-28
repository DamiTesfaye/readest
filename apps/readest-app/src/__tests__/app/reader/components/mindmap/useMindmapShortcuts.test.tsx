import { act, cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createNodeRecord } from '@/services/mindmap/records/defaults';
import { renderInput } from './inputHarness';

const root = () => screen.getByTestId('root');

const key = (init: KeyboardEventInit, target: Element = root()) => {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
};

const node = (id: string, x: number) =>
  createNodeRecord({ id, index: `a${x}`, x, y: 0, label: id });

afterEach(cleanup);

describe('useMindmapShortcuts', () => {
  it('switches tools by letter and ignores modified keys and typing', () => {
    const { controller } = renderInput();
    key({ key: 'p' });
    expect(controller.tool.get()).toBe('pen');
    key({ key: 'S', shiftKey: true });
    expect(controller.tool.get()).toBe('section');
    for (const init of [
      { key: 'v', metaKey: true },
      { key: 'n', ctrlKey: true },
      { key: 'h', altKey: true },
    ]) {
      expect(key(init).defaultPrevented).toBe(false);
    }
    key({ key: 'n' }, screen.getByTestId('typing'));
    expect(controller.tool.get()).toBe('section');
    key({ key: 'Escape' });
    expect(controller.tool.get()).toBe('select');
  });

  it('undoes, redoes, zooms and fits with the platform modifier', () => {
    const { controller } = renderInput([node('a', 0)]);
    act(() => controller.selection.set(['a']));
    act(() => controller.nudge(1, 0));
    key({ key: 'z', metaKey: true });
    expect(controller.store.get('a')).toMatchObject({ x: 0 });
    key({ key: 'z', ctrlKey: true, shiftKey: true });
    expect(controller.store.get('a')).toMatchObject({ x: 16 });
    key({ key: '=', metaKey: true });
    expect(controller.camera.get().z).toBeCloseTo(1.2, 5);
    key({ key: '-', ctrlKey: true });
    expect(controller.camera.get().z).toBeCloseTo(1, 5);
    const fit = vi.spyOn(controller, 'fitView');
    key({ key: '0', metaKey: true });
    expect(fit).toHaveBeenCalledWith(false);
  });

  it('adds a child with Tab and selects the parent with Shift+Tab', () => {
    const { controller, focusRecord } = renderInput([node('a', 0)]);
    act(() => controller.selection.set(['a']));
    expect(key({ key: 'Tab' }).defaultPrevented).toBe(true);
    expect(controller.editing.get()).not.toBeNull();
    act(() => controller.editing.set(null));
    expect(key({ key: 'Tab', shiftKey: true }).defaultPrevented).toBe(true);
    expect(controller.selection.get()).toEqual(['a']);
    expect(focusRecord).toHaveBeenCalledWith('a');
  });

  it('leaves Tab alone when no node is selected so focus can leave the map', () => {
    renderInput([node('a', 0)]);
    expect(key({ key: 'Tab' }).defaultPrevented).toBe(false);
  });

  it('adds a sibling with Enter and edits with F2', () => {
    const { controller } = renderInput([node('a', 0)]);
    act(() => controller.selection.set(['a']));
    key({ key: 'Enter' });
    expect(controller.store.all().filter((r) => r.type === 'node')).toHaveLength(2);
    act(() => {
      controller.editing.set(null);
      controller.selection.set(['a']);
    });
    key({ key: 'F2' });
    expect(controller.editing.get()).toBe('a');
  });

  it('moves focus with arrows, nudges with Alt+arrow and deletes with Backspace', () => {
    const { controller, focusRecord } = renderInput([node('a', 0), node('b', 400)]);
    act(() => controller.selection.set(['a']));
    key({ key: 'ArrowRight' });
    expect(focusRecord).toHaveBeenCalledWith('b');
    key({ key: 'ArrowDown', altKey: true });
    expect(controller.store.get('b')).toMatchObject({ y: 16 });
    key({ key: 'Backspace' });
    expect(controller.store.get('b')!.deleted).toEqual({ by: 'user' });
  });

  it('holds the hand tool while Space is down and releases it on blur', () => {
    const { controller } = renderInput();
    const held = vi.spyOn(controller, 'setSpaceHeld');
    key({ key: ' ' });
    act(() => {
      root().dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true }));
    });
    key({ key: ' ' });
    act(() => {
      root().dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    });
    expect(held.mock.calls).toEqual([[true], [false], [true], [false]]);
  });
});
