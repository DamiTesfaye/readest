import React from 'react';

import { useSidebarStore } from '@/store/sidebarStore';
import { useThemeStore } from '@/store/themeStore';
import { useTranslation } from '@/hooks/useTranslation';
import { getToolbarIconSrc } from '@/utils/toolbarIcons';
import Button from '@/components/Button';

interface SidebarTogglerProps {
  bookKey: string;
}

const SidebarToggler: React.FC<SidebarTogglerProps> = ({ bookKey }) => {
  const _ = useTranslation();
  const { sideBarBookKey, isSideBarVisible, setSideBarBookKey, toggleSideBar } = useSidebarStore();
  const { themeColor, isDarkMode } = useThemeStore();
  const handleToggleSidebar = () => {
    if (sideBarBookKey === bookKey) {
      toggleSideBar();
    } else {
      setSideBarBookKey(bookKey);
      if (!isSideBarVisible) toggleSideBar();
    }
  };
  return (
    <Button
      icon={
        <img
          src={getToolbarIconSrc('sidebar', themeColor, isDarkMode)}
          alt=''
          className='h-5 w-5 object-contain'
        />
      }
      onClick={handleToggleSidebar}
      label={_('Toggle Sidebar')}
    />
  );
};

export default SidebarToggler;
