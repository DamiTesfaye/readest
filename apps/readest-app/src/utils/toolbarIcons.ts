const COLORED_ICON_THEMES = new Set(['paper', 'default']);

export const isColoredIconTheme = (themeName: string, isDarkMode: boolean): boolean => {
  return !isDarkMode && COLORED_ICON_THEMES.has(themeName);
};

export const getToolbarIconSrc = (icon: string, themeName: string, isDarkMode: boolean): string => {
  return isColoredIconTheme(themeName, isDarkMode)
    ? `/images/toolbar/${icon}.svg`
    : `/images/toolbar/${icon}-muted.svg`;
};

export const getSelectionIconSrc = (icon: string, isDarkMode: boolean): string => {
  return isDarkMode ? `/images/selection/${icon}-muted.svg` : `/images/selection/${icon}.svg`;
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
