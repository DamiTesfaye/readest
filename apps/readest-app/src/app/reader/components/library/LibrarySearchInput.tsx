import React from 'react';
import { MdSearch } from 'react-icons/md';

import { useTranslation } from '@/hooks/useTranslation';

interface LibrarySearchInputProps {
  value: string;
  onChange: (value: string) => void;
  onEscape: () => void;
}

const LibrarySearchInput: React.FC<LibrarySearchInputProps> = ({ value, onChange, onEscape }) => {
  const _ = useTranslation();

  return (
    <div
      className='text-base-content/60 flex items-center gap-1.5'
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <MdSearch aria-hidden='true' className='h-4 w-4 shrink-0' />
      <input
        type='text'
        value={value}
        placeholder={_('Search')}
        aria-label={_('Search')}
        className='placeholder:text-base-content/50 text-base-content w-24 border-0 bg-transparent p-0 text-sm outline-none [font-family:"Avenir_Next_LT_Pro"] focus:outline-none focus:ring-0'
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== 'Escape') return;
          e.stopPropagation();
          if (value) {
            onChange('');
          } else {
            onEscape();
          }
        }}
      />
    </div>
  );
};

export default LibrarySearchInput;
