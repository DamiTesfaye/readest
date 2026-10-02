import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/utils/style', () => ({
  getThemeCode: vi.fn(() => ({
    bg: '#ffffff',
    fg: '#000000',
    primary: '#0066cc',
    palette: { 'base-100': '#fff' },
    isDarkMode: false,
  })),
}));

vi.mock('@/utils/bridge', () => ({
  getSystemColorScheme: vi.fn(() => Promise.resolve({ colorScheme: 'light' })),
  hasAmbientLightSensor: vi.fn(() => Promise.resolve({ available: false })),
  startAmbientLightUpdates: vi.fn(() => Promise.resolve({ success: true })),
  stopAmbientLightUpdates: vi.fn(() => Promise.resolve({ success: true })),
}));

vi.mock('@tauri-apps/api/core', () => ({
  addPluginListener: vi.fn(() => Promise.resolve({ unregister: vi.fn() })),
}));

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: vi.fn(() => ({
    isFullscreen: vi.fn(() => Promise.resolve(false)),
    isMaximized: vi.fn(() => Promise.resolve(false)),
  })),
}));

vi.mock('@/services/environment', () => ({
  isWebAppPlatform: vi.fn(() => false),
}));

import { addPluginListener } from '@tauri-apps/api/core';
import { startAmbientLightUpdates, stopAmbientLightUpdates } from '@/utils/bridge';
import { useThemeStore, loadDataTheme, initSystemThemeListener } from '@/store/themeStore';
import type { AppService } from '@/types/system';

