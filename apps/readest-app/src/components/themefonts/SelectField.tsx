import clsx from 'clsx';
import React, { useState } from 'react';
import { rangeOptions } from './model';
import { ChevronDownIcon } from './icons';

interface SelectFieldProps {
  label?: string;
  icon?: React.ReactNode;
  value: number;
  min: number;
  max: number;
  step?: number;
  display?: string;
  className?: string;
  onChange: (value: number) => void;
}

const SelectField = ({
  label,
  icon,
  value,
  min,
  max,
  step = 1,
  display,
  className,
  onChange,
}: SelectFieldProps) => {
  const [open, setOpen] = useState(false);

  return (
    <div
      className={clsx('relative flex flex-col justify-end gap-1', className)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') setOpen(false);
      }}
    >
      {label && <span className='text-base-content/70 popover-field-label'>{label}</span>}
      <button
        type='button'
        aria-haspopup='listbox'
        aria-expanded={open}
        className='eink-bordered bg-base-100 border-base-content/10 text-base-content flex h-8 w-full items-center gap-1 rounded-lg border px-1.5'
        onClick={() => setOpen((prev) => !prev)}
      >
        {icon}
        <span className='min-w-0 flex-1 truncate text-center text-xs'>{display ?? value}</span>
        <ChevronDownIcon className='h-[7px] w-[11px] shrink-0' />
      </button>
      {open && (
        <ul
          role='listbox'
          className='eink-bordered bg-base-100 border-base-content/10 not-eink:shadow-lg absolute top-full z-50 mt-1 max-h-44 w-full overflow-y-auto rounded-lg border'
          onMouseDown={(e) => e.preventDefault()}
        >
          {rangeOptions(min, max, step, value).map((option) => (
            <li key={option}>
              <button
                type='button'
                role='option'
                aria-selected={option === value}
                className={clsx(
                  'text-base-content hover:bg-base-200 w-full px-2 py-1 text-center text-sm',
                  option === value && 'bg-base-200 font-semibold',
                )}
                onClick={() => {
                  onChange(option);
                  setOpen(false);
                }}
              >
                {option}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default SelectField;
