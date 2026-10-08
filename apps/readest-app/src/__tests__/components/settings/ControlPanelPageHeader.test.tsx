import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';

const { saveViewSettings } = vi.hoisted(() => ({ saveViewSettings: vi.fn() }));

let viewSettings: Record<string, unknown> = {};

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({ envConfig: {}, appService: { isMobileApp: false } }),
}));

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (s: string) => s,
}));

const stubView = {
  renderer: {
    setAttribute: vi.fn(),
    removeAttribute: vi.fn(),
    hasAttribute: () => false,
    setStyles: vi.fn(),
  },
};

vi.mock('@/store/readerStore', () => ({
  useReaderStore: () => ({
    getView: () => stubView,
    getViews: () => [],
    getViewSettings: () => viewSettings,
    getGridInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
    recreateViewer: vi.fn(),
  }),
}));

vi.mock('@/store/bookDataStore', () => ({
  useBookDataStore: () => ({
    getBookData: () => ({ isFixedLayout: false, book: { format: 'PDF' } }),
  }),
}));

vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: () => ({ settings: { globalViewSettings: {} } }),
}));

vi.mock('@/hooks/useResetSettings', () => ({
  useResetViewSettings: () => vi.fn(),
}));

vi.mock('@/hooks/useEinkMode', () => ({
  useEinkMode: () => ({ applyEinkMode: vi.fn() }),
}));

vi.mock('@/helpers/settings', () => ({
  saveViewSettings,
  saveSysSettings: vi.fn(),
}));

vi.mock('@/services/environment', () => ({
  isTauriAppPlatform: () => false,
}));

vi.mock('@/utils/share', () => ({
  canShareText: () => true,
}));

vi.mock('@/utils/telemetry', () => ({
  optInTelemetry: vi.fn(),
  optOutTelemetry: vi.fn(),
}));

vi.mock('@/components/settings/PageTurnerSettings', () => ({
  default: () => null,
}));

vi.mock('@/utils/style', () => ({ getStyles: () => '' }));
vi.mock('@/utils/config', () => ({ getMaxInlineSize: () => 720 }));

vi.mock('@/app/reader/hooks/useCapturedTurn', () => ({
  applyPageTurnAttributes: vi.fn(),
}));

import ControlPanel from '@/components/settings/ControlPanel';

const headerSwitch = () =>
  document.querySelector(
    '[data-setting-id="settings.layout.showHeader"] input[type="checkbox"]',
  ) as HTMLInputElement | null;

afterEach(() => {
  cleanup();
  saveViewSettings.mockClear();
});

describe('Settings > Control > Show page header', () => {
  it('reflects the current page header setting', () => {
    viewSettings = { showHeader: true, marginTopPx: 44 };
    render(<ControlPanel bookKey='test' onRegisterReset={() => {}} />);

    expect(headerSwitch()?.checked).toBe(true);
  });

  it('saves the page header setting when toggled off', () => {
    viewSettings = { showHeader: true, marginTopPx: 44 };
    render(<ControlPanel bookKey='test' onRegisterReset={() => {}} />);

    fireEvent.click(headerSwitch()!);

    expect(saveViewSettings).toHaveBeenCalledWith({}, 'test', 'showHeader', false, false, false);
  });

  it('makes room for the header band when it is turned back on', () => {
    viewSettings = { showHeader: false, marginTopPx: 16, vertical: false };
    render(<ControlPanel bookKey='test' onRegisterReset={() => {}} />);

    fireEvent.click(headerSwitch()!);

    expect(saveViewSettings).toHaveBeenCalledWith({}, 'test', 'marginTopPx', 44, false, false);
    expect(saveViewSettings).toHaveBeenCalledWith({}, 'test', 'showHeader', true, false, false);
  });
});