describe('themeStore', () => {
  beforeEach(() => {
    localStorage.clear();
    delete window.onNativeColorSchemeChange;
    delete window.__READEST_IS_EINK;
    // Reset store to initial state
    document.getElementById('theme-background-override')?.remove();
    useThemeStore.setState({
      themeMode: 'auto',
      themeColor: 'default',
      themeBackground: null,
      highContrast: false,
      systemIsDarkMode: false,
      ambientIsDarkMode: false,
      isDarkMode: false,
      systemUIVisible: false,
      statusBarHeight: 24,
      systemUIAlwaysHidden: false,
      safeAreaInsets: { top: 0, right: 0, bottom: 0, left: 0 },
      isRoundedWindow: true,
    });
    // Drop any ambient-light subscription leftover from prior tests.
    useThemeStore.getState().setThemeMode('auto');
    localStorage.clear();
  });

  describe('initial state', () => {
    test('has correct default values', () => {
      const state = useThemeStore.getState();
      expect(state.themeMode).toBe('auto');
      expect(state.themeColor).toBe('default');
      expect(state.highContrast).toBe(false);
      expect(state.systemUIVisible).toBe(false);
      expect(state.statusBarHeight).toBe(24);
      expect(state.systemUIAlwaysHidden).toBe(false);
      expect(state.safeAreaInsets).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
      expect(state.isRoundedWindow).toBe(true);
    });
  });

  describe('setThemeMode', () => {
    test('stores mode in localStorage and sets isDarkMode false for light mode', () => {
      useThemeStore.getState().setThemeMode('light');
      expect(localStorage.getItem('themeMode')).toBe('light');

      const state = useThemeStore.getState();
      expect(state.themeMode).toBe('light');
      expect(state.isDarkMode).toBe(false);
    });

    test('stores mode in localStorage and sets isDarkMode true for dark mode', () => {
      useThemeStore.getState().setThemeMode('dark');
      expect(localStorage.getItem('themeMode')).toBe('dark');

      const state = useThemeStore.getState();
      expect(state.themeMode).toBe('dark');
      expect(state.isDarkMode).toBe(true);
    });

    test('in auto mode, uses systemIsDarkMode to compute isDarkMode', () => {
      // When systemIsDarkMode is false, auto => light
      useThemeStore.setState({ systemIsDarkMode: false });
      useThemeStore.getState().setThemeMode('auto');
      expect(useThemeStore.getState().isDarkMode).toBe(false);

      // When systemIsDarkMode is true, auto => dark
      useThemeStore.setState({ systemIsDarkMode: true });
      useThemeStore.getState().setThemeMode('auto');
      expect(useThemeStore.getState().isDarkMode).toBe(true);
    });

    test('in ambient mode, uses ambientIsDarkMode to compute isDarkMode', () => {
      useThemeStore.setState({ ambientIsDarkMode: true, systemIsDarkMode: false });
      useThemeStore.getState().setThemeMode('ambient');
      expect(useThemeStore.getState().themeMode).toBe('ambient');
      expect(useThemeStore.getState().isDarkMode).toBe(true);
      expect(localStorage.getItem('themeMode')).toBe('ambient');

      useThemeStore.setState({ ambientIsDarkMode: false });
      useThemeStore.getState().setThemeMode('ambient');
      expect(useThemeStore.getState().isDarkMode).toBe(false);
    });

    test('sets data-theme attribute on documentElement', () => {
      useThemeStore.getState().setThemeMode('dark');
      expect(document.documentElement.getAttribute('data-theme')).toBe('default-dark');

      useThemeStore.getState().setThemeMode('light');
      expect(document.documentElement.getAttribute('data-theme')).toBe('default-light');
    });
  });

  describe('setThemeColor', () => {
    test('stores color in localStorage', () => {
      useThemeStore.getState().setThemeColor('starry-night');
      expect(localStorage.getItem('themeColor')).toBe('starry-night');

      const state = useThemeStore.getState();
      expect(state.themeColor).toBe('starry-night');
    });

    test('data-theme for a dual-mood color follows themeMode', () => {
      // A custom/unknown name has no mood lock, so setThemeColor computes dark
      // mode from themeMode (not from any pre-set isDarkMode).
      useThemeStore.setState({ themeMode: 'light' });
      useThemeStore.getState().setThemeColor('ocean');
      expect(document.documentElement.getAttribute('data-theme')).toBe('ocean-light');

      useThemeStore.setState({ themeMode: 'dark' });
      useThemeStore.getState().setThemeColor('ocean');
      expect(document.documentElement.getAttribute('data-theme')).toBe('ocean-dark');
    });

    test('a card theme follows themeMode instead of pinning a mood', () => {
      useThemeStore.setState({ themeMode: 'light' });
      useThemeStore.getState().setThemeColor('starry-night');
      expect(useThemeStore.getState().isDarkMode).toBe(false);
      expect(document.documentElement.getAttribute('data-theme')).toBe('starry-night-light');

      useThemeStore.setState({ themeMode: 'dark' });
      useThemeStore.getState().setThemeColor('starry-night');
      expect(useThemeStore.getState().isDarkMode).toBe(true);
      expect(document.documentElement.getAttribute('data-theme')).toBe('starry-night-dark');
    });

    test('selecting a card theme leaves themeMode untouched', () => {
      useThemeStore.setState({ themeMode: 'auto' });
      useThemeStore.getState().setThemeColor('night-pond');
      expect(useThemeStore.getState().themeMode).toBe('auto');
    });
  });

  describe('setHighContrast', () => {
    test('persists to localStorage and updates state', () => {
      useThemeStore.getState().setHighContrast(true);
      expect(localStorage.getItem('highContrast')).toBe('true');
      expect(useThemeStore.getState().highContrast).toBe(true);

      useThemeStore.getState().setHighContrast(false);
      expect(localStorage.getItem('highContrast')).toBe('false');
      expect(useThemeStore.getState().highContrast).toBe(false);
    });

    test('recomputes themeCode so the reader restyles', async () => {
      const styleModule = await import('@/utils/style');
      const mockGetThemeCode = vi.mocked(styleModule.getThemeCode);
      mockGetThemeCode.mockClear();
      useThemeStore.getState().setHighContrast(true);
      expect(mockGetThemeCode).toHaveBeenCalled();
    });
  });

  describe('setThemeBackground', () => {
    test('persists the background and clears the key when reset to null', () => {
      useThemeStore.getState().setThemeBackground({ kind: 'preset', index: 4 });
      expect(JSON.parse(localStorage.getItem('themeBackground')!)).toEqual({
        kind: 'preset',
        index: 4,
      });
      expect(useThemeStore.getState().themeBackground).toEqual({ kind: 'preset', index: 4 });

      useThemeStore.getState().setThemeBackground(null);
      expect(localStorage.getItem('themeBackground')).toBeNull();
      expect(useThemeStore.getState().themeBackground).toBeNull();
    });

    test('changing theme resets the background (swatches are theme specific)', () => {
      useThemeStore.getState().setThemeBackground({ kind: 'preset', index: 1 });
      useThemeStore.getState().setThemeColor('starry-night');
      expect(useThemeStore.getState().themeBackground).toBeNull();
      expect(localStorage.getItem('themeBackground')).toBeNull();
    });

    test('injects and removes the chrome override style tag', () => {
      useThemeStore.getState().setThemeColor('paper');
      useThemeStore.getState().setThemeBackground({ kind: 'preset', index: 0 });
      expect(document.getElementById('theme-background-override')).not.toBeNull();

      useThemeStore.getState().setThemeBackground(null);
      expect(document.getElementById('theme-background-override')).toBeNull();
    });

    test('recomputes themeCode so the reader restyles', async () => {
      const styleModule = await import('@/utils/style');
      const mockGetThemeCode = vi.mocked(styleModule.getThemeCode);
      mockGetThemeCode.mockClear();
      useThemeStore.getState().setThemeBackground({ kind: 'preset', index: 2 });
      expect(mockGetThemeCode).toHaveBeenCalled();
    });
  });

  describe('handleSystemThemeChange', () => {
    test('updates isDarkMode based on systemIsDarkMode when in auto mode', () => {
      useThemeStore.setState({ themeMode: 'auto' });

      useThemeStore.getState().handleSystemThemeChange(true);
      let state = useThemeStore.getState();
      expect(state.systemIsDarkMode).toBe(true);
      expect(state.isDarkMode).toBe(true);

      useThemeStore.getState().handleSystemThemeChange(false);
      state = useThemeStore.getState();
      expect(state.systemIsDarkMode).toBe(false);
      expect(state.isDarkMode).toBe(false);
    });

    test('isDarkMode stays true when themeMode is dark regardless of system theme', () => {
      useThemeStore.setState({ themeMode: 'dark' });

      useThemeStore.getState().handleSystemThemeChange(false);
      const state = useThemeStore.getState();
      expect(state.systemIsDarkMode).toBe(false);
      expect(state.isDarkMode).toBe(true);
    });

    test('isDarkMode stays false when themeMode is light regardless of system theme', () => {
      useThemeStore.setState({ themeMode: 'light' });

      useThemeStore.getState().handleSystemThemeChange(true);
      const state = useThemeStore.getState();
      expect(state.systemIsDarkMode).toBe(true);
      expect(state.isDarkMode).toBe(false);
    });

    test('updates themeCode when system theme changes to dark', async () => {
      const styleModule = await import('@/utils/style');
      const mockGetThemeCode = vi.mocked(styleModule.getThemeCode);
      const darkThemeCode = {
        bg: '#1a1a1a',
        fg: '#ffffff',
        primary: '#4d9fff',
        palette: {
          'base-100': '#1a1a1a',
          'base-200': '#2a2a2a',
          'base-300': '#3a3a3a',
          'base-content': '#ffffff',
          neutral: '#333333',
          'neutral-content': '#ffffff',
          primary: '#4d9fff',
          secondary: '#6c757d',
          accent: '#4d9fff',
        },
        isDarkMode: true,
      };
      mockGetThemeCode.mockReturnValueOnce(darkThemeCode);

      useThemeStore.setState({ themeMode: 'auto' });
      useThemeStore.getState().handleSystemThemeChange(true);

      expect(useThemeStore.getState().themeCode).toEqual(darkThemeCode);
    });

    test('updates data-theme attribute when system theme changes', () => {
      useThemeStore.setState({ themeMode: 'auto', themeColor: 'default' });
      useThemeStore.getState().handleSystemThemeChange(true);
      expect(document.documentElement.getAttribute('data-theme')).toBe('default-dark');

      useThemeStore.getState().handleSystemThemeChange(false);
      expect(document.documentElement.getAttribute('data-theme')).toBe('default-light');
    });
  });

  describe('handleAmbientLightChange', () => {
    test('updates isDarkMode from lux when in ambient mode', () => {
      useThemeStore.setState({
        themeMode: 'ambient',
        ambientIsDarkMode: false,
        isDarkMode: false,
        themeColor: 'default',
      });
      useThemeStore.getState().handleAmbientLightChange(5);
      expect(useThemeStore.getState().ambientIsDarkMode).toBe(true);
      expect(useThemeStore.getState().isDarkMode).toBe(true);
      expect(localStorage.getItem('ambientIsDarkMode')).toBe('true');
      expect(document.documentElement.getAttribute('data-theme')).toBe('default-dark');
    });

    test('ignores lux updates when not in ambient mode', () => {
      useThemeStore.setState({
        themeMode: 'light',
        ambientIsDarkMode: false,
        isDarkMode: false,
      });
      useThemeStore.getState().handleAmbientLightChange(5);
      expect(useThemeStore.getState().isDarkMode).toBe(false);
      expect(useThemeStore.getState().ambientIsDarkMode).toBe(false);
    });

    test('holds state inside the hysteresis band after first reading', () => {
      useThemeStore.setState({
        themeMode: 'ambient',
        ambientIsDarkMode: true,
        isDarkMode: true,
        themeColor: 'default',
      });
      // First reading establishes dark (low lux)
      useThemeStore.getState().handleAmbientLightChange(5);
      // Mid-band should hold dark
      useThemeStore.getState().handleAmbientLightChange(35);
      expect(useThemeStore.getState().isDarkMode).toBe(true);
      // High lux switches to light
      useThemeStore.getState().handleAmbientLightChange(80);
      expect(useThemeStore.getState().isDarkMode).toBe(false);
    });
  });

  describe('ambient light subscription', () => {
    // The bridge calls are async, so the store has to serialize them. Drain
    // enough macrotasks that any settled chain has run to completion.
    const settle = async () => {
      for (let i = 0; i < 10; i++) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    };

    let calls: string[] = [];

    const resolveImmediately = () => {
      vi.mocked(startAmbientLightUpdates).mockImplementation(async () => {
        calls.push('start');
        return { success: true };
      });
      vi.mocked(stopAmbientLightUpdates).mockImplementation(async () => {
        calls.push('stop');
        return { success: true };
      });
    };

    // The outer beforeEach also drives setThemeMode, so a deferred mock left
    // installed by one test would block the next test's subscription chain.
    afterEach(resolveImmediately);

    beforeEach(async () => {
      calls = [];
      resolveImmediately();
      vi.mocked(addPluginListener).mockImplementation(async () =>
        Promise.resolve({ unregister: vi.fn(() => Promise.resolve()) } as never),
      );
      useThemeStore.getState().setThemeMode('auto');
      await settle();
      calls = [];
      vi.mocked(addPluginListener).mockClear();
    });

    test('re-enabling while a stop is still in flight leaves the sensor running', async () => {
      useThemeStore.getState().setThemeMode('ambient');
      await settle();
      calls = [];

      // Hold the stop open so the ambient -> auto -> ambient toggle overlaps.
      let releaseStop = () => {};
      vi.mocked(stopAmbientLightUpdates).mockImplementation(
        () =>
          new Promise((resolve) => {
            releaseStop = () => {
              calls.push('stop');
              resolve({ success: true });
            };
          }),
      );

      useThemeStore.getState().setThemeMode('auto');
      useThemeStore.getState().setThemeMode('ambient');
      await settle();
      releaseStop();
      await settle();

      // The start must land after the stop resolves, otherwise the native
      // sensor ends up off while the store still thinks it is listening.
      expect(calls).toEqual(['stop', 'start']);
    });

    test('does not start the sensor twice when toggled before the first start settles', async () => {
      useThemeStore.getState().setThemeMode('ambient');
      useThemeStore.getState().setThemeMode('auto');
      useThemeStore.getState().setThemeMode('ambient');
      await settle();

      expect(calls).toEqual(['start', 'stop', 'start']);
      // One live listener: each start registers one, each stop unregisters one.
      expect(vi.mocked(addPluginListener).mock.calls).toHaveLength(2);
    });
  });

  describe('showSystemUI / dismissSystemUI', () => {
    test('showSystemUI sets systemUIVisible to true', () => {
      useThemeStore.getState().showSystemUI();
      expect(useThemeStore.getState().systemUIVisible).toBe(true);
    });

    test('dismissSystemUI sets systemUIVisible to false', () => {
      useThemeStore.setState({ systemUIVisible: true });
      useThemeStore.getState().dismissSystemUI();
      expect(useThemeStore.getState().systemUIVisible).toBe(false);
    });
  });

  describe('setStatusBarHeight', () => {
    test('updates statusBarHeight', () => {
      useThemeStore.getState().setStatusBarHeight(48);
      expect(useThemeStore.getState().statusBarHeight).toBe(48);
    });
  });

  describe('setSystemUIAlwaysHidden', () => {
    test('updates systemUIAlwaysHidden', () => {
      useThemeStore.getState().setSystemUIAlwaysHidden(true);
      expect(useThemeStore.getState().systemUIAlwaysHidden).toBe(true);

      useThemeStore.getState().setSystemUIAlwaysHidden(false);
      expect(useThemeStore.getState().systemUIAlwaysHidden).toBe(false);
    });
  });

  describe('updateSafeAreaInsets', () => {
    test('updates safeAreaInsets', () => {
      const insets = { top: 10, right: 5, bottom: 20, left: 5 };
      useThemeStore.getState().updateSafeAreaInsets(insets);
      expect(useThemeStore.getState().safeAreaInsets).toEqual(insets);
    });
  });

  describe('loadDataTheme', () => {
    test('sets data-theme attribute when localStorage has themeMode and themeColor', () => {
      localStorage.setItem('themeMode', 'dark');
      localStorage.setItem('themeColor', 'starry-night');
      loadDataTheme();
      expect(document.documentElement.getAttribute('data-theme')).toBe('starry-night-dark');
    });

    test('migrates a removed theme name to the default appearance', () => {
      localStorage.setItem('themeMode', 'dark');
      localStorage.setItem('themeColor', 'sepia');
      loadDataTheme();
      expect(document.documentElement.getAttribute('data-theme')).toBe('default-dark');
    });

    test('sets light theme in auto mode when system prefers light', () => {
      localStorage.setItem('themeMode', 'auto');
      localStorage.setItem('themeColor', 'default');
      // jsdom matchMedia mock returns matches: false by default (from vitest.setup.ts)
      loadDataTheme();
      expect(document.documentElement.getAttribute('data-theme')).toBe('default-light');
    });

    test('does nothing when themeMode is not in localStorage', () => {
      localStorage.setItem('themeColor', 'default');
      document.documentElement.removeAttribute('data-theme');
      loadDataTheme();
      expect(document.documentElement.getAttribute('data-theme')).toBeNull();
    });

    test('applies the default appearance when only themeMode is stored', () => {
      // themeColor resolves to `default` when absent, so a stored mode alone is
      // enough to apply the default appearance.
      localStorage.setItem('themeMode', 'dark');
      document.documentElement.removeAttribute('data-theme');
      loadDataTheme();
      expect(document.documentElement.getAttribute('data-theme')).toBe('default-dark');
    });
  });

  describe('initSystemThemeListener', () => {
    const makeAppService = (overrides: Partial<AppService> = {}) =>
      ({
        isIOSApp: false,
        isAndroidApp: false,
        hasWindow: false,
        isLinuxApp: false,
        hasAmbientLightSensor: false,
        ...overrides,
      }) as AppService;

    test('registers window.onNativeColorSchemeChange on iOS', () => {
      initSystemThemeListener(makeAppService({ isIOSApp: true }));
      expect(typeof window.onNativeColorSchemeChange).toBe('function');
    });

    test('does not register the native callback on non-iOS platforms', () => {
      initSystemThemeListener(makeAppService({ isIOSApp: false }));
      expect(window.onNativeColorSchemeChange).toBeUndefined();
    });

    test('native color scheme change updates the theme store in auto mode', () => {
      useThemeStore.setState({ themeMode: 'auto', systemIsDarkMode: false, isDarkMode: false });
      initSystemThemeListener(makeAppService({ isIOSApp: true }));

      window.onNativeColorSchemeChange!('dark');
      expect(useThemeStore.getState().systemIsDarkMode).toBe(true);
      expect(useThemeStore.getState().isDarkMode).toBe(true);
      expect(localStorage.getItem('systemIsDarkMode')).toBe('true');

      window.onNativeColorSchemeChange!('light');
      expect(useThemeStore.getState().systemIsDarkMode).toBe(false);
      expect(useThemeStore.getState().isDarkMode).toBe(false);
      expect(localStorage.getItem('systemIsDarkMode')).toBe('false');
    });
  });

  describe('getIsDarkMode', () => {
    test('returns the current isDarkMode value', () => {
      useThemeStore.setState({ isDarkMode: true });
      expect(useThemeStore.getState().getIsDarkMode()).toBe(true);

      useThemeStore.setState({ isDarkMode: false });
      expect(useThemeStore.getState().getIsDarkMode()).toBe(false);
    });
  });
});

