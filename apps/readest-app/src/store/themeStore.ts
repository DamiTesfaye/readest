import { create } from 'zustand';
import { AppService } from '@/types/system';
import { getThemeCode, ThemeCode } from '@/utils/style';
import { getSystemColorScheme } from '@/utils/bridge';
import { getCurrentWindow } from '@tauri-apps/api/window';
import {
  CustomTheme,
  Palette,
  ThemeMode,
  resolveThemeName,
  getEffectiveDarkMode,
} from '@/styles/themes';
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
  systemIsDarkMode: boolean;
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
  updateAppTheme: (color: keyof Palette) => void;
  saveCustomTheme: (
    envConfig: EnvConfigType,
    settings: SystemSettings,
    theme: CustomTheme,
    isDelete?: boolean,
  ) => void;
  handleSystemThemeChange: (isDark: boolean) => void;
  updateSafeAreaInsets: (insets: Insets) => void;
}

const getInitialThemeMode = (): ThemeMode => {
  if (typeof window !== 'undefined' && localStorage) {
    return (localStorage.getItem('themeMode') as ThemeMode) || 'auto';
  }
  return 'auto';
};

const getInitialThemeColor = (): string => {
  if (typeof window !== 'undefined' && localStorage) {
    const defaultColor = window.__READEST_IS_EINK ? 'contrast' : 'paper';
    return resolveThemeName(localStorage.getItem('themeColor') || defaultColor);
  }
  return 'paper';
};

export const useThemeStore = create<ThemeState>((set, get) => {
  const initialThemeMode = getInitialThemeMode();
  const initialThemeColor = getInitialThemeColor();
  const systemIsDarkMode =
    typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDarkMode = getEffectiveDarkMode(initialThemeColor, initialThemeMode, systemIsDarkMode);
  const themeCode = getThemeCode();

  return {
    themeMode: initialThemeMode,
    themeColor: initialThemeColor,
    systemIsDarkMode,
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
      const isDarkMode = getEffectiveDarkMode(get().themeColor, mode, get().systemIsDarkMode);
      document.documentElement.setAttribute(
        'data-theme',
        `${get().themeColor}-${isDarkMode ? 'dark' : 'light'}`,
      );
      set({ themeMode: mode, isDarkMode });
      set({ themeCode: getThemeCode() });
    },
    setThemeColor: (color) => {
      if (typeof window !== 'undefined' && localStorage) {
        localStorage.setItem('themeColor', color);
      }
      const isDarkMode = getEffectiveDarkMode(color, get().themeMode, get().systemIsDarkMode);
      document.documentElement.setAttribute(
        'data-theme',
        `${color}-${isDarkMode ? 'dark' : 'light'}`,
      );
      set({ themeColor: color, isDarkMode });
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
      const isDarkMode = getEffectiveDarkMode(get().themeColor, mode, systemIsDarkMode);
      document.documentElement.setAttribute(
        'data-theme',
        `${get().themeColor}-${isDarkMode ? 'dark' : 'light'}`,
      );
      set({ systemIsDarkMode, isDarkMode });
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
    const isDarkMode = getEffectiveDarkMode(themeColor, themeMode as ThemeMode, systemIsDarkMode);
    document.documentElement.setAttribute(
      'data-theme',
      `${themeColor}-${isDarkMode ? 'dark' : 'light'}`,
    );
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

  mediaQuery?.addEventListener('change', updateColorTheme);
  document.addEventListener('visibilitychange', updateColorTheme);
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
};
