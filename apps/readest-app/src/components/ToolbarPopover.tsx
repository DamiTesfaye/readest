import clsx from 'clsx';
import React, { useCallback, useEffect, useState } from 'react';
import { Position, getPopupPosition } from '@/utils/sel';
import { POPOVER_EDGE_PADDING, getToolbarAnchorPosition } from '@/utils/popover';
import ModalPortal from '@/components/ModalPortal';
import Popup from '@/components/Popup';

interface ToolbarPopoverProps {
  isOpen: boolean;
  anchorEl: HTMLElement | null;
  width: number;
  maxHeight?: number;
  className?: string;
  triangleClassName?: string;
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
  onClose,
  children,
}) => {
  const [placement, setPlacement] = useState<{ body: Position; pointer: Position } | null>(null);

  const updatePlacement = useCallback(() => {
    if (!anchorEl) return;
    const rect = anchorEl.getBoundingClientRect();
    const pointer = getToolbarAnchorPosition(rect);
    const viewport = { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
    const body = getPopupPosition(pointer, viewport, width, 0, POPOVER_EDGE_PADDING);
    setPlacement({ body, pointer });
  }, [anchorEl, width]);

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
        onClick={onClose}
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
        className={clsx('!bg-base-200', className)}
        triangleClassName={clsx('!text-base-200', triangleClassName)}
        onDismiss={onClose}
      >
        {children}
      </Popup>
    </ModalPortal>
  );
};

export default ToolbarPopover;