// Initialization + migration require a fresh store instance that reads
// localStorage/window set up before the module loads. vi.resetModules() plus a
// dynamic import gives that; the vi.mock calls above are hoisted and apply to
// the re-imported module too.
describe('themeStore initialization', () => {
  beforeEach(() => {
    localStorage.clear();
    delete window.__READEST_IS_EINK;
    vi.resetModules();
  });

  const loadFreshStore = async () => {
    const mod = await import('@/store/themeStore');
    return mod.useThemeStore.getState();
  };

  test('fresh non-eink start: default theme, high contrast off', async () => {
    const state = await loadFreshStore();
    expect(state.themeColor).toBe('default');
    expect(state.highContrast).toBe(false);
    expect(localStorage.getItem('highContrast')).toBe('false');
  });

  test('fresh e-ink start: default theme, high contrast on', async () => {
    window.__READEST_IS_EINK = true;
    const state = await loadFreshStore();
    expect(state.themeColor).toBe('default');
    expect(state.highContrast).toBe(true);
    expect(localStorage.getItem('highContrast')).toBe('true');
  });

  test('migrates a persisted contrast theme to default + high contrast on', async () => {
    localStorage.setItem('themeColor', 'contrast');
    const state = await loadFreshStore();
    expect(state.themeColor).toBe('default');
    expect(state.highContrast).toBe(true);
  });

  test('an explicit stored highContrast value overrides the e-ink default', async () => {
    window.__READEST_IS_EINK = true;
    localStorage.setItem('highContrast', 'false');
    const state = await loadFreshStore();
    expect(state.highContrast).toBe(false);
  });
});
