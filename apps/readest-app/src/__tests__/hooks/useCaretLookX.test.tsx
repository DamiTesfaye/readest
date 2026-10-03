import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';

import { useCaretLookX } from '@/hooks/useCaretLookX';

const CHAR_WIDTH = 10;
const FIELD_WIDTH = 200;

let input: HTMLInputElement;

const setCaret = (value: string, caretIndex: number) => {
  input.value = value;
  input.setSelectionRange(caretIndex, caretIndex);
};

const renderCaretHook = () => {
  const ref = { current: input };
  return renderHook(() => useCaretLookX(ref));
};

const mirrors = () => document.querySelectorAll('span[aria-hidden="true"]');

beforeEach(() => {
  input = document.createElement('input');
  input.type = 'text';
  input.style.paddingLeft = '10px';
  input.style.paddingRight = '10px';
  document.body.appendChild(input);
  Object.defineProperty(input, 'clientWidth', {
    value: FIELD_WIDTH + 20,
    configurable: true,
  });

  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    return { width: (this.textContent?.length ?? 0) * CHAR_WIDTH } as DOMRect;
  });
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    callback(0);
    return 1;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  input.remove();
  vi.restoreAllMocks();
});

describe('useCaretLookX', () => {
  it('rests at centre with the eyes idle before anything is typed', () => {
    const { result } = renderCaretHook();
    expect(result.current).toEqual({ lookX: 0, isTyping: false });
  });

  it('tracks the caret across the field as text is typed', () => {
    const { result } = renderCaretHook();

    act(() => {
      input.focus();
      setCaret('abcdefghij', 10);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect(result.current.isTyping).toBe(true);
    expect(result.current.lookX).toBeCloseTo(0);

    act(() => {
      setCaret('abcdefghijklmnopqrst', 20);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect(result.current.lookX).toBeCloseTo(1);
  });

  it('follows caret moves that leave the value untouched', () => {
    const { result } = renderCaretHook();

    act(() => {
      input.focus();
      setCaret('abcdefghij', 10);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(result.current.lookX).toBeCloseTo(0);

    act(() => {
      input.setSelectionRange(0, 0);
      document.dispatchEvent(new Event('selectionchange'));
    });

    expect(result.current.lookX).toBeCloseTo(-1);
  });

  it('stops reporting typing and returns to centre on blur', () => {
    const { result } = renderCaretHook();

    act(() => {
      input.focus();
      setCaret('abcdefghijklmnopqrst', 20);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(result.current.isTyping).toBe(true);

    act(() => {
      input.blur();
    });

    expect(result.current).toEqual({ lookX: 0, isTyping: false });
  });

  it('reports an empty focused field as not typing', () => {
    const { result } = renderCaretHook();

    act(() => {
      input.focus();
      setCaret('', 0);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect(result.current.isTyping).toBe(false);
  });

  it('re-reads the field text styles, so a runtime font change is not measured stale', () => {
    renderCaretHook();
    const mirror = mirrors()[0] as HTMLElement;
    expect(mirror.style.letterSpacing).not.toBe('3px');

    act(() => {
      input.style.letterSpacing = '3px';
      input.style.fontFamily = 'Georgia';
      input.focus();
      setCaret('abcdefghij', 10);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect(mirror.style.letterSpacing).toBe('3px');
    expect(mirror.style.fontFamily).toBe('Georgia');
  });

  it('removes its measuring element on unmount', () => {
    expect(mirrors()).toHaveLength(0);
    const { unmount } = renderCaretHook();
    expect(mirrors()).toHaveLength(1);

    unmount();

    expect(mirrors()).toHaveLength(0);
  });
});
