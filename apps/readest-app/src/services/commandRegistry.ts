import { Fzf, FzfResultItem, byLengthAsc } from 'fzf';
import { SettingsPanelType } from '@/components/settings/SettingsDialog';
import { RiTranslate, RiShareLine } from 'react-icons/ri';
import { LiaHandPointerSolid } from 'react-icons/lia';
import { IoAccessibilityOutline } from 'react-icons/io5';
import { PiRobot, PiSpeakerHigh, PiSun, PiMoon } from 'react-icons/pi';
import { TbSunMoon } from 'react-icons/tb';
import { MdRefresh } from 'react-icons/md';
import { IconType } from 'react-icons';
import { stubTranslation as _ } from '@/utils/misc';

export type CommandCategory = 'settings' | 'actions' | 'navigation';

export interface CommandItem {
  id: string;
  labelKey: string;
  localizedLabel: string;
  keywords: string[];
  category: CommandCategory;
  panel?: SettingsPanelType;
  panelLabel?: string;
  section?: string;
  icon?: IconType;
  shortcut?: string[];
  action: () => void;
  isAvailable?: () => boolean;
}

export interface CommandSearchResult {
  item: CommandItem;
  score: number;
  positions: Set<number>;
  highlightIndices: Set<number>;
  matchContext?: string;
}

type TranslationFunc = (key: string) => string;

// selector for fzf - combines all searchable text
const getSearchableText = (item: CommandItem): string => {
  return [
    item.localizedLabel,
    item.labelKey,
    item.panel ?? '',
    item.panelLabel ?? '',
    item.section ?? '',
    ...item.keywords,
  ]
    .filter(Boolean)
    .join(' ');
};

// map fzf positions to display label positions
const mapPositionsToLabel = (entry: FzfResultItem<CommandItem>): Set<number> => {
  const searchText = getSearchableText(entry.item);
  const label = entry.item.localizedLabel;
  const labelStart = searchText.indexOf(label);

  if (labelStart === -1) return new Set();

  const labelEnd = labelStart + label.length;
  const mapped = new Set<number>();

  for (const pos of entry.positions) {
    if (pos >= labelStart && pos < labelEnd) {
      mapped.add(pos - labelStart);
    }
  }

  return mapped;
};

// find matched context from keywords/section/panel for secondary display
const findMatchContext = (entry: FzfResultItem<CommandItem>): string | undefined => {
  const searchText = getSearchableText(entry.item);
  const label = entry.item.localizedLabel;
  const labelStart = searchText.indexOf(label);
  const labelEnd = labelStart + label.length;

  // check if any match is outside the label
  for (const pos of entry.positions) {
    if (pos < labelStart || pos >= labelEnd) {
      // match is in keywords/section/panel area
      const parts = [
        entry.item.panelLabel ?? entry.item.panel,
        entry.item.section,
        ...entry.item.keywords,
      ].filter(Boolean);
      for (const part of parts) {
        if (part && searchText.includes(part)) {
          const partStart = searchText.indexOf(part, labelEnd);
          if (partStart !== -1) {
            for (const p of entry.positions) {
              if (p >= partStart && p < partStart + part.length) {
                return part;
              }
            }
          }
        }
      }
    }
  }
  return undefined;
};

export const searchCommands = (query: string, items: CommandItem[]): CommandSearchResult[] => {
  if (!query.trim()) return [];

  const availableItems = items.filter((item) => !item.isAvailable || item.isAvailable());

  const fzf = new Fzf(availableItems, {
    selector: getSearchableText,
    tiebreakers: [byLengthAsc],
    casing: 'smart-case',
    normalize: true,
    limit: 50,
  });

  const results = fzf.find(query);

  return results.map((entry) => ({
    item: entry.item,
    score: entry.score,
    positions: entry.positions,
    highlightIndices: mapPositionsToLabel(entry),
    matchContext: findMatchContext(entry),
  }));
};

// group results by category
export const groupResultsByCategory = (
  results: CommandSearchResult[],
): Record<CommandCategory, CommandSearchResult[]> => {
  const grouped: Record<CommandCategory, CommandSearchResult[]> = {
    settings: [],
    actions: [],
    navigation: [],
  };

  for (const result of results) {
    grouped[result.item.category].push(result);
  }

  return grouped;
};

// settings panel icon map
const panelIcons: Record<SettingsPanelType, IconType> = {
  Control: LiaHandPointerSolid,
  TTS: PiSpeakerHigh,
  Language: RiTranslate,
  AI: PiRobot,
  Integrations: RiShareLine,
  Custom: IoAccessibilityOutline,
};

