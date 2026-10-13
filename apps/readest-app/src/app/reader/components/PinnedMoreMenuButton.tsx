import clsx from 'clsx';
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import MoreMenuButton from './MoreMenuButton';

const MORPH_DURATION_MS = 300;

interface PinnedMoreMenuButtonProps {
  containerRef: React.RefObject<HTMLElement | null>;
  anchorRef: React.RefObject<HTMLElement | null>;
  isHeaderVisible: boolean;
  isReadingRulerActive: boolean;
  iconColor: string;
  onToggleMore: () => void;
  onCloseReadingRuler: () => void;
}

const PinnedMoreMenuButton: React.FC<PinnedMoreMenuButtonProps> = ({
  containerRef,
  anchorRef,
  isHeaderVisible,
  isReadingRulerActive,
  iconColor,
  onToggleMore,
  onCloseReadingRuler,
}) => {
  const [offset, setOffset] = useState<{ top: number; left: number } | null>(null);
  const [isRetiring, setIsRetiring] = useState(false);
  const wasActiveRef = useRef(isReadingRulerActive);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!isReadingRulerActive || !container) return;
    const measure = () => {
      const anchorRect = anchorRef.current?.getBoundingClientRect();
      if (!anchorRect) return;
      const containerRect = container.getBoundingClientRect();
      setOffset({
        top: anchorRect.top - containerRect.top,
        left: anchorRect.left - containerRect.left,
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, [isReadingRulerActive, containerRef, anchorRef]);

  useEffect(() => {
    const wasActive = wasActiveRef.current;
    wasActiveRef.current = isReadingRulerActive;
    if (isReadingRulerActive) {
      setIsRetiring(false);
      return;
    }
    if (!wasActive) return;
    setIsRetiring(true);
    const timer = setTimeout(() => setIsRetiring(false), MORPH_DURATION_MS);
    return () => clearTimeout(timer);
  }, [isReadingRulerActive]);

  const isVisible = !!offset && !isHeaderVisible && (isReadingRulerActive || isRetiring);

  return (
    <div
      data-visible={String(isVisible)}
      aria-hidden={!isVisible}
      inert={!isVisible}
      className={clsx(
        'absolute z-20 hidden transition-[opacity,visibility] duration-300 sm:block',
        isVisible ? 'visible opacity-100' : 'pointer-events-none invisible opacity-0',
      )}
      style={offset ? { top: `${offset.top}px`, left: `${offset.left}px` } : undefined}
    >
      <MoreMenuButton
        isReadingRulerActive={isReadingRulerActive}
        isMoreOpen={false}
        iconColor={iconColor}
        onToggleMore={onToggleMore}
        onCloseReadingRuler={onCloseReadingRuler}
      />
    </div>
  );
};

export default PinnedMoreMenuButton;
