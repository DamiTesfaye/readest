import { describe, expect, it } from 'vitest';
import { exportJsonCanvas } from '@/services/mindmap/export/jsonCanvas';
import {
  createInkRecord,
  createLinkRecord,
  createNodeRecord,
  createSectionRecord,
  createShapeRecord,
  createStickyRecord,
  createTextRecord,
} from '@/services/mindmap/records/defaults';
import type { MapRecord } from '@/services/mindmap/schema/types';

const anchor = { cfi: 'epubcfi(/6/8!/4/2/1:0)', section: 3, progress: 0.4 };

const records: MapRecord[] = [
  createNodeRecord({ id: 'n1', index: 'a3', x: 10.6, y: 20.2, label: 'Emma', color: 'plum' }),
  {
    ...createNodeRecord({ id: 'q1', index: 'a2', x: 300, y: 0, label: 'A quote', color: 'paper' }),
    anchor,
  },
  createStickyRecord({ id: 's1', index: 'a4', x: 0, y: 200, text: 'Remember', color: 'mustard' }),
  createTextRecord({ id: 't1', index: 'a5', x: 0, y: 400, text: 'Plain words' }),
  createShapeRecord({ id: 'sh1', index: 'a6', x: 0, y: 600, color: 'olive' }),
  createSectionRecord({ id: 'sec', index: 'a1', x: -40, y: -40, title: 'Act one' }),
  createInkRecord({ id: 'ink', index: 'a7', x: 0, y: 0, w: 10, h: 10, points: 'AAAA' }),
  {
    ...createNodeRecord({ id: 'gone', index: 'a8', label: 'Deleted' }),
    deleted: { by: 'user' },
  },
  createLinkRecord({
    id: 'l1',
    index: 'a9',
    fromId: 'n1',
    toId: 'q1',
    label: 'says',
    fromAnchor: { side: 'right', t: 0.5 },
    toAnchor: { side: 'center', t: 0.5 },
  }),
  createLinkRecord({ id: 'l0', index: 'a8V', fromId: 'q1', toId: 's1' }),
  createLinkRecord({ id: 'toInk', index: 'aA', fromId: 'n1', toId: 'ink' }),
  createLinkRecord({ id: 'toGone', index: 'aB', fromId: 'n1', toId: 'gone' }),
];

const canvas = exportJsonCanvas(records, { bookFile: 'Emma.epub' });

describe('exportJsonCanvas', () => {
  it('turns nodes, stickies, text and shapes into text nodes and sections into groups', () => {
    expect(canvas.nodes.map((node) => [node.id, node.type])).toEqual([
      ['sec', 'group'],
      ['q1', 'text'],
      ['n1', 'text'],
      ['s1', 'text'],
      ['t1', 'text'],
      ['sh1', 'text'],
    ]);
    expect(canvas.nodes.find((node) => node.id === 'sec')).toMatchObject({ label: 'Act one' });
    expect(canvas.nodes.find((node) => node.id === 't1')).toMatchObject({ text: 'Plain words' });
  });

  it('keeps an anchored record a text node with a link to its place in the book', () => {
    expect(canvas.nodes.find((node) => node.id === 'q1')).toEqual({
      id: 'q1',
      type: 'text',
      x: 300,
      y: 0,
      width: 160,
      height: 64,
      text: 'A quote\n\n[Emma.epub](<Emma.epub#epubcfi(/6/8!/4/2/1:0)>)',
    });
  });

  it('maps colour presets to JSON Canvas colours and leaves ink and paper uncoloured', () => {
    const colors = Object.fromEntries(canvas.nodes.map((node) => [node.id, node.color]));
    expect(colors).toMatchObject({ n1: '6', s1: '3', sh1: '4', sec: '5' });
    expect(colors['q1']).toBeUndefined();
    expect('color' in canvas.nodes.find((node) => node.id === 'q1')!).toBe(false);
  });

  it('writes integer coordinates', () => {
    expect(canvas.nodes.find((node) => node.id === 'n1')).toMatchObject({ x: 11, y: 20 });
  });

  it('keeps only edges between exported nodes, sorted by index, with labels and sides', () => {
    expect(canvas.edges).toEqual([
      { id: 'l0', fromNode: 'q1', toNode: 's1' },
      { id: 'l1', fromNode: 'n1', fromSide: 'right', toNode: 'q1', label: 'says' },
    ]);
  });

  it('exports only the records the caller includes', () => {
    const shown = exportJsonCanvas(records, {
      bookFile: 'Emma.epub',
      include: (record) => record.id !== 'q1',
    });
    expect(shown.nodes.some((node) => node.id === 'q1')).toBe(false);
    expect(shown.edges).toEqual([]);
  });
});
