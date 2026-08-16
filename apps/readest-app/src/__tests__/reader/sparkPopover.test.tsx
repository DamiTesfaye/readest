import React from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { dispatch } = vi.hoisted(() => ({ dispatch: vi.fn() }));

vi.mock('@/hooks/useTranslation', () => ({ useTranslation: () => (s: string) => s }));
vi.mock('@/utils/event', () => ({ eventDispatcher: { dispatch } }));
vi.mock('@/components/ToolbarPopover', () => ({
  default: ({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) =>
    isOpen ? <div>{children}</div> : null,
}));

import SparkPopover from '@/app/reader/components/SparkPopover';

const renderPopover = (overrides: Partial<React.ComponentProps<typeof SparkPopover>> = {}) => {
  const props = {
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
    expect(screen.getByRole('button', { name: /Gallery/ })).toBeTruthy();
    expect(screen.getByText('Organise thoughts')).toBeTruthy();
    expect(screen.getByText('Shape your reading experience')).toBeTruthy();
    expect(screen.getByText('Shorten your reading')).toBeTruthy();
    expect(screen.getByText('Read texts aloud')).toBeTruthy();
    expect(screen.getByText('Host-led podcast')).toBeTruthy();
    expect(screen.getByText('Create & browse media')).toBeTruthy();
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
    expect(srcOf(/Mindmap/)).toBe('/images/spark/mindmap.svg');
    expect(srcOf(/Mood & Modes/)).toBe('/images/spark/mood-modes.svg');
    expect(srcOf(/Summarise/)).toBe('/images/spark/summarise.svg');
    expect(srcOf(/TTS/)).toBe('/images/spark/tts.svg');
    expect(srcOf(/Discuss/)).toBe('/images/spark/discuss.svg');
    expect(srcOf(/Gallery/)).toBe('/images/spark/gallery.svg');
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
    const hosts = screen.getByText('Tim & Alice');
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
    for (const name of [/Mindmap/, /Mood & Modes/, /Summarise/, /Discuss/, /Gallery/]) {
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
});
