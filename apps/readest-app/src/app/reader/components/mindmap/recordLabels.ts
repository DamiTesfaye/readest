import type { TranslationFunc } from '@/hooks/useTranslation';
import type { MapRecord, NodeKind, PresetColor } from '@/services/mindmap/schema/types';
import { isLive } from '@/services/mindmap/spatial/spatialIndex';
import { editableText } from '@/services/mindmap/tools/records';

export const kindLabels = (_: TranslationFunc): Record<NodeKind, string> => ({
  character: _('Character'),
  place: _('Place'),
  chapter: _('Chapter'),
  theme: _('Theme'),
  quote: _('Quote'),
  idea: _('Idea'),
});

export const colorLabels = (_: TranslationFunc): Record<PresetColor, string> => ({
  terracotta: _('Terracotta'),
  plum: _('Plum'),
  sky: _('Sky'),
  mustard: _('Mustard'),
  olive: _('Olive'),
  ink: _('Ink'),
  paper: _('Paper'),
});

const nameOf = (record: MapRecord | undefined, _: TranslationFunc): string => {
  const text = record ? editableText(record).trim() : '';
  return text || _('Untitled');
};

export const recordAriaLabels = (
  records: readonly MapRecord[],
  _: TranslationFunc,
  locale?: string,
): Map<string, string> => {
  const byId = new Map(records.map((record) => [record.id, record]));
  const kinds = kindLabels(_);
  const list = new Intl.ListFormat(locale, { style: 'short', type: 'unit' });
  const connections = new Map<string, string[]>();
  for (const link of records) {
    if (link.type !== 'link' || !isLive(link)) continue;
    const from = byId.get(link.fromId);
    const to = byId.get(link.toId);
    if (!isLive(from) || !isLive(to)) continue;
    const relation = link.label.trim() || _('linked to');
    for (const [self, other] of [
      [from, to],
      [to, from],
    ] as const) {
      const described = _('{{relation}} {{target}}', { relation, target: nameOf(other, _) });
      connections.set(self.id, [...(connections.get(self.id) ?? []), described]);
    }
  }
  const labels = new Map<string, string>();
  for (const record of records) {
    if (!isLive(record)) continue;
    const name = nameOf(record, _);
    if (record.type === 'node') {
      const links = connections.get(record.id) ?? [];
      const kind = kinds[record.kind];
      labels.set(
        record.id,
        links.length > 0
          ? _('{{label}}, {{kind}}, {{connections}}', {
              label: name,
              kind,
              connections: list.format(links),
            })
          : _('{{label}}, {{kind}}', { label: name, kind }),
      );
    } else if (record.type === 'sticky') {
      labels.set(record.id, _('Sticky note: {{text}}', { text: name }));
    } else if (record.type === 'text') {
      labels.set(record.id, _('Text: {{text}}', { text: name }));
    }
  }
  return labels;
};
