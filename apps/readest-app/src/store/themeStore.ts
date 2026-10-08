import { create } from 'zustand';
import { addPluginListener, type PluginListener } from '@tauri-apps/api/core';
import { AppService } from '@/types/system';
import { getThemeCode, ThemeCode } from '@/utils/style';
import {
  getSystemColorScheme,
  startAmbientLightUpdates,
  stopAmbientLightUpdates,
  type AmbientLightPayload,
} from '@/utils/bridge';
import {
  isValidThemeMode,
  readStoredAmbientIsDarkMode,
  resolveAmbientIsDarkMode,
} from '@/utils/ambientLight';
import { getCurrentWindow } from '@tauri-apps/api/window';
import {
  CustomTheme,
  Palette,
  ThemeMode,
  resolveThemeName,
  getEffectiveDarkMode,
} from '@/styles/themes';
import { ThemeBackground, applyBackgroundOverride } from '@/styles/backgrounds';
import { EnvConfigType, isWebAppPlatform } from '@/services/environment';
import { SystemSettings } from '@/types/settings';
import { Insets } from '@/types/misc';

declare global {
  interface Window {
    __READEST_IS_EINK?: boolean;
    onNativeColorSchemeChange?: (colorScheme: 'light' | 'dark') => void;
  }
}

interface ThemeState {
  themeMode: ThemeMode;
  themeColor: string;
  themeBackground: ThemeBackground | null;
  highContrast: boolean;
  systemIsDarkMode: boolean;
  ambientIsDarkMode: boolean;
  themeCode: ThemeCode;
  isDarkMode: boolean;
  systemUIVisible: boolean;
  statusBarHeight: number;
  systemUIAlwaysHidden: boolean;
  safeAreaInsets: Insets | null;
  isRoundedWindow: boolean;
  setSystemUIAlwaysHidden: (hidden: boolean) => void;
  setStatusBarHeight: (height: number) => void;
  showSystemUI: () => void;
  dismissSystemUI: () => void;
  getIsDarkMode: () => boolean;
  setThemeMode: (mode: ThemeMode) => void;
  setThemeColor: (color: string) => void;
  setThemeBackground: (background: ThemeBackground | null) => void;
  setHighContrast: (highContrast: boolean) => void;
  updateAppTheme: (color: keyof Palette) => void;
  saveCustomTheme: (
    envConfig: EnvConfigType,
    settings: SystemSettings,
    theme: CustomTheme,
    isDelete?: boolean,
  ) => void;
  handleSystemThemeChange: (isDark: boolean) => void;
  handleAmbientLightChange: (lux: number) => void;
  updateSafeAreaInsets: (insets: Insets) => void;
}

const getInitialThemeMode = (): ThemeMode => {
  if (typeof window !== 'undefined' && localStorage) {
    const stored = localStorage.getItem('themeMode');
    if (isValidThemeMode(stored)) return stored;
  }
  return 'auto';
};

const getInitialThemeBackground = (): ThemeBackground | null => {
  if (typeof window === 'undefined' || !localStorage) return null;
  try {
    return JSON.parse(localStorage.getItem('themeBackground') || 'null');
  } catch {
    return null;
  }
};

const getInitialThemeColor = (): string => {
  if (typeof window !== 'undefined' && localStorage) {
    // Every platform now starts on the dual-mood default appearance; e-ink no
    // longer forces the removed `contrast` theme — it opts into High Contrast
    // instead (see getInitialHighContrast).
    return resolveThemeName(localStorage.getItem('themeColor') || 'default');
  }
  return 'default';
};

// Toggle the root attribute the High Contrast CSS in globals.css keys on.
// Chrome (daisyUI) reacts through that CSS; book content reacts through
// getThemeCode's boostContrast.
const applyHighContrastAttr = (highContrast: boolean) => {
  if (typeof document === 'undefined') return;
  if (highContrast) {
    document.documentElement.setAttribute('data-high-contrast', 'true');
  } else {
    document.documentElement.removeAttribute('data-high-contrast');
  }
};

