import type { TranslationFunc } from '@/hooks/useTranslation';
import type { ToolId } from '@/services/mindmap/tools/types';

export const toolLabels = (_: TranslationFunc): Record<ToolId, string> => ({
  select: _('Select'),
  hand: _('Hand'),
  node: _('Node'),
  connect: _('Connect'),
  pen: _('Pen'),
  rect: _('Rectangle'),
  ellipse: _('Ellipse'),
  sticky: _('Sticky note'),
  text: _('Text'),
  section: _('Section'),
});
