import React, { useEffect, useState } from 'react';
import { RiFontSize } from 'react-icons/ri';

import { useReaderStore } from '@/store/readerStore';
import { useTranslation } from '@/hooks/useTranslation';
import { useSettingsStore } from '@/store/settingsStore';
import { eventDispatcher } from '@/utils/event';
import Button from '@/components/Button';
import Dialog from '@/components/Dialog';
import ThemeFontsPanel from '@/components/themefonts/ThemeFontsPanel';

interface SettingsTogglerProps {
  bookKey: string;
}

const SettingsToggler: React.FC<SettingsTogglerProps> = ({ bookKey }) => {
  const _ = useTranslation();
  const { setHoveredBookKey } = useReaderStore();
  const { isSettingsDialogOpen, setSettingsDialogOpen } = useSettingsStore();
  const { setSettingsDialogBookKey } = useSettingsStore();
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  useEffect(() => {
    const handleOpenThemeFonts = (e: CustomEvent) => {
      if (e.detail?.bookKey && e.detail.bookKey !== bookKey) return;
      setIsSheetOpen(true);
    };
    eventDispatcher.on('open-theme-fonts', handleOpenThemeFonts);
    return () => {
      eventDispatcher.off('open-theme-fonts', handleOpenThemeFonts);
    };
  }, [bookKey]);

  const handleToggleSettings = () => {
    setHoveredBookKey('');
    if (window.innerWidth < 640) {
      setIsSheetOpen(true);
      return;
    }
    setSettingsDialogBookKey(bookKey);
    setSettingsDialogOpen(!isSettingsDialogOpen);
  };

  return (
    <>
      <Button
        icon={<RiFontSize className='text-base-content' />}
        onClick={handleToggleSettings}
        label={_('Theme & Fonts')}
      ></Button>
      {isSheetOpen && (
        <Dialog
          isOpen={isSheetOpen}
          title={_('Theme & Fonts')}
          snapHeight={0.75}
          useOverlayScroll
          onClose={() => setIsSheetOpen(false)}
        >
          <ThemeFontsPanel bookKey={bookKey} />
        </Dialog>
      )}
    </>
  );
};

export default SettingsToggler;