const getInitialHighContrast = (): boolean => {
  if (typeof window !== 'undefined' && localStorage) {
    const stored = localStorage.getItem('highContrast');
    if (stored !== null) return stored === 'true';
    // Migrate users on the removed `contrast` theme to the High Contrast flag.
    if (localStorage.getItem('themeColor') === 'contrast') return true;
    // E-ink screens default to High Contrast so text stays crisp and theme
    // switching stays a single tap.
    return Boolean(window.__READEST_IS_EINK);
  }
  return false;
};

const getInitialAmbientIsDarkMode = (systemIsDarkMode: boolean): boolean => {
  if (typeof window !== 'undefined' && localStorage) {
    return readStoredAmbientIsDarkMode(localStorage.getItem('ambientIsDarkMode'), systemIsDarkMode);
  }
  return systemIsDarkMode;
};

const persistAmbientIsDarkMode = (isDark: boolean) => {
  if (typeof window !== 'undefined' && localStorage) {
    localStorage.setItem('ambientIsDarkMode', isDark ? 'true' : 'false');
  }
};

const applyDataTheme = (themeColor: string, isDarkMode: boolean) => {
  document.documentElement.setAttribute(
    'data-theme',
    `${themeColor}-${isDarkMode ? 'dark' : 'light'}`,
  );
};

let ambientLightListener: PluginListener | null = null;
let ambientLightListening = false;
let ambientHasLuxReading = false;

const stopAmbientLightListening = async () => {
  if (ambientLightListener) {
    try {
      await ambientLightListener.unregister();
    } catch {
      // ignore unregister races on teardown
    }
    ambientLightListener = null;
  }
  if (ambientLightListening) {
    ambientLightListening = false;
    try {
      await stopAmbientLightUpdates();
    } catch {
      // platform may not support ambient light
    }
  }
  ambientHasLuxReading = false;
};

const startAmbientLightListening = async () => {
  if (ambientLightListening) return;
  try {
    const started = await startAmbientLightUpdates();
    if (!started.success) {
      useThemeStore.getState().setThemeMode('auto');
      return;
    }
    ambientLightListening = true;
    ambientLightListener = await addPluginListener<AmbientLightPayload>(
      'native-bridge',
      'ambient-light',
      (payload) => {
        if (typeof payload?.lux === 'number') {
          useThemeStore.getState().handleAmbientLightChange(payload.lux);
        }
      },
    );
  } catch {
    useThemeStore.getState().setThemeMode('auto');
  }
};

// Start and stop both span several awaits, so overlapping calls could
// interleave: a stop landing after a start leaves the sensor off while we
// still believe we are listening, and two starts leak the first listener.
// Chaining every transition keeps the sensor in step with the last mode set.
let ambientLightSync: Promise<void> = Promise.resolve();

const syncAmbientLightSubscription = (mode: ThemeMode) => {
  ambientLightSync = ambientLightSync.then(() =>
    mode === 'ambient' ? startAmbientLightListening() : stopAmbientLightListening(),
  );
};

