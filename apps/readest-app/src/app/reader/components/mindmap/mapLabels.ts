import type { TranslationFunc } from '@/hooks/useTranslation';
import type { MapIntent, MapSpoiler, MapStyle } from '@/services/mindmap/schema/types';

export const intentLabels = (_: TranslationFunc): Record<MapIntent, string> => ({
  adaptive: _('Adaptive'),
  study: _('Study'),
  story: _('Story'),
  personal: _('Personal'),
});

export const spoilerLabels = (_: TranslationFunc): Record<MapSpoiler, string> => ({
  adaptive: _('Adaptive'),
  grow: _('Grow with reading'),
  fogged: _('Fogged ahead'),
  whole: _('Whole book'),
});

export const styleLabels = (_: TranslationFunc): Record<MapStyle, string> => ({
  sticker: _('Sticker'),
  paper: _('Paper chips'),
  ink: _('Ink & margin'),
});
