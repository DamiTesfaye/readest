import clsx from 'clsx';
import React from 'react';
import type { IconType } from 'react-icons';
import {
  MdBubbleChart,
  MdCallMade,
  MdCropFree,
  MdCropSquare,
  MdEdit,
  MdNearMe,
  MdPanTool,
  MdPanoramaFishEye,
  MdStickyNote2,
  MdTextFields,
} from 'react-icons/md';
import { useTranslation } from '@/hooks/useTranslation';
import type { CanvasController } from '@/services/mindmap/tools/controller';
import type { ToolId } from '@/services/mindmap/tools/types';
import { toolLabels } from './toolLabels';
import { useAtomValue } from './useCanvasStores';

export const DOCK_TOOLS: ReadonlyArray<{ id: ToolId; shortcut: string; icon: IconType }> = [
  { id: 'select', shortcut: 'V', icon: MdNearMe },
  { id: 'hand', shortcut: 'H', icon: MdPanTool },
  { id: 'node', shortcut: 'N', icon: MdBubbleChart },
  { id: 'connect', shortcut: 'X', icon: MdCallMade },
  { id: 'pen', shortcut: 'P', icon: MdEdit },
  { id: 'rect', shortcut: 'R', icon: MdCropSquare },
  { id: 'ellipse', shortcut: 'O', icon: MdPanoramaFishEye },
  { id: 'sticky', shortcut: 'S', icon: MdStickyNote2 },
  { id: 'text', shortcut: 'T', icon: MdTextFields },
  { id: 'section', shortcut: 'Shift+S', icon: MdCropFree },
];

const VIEW_ONLY: ReadonlySet<ToolId> = new Set(['select', 'hand']);

const ToolDock: React.FC<{ controller: CanvasController; bottomInset?: number }> = ({
  controller,
  bottomInset,
}) => {
  const _ = useTranslation();
  const active = useAtomValue(controller.tool);
  const labels = toolLabels(_);
  const tools = controller.readOnly
    ? DOCK_TOOLS.filter((tool) => VIEW_ONLY.has(tool.id))
    : DOCK_TOOLS;
  return (
    <div
      role='toolbar'
      aria-label={_('Tools')}
      className='nodrag nowheel eink-bordered bg-base-100 absolute left-1/2 flex -translate-x-1/2 gap-0.5 rounded-full p-1 shadow-md'
      style={{ bottom: `calc(1rem + ${bottomInset || 0}px)` }}
    >
      {tools.map(({ id, shortcut, icon: Icon }) => (
        <button
          key={id}
          type='button'
          title={labels[id]}
          aria-label={labels[id]}
          aria-keyshortcuts={shortcut}
          aria-pressed={active === id}
          onClick={() => controller.setTool(id)}
          className={clsx(
            'flex h-11 w-10 flex-col items-center justify-center rounded-full transition-colors duration-150',
            'focus-visible:ring-base-content focus-visible:outline-none focus-visible:ring-2',
            active === id
              ? 'bg-base-content text-base-100 eink-inverted'
              : 'text-base-content hover:bg-base-200',
          )}
        >
          <Icon size={18} aria-hidden='true' />
          <span className='text-[10px] leading-none' aria-hidden='true'>
            {shortcut.replace('Shift+', '⇧')}
          </span>
        </button>
      ))}
    </div>
  );
};

export default ToolDock;
