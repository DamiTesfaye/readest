import { beforeEach, describe, expect, it } from 'vitest';
import { useSettingsStore } from '@/store/settingsStore';
import { openAmpleReadAccount } from '@/services/ampleread/auth/openAccount';

describe('openAmpleReadAccount', () => {
  beforeEach(() => {
    useSettingsStore.setState({
      requestedPanel: null,
      requestedSubPage: null,
      isSettingsDialogOpen: false,
    });
  });

  it('opens Settings on the AmpleRead account page under Integrations', () => {
    openAmpleReadAccount();
    const state = useSettingsStore.getState();
    expect(state.requestedPanel).toBe('Integrations');
    expect(state.requestedSubPage).toBe('ampleread');
    expect(state.isSettingsDialogOpen).toBe(true);
  });
});
