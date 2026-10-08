import React from 'react';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { dispatch, openEntry } = vi.hoisted(() => ({ dispatch: vi.fn(), openEntry: vi.fn() }));

vi.mock('@/hooks/useTranslation', () => ({ useTranslation: () => (s: string) => s }));
vi.mock('@/utils/event', () => ({ eventDispatcher: { dispatch } }));
vi.mock('@/store/mindmapViewStore', () => ({
  useMindmapViewStore: { getState: () => ({ openEntry }) },
}));
vi.mock('@/components/ToolbarPopover', () => ({
  default: ({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) =>
    isOpen ? <div>{children}</div> : null,
}));

import SparkPopover from '@/app/reader/components/SparkPopover';

const renderPopover = (overrides: Partial<React.ComponentProps<typeof SparkPopover>> = {}) => {
  const props = {
    bookKey: 'book-1',
    isOpen: true,
    anchorEl: document.body,
    onClose: vi.fn(),
    onToggleTTS: vi.fn(),
    ...overrides,
  };
  render(<SparkPopover {...props} />);
  return props;
};

beforeEach(() => {
  dispatch.mockReset();
  openEntry.mockReset();
  openEntry.mockResolvedValue(undefined);
});

afterEach(cleanup);

describe('SparkPopover', () => {
  it('renders all six actions with their subtitles', () => {
    renderPopover();
    expect(screen.getByRole('button', { name: /Mindmap/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Mood & Modes/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Summarise/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /TTS/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Discuss/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Margins/ })).toBeTruthy();
    expect(screen.getByText('Organise thoughts')).toBeTruthy();
    expect(screen.getByText('Shape your reading experience')).toBeTruthy();
    expect(screen.getByText('Shorten your reading')).toBeTruthy();
    expect(screen.getByText('Read texts aloud')).toBeTruthy();
    expect(screen.getByText('Host-led podcast')).toBeTruthy();
    expect(screen.getByText('Readers, notes & finds')).toBeTruthy();
  });

  it('lays the actions out in a three column grid', () => {
    renderPopover();
    const grid = screen.getByRole('button', { name: /Mindmap/ }).parentElement as HTMLElement;
    expect(grid.className).toMatch(/\bgrid-cols-3\b/);
    expect(grid.querySelectorAll('button')).toHaveLength(6);
  });

  it('resolves the illustrations from the ai image directory', () => {
    renderPopover();
    const srcOf = (name: RegExp) =>
      screen.getByRole('button', { name }).querySelector('img')?.getAttribute('src');
    expect(
      screen
        .getByRole('button', { name: /Mindmap/ })
        .querySelector('[data-testid="spark-art-mindmap"]'),
    ).toBeTruthy();
    expect(srcOf(/Mood & Modes/)).toBe('/images/spark/mood-modes.svg');
    expect(srcOf(/Summarise/)).toBe('/images/spark/summarise.svg');
    expect(
      screen.getByRole('button', { name: /TTS/ }).querySelector('[data-testid="spark-art-tts"]'),
    ).toBeTruthy();
    expect(srcOf(/Discuss/)).toBe('/images/spark/discuss.svg');
    expect(srcOf(/Margins/)).toBe('/images/spark/margins.svg');
  });

  it('styles titles in the action tier and subtitles in the label tier', () => {
    renderPopover();
    expect(screen.getByText('Mindmap').className).toContain('popover-action-label');
    expect(screen.getByText('Organise thoughts').className).toContain('popover-label');
  });

  it('renders the host names on the discuss card in the serif title face', () => {
    renderPopover();
    const discuss = screen.getByRole('button', { name: /Discuss/ });
    expect(screen.getByText('with')).toBeTruthy();
    const hosts = screen.getByText('Tim & Fini');
    expect(discuss.contains(hosts)).toBe(true);
    expect(hosts.className).toContain('popover-title');
  });

  it('toggles TTS and closes from the TTS card', () => {
    const props = renderPopover();
    fireEvent.click(screen.getByRole('button', { name: /TTS/ }));
    expect(props.onToggleTTS).toHaveBeenCalledTimes(1);
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('shows a coming soon toast and closes for unreleased features', () => {
    for (const name of [/Mood & Modes/, /Summarise/, /Discuss/, /Margins/]) {
      dispatch.mockReset();
      const props = renderPopover();
      fireEvent.click(screen.getByRole('button', { name }));
      expect(dispatch).toHaveBeenCalledWith('toast', {
        type: 'info',
        message: 'Coming soon',
      });
      expect(props.onClose).toHaveBeenCalledTimes(1);
      expect(props.onToggleTTS).not.toHaveBeenCalled();
      cleanup();
    }
  });

  it('opens the mind map for the book and closes from the Mindmap card', async () => {
    const props = renderPopover();
    fireEvent.click(screen.getByRole('button', { name: /Mindmap/ }));
    expect(openEntry).toHaveBeenCalledWith('book-1');
    expect(props.onClose).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('shows an error toast when the mind map cannot open', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    openEntry.mockRejectedValue(new Error('disk'));
    renderPopover();
    fireEvent.click(screen.getByRole('button', { name: /Mindmap/ }));
    await waitFor(() =>
      expect(dispatch).toHaveBeenCalledWith('toast', {
        type: 'error',
        message: 'Could not open the mind map',
      }),
    );
    error.mockRestore();
  });
});
