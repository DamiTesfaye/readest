import { describe, expect, it } from 'vitest';
import { recordAriaLabels } from '@/app/reader/components/mindmap/recordLabels';
import {
  createLinkRecord,
  createNodeRecord,
  createShapeRecord,
  createStickyRecord,
  createTextRecord,
} from '@/services/mindmap/records/defaults';

const translate = (key: string, options: Record<string, string | number> = {}) =>
  key.replace(/{{(\w+)}}/g, (_, name: string) => String(options[name] ?? ''));

describe('recordAriaLabels', () => {
  it('names a node with its kind and every live connection', () => {
    const labels = recordAriaLabels(
      [
        createNodeRecord({ id: 'e', index: 'a1', label: 'Elizabeth', kind: 'character' }),
        createNodeRecord({ id: 'd', index: 'a2', label: 'Mr Darcy', kind: 'character' }),
        createNodeRecord({ id: 'j', index: 'a3', label: 'Jane', kind: 'character' }),
        createLinkRecord({ id: 'l1', index: 'a4', fromId: 'e', toId: 'd', label: 'slights' }),
        createLinkRecord({ id: 'l2', index: 'a5', fromId: 'e', toId: 'j', label: 'sisters with' }),
      ],
      translate,
      'en',
    );
    expect(labels.get('e')).toBe('Elizabeth, Character, slights Mr Darcy, sisters with Jane');
    expect(labels.get('d')).toBe('Mr Darcy, Character, slights (from Elizabeth)');
    expect(labels.get('j')).toBe('Jane, Character, sisters with (from Elizabeth)');
  });

  it('describes unlabelled links, stickies, text and untitled records', () => {
    const labels = recordAriaLabels(
      [
        createNodeRecord({ id: 'a', index: 'a1', label: '' }),
        createNodeRecord({ id: 'b', index: 'a2', label: 'B' }),
        createLinkRecord({ id: 'l', index: 'a3', fromId: 'a', toId: 'b' }),
        createStickyRecord({ id: 's', index: 'a4', text: 'Remember' }),
        createTextRecord({ id: 't', index: 'a5', text: 'Heading' }),
        createShapeRecord({ id: 'r', index: 'a6' }),
      ],
      translate,
      'en',
    );
    expect(labels.get('a')).toBe('Untitled, Idea, linked to B');
    expect(labels.get('s')).toBe('Sticky note: Remember');
    expect(labels.get('t')).toBe('Text: Heading');
    expect(labels.has('r')).toBe(false);
  });

  it('ignores deleted records and links to them', () => {
    const labels = recordAriaLabels(
      [
        createNodeRecord({ id: 'a', index: 'a1', label: 'A' }),
        { ...createNodeRecord({ id: 'b', index: 'a2', label: 'B' }), deleted: { by: 'user' } },
        createLinkRecord({ id: 'l', index: 'a3', fromId: 'a', toId: 'b', label: 'knows' }),
      ],
      translate,
      'en',
    );
    expect(labels.get('a')).toBe('A, Idea');
    expect(labels.has('b')).toBe(false);
  });
});
