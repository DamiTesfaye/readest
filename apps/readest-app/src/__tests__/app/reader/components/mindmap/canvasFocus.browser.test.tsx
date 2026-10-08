import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import MindmapCanvas from '@/app/reader/components/mindmap/MindmapCanvas';
import { createNodeRecord } from '@/services/mindmap/records/defaults';
import { createMapStore } from '@/services/mindmap/store/mapStore';
import { createCanvasController } from '@/services/mindmap/tools/controller';
import '@/styles/globals.css';
import { frames } from './cdpCanvas';

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (value: string, options?: Record<string, string | number>) =>
    value.replace(/{{(\w+)}}/g, (_, name: string) => String(options?.[name] ?? '')),
}));

const mount = () => {
  const controller = createCanvasController({
    store: createMapStore([
      createNodeRecord({ id: 'a', index: 'a1', x: 100, y: 100, label: 'Alpha' }),
      createNodeRecord({ id: 'b', index: 'a2', x: 400, y: 100, label: 'Beta' }),
    ]),
    camera: { x: 0, y: 0, z: 1 },
  });
  render(
    <div style={{ position: 'absolute', left: 0, top: 0, width: 1000, height: 700 }}>
      <button type='button'>Outside</button>
      <MindmapCanvas
        controller={controller}
        title='Focus map'
        mapStyle='sticker'
        mode='light'
        animate={false}
        wheelZooms={false}
        autoFocus
        reveal={null}
        announcement=''
        onJumpToBook={vi.fn()}
      />
    </div>,
  );
  return controller;
};

const openRecordMenu = (id: string) => {
  const record = screen.getByTestId(`mm-record-${id}`);
  const rect = record.getBoundingClientRect();
  act(() => {
    record.dispatchEvent(
      new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: rect.left + 20,
        clientY: rect.top + 20,
      }),
    );
  });
  return screen.getByTestId('mm-record-menu');
};

const focusedRecordId = () => document.activeElement?.getAttribute('data-record-id') ?? null;

beforeEach(async () => {
  await page.viewport(1280, 900);
  document.documentElement.setAttribute('data-theme', 'default-light');
});

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute('data-theme');
});

describe('canvas focus in real Chromium', () => {
  it('keeps focus in the map after Delete and undoes it with Ctrl+Z', async () => {
    const controller = mount();
    await userEvent.keyboard('{ArrowRight}');
    const id = focusedRecordId();
    expect(id).toBeTruthy();
    await userEvent.keyboard('{Delete}');
    await frames();
    expect(controller.store.get(id!)?.deleted).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByTestId('mindmap-canvas'));
    await userEvent.keyboard('{Control>}z{/Control}');
    await frames();
    expect(controller.store.get(id!)?.deleted ?? null).toBeNull();
    expect(document.activeElement).not.toBe(document.body);
  });

  it('draws a visible focus ring on a record reached with the arrow keys', async () => {
    mount();
    await userEvent.keyboard('{ArrowRight}');
    const record = document.activeElement as HTMLElement;
    expect(record.getAttribute('data-record-id')).toBeTruthy();
    expect(record.matches(':focus-visible')).toBe(true);
    expect(getComputedStyle(record).boxShadow).not.toBe('none');
  });

  it('keeps focus in the map when redo removes the focused record', async () => {
    const controller = mount();
    act(() => controller.selection.set(['a']));
    act(() => screen.getByTestId('mm-record-a').focus());
    await userEvent.keyboard('{Delete}');
    await userEvent.keyboard('{Control>}z{/Control}');
    await frames();
    expect(controller.store.get('a')?.deleted ?? null).toBeNull();
    act(() => screen.getByTestId('mm-record-a').focus());
    await userEvent.keyboard('{Control>}{Shift>}z{/Shift}{/Control}');
    await frames();
    expect(controller.store.get('a')?.deleted).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByTestId('mindmap-canvas'));
  });

  it('moves focus into the record menu and closes it on Escape before clearing the selection', async () => {
    const controller = mount();
    const menu = openRecordMenu('a');
    await frames();
    expect(menu.contains(document.activeElement)).toBe(true);
    expect(document.activeElement?.getAttribute('role')).toBe('menuitem');
    await userEvent.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(menu.querySelectorAll('[role="menuitem"]')[1]);
    await userEvent.keyboard('{Escape}');
    await frames();
    expect(screen.queryByTestId('mm-record-menu')).toBeNull();
    expect(controller.selection.get()).toEqual(['a']);
    expect(focusedRecordId()).toBe('a');
  });

  it('keeps focus in the map after Delete from the record menu', async () => {
    const controller = mount();
    openRecordMenu('a');
    await userEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    await frames();
    expect(controller.store.get('a')?.deleted).toBeTruthy();
    expect(screen.queryByTestId('mm-record-menu')).toBeNull();
    expect(document.activeElement).toBe(screen.getByTestId('mindmap-canvas'));
  });

  it('closes the record menu on an outside click without taking focus back', async () => {
    mount();
    openRecordMenu('a');
    await userEvent.click(screen.getByRole('button', { name: 'Outside' }));
    await frames();
    expect(screen.queryByTestId('mm-record-menu')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Outside' }));
  });

  it('returns focus to the pill button when its menu closes with Escape', async () => {
    const controller = mount();
    act(() => controller.selection.set(['b']));
    const more = screen.getByRole('button', { name: 'More actions' });
    await userEvent.click(more);
    await frames();
    expect(document.activeElement?.getAttribute('role')).toBe('menuitem');
    await userEvent.keyboard('{Escape}');
    await frames();
    expect(screen.queryByTestId('mm-record-menu')).toBeNull();
    expect(document.activeElement).toBe(more);
    expect(controller.selection.get()).toEqual(['b']);
  });
});
