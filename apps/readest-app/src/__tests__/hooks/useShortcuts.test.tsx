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

  it('ignores keys aimed at the full-screen mindmap chrome outside the canvas root', () => {
    const onToggleNotebook = vi.fn();
    const Harness = () => {
      useShortcuts({ onToggleNotebook }, []);
      return (
        <section data-mindmap-view data-layout='fullscreen' data-testid='view'>
          <button type='button' data-testid='top-bar-button' />
        </section>
      );
    };
    render(<Harness />);
    const button = screen.getByTestId('top-bar-button');
    button.focus();
    const event = keyboardEventFor(button, { key: 'n' });
    expect(onToggleNotebook).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('ignores reader shortcuts on document.body while the full-screen map is open', () => {
    const onToggleNotebook = vi.fn();
    const Harness = () => {
      useShortcuts({ onToggleNotebook }, []);
      return <section data-mindmap-view data-layout='fullscreen' data-testid='view' />;
    };
    render(<Harness />);
    keyboardEventFor(document.body, { key: 'n' });
    expect(onToggleNotebook).not.toHaveBeenCalled();
  });
});
