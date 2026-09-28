import React from 'react';
import { MdAdd, MdRemove } from 'react-icons/md';
import { useTranslation } from '@/hooks/useTranslation';
import { type CanvasController, ZOOM_STEP } from '@/services/mindmap/tools/controller';
import { useAtomValue } from './useCanvasStores';

const BUTTON =
  'flex h-10 min-w-10 items-center justify-center rounded-full px-2 text-sm transition-colors duration-150 hover:bg-base-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-base-content/15';

const ZoomControl: React.FC<{ controller: CanvasController; animate: boolean }> = ({
  controller,
  animate,
}) => {
  const _ = useTranslation();
  const { z } = useAtomValue(controller.camera);
  const percent = new Intl.NumberFormat(undefined, { style: 'percent' }).format(z);
  return (
    <div className='nodrag nowheel eink-bordered bg-base-100 text-base-content absolute bottom-4 end-4 flex items-center rounded-full p-1 shadow-md'>
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
