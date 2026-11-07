const HOVER_THROTTLE_MS = 100;
const LONG_PRESS_MS = 500;
const SLOP_PX = 10;

export interface CreatorHoverOptions<T> {
  hitTest(point: { x: number; y: number }): string | undefined;
  peekOf(key: string): T | undefined;
  show(peek: T | null, x: number, y: number): void;
}

export const attachCreatorHover = <T>(doc: Document, o: CreatorHoverOptions<T>): (() => void) => {
  let shown: string | null = null;
  let lastMove = -Infinity;
  let press: { timer: ReturnType<typeof setTimeout>; x: number; y: number } | null = null;

  const update = (x: number, y: number) => {
    const key = o.hitTest({ x, y });
    const peek = key ? o.peekOf(key) : undefined;
    const next = peek ? key! : null;
    if (next === shown) return;
    shown = next;
    o.show(peek ?? null, x, y);
  };

  const hide = (x: number, y: number) => {
    if (!shown) return;
    shown = null;
    o.show(null, x, y);
  };

  const cancelPress = () => {
    if (press) clearTimeout(press.timer);
    press = null;
  };

  const onMove = (e: PointerEvent) => {
    if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > SLOP_PX) cancelPress();
    if (e.pointerType !== 'mouse') return;
    const now = performance.now();
    if (now - lastMove < HOVER_THROTTLE_MS) return;
    lastMove = now;
    update(e.clientX, e.clientY);
  };

  const onDown = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') return;
    hide(e.clientX, e.clientY);
    cancelPress();
    const { clientX: x, clientY: y } = e;
    press = { x, y, timer: setTimeout(() => update(x, y), LONG_PRESS_MS) };
  };

  const onLeave = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') hide(e.clientX, e.clientY);
  };

  doc.addEventListener('pointermove', onMove);
  doc.addEventListener('pointerdown', onDown);
  doc.addEventListener('pointerup', cancelPress);
  doc.addEventListener('pointercancel', cancelPress);
  doc.addEventListener('pointerleave', onLeave);
  return () => {
    cancelPress();
    doc.removeEventListener('pointermove', onMove);
    doc.removeEventListener('pointerdown', onDown);
    doc.removeEventListener('pointerup', cancelPress);
    doc.removeEventListener('pointercancel', cancelPress);
    doc.removeEventListener('pointerleave', onLeave);
  };
};
