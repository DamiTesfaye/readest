import clsx from 'clsx';
import { useState } from 'react';
import { MdCheck } from 'react-icons/md';
import { useTranslation } from '@/hooks/useTranslation';
import { filterFonts } from './model';
import { ChevronDownIcon } from './icons';

interface FontSelectorProps {
  selected: string;
  options: string[];
  onSelect: (font: string) => void;
}

const FontSelector = ({ selected, options, onSelect }: FontSelectorProps) => {
  const _ = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const close = () => {
    setOpen(false);
    setQuery('');
  };

  const matches = filterFonts(options, query);

  return (
    <div
      className='relative'
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) close();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') close();
      }}
    >
      <button
        type='button'
        aria-haspopup='listbox'
        aria-expanded={open}
        className='text-base-content flex h-8 w-full items-center justify-between gap-2 overflow-hidden px-2'
        onClick={() => setOpen((prev) => !prev)}
      >
        <span
          className='min-w-0 flex-1 truncate text-left text-xs'
          style={{ fontFamily: selected || undefined }}
        >
          {selected}
        </span>
        <ChevronDownIcon className='h-[7px] w-[11px] shrink-0' />
      </button>
      {open && (
        <div className='eink-bordered bg-base-100 border-base-content/10 not-eink:shadow-lg absolute left-0 top-full z-50 mt-1 flex w-56 flex-col gap-1 rounded-lg border p-2'>
          <input
            type='search'
            autoFocus
            value={query}
            placeholder={_('Search Fonts')}
            aria-label={_('Search Fonts')}
            className='eink-bordered bg-base-200 text-base-content placeholder:text-base-content/50 w-full rounded-md px-2 py-1 text-sm outline-none'
            onChange={(e) => setQuery(e.target.value)}
          />
          <ul
            role='listbox'
            className='max-h-56 overflow-y-auto'
            onMouseDown={(e) => e.preventDefault()}
          >
            {matches.map((font) => (
              <li key={font}>
                <button
                  type='button'
                  role='option'
                  aria-selected={font === selected}
                  className='text-base-content hover:bg-base-200 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-start'
                  onClick={() => {
                    onSelect(font);
                    close();
                  }}
                >
                  <MdCheck
                    className={clsx('h-4 w-4 shrink-0', font !== selected && 'invisible')}
                    aria-hidden='true'
                  />
                  <span className='truncate text-sm' style={{ fontFamily: font }}>
                    {font}
                  </span>
                </button>
              </li>
            ))}
            {matches.length === 0 && (
              <li className='text-base-content/60 px-2 py-1.5 text-sm'>{_('No fonts found')}</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
};

export default FontSelector;
