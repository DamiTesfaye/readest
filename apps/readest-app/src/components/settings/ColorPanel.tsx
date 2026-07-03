import React, { useState, useEffect } from 'react';
import {
  applyCustomTheme,
  CustomTheme,
  generateDarkPalette,
  generateLightPalette,
  Theme,
  themes,
} from '@/styles/themes';
import { useEnv } from '@/context/EnvContext';
import { useThemeStore } from '@/store/themeStore';
import { useReaderStore } from '@/store/readerStore';
import { useTranslation } from '@/hooks/useTranslation';
import { useSettingsStore } from '@/store/settingsStore';
import { useResetViewSettings } from '@/hooks/useResetSettings';
import { saveViewSettings } from '@/helpers/settings';
import { manageSyntaxHighlighting } from '@/utils/highlightjs';
import { SettingsPanelPanelProp } from './SettingsDialog';
import { useAtmosphereStore } from '@/store/atmosphereStore';
import { DefaultHighlightColor, HighlightColor, UserHighlightColor } from '@/types/book';
import clsx from 'clsx';
import { SettingLabel } from './primitives';
import { HIGHLIGHT_COLOR_HEX } from '@/services/constants';
import ThemeEditor from './color/ThemeEditor';
import ThemeModeSelector from './color/ThemeModeSelector';
import ThemeColorSelector from './color/ThemeColorSelector';
import HighlightColorsEditor from './color/HighlightColorsEditor';
import CodeHighlightingSettings from './color/CodeHighlightingSettings';
import ReadingRulerSettings from './color/ReadingRulerSettings';