// control panel items
const controlPanelItems = [
  {
    id: 'settings.control.scrolledMode',
    labelKey: _('Scrolled Mode'),
    keywords: ['scroll', 'scrolled', 'mode', 'paginate', 'continuous'],
    section: 'Scroll',
  },
  {
    id: 'settings.control.scroll.noContinuousScroll',
    labelKey: _('Single Section Scroll'),
    keywords: ['single', 'section', 'scroll', 'continuous', 'one', 'chapter'],
    section: 'Scroll',
  },
  {
    id: 'settings.control.overlapPixels',
    labelKey: _('Overlap Pixels'),
    keywords: ['overlap', 'pixels', 'scroll', 'offset'],
    section: 'Scroll',
  },
  {
    id: 'settings.control.clickToPaginate',
    labelKey: _('Click to Paginate'),
    keywords: ['click', 'tap', 'paginate', 'page', 'turn'],
    section: 'Pagination',
  },
  {
    id: 'settings.control.clickBothSides',
    labelKey: _('Click Both Sides'),
    keywords: ['click', 'tap', 'both', 'sides', 'fullscreen'],
    section: 'Pagination',
  },
  {
    id: 'settings.control.swapClickSides',
    labelKey: _('Swap Click Sides'),
    keywords: ['swap', 'click', 'tap', 'sides', 'reverse'],
    section: 'Pagination',
  },
  {
    id: 'settings.control.disableDoubleClick',
    labelKey: _('Disable Double Click'),
    keywords: ['disable', 'double', 'click', 'tap'],
    section: 'Pagination',
  },
  {
    id: 'settings.control.showPaginationButtons',
    labelKey: _('Show Page Navigation Buttons'),
    keywords: ['show', 'pagination', 'buttons', 'navigation', 'arrows', 'chevron', 'page', 'turn'],
    section: 'Pagination',
  },
  {
    id: 'settings.control.enableQuickActions',
    labelKey: _('Enable Quick Actions'),
    keywords: ['quick', 'actions', 'annotation', 'enable'],
    section: 'Annotation Tools',
  },
  {
    id: 'settings.control.quickAction',
    labelKey: _('Quick Action'),
    keywords: ['quick', 'action', 'annotation', 'highlight', 'copy'],
    section: 'Annotation Tools',
  },
  {
    id: 'settings.control.copyToNotebook',
    labelKey: _('Copy to Notebook'),
    keywords: ['copy', 'notebook', 'annotation', 'excerpt'],
    section: 'Annotation Tools',
  },
  {
    id: 'settings.control.pagingAnimation',
    labelKey: _('Paging Animation'),
    keywords: ['paging', 'animation', 'transition', 'effect'],
    section: 'Animation',
  },
  {
    id: 'settings.control.einkMode',
    labelKey: _('E-Ink Mode'),
    keywords: ['eink', 'e-ink', 'kindle', 'e-reader', 'epaper'],
    section: 'Device',
  },
  {
    id: 'settings.control.colorEinkMode',
    labelKey: _('Color E-Ink Mode'),
    keywords: ['color', 'eink', 'e-ink', 'kaleido'],
    section: 'Device',
  },
  {
    id: 'settings.control.screenWakeLock',
    labelKey: _('Keep Screen Awake'),
    keywords: ['screen', 'wake', 'lock', 'awake', 'sleep', 'display'],
    section: 'Device',
  },
  {
    id: 'settings.control.allowJavascript',
    labelKey: _('Allow JavaScript'),
    keywords: ['javascript', 'js', 'script', 'security', 'allow'],
    section: 'Security',
  },
];

// language panel items
const languagePanelItems = [
  {
    id: 'settings.language.interfaceLanguage',
    labelKey: _('Interface Language'),
    keywords: ['interface', 'language', 'locale', 'ui', 'translation'],
    section: 'Language',
  },
  {
    id: 'settings.language.translationEnabled',
    labelKey: _('Enable Translation'),
    keywords: ['translation', 'translate', 'enable', 'language'],
    section: 'Translation',
  },
  {
    id: 'settings.language.translationProvider',
    labelKey: _('Translation Service'),
    keywords: ['translation', 'provider', 'google', 'deepl', 'service'],
    section: 'Translation',
  },
  {
    id: 'settings.language.targetLanguage',
    labelKey: _('Translate To'),
    keywords: ['target', 'language', 'translation', 'destination'],
    section: 'Translation',
  },
  {
    id: 'settings.language.ttsTextTranslation',
    labelKey: _('TTS Text'),
    keywords: ['tts', 'text', 'translation', 'speech', 'read'],
    section: 'Translation',
  },
  {
    id: 'settings.language.quotationMarks',
    labelKey: _('Replace Quotation Marks'),
    keywords: ['quotation', 'marks', 'quotes', 'punctuation', 'cjk'],
    section: 'Punctuation',
  },
  {
    id: 'settings.language.chineseConversion',
    labelKey: _('Convert Simplified and Traditional Chinese'),
    keywords: ['chinese', 'conversion', 'simplified', 'traditional', 'cjk'],
    section: 'Chinese',
  },
];

