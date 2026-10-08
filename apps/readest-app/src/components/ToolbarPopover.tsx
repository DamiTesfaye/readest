import clsx from 'clsx';
import React, { useCallback, useEffect, useState } from 'react';
import { Rect, getPopupPosition } from '@/utils/sel';
import {
  POPOVER_EDGE_PADDING,
  PopoverPlacement,
  forwardBackdropClickToToolbar,
  getToolbarAnchorPosition,
} from '@/utils/popover';
import ModalPortal from '@/components/ModalPortal';
import Popup from '@/components/Popup';

interface ToolbarPopoverProps {
  isOpen: boolean;
  anchorEl: HTMLElement | null;
  width: number;
  maxHeight?: number;
  className?: string;
  triangleClassName?: string;
  getPlacement?: (anchorRect: Rect, viewport: Rect) => PopoverPlacement;
  onClose: () => void;
  children: React.ReactNode;
}

const ToolbarPopover: React.FC<ToolbarPopoverProps> = ({
  isOpen,
  anchorEl,
  width,
  maxHeight,
  className,
  triangleClassName,
  getPlacement,
  onClose,
  children,
}) => {
  const [placement, setPlacement] = useState<PopoverPlacement | null>(null);

  const updatePlacement = useCallback(() => {
    if (!anchorEl) return;
    const rect = anchorEl.getBoundingClientRect();
    const viewport = { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
    if (getPlacement) {
      setPlacement(getPlacement(rect, viewport));
      return;
    }
    const pointer = getToolbarAnchorPosition(rect);
    const body = getPopupPosition(pointer, viewport, width, 0, POPOVER_EDGE_PADDING);
    setPlacement({ body, pointer });
  }, [anchorEl, width, getPlacement]);

  useEffect(() => {
    if (!isOpen) {
      setPlacement(null);
      return;
    }
    updatePlacement();
    window.addEventListener('resize', updatePlacement);
    return () => window.removeEventListener('resize', updatePlacement);
  }, [isOpen, updatePlacement]);

  if (!isOpen || !placement) return null;

  return (
    <ModalPortal showOverlay={false}>
      <div
        role='none'
        className='fixed inset-0 z-40'
        onClick={(e) => {
          onClose();
          forwardBackdropClickToToolbar(e, anchorEl);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      <Popup
        isOpen={isOpen}
        width={width}
        maxHeight={maxHeight}
        position={placement.body}
        trianglePosition={placement.pointer}
        className={clsx('!bg-base-200 no-scrollbar overflow-y-auto overscroll-contain', className)}
        triangleClassName={clsx('!text-base-200', triangleClassName)}
        onDismiss={onClose}
      >
        {children}
      </Popup>
    </ModalPortal>
  );
};

export default ToolbarPopover;