const ColorPanel: React.FC<SettingsPanelPanelProp> = ({ bookKey, onRegisterReset }) => {
  const _ = useTranslation();
  const { themeMode, themeColor, isDarkMode, setThemeMode, setThemeColor, saveCustomTheme } =
    useThemeStore();
  const { envConfig } = useEnv();
  const { settings, setSettings, saveSettings } = useSettingsStore();
  const { getView, getViewSettings } = useReaderStore();
  const viewSettings = getViewSettings(bookKey) || settings.globalViewSettings;
  // Fixed-mood themes (scene themes, sepia, ink) render in one mode only;
  // hide the light/dark/auto toggle while one is active.
  const activeThemeMood = themes.find((t) => t.name === themeColor)?.mood;

  const [invertImgColorInDark, setInvertImgColorInDark] = useState(
    viewSettings.invertImgColorInDark,
  );
  const [editTheme, setEditTheme] = useState<CustomTheme | null>(null);
  const [customThemes, setCustomThemes] = useState<Theme[]>([]);
  const [showCustomThemeEditor, setShowCustomThemeEditor] = useState(false);
  const [overrideColor, setOverrideColor] = useState(viewSettings.overrideColor);
  const [codeHighlighting, setcodeHighlighting] = useState(viewSettings.codeHighlighting);
  const [codeLanguage, setCodeLanguage] = useState(viewSettings.codeLanguage);
  const [highlightOpacity, setHighlightOpacity] = useState(viewSettings.highlightOpacity ?? 0.3);
  const [customHighlightColors, setCustomHighlightColors] = useState(
    settings.globalReadSettings.customHighlightColors,
  );
  const [userHighlightColors, setUserHighlightColors] = useState<UserHighlightColor[]>(
    settings.globalReadSettings.userHighlightColors ?? [],
  );
  const [defaultHighlightLabels, setDefaultHighlightLabels] = useState<
    Partial<Record<DefaultHighlightColor, string>>
  >(settings.globalReadSettings.defaultHighlightLabels ?? {});

  const [readingRulerEnabled, setReadingRulerEnabled] = useState(viewSettings.readingRulerEnabled);
  const [readingRulerLines, setReadingRulerLines] = useState(viewSettings.readingRulerLines);
  const [readingRulerOpacity, setReadingRulerOpacity] = useState(viewSettings.readingRulerOpacity);
  const [readingRulerColor, setReadingRulerColor] = useState(viewSettings.readingRulerColor);

  const resetToDefaults = useResetViewSettings();
  const { deactivate: deactivateAtmosphere } = useAtmosphereStore();

  const handleReset = () => {
    resetToDefaults({
      overrideColor: setOverrideColor,
      invertImgColorInDark: setInvertImgColorInDark,
      highlightOpacity: setHighlightOpacity,
      codeHighlighting: setcodeHighlighting,
      codeLanguage: setCodeLanguage,
      readingRulerEnabled: setReadingRulerEnabled,
      readingRulerLines: setReadingRulerLines,
      readingRulerOpacity: setReadingRulerOpacity,
    });
    setThemeColor('paper');
    setThemeMode('auto');
    setCustomHighlightColors(HIGHLIGHT_COLOR_HEX);
    setUserHighlightColors([]);
    setDefaultHighlightLabels({});
    deactivateAtmosphere();
  };

  useEffect(() => {
    onRegisterReset(handleReset);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (invertImgColorInDark === viewSettings.invertImgColorInDark) return;
    saveViewSettings(envConfig, bookKey, 'invertImgColorInDark', invertImgColorInDark);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invertImgColorInDark]);

  useEffect(() => {
    if (overrideColor === viewSettings.overrideColor) return;
    saveViewSettings(envConfig, bookKey, 'overrideColor', overrideColor);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overrideColor]);

  useEffect(() => {
    if (highlightOpacity === viewSettings.highlightOpacity) return;
    saveViewSettings(envConfig, bookKey, 'highlightOpacity', highlightOpacity);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightOpacity]);

  useEffect(() => {
    let update = false;
    if (codeHighlighting !== viewSettings.codeHighlighting) {
      saveViewSettings(envConfig, bookKey, 'codeHighlighting', codeHighlighting);
      update = true;
    }
    if (codeLanguage !== viewSettings.codeLanguage) {
      saveViewSettings(envConfig, bookKey, 'codeLanguage', codeLanguage);
      update = true;
    }
    if (!update) return;
    const view = getView(bookKey);
    if (!view) return;
    const docs = view.renderer.getContents();
    docs.forEach(({ doc }) => manageSyntaxHighlighting(doc, viewSettings));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codeHighlighting, codeLanguage]);

  useEffect(() => {
    saveViewSettings(envConfig, bookKey, 'readingRulerEnabled', readingRulerEnabled, false, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readingRulerEnabled]);

  useEffect(() => {
    saveViewSettings(envConfig, bookKey, 'readingRulerLines', readingRulerLines, false, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readingRulerLines]);

  useEffect(() => {
    saveViewSettings(envConfig, bookKey, 'readingRulerOpacity', readingRulerOpacity, false, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readingRulerOpacity]);

  useEffect(() => {
    saveViewSettings(envConfig, bookKey, 'readingRulerColor', readingRulerColor, false, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readingRulerColor]);

  useEffect(() => {
    const customThemes = settings.globalReadSettings.customThemes ?? [];
    setCustomThemes(
      customThemes.map((customTheme) => ({
        name: customTheme.name,
        label: customTheme.label,
        colors: {
          light: generateLightPalette(customTheme.colors.light),
          dark: generateDarkPalette(customTheme.colors.dark),
        },
        isCustomizale: true,
      })),
    );
  }, [settings]);

  const handleSaveCustomTheme = (customTheme: CustomTheme) => {
    applyCustomTheme(customTheme);
    saveCustomTheme(envConfig, settings, customTheme);
    setSettings({ ...settings });
    setThemeColor(customTheme.name);
    setShowCustomThemeEditor(false);
  };

  const handleDeleteCustomTheme = (customTheme: CustomTheme) => {
    saveCustomTheme(envConfig, settings, customTheme, true);
    setSettings({ ...settings });
    setThemeColor('paper');
    setShowCustomThemeEditor(false);
  };

  const handleEditTheme = (name: string) => {
    const customTheme = settings.globalReadSettings.customThemes.find((t) => t.name === name);
    if (customTheme) {
      setEditTheme(customTheme);
      setShowCustomThemeEditor(true);
    }
  };

  const handleCustomHighlightColorsChange = (colors: Record<HighlightColor, string>) => {
    setCustomHighlightColors(colors);
    settings.globalReadSettings.customHighlightColors = colors;
    setSettings(settings);
    saveSettings(envConfig, settings);
  };

  const handleUserHighlightColorsChange = (colors: UserHighlightColor[]) => {
    setUserHighlightColors(colors);
    settings.globalReadSettings.userHighlightColors = colors;
    setSettings(settings);
    saveSettings(envConfig, settings);
  };

  const handleDefaultHighlightLabelsChange = (
    labels: Partial<Record<DefaultHighlightColor, string>>,
  ) => {
    setDefaultHighlightLabels(labels);
    settings.globalReadSettings.defaultHighlightLabels = labels;
    setSettings(settings);
    saveSettings(envConfig, settings);
  };

  return (
    <div className='my-4 w-full space-y-6'>
      {showCustomThemeEditor ? (
        <ThemeEditor
          customTheme={editTheme}
          onSave={handleSaveCustomTheme}
          onDelete={handleDeleteCustomTheme}
          onCancel={() => setShowCustomThemeEditor(false)}
        />
      ) : (
        <>
          {!activeThemeMood && (
            <ThemeModeSelector
              themeMode={themeMode}
              onThemeModeChange={setThemeMode}
              data-setting-id='settings.color.themeMode'
            />
          )}

          <label
            data-setting-id='settings.color.invertImageInDarkMode'
            className={clsx(
              'flex items-center justify-between px-4',
              !isDarkMode && 'cursor-not-allowed opacity-50',
              isDarkMode && 'cursor-pointer',
            )}
          >
            <SettingLabel>{_('Invert Image In Dark Mode')}</SettingLabel>
            <input
              type='checkbox'
              className='toggle'
              checked={invertImgColorInDark}
              disabled={!isDarkMode}
              onChange={() => setInvertImgColorInDark(!invertImgColorInDark)}
            />
          </label>

          <label
            data-setting-id='settings.color.overrideBookColor'
            className='flex cursor-pointer items-center justify-between px-4'
          >
            <SettingLabel>{_('Override Book Color')}</SettingLabel>
            <input
              type='checkbox'
              className='toggle'
              checked={overrideColor}
              onChange={() => setOverrideColor(!overrideColor)}
            />
          </label>

          <ThemeColorSelector
            themes={themes.concat(customThemes)}
            themeColor={themeColor}
            isDarkMode={isDarkMode}
            onThemeColorChange={setThemeColor}
            onEditTheme={handleEditTheme}
            onCreateTheme={() => setShowCustomThemeEditor(true)}
            data-setting-id='settings.color.themeColor'
          />

          <HighlightColorsEditor
            customHighlightColors={customHighlightColors}
            userHighlightColors={userHighlightColors}
            defaultHighlightLabels={defaultHighlightLabels}
            highlightOpacity={highlightOpacity}
            onCustomHighlightColorsChange={handleCustomHighlightColorsChange}
            onUserHighlightColorsChange={handleUserHighlightColorsChange}
            onDefaultHighlightLabelsChange={handleDefaultHighlightLabelsChange}
            onOpacityChange={setHighlightOpacity}
            data-setting-id='settings.color.highlightColors'
          />

          <ReadingRulerSettings
            enabled={readingRulerEnabled}
            lines={readingRulerLines}
            opacity={readingRulerOpacity}
            color={readingRulerColor}
            onEnabledChange={setReadingRulerEnabled}
            onLinesChange={setReadingRulerLines}
            onOpacityChange={setReadingRulerOpacity}
            onColorChange={setReadingRulerColor}
            data-setting-id='settings.color.readingRuler'
          />

          <CodeHighlightingSettings
            codeHighlighting={codeHighlighting}
            codeLanguage={codeLanguage}
            onToggle={setcodeHighlighting}
            onLanguageChange={setCodeLanguage}
            data-setting-id='settings.color.codeHighlighting'
          />
        </>
      )}
    </div>
  );
};

export default ColorPanel;
