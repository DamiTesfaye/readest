import clsx from 'clsx';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import ToolbarPopover from '@/components/ToolbarPopover';
import {
  QUICK_PICK_DRAG_TYPE,
  QUICK_PICK_IDS,
  getQuickPickIconSrc,
  isQuickPickId,
  type QuickPickId,
  type QuickPickSlots as Slots,
} from '@/utils/quickPicks';
import type { MoreAction } from '../hooks/useMoreActions';

const LONG_PRESS_MS = 500;
const PICKER_WIDTH = 220;
const WOBBLE_STAGGER_S = 0.09;
const ZONE_ATTR = 'data-quick-pick-zone';

interface QuickPickSlotsProps {
  slots: Slots;
  actions: Record<QuickPickId, MoreAction>;
  colored: boolean;
  isArranging: boolean;
  onPlace: (id: QuickPickId, index: number) => void;
  onArrangeChange: (isArranging: boolean) => void;
  onRemove: (index: number) => void;
  indices?: number[];
}

const SLOT_CLASS =
  'btn btn-ghost hover:bg-transparent relative h-8 min-h-8 w-8 p-0 transition-shadow';

const QuickPickSlots: React.FC<QuickPickSlotsProps> = ({
  slots,
  actions,
  colored,
  isArranging,
  onPlace,
  onArrangeChange,
  onRemove,
  indices,
}) => {
  const _ = useTranslation();
  const [picker, setPicker] = useState<{ index: number; anchor: HTMLElement } | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressClick = useRef(false);

  const wobble = (order: number) =>
    isArranging
      ? {
          className: 'quick-pick-wobble',
          style: { animationDelay: `${-order * WOBBLE_STAGGER_S}s` },
        }
      : { className: undefined, style: undefined };

  const openPicker = (index: number, anchor: HTMLElement) => {
    setPicker({ index, anchor });
    onArrangeChange(true);
  };

  const closePicker = () => setPicker(null);

  useEffect(() => {
    if (!isArranging) return;
    const finish = () => {
      setPicker(null);
      onArrangeChange(false);
    };
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest(`[${ZONE_ATTR}]`)) return;
      finish();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') finish();
    };
    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isArranging, onArrangeChange]);

  const cancelPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
  };

  const startPress = (index: number) => (event: React.PointerEvent<HTMLButtonElement>) => {
    cancelPress();
    const anchor = event.currentTarget;
    pressTimer.current = setTimeout(() => {
      pressTimer.current = null;
      suppressClick.current = true;
      openPicker(index, anchor);
    }, LONG_PRESS_MS);
  };

  const dropHandlers = (index: number) => ({
    onDragOver: (event: React.DragEvent) => {
      if (!Array.from(event.dataTransfer.types).includes(QUICK_PICK_DRAG_TYPE)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      setDropIndex(index);
    },
    onDragLeave: () => setDropIndex(null),
    onDrop: (event: React.DragEvent) => {
      setDropIndex(null);
      const id = event.dataTransfer.getData(QUICK_PICK_DRAG_TYPE);
      if (!isQuickPickId(id)) return;
      event.preventDefault();
      onPlace(id, index);
    },
  });

  const dragSource = (id: QuickPickId) => ({
    draggable: true,
    onDragStart: (event: React.DragEvent) => {
      cancelPress();
      event.dataTransfer.setData(QUICK_PICK_DRAG_TYPE, id);
      event.dataTransfer.effectAllowed = 'move';
      onArrangeChange(true);
    },
    onDragEnd: () => onArrangeChange(false),
  });

  const handleSlotClick = (action: MoreAction) => (event: React.MouseEvent<HTMLElement>) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    action.run(event.currentTarget);
  };

  const pinned = new Set(slots);
  const choices = QUICK_PICK_IDS.filter((id) => !pinned.has(id));

  return (
    <span className='flex items-center gap-x-3' {...{ [ZONE_ATTR]: '' }}>
      {slots.map((id, index) => {
        if (indices && !indices.includes(index)) return null;
        const ring = dropIndex === index && 'ring-base-content/40 ring-2';
        if (!id) {
          return (
            <button
              key={`empty-${index}`}
              type='button'
              title={_('Add a quick pick')}
              aria-label={_('Add a quick pick')}
              className={clsx(SLOT_CLASS, ring)}
              onClick={(event) => openPicker(index, event.currentTarget)}
              {...dropHandlers(index)}
            >
              <span className='border-base-content/50 flex h-6 w-7 items-center justify-center rounded-md border border-dashed'>
                <svg viewBox='0 0 12 12' className='h-2.5 w-2.5' aria-hidden='true'>
                  <path
                    d='M6 1v10M1 6h10'
                    stroke='currentColor'
                    strokeWidth='2'
                    strokeLinecap='round'
                  />
                </svg>
              </span>
            </button>
          );
        }
        const action = actions[id];
        const { className, style } = wobble(index);
        return (
          <span key={id} className='relative flex'>
            <button
              type='button'
              title={action.title}
              aria-label={action.title}
              aria-pressed={action.toggled}
              className={clsx(SLOT_CLASS, ring)}
              onClick={handleSlotClick(action)}
              onPointerDown={startPress(index)}
              onPointerUp={cancelPress}
              onPointerLeave={cancelPress}
              onPointerCancel={cancelPress}
              onContextMenu={(event) => event.preventDefault()}
              {...dragSource(id)}
              {...dropHandlers(index)}
            >
              <img
                src={getQuickPickIconSrc(id, colored)}
                alt=''
                draggable={false}
                className={clsx('h-6 w-auto max-w-7 object-contain', className)}
                style={style}
              />
              {action.toggled && (
                <span className='bg-success absolute right-0 top-0.5 h-1.5 w-1.5 rounded-full' />
              )}
            </button>
            {isArranging && (
              <button
                type='button'
                aria-label={_('Remove {{title}}', { title: action.title })}
                title={_('Remove {{title}}', { title: action.title })}
                className='absolute -left-1.5 -top-1.5 z-10 flex h-4 w-4 items-center justify-center'
                onClick={() => onRemove(index)}
              >
                <img src='/images/toolbar/close-circle.svg' alt='' className='h-4 w-4' />
              </button>
            )}
          </span>
        );
      })}
      <ToolbarPopover
        isOpen={picker !== null}
        anchorEl={picker?.anchor ?? null}
        width={PICKER_WIDTH}
        onClose={closePicker}
      >
        <div className='flex flex-col gap-1 p-2' {...{ [ZONE_ATTR]: '' }}>
          {choices.map((id, order) => {
            const { className, style } = wobble(order + slots.length);
            return (
              <button
                key={id}
                type='button'
                className='hover:bg-base-300 flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-start transition-colors'
                onClick={() => {
                  if (picker) onPlace(id, picker.index);
                  closePicker();
                }}
                {...dragSource(id)}
              >
                <span className='flex h-7 w-8 shrink-0 items-center justify-center'>
                  <img
                    src={getQuickPickIconSrc(id, colored)}
                    alt=''
                    draggable={false}
                    className={clsx('h-6 w-auto max-w-8 object-contain', className)}
                    style={style}
                  />
                </span>
                <span className='popover-action-label text-base-content text-xs'>
                  {actions[id].title}
                </span>
              </button>
            );
          })}
        </div>
      </ToolbarPopover>
    </span>
  );
};

export default QuickPickSlots;