export const useThemeStore = create<ThemeState>((set, get) => {
  const initialThemeMode = getInitialThemeMode();
  const initialThemeColor = getInitialThemeColor();
  const initialHighContrast = getInitialHighContrast();
  // Persist the resolved High Contrast value so migration (contrast theme) and
  // the e-ink default survive a later theme change that overwrites themeColor.
  if (
    typeof window !== 'undefined' &&
    localStorage &&
    localStorage.getItem('highContrast') === null
  ) {
    localStorage.setItem('highContrast', initialHighContrast ? 'true' : 'false');
  }
  applyHighContrastAttr(initialHighContrast);
  const initialThemeBackground = getInitialThemeBackground();
  applyBackgroundOverride(initialThemeColor, initialThemeBackground);
  const systemIsDarkMode =
    typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const ambientIsDarkMode = getInitialAmbientIsDarkMode(systemIsDarkMode);
  const isDarkMode = getEffectiveDarkMode(
    initialThemeColor,
    initialThemeMode,
    systemIsDarkMode,
    ambientIsDarkMode,
  );
  const themeCode = getThemeCode();

  return {
    themeMode: initialThemeMode,
    themeColor: initialThemeColor,
    themeBackground: initialThemeBackground,
    highContrast: initialHighContrast,
    systemIsDarkMode,
    ambientIsDarkMode,
    isDarkMode,
    themeCode,
    systemUIVisible: false,
    statusBarHeight: 24,
    systemUIAlwaysHidden: false,
    safeAreaInsets: { top: 0, right: 0, bottom: 0, left: 0 },
    isRoundedWindow: true,
    showSystemUI: () => set({ systemUIVisible: true }),
    dismissSystemUI: () => set({ systemUIVisible: false }),
    setStatusBarHeight: (height: number) => set({ statusBarHeight: height }),
    setSystemUIAlwaysHidden: (hidden: boolean) => set({ systemUIAlwaysHidden: hidden }),
    getIsDarkMode: () => get().isDarkMode,
    setThemeMode: (mode) => {
      if (typeof window !== 'undefined' && localStorage) {
        localStorage.setItem('themeMode', mode);
      }
      const isDarkMode = getEffectiveDarkMode(
        get().themeColor,
        mode,
        get().systemIsDarkMode,
        get().ambientIsDarkMode,
      );
      applyDataTheme(get().themeColor, isDarkMode);
      set({ themeMode: mode, isDarkMode });
      set({ themeCode: getThemeCode() });
      syncAmbientLightSubscription(mode);
    },
    setThemeColor: (color) => {
      if (typeof window !== 'undefined' && localStorage) {
        localStorage.setItem('themeColor', color);
        // Swatches are derived from the theme's own background, so a stored
        // slot means nothing once the theme changes.
        localStorage.removeItem('themeBackground');
      }
      applyBackgroundOverride(color, null);
      const isDarkMode = getEffectiveDarkMode(
        color,
        get().themeMode,
        get().systemIsDarkMode,
        get().ambientIsDarkMode,
      );
      applyDataTheme(color, isDarkMode);
      set({ themeColor: color, themeBackground: null, isDarkMode });
      set({ themeCode: getThemeCode() });
    },
    setThemeBackground: (background) => {
      if (typeof window !== 'undefined' && localStorage) {
        if (background) {
          localStorage.setItem('themeBackground', JSON.stringify(background));
        } else {
          localStorage.removeItem('themeBackground');
        }
      }
      applyBackgroundOverride(get().themeColor, background);
      set({ themeBackground: background });
      // Recompute themeCode so the reader restyles book content with the new bg.
      set({ themeCode: getThemeCode() });
    },
    setHighContrast: (highContrast) => {
      if (typeof window !== 'undefined' && localStorage) {
        localStorage.setItem('highContrast', highContrast ? 'true' : 'false');
      }
      applyHighContrastAttr(highContrast);
      set({ highContrast });
      // Recompute themeCode so the reader restyles book content with the
      // boosted palette (getThemeCode reads the persisted flag).
      set({ themeCode: getThemeCode() });
    },
    updateAppTheme: (color) => {
      if (isWebAppPlatform()) {
        const { palette } = get().themeCode;
        document.querySelector('meta[name="theme-color"]')?.setAttribute('content', palette[color]);
      }
    },
    saveCustomTheme: async (envConfig, settings, theme, isDelete) => {
      const customThemes = settings.globalReadSettings.customThemes || [];
      const index = customThemes.findIndex((t) => t.name === theme.name);
      if (isDelete) {
        if (index > -1) {
          customThemes.splice(index, 1);
        }
      } else {
        if (index > -1) {
          customThemes[index] = theme;
        } else {
          customThemes.push(theme);
        }
      }
      settings.globalReadSettings.customThemes = customThemes;
      localStorage.setItem('customThemes', JSON.stringify(customThemes));
      const appService = await envConfig.getAppService();
      await appService.saveSettings(settings);
    },
    handleSystemThemeChange: (systemIsDarkMode) => {
      const mode = get().themeMode;
      const isDarkMode = getEffectiveDarkMode(
        get().themeColor,
        mode,
        systemIsDarkMode,
        get().ambientIsDarkMode,
      );
      applyDataTheme(get().themeColor, isDarkMode);
      set({ systemIsDarkMode, isDarkMode });
      set({ themeCode: getThemeCode() });
    },
    handleAmbientLightChange: (lux) => {
      if (get().themeMode !== 'ambient') return;
      const previous = ambientHasLuxReading ? get().ambientIsDarkMode : null;
      ambientHasLuxReading = true;
      const nextAmbientIsDark = resolveAmbientIsDarkMode(lux, previous);
      const isDarkMode = getEffectiveDarkMode(
        get().themeColor,
        'ambient',
        get().systemIsDarkMode,
        nextAmbientIsDark,
      );
      if (nextAmbientIsDark === get().ambientIsDarkMode && get().isDarkMode === isDarkMode) {
        return;
      }
      persistAmbientIsDarkMode(nextAmbientIsDark);
      applyDataTheme(get().themeColor, isDarkMode);
      set({ ambientIsDarkMode: nextAmbientIsDark, isDarkMode });
      set({ themeCode: getThemeCode() });
    },
    updateSafeAreaInsets: (insets) => {
      set({ safeAreaInsets: insets });
    },
  };
});