// ai panel items
const aiPanelItems = [
  {
    id: 'settings.ai.enableAssistant',
    labelKey: _('Enable AI Assistant'),
    keywords: ['ai', 'assistant', 'enable', 'chatbot', 'llm'],
    section: 'AI',
  },
  {
    id: 'settings.ai.provider',
    labelKey: _('AI Provider'),
    keywords: ['ai', 'provider', 'ollama', 'gateway', 'service'],
    section: 'AI',
  },
  {
    id: 'settings.ai.ollamaUrl',
    labelKey: _('Ollama URL'),
    keywords: ['ollama', 'url', 'server', 'endpoint', 'api'],
    section: 'Ollama',
  },
  {
    id: 'settings.ai.ollamaModel',
    labelKey: _('Ollama Model'),
    keywords: ['ollama', 'model', 'llama', 'mistral', 'gemma'],
    section: 'Ollama',
  },
  {
    id: 'settings.ai.gatewayApiKey',
    labelKey: _('API Key'),
    keywords: ['api', 'key', 'gateway', 'token', 'secret'],
    section: 'AI Gateway',
  },
  {
    id: 'settings.ai.gatewayModel',
    labelKey: _('AI Gateway Model'),
    keywords: ['gateway', 'model', 'openai', 'gpt', 'claude'],
    section: 'AI Gateway',
  },
  {
    id: 'settings.ai.openrouterApiKey',
    labelKey: _('OpenRouter API Key'),
    keywords: ['openrouter', 'api', 'key', 'token', 'secret'],
    section: 'OpenRouter',
  },
  {
    id: 'settings.ai.openrouterBaseUrl',
    labelKey: _('OpenRouter Base URL'),
    keywords: ['openrouter', 'base', 'url', 'endpoint', 'openai', 'compatible'],
    section: 'OpenRouter',
  },
  {
    id: 'settings.ai.openrouterModel',
    labelKey: _('OpenRouter Model'),
    keywords: ['openrouter', 'model', 'claude', 'gpt', 'llama', 'deepseek'],
    section: 'OpenRouter',
  },
];

// custom panel items
const customPanelItems = [
  {
    id: 'settings.custom.contentCss',
    labelKey: _('Custom Content CSS'),
    keywords: ['custom', 'css', 'content', 'style', 'book'],
    section: 'Custom CSS',
  },
  {
    id: 'settings.custom.readerUiCss',
    labelKey: _('Custom Reader UI CSS'),
    keywords: ['custom', 'css', 'reader', 'ui', 'interface'],
    section: 'Custom CSS',
  },
];

const actionItems = [
  {
    id: 'action.toggleTheme',
    labelKey: _('Theme Mode'),
    keywords: ['theme', 'dark', 'light', 'auto', 'mode', 'toggle'],
  },
  {
    id: 'action.fullscreen',
    labelKey: _('Fullscreen'),
    keywords: ['fullscreen', 'full', 'screen', 'maximize', 'window'],
  },
  {
    id: 'action.alwaysOnTop',
    labelKey: _('Always on Top'),
    keywords: ['always', 'top', 'pin', 'window', 'float'],
  },
  {
    id: 'action.screenWakeLock',
    labelKey: _('Keep Screen Awake'),
    keywords: ['screen', 'wake', 'lock', 'awake', 'sleep', 'display'],
  },
  {
    id: 'action.autoUpload',
    labelKey: _('Auto Upload Books to Cloud'),
    keywords: ['auto', 'upload', 'cloud', 'sync', 'backup'],
  },
  {
    id: 'action.reload',
    labelKey: _('Reload Page'),
    keywords: ['reload', 'refresh', 'page'],
  },
  {
    id: 'action.openLastBooks',
    labelKey: _('Open Last Book on Start'),
    keywords: ['open', 'last', 'book', 'start', 'resume'],
  },
  {
    id: 'action.about',
    labelKey: _('About Readest'),
    keywords: ['about', 'readest', 'version', 'info'],
  },
  {
    id: 'action.telemetry',
    labelKey: _('Help improve Readest'),
    keywords: ['telemetry', 'analytics', 'improve', 'statistics'],
  },
];

export interface CommandRegistryOptions {
  _: TranslationFunc;
  openSettingsPanel: (panel: SettingsPanelType, itemId?: string) => void;
  toggleTheme: () => void;
  toggleFullscreen: () => void;
  toggleAlwaysOnTop: () => void;
  toggleScreenWakeLock: () => void;
  toggleAutoUpload: () => void;
  reloadPage: () => void;
  toggleOpenLastBooks: () => void;
  showAbout: () => void;
  toggleTelemetry: () => void;
  isDesktop: boolean;
  // TODO: add reader-specific actions when reader is open (tts, bookmark, etc.)
}

