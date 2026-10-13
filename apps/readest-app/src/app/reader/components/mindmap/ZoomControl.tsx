import React from 'react';
import { MdAdd, MdRemove } from 'react-icons/md';
import { useTranslation } from '@/hooks/useTranslation';
import { type CanvasController, ZOOM_STEP } from '@/services/mindmap/tools/controller';
import { getLocale } from '@/utils/misc';
import { useAtomValue } from './useCanvasStores';

const BUTTON =
  'flex h-10 min-w-10 items-center justify-center rounded-full px-2 text-sm transition-colors duration-150 hover:bg-base-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-base-content';

const ZoomControl: React.FC<{
  controller: CanvasController;
  animate: boolean;
  bottomInset?: number;
}> = ({ controller, animate, bottomInset }) => {
  const _ = useTranslation();
  const { z } = useAtomValue(controller.camera);
  const percent = new Intl.NumberFormat(getLocale(), { style: 'percent' }).format(z);
  return (
    <div
      className='nodrag nowheel eink-bordered bg-base-100 text-base-content absolute end-4 flex items-center rounded-full p-1 shadow-md'
      style={{ bottom: `calc(1rem + ${bottomInset || 0}px)` }}
    >
      <button
        type='button'
        className={BUTTON}
        aria-label={_('Zoom out')}
        onClick={() => controller.zoomBy(1 / ZOOM_STEP)}
      >
        <MdRemove size={18} />
      </button>
      <button
        type='button'
        data-testid='mm-zoom-level'
        className={BUTTON}
        aria-label={_('Fit to screen')}
        title={_('Fit to screen')}
        onClick={() => controller.fitView(animate)}
      >
        {percent}
      </button>
      <button
        type='button'
        className={BUTTON}
        aria-label={_('Zoom in')}
        onClick={() => controller.zoomBy(ZOOM_STEP)}
      >
        <MdAdd size={18} />
      </button>
    </div>
  );
};

export default ZoomControl;
