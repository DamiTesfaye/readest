import { useEnv } from '@/context/EnvContext';
import { useReaderStore } from '@/store/readerStore';
import { useMindmapViewStore } from '@/store/mindmapViewStore';
import { useTranslation } from '@/hooks/useTranslation';
import { saveViewSettings } from '@/helpers/settings';
import { eventDispatcher } from '@/utils/event';
import type { QuickPickId } from '@/utils/quickPicks';

export interface MoreAction {
  title: string;
  hosts?: string;
  subtitle: string;
  beta?: boolean;
  toggled?: boolean;
  run: (target: HTMLElement) => void;
}

export interface MoreActionHandlers {
  bookKey: string;
  anchorEl: HTMLElement | null;
  onDone: () => void;
  onOpenLibrary: (target: HTMLElement) => void;
  onOpenContents: (target: HTMLElement) => void;
  onOpenThemeFonts: (target: HTMLElement) => void;
  onOpenAnnotations: (target: HTMLElement) => void;
  onOpenBooknotes: (target: HTMLElement) => void;
  onToggleTTS: () => void;
}

export const useMoreActions = ({
  bookKey,
  anchorEl,
  onDone,
  onOpenLibrary,
  onOpenContents,
  onOpenThemeFonts,
  onOpenAnnotations,
  onOpenBooknotes,
  onToggleTTS,
}: MoreActionHandlers): Record<QuickPickId, MoreAction> => {
  const _ = useTranslation();
  const { envConfig } = useEnv();
  const { getViewSettings } = useReaderStore();
  const viewSettings = getViewSettings(bookKey);
  const readingRulerEnabled = viewSettings?.readingRulerEnabled ?? false;
  const movingPicturesEnabled = viewSettings?.movingPicturesEnabled ?? false;

  const comingSoon = () => {
    eventDispatcher.dispatch('toast', { type: 'info', message: _('Coming soon') });
    onDone();
  };

  const toggleSetting =
    (key: 'readingRulerEnabled' | 'movingPicturesEnabled', enabled: boolean) => () => {
      saveViewSettings(envConfig, bookKey, key, !enabled, false, false);
      onDone();
    };

  const openMindmap = () => {
    useMindmapViewStore
      .getState()
      .openEntry(bookKey)
      .catch((error: unknown) => {
        console.error('mindmap: failed to open', error);
        eventDispatcher.dispatch('toast', {
          type: 'error',
          message: _('Could not open the mind map'),
        });
      });
    anchorEl?.focus({ preventScroll: true });
    onDone();
  };

  const toggleTTS = () => {
    onToggleTTS();
    onDone();
  };

  return {
    library: {
      title: _('Library'),
      subtitle: _('Switch to another book'),
      run: onOpenLibrary,
    },
    contents: {
      title: _('Contents'),
      subtitle: _('Jump between chapters'),
      run: onOpenContents,
    },
    'theme-fonts': {
      title: _('Theme & Fonts'),
      subtitle: _('Style the page your way'),
      run: onOpenThemeFonts,
    },
    annotations: {
      title: _('Annotations'),
      subtitle: _('Review your highlights'),
      run: onOpenAnnotations,
    },
    bookmarks: {
      title: _('Bookmarks & Notes'),
      subtitle: _('Saved spots & thoughts'),
      run: onOpenBooknotes,
    },
    margins: {
      title: _('Margins'),
      subtitle: _('Readers, notes & finds'),
      run: comingSoon,
    },
    mindmap: {
      title: _('Mindmap'),
      subtitle: _('Organise thoughts'),
      run: openMindmap,
    },
    discuss: {
      title: _('Discuss'),
      hosts: _('Tim & Fini'),
      subtitle: _('Host-led podcast'),
      run: comingSoon,
    },
    summarise: {
      title: _('Summarise'),
      subtitle: _('Shorten your reading'),
      run: comingSoon,
    },
    tts: {
      title: _('TTS'),
      subtitle: _('Read texts aloud'),
      run: toggleTTS,
    },
    'mood-modes': {
      title: _('Mood & Modes'),
      subtitle: _('Shape your reading experience'),
      run: comingSoon,
    },
    'moving-pictures': {
      title: _('Moving Pictures'),
      subtitle: _('Watch scenes come alive'),
      beta: true,
      toggled: movingPicturesEnabled,
      run: toggleSetting('movingPicturesEnabled', movingPicturesEnabled),
    },
    ruler: {
      title: _('Reading Ruler'),
      subtitle: _('Guide your eyes line by line'),
      toggled: readingRulerEnabled,
      run: toggleSetting('readingRulerEnabled', readingRulerEnabled),
    },
  };
};
