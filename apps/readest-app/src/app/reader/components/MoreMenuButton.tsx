import React from 'react';
import { useTranslation } from '@/hooks/useTranslation';

const BAR_SHIFT_PX = 7;

const BARS = [
  { y: 4, closeTransform: `translateY(${BAR_SHIFT_PX}px) rotate(45deg)`, closeOpacity: 1 },
  { y: 11, closeTransform: 'scaleX(0)', closeOpacity: 0 },
  { y: 18, closeTransform: `translateY(-${BAR_SHIFT_PX}px) rotate(-45deg)`, closeOpacity: 1 },
];

interface MoreMenuButtonProps {
  ref?: React.Ref<HTMLButtonElement>;
  isReadingRulerActive: boolean;
  isMoreOpen: boolean;
  iconColor: string;
  onToggleMore: () => void;
  onCloseReadingRuler: () => void;
}

const MoreMenuButton: React.FC<MoreMenuButtonProps> = ({
  ref,
  isReadingRulerActive,
  isMoreOpen,
  iconColor,
  onToggleMore,
  onCloseReadingRuler,
}) => {
  const _ = useTranslation();
  const label = isReadingRulerActive ? _('Close') : _('More');

  return (
    <button
      ref={ref}
      type='button'
      title={label}
      aria-label={label}
      aria-expanded={isReadingRulerActive ? undefined : isMoreOpen}
      data-shape={isReadingRulerActive ? 'close' : 'menu'}
      className='btn btn-ghost hover:bg-transparent h-8 min-h-8 w-8 p-0'
      onClick={isReadingRulerActive ? onCloseReadingRuler : onToggleMore}
    >
      <svg viewBox='0 0 24 24' className='h-4 w-4' aria-hidden='true'>
        {BARS.map((bar) => (
          <rect
            key={bar.y}
            x={3}
            y={bar.y}
            width={18}
            height={2}
            rx={1}
            fill={iconColor}
            className='transition-[transform,opacity] duration-300 ease-out anim-off:transition-none'
            style={{
              transformBox: 'fill-box',
              transformOrigin: 'center',
              transform: isReadingRulerActive ? bar.closeTransform : 'none',
              opacity: isReadingRulerActive ? bar.closeOpacity : 1,
            }}
          />
        ))}
      </svg>
    </button>
  );
};

export default MoreMenuButton;
