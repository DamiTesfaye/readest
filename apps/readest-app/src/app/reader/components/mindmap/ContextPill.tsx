import clsx from 'clsx';
import React, { type RefObject, useRef, useState } from 'react';
import { MdMoreHoriz } from 'react-icons/md';
import { useTranslation } from '@/hooks/useTranslation';
import type { Point } from '@/services/mindmap/records/geometry';
import type { NodeKind, PositionedRecord, RecordAnchor } from '@/services/mindmap/schema/types';
import { PRESET_COLORS } from '@/services/mindmap/theme/presets';
import { isLive, recordBounds } from '@/services/mindmap/spatial/spatialIndex';
import { readField } from '@/services/mindmap/store/mapStore';
import type { CanvasController } from '@/services/mindmap/tools/controller';
import { unionBounds } from '@/services/mindmap/tools/records';
import { colorLabels, kindLabels } from './recordLabels';
import { useAtomValue, useMapRecords } from './useCanvasStores';
import { useMediaQuery } from './useMediaQuery';
import { type MenuClose, useMenuFocus } from './useMenuFocus';

const PILL_HEIGHT_PX = 44;
const COARSE_PILL_HEIGHT_PX = 52;
const COARSE_TARGET = '[@media(pointer:coarse)]:size-11 [@media(pointer:coarse)]:min-h-11';
const PILL_GAP_PX = 12;
const KINDS: NodeKind[] = ['character', 'place', 'chapter', 'theme', 'quote', 'idea'];

const sharedValue = (records: PositionedRecord[], field: string): unknown => {
  const values = new Set(records.map((record) => readField(record, field)));
  return values.size === 1 ? [...values][0] : undefined;
};

interface MenuItem {
  label: string;
  action: () => void;
  danger?: boolean;
  disabled?: boolean;
}

interface RecordMenuProps {
  controller: CanvasController;
  at: Point;
  onClose: MenuClose;
  onJumpToBook: (anchor: RecordAnchor) => void;
  canJumpToBook?: (anchor: RecordAnchor) => boolean;
  onResetPosition?: (id: string) => void;
  anchorRef?: RefObject<HTMLElement | null>;
}

