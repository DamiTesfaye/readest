import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import useShortcuts from '@/hooks/useShortcuts';

const keyboardEventFor = (target: HTMLElement, init: KeyboardEventInit) => {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
};

describe('useShortcuts and the mindmap', () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('ignores keys aimed at the docked mindmap and still handles them elsewhere', () => {
    const onToggleNotebook = vi.fn();
    const Harness = () => {
      useShortcuts({ onToggleNotebook }, []);
      return (
        <>
          <div data-mindmap-root tabIndex={0} data-testid='map'>
            <span data-testid='record' tabIndex={-1} />
          </div>
          <div data-testid='book' tabIndex={0} />
        </>
      );
    };
    render(<Harness />);
    const record = screen.getByTestId('record');
    record.focus();
    const insideMap = keyboardEventFor(record, { key: 'n' });
    const backspace = keyboardEventFor(record, { key: 'Backspace' });
    expect(onToggleNotebook).not.toHaveBeenCalled();
    expect(insideMap.defaultPrevented).toBe(false);
    expect(backspace.defaultPrevented).toBe(false);
    const book = screen.getByTestId('book');
    book.focus();
    keyboardEventFor(book, { key: 'n' });
    expect(onToggleNotebook).toHaveBeenCalledOnce();
  });
});
