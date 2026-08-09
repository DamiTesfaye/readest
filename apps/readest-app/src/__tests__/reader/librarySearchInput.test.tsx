import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import LibrarySearchInput from '@/app/reader/components/library/LibrarySearchInput';

vi.mock('@/hooks/useTranslation', () => ({ useTranslation: () => (s: string) => s }));

afterEach(cleanup);

describe('LibrarySearchInput', () => {
  it('reports typed text', () => {
    const onChange = vi.fn();
    render(<LibrarySearchInput value='' onChange={onChange} onEscape={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText('Search'), { target: { value: 'moby' } });
    expect(onChange).toHaveBeenCalledWith('moby');
  });

  it('clears a non-empty query on Escape instead of escalating', () => {
    const onChange = vi.fn();
    const onEscape = vi.fn();
    render(<LibrarySearchInput value='moby' onChange={onChange} onEscape={onEscape} />);

    fireEvent.keyDown(screen.getByPlaceholderText('Search'), { key: 'Escape' });
    expect(onChange).toHaveBeenCalledWith('');
    expect(onEscape).not.toHaveBeenCalled();
  });

  it('escalates Escape when the query is already empty', () => {
    const onChange = vi.fn();
    const onEscape = vi.fn();
    render(<LibrarySearchInput value='' onChange={onChange} onEscape={onEscape} />);

    fireEvent.keyDown(screen.getByPlaceholderText('Search'), { key: 'Escape' });
    expect(onEscape).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('stops pointer events from reaching the popover dismiss overlay', () => {
    const onOuterMouseDown = vi.fn();
    render(
      <div onMouseDown={onOuterMouseDown}>
        <LibrarySearchInput value='' onChange={vi.fn()} onEscape={vi.fn()} />
      </div>,
    );

    fireEvent.mouseDown(screen.getByPlaceholderText('Search'));
    expect(onOuterMouseDown).not.toHaveBeenCalled();
  });
});
