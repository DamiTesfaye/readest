import { type RefObject, useEffect } from 'react';
import type { Direction } from '@/services/mindmap/spatial/nearestInDirection';
import { type CanvasController, ZOOM_STEP } from '@/services/mindmap/tools/controller';
import { editableField } from '@/services/mindmap/tools/records';
import type { ToolId } from '@/services/mindmap/tools/types';

export const TOOL_KEYS: Readonly<Record<string, ToolId>> = {
  v: 'select',
  h: 'hand',
  n: 'node',
  x: 'connect',
  p: 'pen',
  r: 'rect',
  o: 'ellipse',
  s: 'sticky',
  t: 'text',
};

const ARROWS: Readonly<Record<string, Direction>> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
};

const NUDGE: Readonly<Record<Direction, [number, number]>> = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};

export const isTypingTarget = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));

const targetsCanvas = (target: EventTarget | null, root: HTMLElement): boolean =>
  target === root || (target instanceof Element && target.closest('[data-record-id]') !== null);

const handleModified = (
  event: KeyboardEvent,
  controller: CanvasController,
  animate: boolean,
): boolean => {
  const key = event.key.toLowerCase();
  if (key === 'z') {
    if (event.shiftKey) controller.redo();
    else controller.undo();
  } else if (key === '0') {
    controller.fitView(animate);
  } else if (key === '=' || key === '+') {
    controller.zoomBy(ZOOM_STEP);
  } else if (key === '-') {
    controller.zoomBy(1 / ZOOM_STEP);
  } else {
    return false;
  }
  return true;
};

const handleMapKey = (
  event: KeyboardEvent,
  controller: CanvasController,
  focusRecord: (id: string) => void,
  animate: boolean,
): boolean => {
  const { key, shiftKey } = event;
  const selection = controller.selection.get();
  const direction = ARROWS[key];
  if (direction) {
    const id = controller.focusDirection(direction, animate);
    if (id) focusRecord(id);
    return true;
  }
  if (key === 'Tab') {
    const id = shiftKey ? controller.selectParent(animate) : controller.addChild(animate);
    if (id && shiftKey) focusRecord(id);
    return id !== null;
  }
  if (key === 'Enter') return controller.addSibling(animate) !== null;
  if (key === 'F2') {
    const record = selection.length === 1 ? controller.store.get(selection[0]!) : undefined;
    if (!record || !editableField(record) || controller.readOnly) return false;
    controller.editing.set(record.id);
    return true;
  }
  if (key === 'Delete' || key === 'Backspace') {
    controller.deleteSelection();
    return true;
  }
  if (key === 'Escape') {
    controller.setTool('select');
    controller.selection.set([]);
    return true;
  }
  const tool = shiftKey ? (key === 'S' ? 'section' : undefined) : TOOL_KEYS[key.toLowerCase()];
  if (!tool) return false;
  controller.setTool(tool);
  return true;
};

export const useMindmapShortcuts = (
  rootRef: RefObject<HTMLElement | null>,
  controller: CanvasController,
  focusRecord: (id: string) => void,
  animate: boolean,
): void => {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || isTypingTarget(event.target)) return;
      if (event.metaKey || event.ctrlKey) {
        if (handleModified(event, controller, animate)) event.preventDefault();
        return;
      }
      if (!targetsCanvas(event.target, root)) return;
      let handled: boolean;
      if (event.altKey) {
        const direction = ARROWS[event.key];
        if (direction) controller.nudge(...NUDGE[direction]);
        handled = direction !== undefined;
      } else if (event.key === ' ') {
        controller.setSpaceHeld(true);
        handled = true;
      } else {
        handled = handleMapKey(event, controller, focusRecord, animate);
      }
      if (handled) event.preventDefault();
    };
    const onKeyUp = (event: KeyboardEvent): void => {
      if (event.key === ' ') controller.setSpaceHeld(false);
    };
    const onBlur = (): void => controller.setSpaceHeld(false);
    root.addEventListener('keydown', onKeyDown);
    root.addEventListener('keyup', onKeyUp);
    root.addEventListener('focusout', onBlur);
    return () => {
      root.removeEventListener('keydown', onKeyDown);
      root.removeEventListener('keyup', onKeyUp);
      root.removeEventListener('focusout', onBlur);
    };
  }, [rootRef, controller, focusRecord, animate]);
};