export const buildCommandRegistry = (options: CommandRegistryOptions): CommandItem[] => {
  const { _, openSettingsPanel, isDesktop } = options;
  const items: CommandItem[] = [];

  // helper to create settings item
  const createSettingsItem = (
    def: { id: string; labelKey: string; keywords: string[]; section?: string },
    panel: SettingsPanelType,
    panelLabel?: string,
  ): CommandItem => ({
    id: def.id,
    labelKey: def.labelKey,
    localizedLabel: _(def.labelKey),
    keywords: def.keywords,
    category: 'settings',
    panel,
    panelLabel: _(panelLabel ?? panel),
    section: def.section,
    icon: panelIcons[panel],
    action: () => openSettingsPanel(panel, def.id),
  });

  // add control panel items
  for (const def of controlPanelItems) {
    items.push(createSettingsItem(def, 'Control', 'Behavior'));
  }

  // add language panel items
  for (const def of languagePanelItems) {
    items.push(createSettingsItem(def, 'Language'));
  }

  // add ai panel items (only in dev, as of now atleast)
  if (process.env.NODE_ENV !== 'production') {
    for (const def of aiPanelItems) {
      items.push(createSettingsItem(def, 'AI'));
    }
  }

  // add custom panel items
  for (const def of customPanelItems) {
    items.push(createSettingsItem(def, 'Custom'));
  }

  // add action items
  const getThemeIcon = (): IconType => {
    const themeMode =
      typeof localStorage !== 'undefined' ? localStorage.getItem('themeMode') : 'auto';
    return themeMode === 'dark' ? PiMoon : themeMode === 'light' ? PiSun : TbSunMoon;
  };

  const createActionItem = (def: {
    id: string;
    action: () => void;
    icon?: IconType;
    isAvailable?: () => boolean;
  }): CommandItem => {
    const item = actionItems.find((item) => item.id === def.id);
    if (!item) throw new Error(`Action item definition not found for id: ${def.id}`);
    return {
      id: def.id,
      labelKey: item.labelKey,
      localizedLabel: _(item.labelKey),
      keywords: item.keywords,
      icon: def.icon ?? getThemeIcon(),
      category: 'actions',
      action: def.action,
      isAvailable: def.isAvailable,
    };
  };

  items.push(
    createActionItem({
      id: 'action.toggleTheme',
      action: options.toggleTheme,
    }),
  );

  items.push(
    createActionItem({
      id: 'action.fullscreen',
      action: options.toggleFullscreen,
      isAvailable: () => isDesktop,
    }),
  );

  items.push(
    createActionItem({
      id: 'action.alwaysOnTop',
      action: options.toggleAlwaysOnTop,
      isAvailable: () => isDesktop,
    }),
  );

  items.push(
    createActionItem({
      id: 'action.screenWakeLock',
      action: options.toggleScreenWakeLock,
    }),
  );

  items.push(
    createActionItem({
      id: 'action.autoUpload',
      action: options.toggleAutoUpload,
    }),
  );

  items.push(
    createActionItem({
      id: 'action.reload',
      icon: MdRefresh,
      action: options.reloadPage,
    }),
  );

  items.push(
    createActionItem({
      id: 'action.openLastBooks',
      action: options.toggleOpenLastBooks,
      isAvailable: () => isDesktop,
    }),
  );

  items.push(
    createActionItem({
      id: 'action.about',
      action: options.showAbout,
    }),
  );

  items.push(
    createActionItem({
      id: 'action.telemetry',
      action: options.toggleTelemetry,
    }),
  );

  return items;
};

// category labels for display
export const getCategoryLabel = (_: TranslationFunc, category: CommandCategory): string => {
  switch (category) {
    case 'settings':
      return _('Settings');
    case 'actions':
      return _('Actions');
    case 'navigation':
      return _('Navigation');
    default:
      return category;
  }
};

// get recent commands from localStorage
export const getRecentCommands = (items: CommandItem[], limit = 5): CommandItem[] => {
  if (typeof localStorage === 'undefined') return [];

  try {
    const recentIds = JSON.parse(localStorage.getItem('recentCommands') || '[]') as string[];
    return recentIds
      .slice(0, limit)
      .map((id) => items.find((item) => item.id === id))
      .filter((item): item is CommandItem => item !== undefined);
  } catch {
    return [];
  }
};

// track command usage for recent list
export const trackCommandUsage = (commandId: string): void => {
  if (typeof localStorage === 'undefined') return;

  try {
    const recentIds = JSON.parse(localStorage.getItem('recentCommands') || '[]') as string[];
    const updated = [commandId, ...recentIds.filter((id) => id !== commandId)].slice(0, 10);
    localStorage.setItem('recentCommands', JSON.stringify(updated));
  } catch {
    // ignore errors
  }
};
