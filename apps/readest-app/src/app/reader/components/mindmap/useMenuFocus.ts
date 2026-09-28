import type React from 'react';
import { type RefObject, useEffect, useRef } from 'react';

const ITEM_SELECTOR = '[role^="menuitem"]';

const STEPS: Readonly<Record<string, (index: number, count: number) => number>> = {
  ArrowDown: (index, count) => (index + 1) % count,
  ArrowUp: (index, count) => (index - 1 + count) % count,
  Home: () => 0,
  End: (_index, count) => count - 1,
};

export type MenuClose = (returnFocus: boolean) => void;

export const useMenuFocus = (
  menuRef: RefObject<HTMLElement | null>,
  onClose: MenuClose,
  anchorRef?: RefObject<HTMLElement | null>,
): ((event: React.KeyboardEvent<HTMLElement>) => void) => {
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);

  useEffect(() => {
    menuRef.current?.querySelector<HTMLElement>(ITEM_SELECTOR)?.focus({ preventScroll: true });
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (menuRef.current?.contains(target) || anchorRef?.current?.contains(target)) return;
      close.current(false);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [menuRef, anchorRef]);

  return (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close.current(true);
      return;
    }
    const step = STEPS[event.key];
    const menu = menuRef.current;
    if (!step || !menu) return;
    const items = [...menu.querySelectorAll<HTMLElement>(ITEM_SELECTOR)];
    if (items.length === 0) return;
    event.preventDefault();
    const index = items.indexOf(document.activeElement as HTMLElement);
    items[step(Math.max(index, 0), items.length)]?.focus({ preventScroll: true });
  };
};
