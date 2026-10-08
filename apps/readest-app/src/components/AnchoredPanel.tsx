import clsx from 'clsx';
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';

interface AnchoredPanelProps {
  anchorEl: HTMLElement | null;
  isOpen: boolean;
  matchAnchorWidth?: boolean;
  className?: string;
  onDismiss: () => void;
  children: React.ReactNode;
}

const VIEWPORT_MARGIN = 8;
const ANCHOR_GAP = 4;

const AnchoredPanel: React.FC<AnchoredPanelProps> = ({
  anchorEl,
  isOpen,
  matchAnchorWidth = false,
  className,
  onDismiss,
  children,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  const reposition = useCallback(() => {
    const panel = panelRef.current;
    if (!anchorEl || !panel) return;
    const anchor = anchorEl.getBoundingClientRect();
    const { width, height } = panel.getBoundingClientRect();
    const spaceBelow = window.innerHeight - anchor.bottom - ANCHOR_GAP - VIEWPORT_MARGIN;
    const flip = height > spaceBelow && anchor.top - ANCHOR_GAP - height > VIEWPORT_MARGIN;
    setPosition({
      top: flip ? anchor.top - ANCHOR_GAP - height : anchor.bottom + ANCHOR_GAP,
      left: Math.max(
        VIEWPORT_MARGIN,
        Math.min(anchor.left, window.innerWidth - VIEWPORT_MARGIN - width),
      ),
    });
  }, [anchorEl]);

  useLayoutEffect(() => {
    if (!isOpen) {
      setPosition(null);
      return;
    }
    reposition();
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [isOpen, reposition]);

  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || anchorEl?.contains(target)) return;
      onDismiss();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onDismiss();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [anchorEl, isOpen, onDismiss]);

  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <div
      ref={panelRef}
      className={clsx('fixed z-[125]', className)}
      style={{
        top: position?.top ?? 0,
        left: position?.left ?? 0,
        width: matchAnchorWidth ? anchorEl?.getBoundingClientRect().width : undefined,
        visibility: position ? 'visible' : 'hidden',
      }}
    >
      {children}
    </div>,
    document.body,
  );
};

export default AnchoredPanel;
