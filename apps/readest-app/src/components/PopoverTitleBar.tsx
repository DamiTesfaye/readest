import clsx from 'clsx';
import React from 'react';

interface PopoverTitleBarProps {
  title: string;
  end?: React.ReactNode;
  showDivider?: boolean;
  className?: string;
  dividerClassName?: string;
}

const PopoverTitleBar: React.FC<PopoverTitleBarProps> = ({
  title,
  end,
  showDivider = false,
  className,
  dividerClassName,
}) => (
  <>
    <div className={clsx('relative flex items-center justify-center', className)}>
      <h2 className='text-base-content popover-title text-center text-sm'>{title}</h2>
      {end ? <div className='absolute inset-y-0 end-0 flex items-center'>{end}</div> : null}
    </div>
    {showDivider ? <div className={clsx('bg-base-content/15 h-px', dividerClassName)} /> : null}
  </>
);

export default PopoverTitleBar;
