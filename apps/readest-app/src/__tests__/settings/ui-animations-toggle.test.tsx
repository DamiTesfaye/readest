import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import ControlPanel from '@/components/settings/ControlPanel';
import { saveSysSettings } from '@/helpers/settings';
import { DEFAULT_SYSTEM_SETTINGS } from '@/services/constants';
import { getDefaultViewSettings, type Context } from '@/services/settingsService';
import type { SystemSettings } from '@/types/settings';

const settings = {
  ...DEFAULT_SYSTEM_SETTINGS,
  globalViewSettings: getDefaultViewSettings({ isMobile: false, isEink: false } as Context),
} as SystemSettings;

vi.mock('@/helpers/settings', () => ({
  saveSysSettings: vi.fn(),
  saveViewSettings: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({
    envConfig: {},
    appService: {
      isMobileApp: false,
      isAndroidApp: false,
      appPlatform: 'macos',
      hasScreenBrightness: false,
      hasUpdater: false,
    },
  }),
}));

vi.mock('@/store/readerStore', () => ({
  useReaderStore: () => ({
    getView: () => null,
    getViewSettings: () => null,
    recreateViewer: vi.fn(),
  }),
}));

vi.mock('@/store/bookDataStore', () => ({
  useBookDataStore: () => ({ getBookData: () => null }),
}));

vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: () => ({ settings }),
}));

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (key: string) => key,
}));

vi.mock('@/hooks/useResetSettings', () => ({
  useResetViewSettings: () => vi.fn(),
}));

vi.mock('@/app/reader/components/annotator/AnnotationTools', () => ({
  annotationToolQuickActions: [],
}));

vi.mock('@/utils/share', () => ({
  canShareText: () => false,
}));

vi.mock('@/utils/telemetry', () => ({
  optInTelemetry: vi.fn(),
  optOutTelemetry: vi.fn(),
}));

vi.mock('@/components/settings/PageTurnerSettings', () => ({
  default: () => null,
}));

vi.mock('@/components/settings/AnnotationToolbarCustomizer', () => ({
  default: () => null,
}));

const getUIAnimationsToggle = () => {
  const row = screen.getByText('UI Animations').closest('label');
  expect(row).not.toBeNull();
  return within(row as HTMLElement).getByRole('checkbox') as HTMLInputElement;
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  document.documentElement.removeAttribute('data-ui-anim');
});

describe('UI Animations switch', () => {
  it('renders in an Interface section, on by default without OS reduce motion', () => {
    render(<ControlPanel bookKey='book-1' onRegisterReset={vi.fn()} />);
    expect(screen.getByText('Interface')).not.toBeNull();
    expect(getUIAnimationsToggle().checked).toBe(true);
  });

  it('persists false and sets the root attribute when switched off', () => {
    render(<ControlPanel bookKey='book-1' onRegisterReset={vi.fn()} />);
    fireEvent.click(getUIAnimationsToggle());
    expect(saveSysSettings).toHaveBeenCalledWith(expect.anything(), 'uiAnimationsEnabled', false);
    expect(document.documentElement.getAttribute('data-ui-anim')).toBe('off');
  });

  it('persists true and clears the root attribute when switched back on', () => {
    render(<ControlPanel bookKey='book-1' onRegisterReset={vi.fn()} />);
    const toggle = getUIAnimationsToggle();
    fireEvent.click(toggle);
    fireEvent.click(toggle);
    expect(saveSysSettings).toHaveBeenLastCalledWith(
      expect.anything(),
      'uiAnimationsEnabled',
      true,
    );
    expect(document.documentElement.hasAttribute('data-ui-anim')).toBe(false);
  });
});
