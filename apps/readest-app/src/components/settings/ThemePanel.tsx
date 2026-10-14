import React, { useState, useEffect } from 'react';
import {
  applyCustomTheme,
  CustomTheme,
  generateDarkPalette,
  generateLightPalette,
  Theme,
  themes,
  ThemeScope,
  getEffectiveDarkMode,
} from '@/styles/themes';
import { useEnv } from '@/context/EnvContext';
import { useThemeStore } from '@/store/themeStore';
import { useReaderStore } from '@/store/readerStore';
import { useBookDataStore } from '@/store/bookDataStore';
import { useSidebarStore } from '@/store/sidebarStore';
import { useTranslation } from '@/hooks/useTranslation';
import { useSettingsStore } from '@/store/settingsStore';
import { useResetViewSettings } from '@/hooks/useResetSettings';
import { saveViewSettings } from '@/helpers/settings';
import { manageSyntaxHighlighting } from '@/utils/highlightjs';
import { refreshViewDialogueHighlight } from '@/utils/dialogueHighlight';
import { SettingsPanelPanelProp } from './SettingsDialog';
import { useAtmosphereStore } from '@/store/atmosphereStore';
import { DefaultHighlightColor, HighlightColor, UserHighlightColor } from '@/types/book';
import clsx from 'clsx';
import { ScopeSwitch, SectionTitle, SettingLabel, SettingsSwitchRow } from './primitives';
import { HIGHLIGHT_COLOR_HEX } from '@/services/constants';
import ThemeEditor from './theme/ThemeEditor';
import ThemeModeSelector from './color/ThemeModeSelector';
import ThemeColorSelector from './theme/ThemeColorSelector';
import BackgroundSwatchRow from './theme/BackgroundSwatchRow';
import HighlightColorsEditor from './theme/HighlightColorsEditor';
import CodeHighlightingSettings from './theme/CodeHighlightingSettings';
import DialogueHighlightSettings from './theme/DialogueHighlightSettings';
import ReadingRulerSettings from './theme/ReadingRulerSettings';