export const loadDataTheme = () => {
  if (typeof localStorage === 'undefined' || typeof document === 'undefined') return;

  const themeMode = localStorage.getItem('themeMode');
  const themeColor = resolveThemeName(localStorage.getItem('themeColor'));
  if (themeMode && themeColor) {
    const systemIsDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const ambientIsDarkMode = getInitialAmbientIsDarkMode(systemIsDarkMode);
    const mode = isValidThemeMode(themeMode) ? themeMode : 'auto';
    const isDarkMode = getEffectiveDarkMode(themeColor, mode, systemIsDarkMode, ambientIsDarkMode);
    applyDataTheme(themeColor, isDarkMode);
    if (localStorage.getItem('highContrast') === 'true') {
      document.documentElement.setAttribute('data-high-contrast', 'true');
    } else {
      document.documentElement.removeAttribute('data-high-contrast');
    }
  }
};

export const initSystemThemeListener = (appService: AppService) => {
  if (typeof window === 'undefined' || !appService) return;

  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const applySystemTheme = (systemIsDarkMode: boolean) => {
    if (typeof window !== 'undefined' && localStorage) {
      localStorage.setItem('systemIsDarkMode', systemIsDarkMode ? 'true' : 'false');
    }
    useThemeStore.getState().handleSystemThemeChange(systemIsDarkMode);
  };
  const updateColorTheme = async () => {
    let systemIsDarkMode;
    if (appService.isIOSApp) {
      const res = await getSystemColorScheme();
      systemIsDarkMode = res.colorScheme === 'dark';
    } else {
      systemIsDarkMode = mediaQuery.matches;
    }
    applySystemTheme(systemIsDarkMode);
  };

  const updateWindowTheme = async () => {
    if (!appService.hasWindow || !appService.isLinuxApp) return;
    const currentWindow = getCurrentWindow();
    const isFullscreen = await currentWindow.isFullscreen();
    const isMaximized = await currentWindow.isMaximized();
    useThemeStore.setState({ isRoundedWindow: !isMaximized && !isFullscreen });
  };

  const syncAmbientForVisibility = () => {
    const mode = useThemeStore.getState().themeMode;
    if (document.visibilityState === 'visible') {
      syncAmbientLightSubscription(mode);
    } else {
      void stopAmbientLightListening();
    }
  };

  mediaQuery?.addEventListener('change', updateColorTheme);
  document.addEventListener('visibilitychange', () => {
    void updateColorTheme();
    syncAmbientForVisibility();
  });
  window.addEventListener('resize', updateWindowTheme);

  // iOS WKWebView never fires the `prefers-color-scheme` media query
  // `change` event while the app stays foregrounded (e.g. toggling dark
  // mode from Control Center), so the native plugin pushes the new
  // appearance through this callback instead.
  if (appService.isIOSApp) {
    window.onNativeColorSchemeChange = (colorScheme) => {
      applySystemTheme(colorScheme === 'dark');
    };
  }

  updateColorTheme();

  // appService.init() has already probed the sensor by the time this runs, so
  // fall back when Ambient Mode was persisted on a device that lacks one.
  const themeMode = useThemeStore.getState().themeMode;
  if (themeMode === 'ambient' && !appService.hasAmbientLightSensor) {
    useThemeStore.getState().setThemeMode('auto');
  } else {
    syncAmbientLightSubscription(themeMode);
  }
};