export const RecordMenu: React.FC<RecordMenuProps> = ({
  controller,
  at,
  onClose,
  onJumpToBook,
  canJumpToBook,
  onResetPosition,
  anchorRef,
}) => {
  const _ = useTranslation();
  const menuRef = useRef<HTMLDivElement>(null);
  const onKeyDown = useMenuFocus(menuRef, onClose, anchorRef);
  const selection = useAtomValue(controller.selection);
  const records = selection.map((id) => controller.store.get(id)).filter(isLive);
  const single = records.length === 1 ? records[0]! : null;
  const run = (action: () => void) => () => {
    action();
    onClose(true);
  };
  const candidates: (MenuItem | false | null | undefined)[] = [
    single?.anchor && {
      label: _('Jump to book'),
      action: () => onJumpToBook(single.anchor!),
      disabled: canJumpToBook?.(single.anchor) === false,
    },
    onResetPosition &&
      single?.origin === 'generated' &&
      !controller.readOnly && {
        label: _('Reset position'),
        action: () => onResetPosition(single.id),
      },
    !controller.readOnly && { label: _('Bring to front'), action: controller.bringToFront },
    !controller.readOnly && { label: _('Send to back'), action: controller.sendToBack },
    !controller.readOnly && { label: _('Duplicate'), action: controller.duplicateSelection },
    !controller.readOnly && {
      label: _('Delete'),
      action: controller.deleteSelection,
      danger: true,
    },
  ];
  const items = candidates.filter((item): item is MenuItem => Boolean(item));
  if (items.length === 0) return null;
  return (
    <div
      ref={menuRef}
      role='menu'
      aria-label={_('Record actions')}
      data-testid='mm-record-menu'
      className='nodrag nowheel eink-bordered bg-base-100 text-base-content absolute z-10 flex min-w-44 flex-col rounded-lg p-1 text-sm shadow-lg'
      style={{ left: at.x, top: at.y }}
      onKeyDown={onKeyDown}
    >
      {items.map((item) => (
        <button
          key={item.label}
          type='button'
          role='menuitem'
          tabIndex={-1}
          aria-disabled={item.disabled || undefined}
          className={clsx(
            'hover:bg-base-200 rounded-md px-3 py-2 text-start transition-colors duration-150',
            item.danger && 'text-error',
            item.disabled && 'opacity-50',
          )}
          onClick={item.disabled ? undefined : run(item.action)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
};

interface ContextPillProps {
  controller: CanvasController;
  onJumpToBook: (anchor: RecordAnchor) => void;
  canJumpToBook?: (anchor: RecordAnchor) => boolean;
  onResetPosition?: (id: string) => void;
  onFocusLost?: () => void;
  eink?: boolean;
}

const ContextPill: React.FC<ContextPillProps> = ({
  controller,
  onJumpToBook,
  canJumpToBook,
  onResetPosition,
  onFocusLost,
  eink = false,
}) => {
  const _ = useTranslation();
  const moreRef = useRef<HTMLButtonElement>(null);
  useMapRecords(controller.store);
  const selection = useAtomValue(controller.selection);
  const camera = useAtomValue(controller.camera);
  const editing = useAtomValue(controller.editing);
  const live = useAtomValue(controller.live);
  const [menuOpen, setMenuOpen] = useState(false);
  const pillHeight = useMediaQuery('(pointer: coarse)') ? COARSE_PILL_HEIGHT_PX : PILL_HEIGHT_PX;
  const records = selection
    .map((id) => controller.store.get(id))
    .filter((record): record is PositionedRecord => isLive(record) && record.type !== 'link');
  const bounds = unionBounds(records.map(recordBounds));
  if (!bounds || editing || live.guides.length > 0 || live.brush) return null;
  const canColor =
    !controller.readOnly &&
    !eink &&
    records.some((record) => record.type !== 'text' && record.type !== 'sticky');
  const nodes = records.every((record) => record.type === 'node');
  const single = records.length === 1 ? records[0]! : null;
  const top = bounds.y * camera.z + camera.y;
  const bottom = (bounds.y + bounds.h) * camera.z + camera.y;
  const above = top - pillHeight - PILL_GAP_PX;
  const colorNames = colorLabels(_);
  const kindNames = kindLabels(_);
  const currentColor = sharedValue(records, 'color');
  const currentKind = sharedValue(records, 'kind');
  return (
    <div
      data-testid='mm-context-pill'
      className='nodrag nowheel eink-bordered bg-base-100 text-base-content absolute z-10 flex max-w-[calc(100%-1rem)] -translate-x-1/2 items-center gap-1 rounded-full px-2 py-1 shadow-md'
      style={{
        left: (bounds.x + bounds.w / 2) * camera.z + camera.x,
        top: above >= 0 ? above : bottom + PILL_GAP_PX,
      }}
    >
      {canColor && (
        <div className='no-scrollbar flex min-w-0 items-center gap-1 overflow-x-auto'>
          {PRESET_COLORS.map((color) => (
            <button
              key={color}
              type='button'
              aria-label={colorNames[color]}
              aria-pressed={currentColor === color}
              onClick={() => controller.setColor(color)}
              className={clsx(
                'size-6 shrink-0 rounded-full [@media(pointer:coarse)]:size-11',
                currentColor === color
                  ? 'border-base-content border-2'
                  : 'border-base-content/60 border',
              )}
              style={{ background: `var(--mm-${color}-fill)` }}
            />
          ))}
        </div>
      )}
      {nodes && !controller.readOnly && (
        <select
          aria-label={_('Node kind')}
          className='select select-ghost select-sm'
          value={typeof currentKind === 'string' ? currentKind : ''}
          onChange={(event) => controller.setKind(event.target.value as NodeKind)}
        >
          {KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {kindNames[kind]}
            </option>
          ))}
        </select>
      )}
      {single?.anchor && (
        <button
          type='button'
          className='btn btn-ghost btn-sm [@media(pointer:coarse)]:min-h-11 shrink-0 rounded-full [@media(pointer:coarse)]:h-11'
          disabled={canJumpToBook?.(single.anchor) === false}
          onClick={() => onJumpToBook(single.anchor!)}
        >
          {_('Jump to book')}
        </button>
      )}
      <button
        ref={moreRef}
        type='button'
        aria-label={_('More actions')}
        aria-haspopup='menu'
        aria-expanded={menuOpen}
        className={`btn btn-ghost btn-circle btn-sm shrink-0 ${COARSE_TARGET}`}
        onClick={() => setMenuOpen((open) => !open)}
      >
        <MdMoreHoriz size={18} />
      </button>
      {menuOpen && (
        <RecordMenu
          controller={controller}
          at={{ x: 0, y: pillHeight }}
          anchorRef={moreRef}
          onClose={(returnFocus) => {
            setMenuOpen(false);
            if (!returnFocus) return;
            moreRef.current?.focus({ preventScroll: true });
            onFocusLost?.();
          }}
          onJumpToBook={onJumpToBook}
          canJumpToBook={canJumpToBook}
          onResetPosition={onResetPosition}
        />
      )}
    </div>
  );
};

export default ContextPill;