const ThemePanel: React.FC<SettingsPanelPanelProp> = ({ bookKey, onRegisterReset }) => {
  const _ = useTranslation();
  const {
    isDarkMode,
    systemIsDarkMode,
    ambientIsDarkMode,
    highContrast,
    readerThemeColor,
    libraryThemeColor,
    getScopedTheme,
    setScopedThemeMode,
    setScopedThemeColor,
    setHighContrast,
    resetThemeScopes,
    saveCustomTheme,
  } = useThemeStore();
  const { envConfig } = useEnv();
  const { settings, setSettings, saveSettings } = useSettingsStore();
  const { getView, getViewSettings } = useReaderStore();
  const viewSettings = getViewSettings(bookKey) || settings.globalViewSettings;

  // Theme Mode and Theme Color share one scope switch (issue #5945): picking
  // a value here is what decouples the library from the reader, so the two
  // halves of "the theme" must never be editable for different pages at once.
  const [themeScope, setThemeScope] = useState<ThemeScope>(bookKey ? 'reader' : 'library');
  const { themeMode, themeColor } = getScopedTheme(themeScope);
  // Swatches preview the scope being EDITED, which is not always the scope
  // on screen — picking a library color from inside a dark reader has to
  // show the library's light swatches.
  const scopedIsDarkMode = getEffectiveDarkMode(
    themeColor,
    themeMode,
    systemIsDarkMode,
    ambientIsDarkMode,
  );

  // Re-tapping the selected card returns to the default appearance while
  // keeping the current mode preference (themeMode is left untouched).
  const handleThemeColorChange = (name: string) => {
    setScopedThemeColor(themeScope, name === themeColor ? 'default' : name);
  };

  const [invertImgColorInDark, setInvertImgColorInDark] = useState(
    viewSettings.invertImgColorInDark,
  );
  const [editTheme, setEditTheme] = useState<CustomTheme | null>(null);
  const [customThemes, setCustomThemes] = useState<Theme[]>([]);
  const [showCustomThemeEditor, setShowCustomThemeEditor] = useState(false);
  const [overrideColor, setOverrideColor] = useState(viewSettings.overrideColor);
  const [codeHighlighting, setcodeHighlighting] = useState(viewSettings.codeHighlighting);
  const [codeLanguage, setCodeLanguage] = useState(viewSettings.codeLanguage);
  const [dialogueHighlight, setDialogueHighlight] = useState(viewSettings.dialogueHighlight);
  const [dialogueHighlightCustomColor, setDialogueHighlightCustomColor] = useState(
    viewSettings.dialogueHighlightCustomColor,
  );
  const [dialogueHighlightColor, setDialogueHighlightColor] = useState(
    viewSettings.dialogueHighlightColor,
  );
  const [dialogueHighlightTextColor, setDialogueHighlightTextColor] = useState(
    viewSettings.dialogueHighlightTextColor,
  );
  const [dialogueHighlightCustomTextColor, setDialogueHighlightCustomTextColor] = useState(
    viewSettings.dialogueHighlightCustomTextColor,
  );
  const [dialogueHighlightItalic, setDialogueHighlightItalic] = useState(
    viewSettings.dialogueHighlightItalic,
  );
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
      dialogueHighlight: setDialogueHighlight,
      dialogueHighlightCustomColor: setDialogueHighlightCustomColor,
      dialogueHighlightColor: setDialogueHighlightColor,
      dialogueHighlightCustomTextColor: setDialogueHighlightCustomTextColor,
      dialogueHighlightTextColor: setDialogueHighlightTextColor,
      dialogueHighlightItalic: setDialogueHighlightItalic,
      readingRulerEnabled: setReadingRulerEnabled,
      readingRulerLines: setReadingRulerLines,
      readingRulerOpacity: setReadingRulerOpacity,
    });
    resetThemeScopes();
    // Restore the platform's High Contrast default (on for e-ink screens).
    setHighContrast(Boolean(window.__READEST_IS_EINK));
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

  // Re-wrap dialogue marks in every view affected by the save: global
  // settings fan out to all open books via saveViewSettings, and the library
  // dialog carries an empty bookKey, so refreshing only the current view
  // would leave stale or missing spans elsewhere. Each view keeps its own
  // (possibly per-book) settings, hence the per-key lookup.
  const refreshDialogueMarks = () => {
    const { bookKeys, getView, getViewSettings } = useReaderStore.getState();
    const isGlobal = getViewSettings(bookKey)?.isGlobal ?? true;
    const keys = isGlobal ? bookKeys : bookKey ? [bookKey] : [];
    const { getConfig } = useBookDataStore.getState();
    const { getSearchNavState } = useSidebarStore.getState();
    keys.forEach((key) => {
      const vs = getViewSettings(key);
      const view = getView(key);
      if (!vs || !view) return;
      refreshViewDialogueHighlight(
        view,
        vs,
        getConfig(key)?.booknotes ?? [],
        getSearchNavState(key).searchResults,
      );
    });
  };

  useEffect(() => {
    if (dialogueHighlight === viewSettings.dialogueHighlight) return;
    // A global save reaches the open books one at a time; refresh once every
    // view has the new setting.
    saveViewSettings(envConfig, bookKey, 'dialogueHighlight', dialogueHighlight).then(
      refreshDialogueMarks,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialogueHighlight]);

  useEffect(() => {
    // Capture before the saves below mutate viewSettings in place.
    const customTextColorChanged =
      dialogueHighlightCustomTextColor !== viewSettings.dialogueHighlightCustomTextColor;
    const saves: Promise<void>[] = [];
    if (dialogueHighlightCustomColor !== viewSettings.dialogueHighlightCustomColor) {
      saves.push(
        saveViewSettings(
          envConfig,
          bookKey,
          'dialogueHighlightCustomColor',
          dialogueHighlightCustomColor,
        ),
      );
    }
    if (dialogueHighlightColor !== viewSettings.dialogueHighlightColor) {
      saves.push(
        saveViewSettings(envConfig, bookKey, 'dialogueHighlightColor', dialogueHighlightColor),
      );
    }
    if (viewSettings.dialogueHighlightCustomTextColor !== dialogueHighlightCustomTextColor) {
      saves.push(
        saveViewSettings(
          envConfig,
          bookKey,
          'dialogueHighlightCustomTextColor',
          dialogueHighlightCustomTextColor,
        ),
      );
    }
    if (viewSettings.dialogueHighlightItalic !== dialogueHighlightItalic) {
      saves.push(
        saveViewSettings(envConfig, bookKey, 'dialogueHighlightItalic', dialogueHighlightItalic),
      );
    }
    if (viewSettings.dialogueHighlightTextColor !== dialogueHighlightTextColor) {
      saves.push(
        saveViewSettings(
          envConfig,
          bookKey,
          'dialogueHighlightTextColor',
          dialogueHighlightTextColor,
        ),
      );
    }
    // Recoloring is pure CSS (getStyles reads these fields), so the saved
    // viewSettings refresh via saveViewSettings -> setStyles is enough when
    // the background is on and spans are guaranteed present. With the
    // background off, spans may not exist yet (text-only mode just turned
    // on), so re-wrap — but only on that toggle transition, not on every
    // color-picker tick, since each run clears and rewrites every document.
    // Wait for every save so each open book has the new settings first.
    if (!dialogueHighlight && customTextColorChanged) {
      Promise.all(saves).then(refreshDialogueMarks);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    dialogueHighlightCustomColor,
    dialogueHighlightColor,
    dialogueHighlightCustomTextColor,
    dialogueHighlightTextColor,
    dialogueHighlightItalic,
  ]);

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
        isCustomizable: true,
      })),
    );
  }, [settings]);

  const handleSaveCustomTheme = (customTheme: CustomTheme) => {
    applyCustomTheme(customTheme);
    saveCustomTheme(envConfig, settings, customTheme);
    setSettings({ ...settings });
    setScopedThemeColor(themeScope, customTheme.name);
    setShowCustomThemeEditor(false);
  };

  const handleDeleteCustomTheme = (customTheme: CustomTheme) => {
    saveCustomTheme(envConfig, settings, customTheme, true);
    setSettings({ ...settings });
    setScopedThemeColor(themeScope, 'default');
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
          <div className='mb-2 flex items-center justify-between gap-2'>
            <SectionTitle>{_('Theme')}</SectionTitle>
            <ScopeSwitch label={_('Theme')} scope={themeScope} onScopeChange={setThemeScope} />
          </div>
          <ThemeModeSelector
            themeMode={themeMode}
            isDarkMode={scopedIsDarkMode}
            systemIsDarkMode={systemIsDarkMode}
            onThemeModeChange={(mode) => setScopedThemeMode(themeScope, mode)}
            data-setting-id='settings.color.themeMode'
          />

          <ThemeColorSelector
            themes={themes.concat(customThemes)}
            themeColor={themeColor}
            isDarkMode={scopedIsDarkMode}
            onThemeColorChange={handleThemeColorChange}
            onEditTheme={handleEditTheme}
            onCreateTheme={() => setShowCustomThemeEditor(true)}
            data-setting-id='settings.color.themeColor'
          />

          {(themeScope === 'reader' || libraryThemeColor === null) &&
            themes.some((t) => t.name === readerThemeColor) && <BackgroundSwatchRow />}

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

          <SettingsSwitchRow
            data-setting-id='settings.color.highContrast'
            label={_('High Contrast')}
            description={_('Boost text contrast on top of any theme.')}
            checked={highContrast}
            onChange={() => setHighContrast(!highContrast)}
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

          <DialogueHighlightSettings
            dialogueHighlight={dialogueHighlight}
            customBackground={dialogueHighlightCustomColor}
            backgroundColor={dialogueHighlightColor}
            customTextColor={dialogueHighlightCustomTextColor}
            textColor={dialogueHighlightTextColor}
            onToggle={setDialogueHighlight}
            onCustomBackgroundToggle={setDialogueHighlightCustomColor}
            onBackgroundColorChange={setDialogueHighlightColor}
            onCustomTextColorToggle={setDialogueHighlightCustomTextColor}
            italic={dialogueHighlightItalic}
            onTextColorChange={setDialogueHighlightTextColor}
            onItalicToggle={setDialogueHighlightItalic}
            data-setting-id='settings.color.dialogueHighlight'
          />
        </>
      )}
    </div>
  );
};

export default ThemePanel;
