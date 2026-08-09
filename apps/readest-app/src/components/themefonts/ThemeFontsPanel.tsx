import React, { useState } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import PopoverTitleBar from '@/components/PopoverTitleBar';
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
    <div className='flex flex-col gap-3 pb-5 pt-4'>
      <PopoverTitleBar title={_('Theme & Fonts')} showDivider dividerClassName='mx-4' />
      <ControlRow bookKey={bookKey} />
      <div className='mt-2'>
        <ThemeCardGrid />
      </div>
      {expanded ? (
        <CustomizeSection bookKey={bookKey} onCollapse={() => setExpanded(false)} />
      ) : (
        <div className='mt-4 flex justify-center px-4'>
          <button
            type='button'
            className='eink-bordered bg-base-300 hover:bg-base-content/10 text-base-content flex w-2/3 items-center justify-center gap-1.5 rounded-md py-1.5 text-sm font-black [font-family:"Avenir_Next_LT_Pro"]'
            onClick={() => setExpanded(true)}
          >
            <img src='/images/theme-fonts/brush.svg' alt='' className='h-4 w-4' />
            {_('Customize')}
          </button>
        </div>
      )}
    </div>
  );
};

export default ThemeFontsPanel;
