import { type RefObject, useEffect } from 'react';
import type { Point } from '@/services/mindmap/records/geometry';
import type { LinkAnchor } from '@/services/mindmap/schema/types';
import type { CanvasController } from '@/services/mindmap/tools/controller';
import type { CanvasPointer, PointerKind, PointerTarget } from '@/services/mindmap/tools/types';

export const WHEEL_ZOOM_SPEED = 0.0015;
const LINE_HEIGHT_PX = 16;

interface SafariGestureEvent extends UIEvent {
  scale: number;
  clientX: number;
  clientY: number;
}

interface Pinch {
  distance: number;
  center: Point;
}

const pointerKind = (type: string): PointerKind =>
  type === 'pen' ? 'pen' : type === 'touch' ? 'touch' : 'mouse';

const closestIn = (target: EventTarget | null, selector: string): Element | null =>
  target instanceof Element ? target.closest(selector) : null;

export const pointerTarget = (target: EventTarget | null): PointerTarget => {
  const handle = closestIn(target, '[data-connect-handle]');
  if (handle) {
    return {
      kind: 'connect',
      id: handle.getAttribute('data-record-id') ?? '',
      side: handle.getAttribute('data-connect-handle') as LinkAnchor['side'],
    };
  }
  const resize = closestIn(target, '[data-resize-handle]');
  if (resize) return { kind: 'resize', id: resize.getAttribute('data-record-id') ?? '' };
  return { kind: 'canvas' };
};

export const useCanvasInput = (
  rootRef: RefObject<HTMLElement | null>,
  controller: CanvasController,
  wheelZooms: boolean,
): void => {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const touches = new Map<number, Point>();
    let pinch: Pinch | null = null;
    let gestureScale = 1;

    const local = (
      event: { clientX: number; clientY: number },
      rect = root.getBoundingClientRect(),
    ): Point => ({
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    });

    const toPointer = (
      event: PointerEvent,
      rect: DOMRect,
      target: PointerTarget,
    ): CanvasPointer => {
      const screen = local(event, rect);
      return {
        id: event.pointerId,
        kind: pointerKind(event.pointerType),
        button: event.button,
        screen,
        page: controller.camera.screenToPage(screen),
        pressure: event.pressure,
        alt: event.altKey,
        shift: event.shiftKey,
        clicks: event.detail,
        target,
      };
    };

    const pinchOf = (): Pinch => {
      const [a, b] = [...touches.values()] as [Point, Point];
      return {
        distance: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)),
        center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      };
    };

    const onDown = (event: PointerEvent): void => {
      if (event.button === 2 || closestIn(event.target, '.nodrag, .nopan')) return;
      event.preventDefault();
      root.focus({ preventScroll: true });
      if (event.pointerType === 'touch') {
        touches.set(event.pointerId, local(event));
        if (touches.size >= 2) {
          controller.pointerCancel();
          pinch = touches.size === 2 ? pinchOf() : pinch;
          return;
        }
      }
      root.setPointerCapture(event.pointerId);
      controller.pointerDown(
        toPointer(event, root.getBoundingClientRect(), pointerTarget(event.target)),
      );
    };

    const onMove = (event: PointerEvent): void => {
      if (touches.has(event.pointerId)) touches.set(event.pointerId, local(event));
      if (pinch && touches.size >= 2) {
        const next = pinchOf();
        controller.camera.panBy(next.center.x - pinch.center.x, next.center.y - pinch.center.y);
        controller.camera.zoomAt(next.center, next.distance / pinch.distance);
        pinch = next;
        return;
      }
      const rect = root.getBoundingClientRect();
      const target = pointerTarget(event.target);
      const samples =
        controller.gestureActive() && typeof event.getCoalescedEvents === 'function'
          ? event.getCoalescedEvents().map((sample) => toPointer(sample, rect, target))
          : [];
      controller.pointerMove(toPointer(event, rect, target), samples);
    };

    const onUp = (event: PointerEvent): void => {
      touches.delete(event.pointerId);
      if (pinch) {
        if (touches.size < 2) pinch = null;
        return;
      }
      if (root.hasPointerCapture(event.pointerId)) root.releasePointerCapture(event.pointerId);
      controller.pointerUp(
        toPointer(event, root.getBoundingClientRect(), pointerTarget(event.target)),
      );
    };

    const onCancel = (event: PointerEvent): void => {
      touches.delete(event.pointerId);
      if (touches.size < 2) pinch = null;
      controller.pointerCancel();
    };

    const onWheel = (event: WheelEvent): void => {
      if (closestIn(event.target, '.nowheel')) return;
      event.preventDefault();
      const scale = event.deltaMode === 1 ? LINE_HEIGHT_PX : 1;
      const dx = event.deltaX * scale;
      const dy = event.deltaY * scale;
      if (event.ctrlKey || event.metaKey || wheelZooms) {
        controller.camera.zoomAt(local(event), Math.exp(-dy * WHEEL_ZOOM_SPEED));
      } else {
        controller.camera.panBy(-dx, -dy);
      }
    };

    const onGestureStart = (event: Event): void => {
      event.preventDefault();
      gestureScale = 1;
    };

    const onGestureChange = (event: Event): void => {
      event.preventDefault();
      const gesture = event as SafariGestureEvent;
      controller.camera.zoomAt(local(gesture), gesture.scale / gestureScale);
      gestureScale = gesture.scale;
    };

    root.addEventListener('pointerdown', onDown);
    root.addEventListener('pointermove', onMove);
    root.addEventListener('pointerup', onUp);
    root.addEventListener('pointercancel', onCancel);
    root.addEventListener('wheel', onWheel, { passive: false });
    root.addEventListener('gesturestart', onGestureStart);
    root.addEventListener('gesturechange', onGestureChange);
    return () => {
      root.removeEventListener('pointerdown', onDown);
      root.removeEventListener('pointermove', onMove);
      root.removeEventListener('pointerup', onUp);
      root.removeEventListener('pointercancel', onCancel);
      root.removeEventListener('wheel', onWheel);
      root.removeEventListener('gesturestart', onGestureStart);
      root.removeEventListener('gesturechange', onGestureChange);
    };
  }, [rootRef, controller, wheelZooms]);
};
