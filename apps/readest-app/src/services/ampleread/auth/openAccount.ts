import { useSettingsStore } from '@/store/settingsStore';

export const openAmpleReadAccount = (): void => {
  const { setRequestedPanel, setRequestedSubPage, setSettingsDialogOpen } =
    useSettingsStore.getState();
  setRequestedPanel('Integrations');
  setRequestedSubPage('ampleread');
  setSettingsDialogOpen(true);
};
