const COLORED_ICON_FILL = '#000000';
const MUTED_ICON_FILL = '#D9D9D9';

export const isColoredIconTheme = (_themeName: string, isDarkMode: boolean): boolean => {
  return !isDarkMode;
};

export const getToolbarIconSrc = (icon: string, themeName: string, isDarkMode: boolean): string => {
  return isColoredIconTheme(themeName, isDarkMode)
    ? `/images/toolbar/${icon}.svg`
    : `/images/toolbar/${icon}-muted.svg`;
};

export const getToolbarIconColor = (themeName: string, isDarkMode: boolean): string => {
  return isColoredIconTheme(themeName, isDarkMode) ? COLORED_ICON_FILL : MUTED_ICON_FILL;
};

export const getSelectionIconSrc = (icon: string, isDarkMode: boolean): string => {
  return isDarkMode ? `/images/selection/${icon}-muted.svg` : `/images/selection/${icon}.svg`;
};

export const getSelectionIconColor = (isDarkMode: boolean): string => {
  return isDarkMode ? MUTED_ICON_FILL : COLORED_ICON_FILL;
};

const PAPER_OUTLINE_ICONS = new Set([
  'library',
  'currently-reading',
  'finished-reading',
  'collections',
  'shared',
]);

export const hasPaperOutlineIcon = (icon: string, themeColor?: string): boolean =>
  themeColor === 'paper' && PAPER_OUTLINE_ICONS.has(icon);

export const getHomepageIconSrc = (
  icon: string,
  isDarkMode: boolean,
  active = false,
  themeColor?: string,
): string => {
  if (hasPaperOutlineIcon(icon, themeColor)) return `/images/homepage/paper/${icon}.svg`;
  return !isDarkMode || active
    ? `/images/homepage/${icon}.svg`
    : `/images/homepage/${icon}-muted.svg`;
};

export const getSearchShortcutBadgeSrc = (
  osPlatform: string | undefined,
  isDarkMode: boolean,
): string => {
  const os = osPlatform === 'macos' || osPlatform === 'ios' ? 'mac' : 'windows';
  return `/images/homepage/search_shortcut_key_${os}_${isDarkMode ? 'dark' : 'light'}.svg`;
};

export const getThemeFontsTriggerSrc = (
  size: 'small' | 'large',
  themeName: string,
  isDarkMode: boolean,
): string => {
  return isColoredIconTheme(themeName, isDarkMode)
    ? `/images/theme-fonts/paper-${size}.svg`
    : `/images/theme-fonts/muted-${size}.svg`;
};
