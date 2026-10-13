import clsx from 'clsx';
import React, { useRef } from 'react';
import { MdArrowBackIosNew } from 'react-icons/md';
import { useTranslation } from '@/hooks/useTranslation';
import { useTrafficLight } from '@/hooks/useTrafficLight';
import { useResponsiveSize } from '@/hooks/useResponsiveSize';
import SidebarToggler from '../SidebarToggler';

const SidebarHeader: React.FC<{
  bookKey: string;
  onClose: () => void;
}> = ({ bookKey, onClose }) => {
  const _ = useTranslation();
  const headerRef = useRef<HTMLDivElement>(null);
  const { isTrafficLightVisible } = useTrafficLight(headerRef);
  const iconSize22 = useResponsiveSize(22);

  return (
    <div
      ref={headerRef}
      className={clsx(
        'sidebar-header flex h-11 items-center',
        isTrafficLightVisible ? 'ps-1.5 sm:ps-20' : 'ps-1.5',
      )}
      dir='ltr'
    >
      <button
        title={_('Close')}
        onClick={onClose}
        className={'btn btn-ghost btn-circle flex h-6 min-h-6 w-6 hover:bg-transparent sm:hidden'}
      >
        <MdArrowBackIosNew size={iconSize22} />
      </button>
      <div className='hidden sm:flex'>
        <SidebarToggler bookKey={bookKey} />
      </div>
    </div>
  );
};

export default SidebarHeader;
