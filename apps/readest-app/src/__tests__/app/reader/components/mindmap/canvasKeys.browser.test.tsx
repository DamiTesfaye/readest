import { act, cleanup, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { createNodeRecord } from '@/services/mindmap/records/defaults';
import type { CanvasController } from '@/services/mindmap/tools/controller';
import '@/styles/globals.css';
import { type CdpInput, clientAt, createCdpInput, frames, mountCanvas } from './cdpCanvas';

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (value: string, options?: Record<string, string | number>) =>
    value.replace(/{{(\w+)}}/g, (_, name: string) => String(options?.[name] ?? '')),
}));

const nodeA = () =>
  createNodeRecord({ id: 'a', index: 'a1', x: 100, y: 100, w: 160, h: 64, label: 'Alpha' });
const nodeB = () =>
  createNodeRecord({ id: 'b', index: 'a2', x: 500, y: 100, w: 160, h: 64, label: 'Beta' });

let input: CdpInput;

beforeEach(async () => {
  await page.viewport(1280, 900);
  input = await createCdpInput();
});

afterEach(async () => {
  await input.session.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: 0,
    y: 0,
    button: 'left',
  });
  cleanup();
});

const space = async (type: 'keyDown' | 'keyUp') => {
  await input.session.send('Input.dispatchKeyEvent', {
    type,
    key: ' ',
    code: 'Space',
    windowsVirtualKeyCode: 32,
    ...(type === 'keyDown' ? { text: ' ' } : {}),
  });
};

const startEditing = async (controller: CanvasController) => {
  act(() => {
    controller.selection.set(['a']);
    controller.editing.set('a');
  });
  await frames();
  const editor = screen.getByTestId('mm-label-editor') as HTMLTextAreaElement;
  expect(document.activeElement).toBe(editor);
  return editor;
};

const labelOf = (controller: CanvasController) =>
  (controller.store.get('a') as { label: string }).label;

describe('canvas keys in real Chromium', () => {
  it('keeps the label editor open when Enter confirms an IME candidate', async () => {
    const controller = mountCanvas([nodeA()]);
    await frames();
    await startEditing(controller);
    await input.session.send('Input.imeSetComposition', {
      text: 'にほん',
      selectionStart: 3,
      selectionEnd: 3,
    });
    await input.session.send('Input.dispatchKeyEvent', {
      type: 'rawKeyDown',
      key: 'Enter',
      code: 'Enter',
      windowsVirtualKeyCode: 13,
    });
    await frames();
    expect(controller.editing.get()).toBe('a');
    expect(labelOf(controller)).toBe('Alpha');
  });

  it('selects the existing label when editing starts so typing replaces it', async () => {
    const controller = mountCanvas([nodeA()]);
    await frames();
    const editor = await startEditing(controller);
    expect([editor.selectionStart, editor.selectionEnd]).toEqual([0, 'Alpha'.length]);
    await input.session.send('Input.insertText', { text: 'Omega' });
    await input.key('Enter', 'Enter', 13, '\r');
    expect(labelOf(controller)).toBe('Omega');
  });

  it('pans with Space and drag after arrow keys moved focus onto a record', async () => {
    const controller = mountCanvas([nodeA(), nodeB()]);
    await frames();
    const onA = clientAt(controller, 180, 132);
    await input.drag(onA, onA, 1);
    expect(controller.selection.get()).toEqual(['a']);
    await input.key('ArrowRight', 'ArrowRight', 39);
    expect((document.activeElement as HTMLElement).dataset['recordId']).toBe('b');
    await space('keyDown');
    const before = controller.camera.get();
    await input.drag(clientAt(controller, 400, 400), clientAt(controller, 500, 450));
    await space('keyUp');
    expect(controller.camera.get().x - before.x).toBeCloseTo(100, 0);
    expect(controller.selection.get()).toEqual(['b']);
  });

  it('drops a held Space once focus leaves the map', async () => {
    const controller = mountCanvas([nodeA()]);
    await frames();
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    await space('keyDown');
    outside.focus();
    screen.getByTestId('mindmap-canvas').focus();
    const before = controller.camera.get();
    await input.drag(clientAt(controller, 400, 400), clientAt(controller, 500, 450));
    outside.remove();
    expect(controller.camera.get()).toEqual(before);
  });
});
