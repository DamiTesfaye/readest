import React, { useState } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import ControlRow from './ControlRow';
import ThemeCardGrid from './ThemeCardGrid';
import CustomizeSection from './CustomizeSection';

interface ThemeFontsPanelProps {
  bookKey: string;
}

const ThemeFontsPanel: React.FC<ThemeFontsPanelProps> = ({ bookKey }) => {
  const _ = useTranslation();
  const [expanded, setExpanded] = useState(false);

  return (
    <div className='flex flex-col gap-3 py-4'>
      <h2 className='text-base-content text-center text-sm font-semibold'>{_('Theme & Fonts')}</h2>
      <ControlRow bookKey={bookKey} />
      <ThemeCardGrid />
      {expanded ? (
        <CustomizeSection bookKey={bookKey} onCollapse={() => setExpanded(false)} />
      ) : (
        <div className='px-4'>
          <button
            type='button'
            className='eink-bordered bg-base-200 hover:bg-base-300 text-base-content w-full rounded-md py-2 text-sm font-medium'
            onClick={() => setExpanded(true)}
          >
            {_('Customize')}
          </button>
        </div>
      )}
    </div>
  );
};

export default ThemeFontsPanel;
