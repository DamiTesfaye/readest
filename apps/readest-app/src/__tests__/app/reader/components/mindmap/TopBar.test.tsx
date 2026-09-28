import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TopBar, { NEW_MAP_OPTION, type TopBarProps } from '@/app/reader/components/mindmap/TopBar';
import type { MindmapIndexEntry } from '@/services/mindmap/persist/mindmapIndex';
import { DEFAULT_MAP_META } from '@/services/mindmap/schema/types';

const entry = (mapId: string, title: string): MindmapIndexEntry => ({
  mapId,
  title,
  style: 'sticker',
  source: 'blank',
  updatedAt: 0,
});

const renderBar = (props: Partial<TopBarProps> = {}) => {
  const handlers = {
    onBack: vi.fn(),
    onSwitchMap: vi.fn(),
    onNewMap: vi.fn(),
    onRename: vi.fn(),
    onStyle: vi.fn(),
    onToggleDock: vi.fn(),
    onToggleWheelZooms: vi.fn(),
    onDelete: vi.fn(),
  };
  render(
    <TopBar
      mapId='a'
      meta={{ ...DEFAULT_MAP_META, title: 'People', intent: 'story', spoiler: 'grow' }}
      maps={[entry('a', 'People'), entry('b', 'Places')]}
      plan='free'
      bookTitle='Emma'
      page={12}
      eink={false}
      readOnly={false}
      docked={false}
      canDock
      wheelZooms={false}
      {...handlers}
      {...props}
    />,
  );
  return handlers;
};

afterEach(cleanup);

describe('TopBar', () => {
  it('goes back to the page and shows the book, intent and spoiler scope', () => {
    const { onBack } = renderBar();
    fireEvent.click(screen.getByRole('button', { name: /Back to page 12/ }));
    expect(onBack).toHaveBeenCalled();
    expect(screen.getByTestId('mm-top-bar').textContent).toContain('Emma');
    expect(screen.getByTestId('mm-top-bar').textContent).toContain('Story · Grow with reading');
  });

  it('switches maps, starts a new one and shows the free count', () => {
    const { onSwitchMap, onNewMap } = renderBar();
    const switcher = screen.getByRole('combobox', { name: 'Mind map' });
    expect(screen.getByTestId('mm-map-count').textContent).toBe('2/3');
    fireEvent.change(switcher, { target: { value: 'b' } });
    expect(onSwitchMap).toHaveBeenCalledWith('b');
    fireEvent.change(switcher, { target: { value: NEW_MAP_OPTION } });
    expect(onNewMap).toHaveBeenCalled();
    cleanup();
    renderBar({ plan: 'pro' });
    expect(screen.queryByTestId('mm-map-count')).toBeNull();
  });

  it('renames from the options menu', () => {
    const { onRename } = renderBar();
    fireEvent.click(screen.getByRole('button', { name: 'Map options' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }));
    const input = screen.getByRole('textbox', { name: 'Map title' });
    fireEvent.change(input, { target: { value: 'Everyone' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onRename).toHaveBeenCalledWith('Everyone');
  });

  it('changes the style, locked to Ink & margin on e-ink', () => {
    const { onStyle } = renderBar();
    fireEvent.change(screen.getByRole('combobox', { name: 'Map style' }), {
      target: { value: 'ink' },
    });
    expect(onStyle).toHaveBeenCalledWith('ink');
    cleanup();
    renderBar({ eink: true });
    const locked = screen.getByRole('combobox', { name: 'Map style' }) as HTMLSelectElement;
    expect(locked.disabled).toBe(true);
    expect(locked.value).toBe('ink');
  });

  it('offers docking only on wide screens', () => {
    const { onToggleDock } = renderBar();
    fireEvent.click(screen.getByRole('button', { name: 'Dock beside book' }));
    expect(onToggleDock).toHaveBeenCalled();
    cleanup();
    renderBar({ docked: true });
    expect(screen.getByRole('button', { name: 'Full screen' })).toBeTruthy();
    cleanup();
    renderBar({ canDock: false });
    expect(screen.queryByRole('button', { name: 'Dock beside book' })).toBeNull();
  });

  it('asks twice before deleting and toggles wheel zoom', () => {
    const { onDelete, onToggleWheelZooms } = renderBar();
    fireEvent.click(screen.getByRole('button', { name: 'Map options' }));
    expect(
      screen
        .getByRole('menuitemcheckbox', { name: 'Scroll wheel zooms' })
        .getAttribute('aria-checked'),
    ).toBe('false');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete map' }));
    expect(onDelete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Tap again to delete this map' }));
    expect(onDelete).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Map options' }));
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Scroll wheel zooms' }));
    expect(onToggleWheelZooms).toHaveBeenCalled();
  });

  it('shows Export JSON Canvas only when an exporter is provided', () => {
    renderBar();
    fireEvent.click(screen.getByRole('button', { name: 'Map options' }));
    expect(screen.queryByRole('menuitem', { name: 'Export JSON Canvas' })).toBeNull();
    cleanup();
    const onExport = vi.fn();
    renderBar({ onExport });
    fireEvent.click(screen.getByRole('button', { name: 'Map options' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Export JSON Canvas' }));
    expect(onExport).toHaveBeenCalled();
  });
});
