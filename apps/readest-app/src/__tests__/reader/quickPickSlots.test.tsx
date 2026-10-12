import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation:
    () =>
    (s: string, options: Record<string, string> = {}) =>
      s.replace(/{{(\w+)}}/g, (_match, key: string) => options[key] ?? ''),
}));
vi.mock('@/components/ToolbarPopover', () => ({
  default: ({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) =>
    isOpen ? <div data-testid='quick-pick-picker'>{children}</div> : null,
}));

import QuickPickSlots from '@/app/reader/components/QuickPickSlots';
import type { MoreAction } from '@/app/reader/hooks/useMoreActions';
import {
  QUICK_PICK_DRAG_TYPE,
  QUICK_PICK_IDS,
  type QuickPickId,
  type QuickPickSlots as Slots,
} from '@/utils/quickPicks';

const makeActions = () =>
  Object.fromEntries(
    QUICK_PICK_IDS.map((id) => [
      id,
      {
        title: id === 'library' ? 'Library' : id === 'margins' ? 'Margins' : `Title ${id}`,
        subtitle: '',
        toggled: id === 'ruler' ? true : undefined,
        run: vi.fn(),
      } satisfies MoreAction,
    ]),
  ) as Record<QuickPickId, MoreAction & { run: ReturnType<typeof vi.fn> }>;

const renderSlots = (
  slots: Slots = ['library', 'margins', null],
  isArranging = false,
  indices?: number[],
) => {
  const actions = makeActions();
  const onPlace = vi.fn();
  const onArrangeChange = vi.fn();
  const onRemove = vi.fn();
  render(
    <QuickPickSlots
      slots={slots}
      actions={actions}
      colored
      isArranging={isArranging}
      onPlace={onPlace}
      onArrangeChange={onArrangeChange}
      onRemove={onRemove}
      indices={indices}
    />,
  );
  return { actions, onPlace, onArrangeChange, onRemove };
};

const dataTransfer = (id?: string) => {
  const store = new Map<string, string>(id ? [[QUICK_PICK_DRAG_TYPE, id]] : []);
  return {
    types: Array.from(store.keys()),
    getData: (type: string) => store.get(type) ?? '',
    setData: (type: string, value: string) => store.set(type, value),
    effectAllowed: 'all',
    dropEffect: 'none',
  };
};

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('QuickPickSlots', () => {
  it('shows Library and Margins with their icons and one open slot by default', () => {
    renderSlots();
    const library = screen.getByRole('button', { name: 'Library' });
    expect(library.querySelector('img')?.getAttribute('src')).toBe('/images/toolbar/library.svg');
    const margins = screen.getByRole('button', { name: 'Margins' });
    expect(margins.querySelector('img')?.getAttribute('src')).toBe('/images/spark/margins.svg');
    expect(screen.getAllByRole('button', { name: 'Add a quick pick' })).toHaveLength(1);
  });

  it('renders only the requested slots and places into their own index', () => {
    const { onPlace } = renderSlots(['library', 'margins', null, 'contents'], false, [3]);
    expect(screen.queryByRole('button', { name: 'Library' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add a quick pick' })).toBeNull();
    const contents = screen.getByRole('button', { name: 'Title contents' });
    fireEvent.drop(contents, { dataTransfer: dataTransfer('tts') });
    expect(onPlace).toHaveBeenCalledWith('tts', 3);
  });

  it('runs the pinned action with its slot as the anchor', () => {
    const { actions } = renderSlots();
    const library = screen.getByRole('button', { name: 'Library' });
    fireEvent.click(library);
    expect(actions.library.run).toHaveBeenCalledWith(library);
  });

  it('marks a pinned toggle as pressed while it is on', () => {
    renderSlots(['ruler', null, null]);
    expect(screen.getByRole('button', { name: 'Title ruler' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
  });

  it('opens a picker of unpinned rows from an empty slot and fills the slot', () => {
    const { onPlace } = renderSlots();
    expect(screen.queryByTestId('quick-pick-picker')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Add a quick pick' }));
    const picker = screen.getByTestId('quick-pick-picker');
    const rows = Array.from(picker.querySelectorAll('button'));
    expect(rows.map((row) => row.textContent)).not.toContain('Library');
    expect(rows.map((row) => row.textContent)).not.toContain('Margins');
    expect(rows).toHaveLength(QUICK_PICK_IDS.length - 2);
    const tts = rows.find((row) => row.textContent === 'Title tts')!;
    expect(tts.querySelector('img')?.getAttribute('src')).toBe('/images/spark/tts.svg');
    fireEvent.click(tts);
    expect(onPlace).toHaveBeenCalledWith('tts', 2);
    expect(screen.queryByTestId('quick-pick-picker')).toBeNull();
  });

  it('fills an empty slot or replaces an occupied one on drop', () => {
    const { onPlace } = renderSlots();
    const empty = screen.getByRole('button', { name: 'Add a quick pick' });
    fireEvent.drop(empty, { dataTransfer: dataTransfer('mindmap') });
    expect(onPlace).toHaveBeenLastCalledWith('mindmap', 2);
    fireEvent.drop(screen.getByRole('button', { name: 'Library' }), {
      dataTransfer: dataTransfer('tts'),
    });
    expect(onPlace).toHaveBeenLastCalledWith('tts', 0);
  });

  it('accepts a quick pick drag over a slot and ignores foreign drops', () => {
    const { onPlace } = renderSlots();
    const slot = screen.getByRole('button', { name: 'Margins' });
    const over = fireEvent.dragOver(slot, { dataTransfer: dataTransfer('tts') });
    expect(over).toBe(false);
    const foreign = fireEvent.dragOver(slot, { dataTransfer: dataTransfer() });
    expect(foreign).toBe(true);
    fireEvent.drop(slot, { dataTransfer: dataTransfer() });
    expect(onPlace).not.toHaveBeenCalled();
  });

  it('lets a pinned slot be dragged onto another slot', () => {
    renderSlots();
    const library = screen.getByRole('button', { name: 'Library' });
    expect(library.getAttribute('draggable')).toBe('true');
    const transfer = dataTransfer();
    fireEvent.dragStart(library, { dataTransfer: transfer });
    expect(transfer.getData(QUICK_PICK_DRAG_TYPE)).toBe('library');
  });

  it('opens the picker without a title', () => {
    renderSlots();
    fireEvent.click(screen.getByRole('button', { name: 'Add a quick pick' }));
    const picker = screen.getByTestId('quick-pick-picker');
    expect(picker.querySelector('h1, h2, h3, [role="heading"]')).toBeNull();
  });

  it('long pressing a filled slot opens the picker to replace it', () => {
    vi.useFakeTimers();
    const { actions, onPlace } = renderSlots();
    const library = screen.getByRole('button', { name: 'Library' });
    fireEvent.pointerDown(library, { pointerType: 'touch' });
    act(() => {
      vi.advanceTimersByTime(600);
    });
    fireEvent.pointerUp(library, { pointerType: 'touch' });
    fireEvent.click(library);
    expect(actions.library.run).not.toHaveBeenCalled();
    const picker = screen.getByTestId('quick-pick-picker');
    const mindmap = Array.from(picker.querySelectorAll('button')).find(
      (row) => row.textContent === 'Title mindmap',
    )!;
    fireEvent.click(mindmap);
    expect(onPlace).toHaveBeenCalledWith('mindmap', 0);
  });

  it('a short press still runs the action', () => {
    vi.useFakeTimers();
    const { actions } = renderSlots();
    const library = screen.getByRole('button', { name: 'Library' });
    fireEvent.pointerDown(library, { pointerType: 'mouse' });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    fireEvent.pointerUp(library, { pointerType: 'mouse' });
    fireEvent.click(library);
    expect(actions.library.run).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('quick-pick-picker')).toBeNull();
  });

  it('enters arranging while the picker is open or a slot is dragged', () => {
    const { onArrangeChange } = renderSlots();
    fireEvent.click(screen.getByRole('button', { name: 'Add a quick pick' }));
    expect(onArrangeChange).toHaveBeenLastCalledWith(true);
    const library = screen.getByRole('button', { name: 'Library' });
    fireEvent.dragStart(library, { dataTransfer: dataTransfer() });
    expect(onArrangeChange).toHaveBeenLastCalledWith(true);
    fireEvent.dragEnd(library, { dataTransfer: dataTransfer() });
    expect(onArrangeChange).toHaveBeenLastCalledWith(false);
  });

  it('wobbles the pinned icons only while arranging', () => {
    renderSlots(['library', 'margins', null], true);
    for (const name of ['Library', 'Margins']) {
      expect(screen.getByRole('button', { name }).querySelector('img')?.className).toContain(
        'quick-pick-wobble',
      );
    }
    cleanup();
    renderSlots(['library', 'margins', null], false);
    expect(
      screen.getByRole('button', { name: 'Library' }).querySelector('img')?.className,
    ).not.toContain('quick-pick-wobble');
  });

  it('shows a remove badge on each filled slot while arranging', () => {
    const { onRemove, actions } = renderSlots(['library', 'margins', null], true);
    const remove = screen.getByRole('button', { name: 'Remove Margins' });
    expect(remove.querySelector('img')?.getAttribute('src')).toBe(
      '/images/toolbar/close-circle.svg',
    );
    expect(screen.getAllByRole('button', { name: /^Remove / })).toHaveLength(2);
    fireEvent.click(remove);
    expect(onRemove).toHaveBeenCalledWith(1);
    expect(actions.margins.run).not.toHaveBeenCalled();
  });

  it('hides the remove badges when not arranging', () => {
    renderSlots(['library', 'margins', null], false);
    expect(screen.queryByRole('button', { name: /^Remove / })).toBeNull();
  });

  it('keeps arranging after a pick until a press lands outside the slots', () => {
    const { onArrangeChange } = renderSlots(['library', 'margins', null], true);
    fireEvent.click(screen.getByRole('button', { name: 'Add a quick pick' }));
    const picker = screen.getByTestId('quick-pick-picker');
    fireEvent.click(picker.querySelector('button')!);
    expect(onArrangeChange).not.toHaveBeenCalledWith(false);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Library' }));
    expect(onArrangeChange).not.toHaveBeenCalledWith(false);
    fireEvent.pointerDown(document.body);
    expect(onArrangeChange).toHaveBeenLastCalledWith(false);
  });

  it('stops arranging on Escape', () => {
    const { onArrangeChange } = renderSlots(['library', 'margins', null], true);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onArrangeChange).toHaveBeenLastCalledWith(false);
  });
});
