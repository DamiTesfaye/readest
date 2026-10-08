import { RefObject, useEffect, useState } from 'react';

import { computeLookX } from '@/utils/caretLook';

const MIRROR_STYLE_PROPS = [
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'letterSpacing',
  'textTransform',
  'fontVariant',
  'fontFeatureSettings',
] as const;

export interface CaretLook {
  lookX: number;
  isTyping: boolean;
}

const REST: CaretLook = { lookX: 0, isTyping: false };

export const useCaretLookX = (inputRef: RefObject<HTMLInputElement | null>): CaretLook => {
  const [look, setLook] = useState<CaretLook>(REST);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;

    const mirror = document.createElement('span');
    mirror.style.position = 'absolute';
    mirror.style.top = '0';
    mirror.style.left = '-9999px';
    mirror.style.visibility = 'hidden';
    mirror.style.whiteSpace = 'pre';
    mirror.setAttribute('aria-hidden', 'true');
    document.body.appendChild(mirror);

    let frame = 0;
    let pending = false;

    const measure = () => {
      if (document.activeElement !== input || input.value.length === 0) {
        setLook(REST);
        return;
      }
      mirror.textContent = input.value.slice(0, input.selectionStart ?? input.value.length);
      const style = getComputedStyle(input);
      for (const prop of MIRROR_STYLE_PROPS) {
        mirror.style[prop] = style[prop];
      }
      const contentWidth =
        input.clientWidth -
        (parseFloat(style.paddingLeft) || 0) -
        (parseFloat(style.paddingRight) || 0);
      setLook({
        lookX: computeLookX({
          textWidth: mirror.getBoundingClientRect().width,
          scrollLeft: input.scrollLeft,
          contentWidth,
          rtl: style.direction === 'rtl',
        }),
        isTyping: true,
      });
    };

    const schedule = () => {
      if (pending) return;
      pending = true;
      frame = requestAnimationFrame(() => {
        pending = false;
        measure();
      });
    };

    input.addEventListener('input', schedule);
    input.addEventListener('focus', schedule);
    input.addEventListener('blur', schedule);
    document.addEventListener('selectionchange', schedule);
    document.fonts?.ready.then(schedule).catch(() => {});

    return () => {
      if (frame) cancelAnimationFrame(frame);
      input.removeEventListener('input', schedule);
      input.removeEventListener('focus', schedule);
      input.removeEventListener('blur', schedule);
      document.removeEventListener('selectionchange', schedule);
      mirror.remove();
    };
  }, [inputRef]);

  return look;
};
