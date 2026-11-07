import { describe, expect, it } from 'vitest';
import {
  addShape,
  detach,
  initialSession,
  lastSentenceSpan,
  moveShape,
  nextWordSpan,
  removeShape,
  undo,
  unitFor,
  wordSpanAt,
} from '@/services/margins/play/session';

const TEXT = 'Begin the morning by saying to thyself. I shall meet with the busy-body.';
const enc = (s: string) => new TextEncoder().encode(s).length;

describe('play session', () => {
  it('shakes the last full sentence and undo restores the state exactly', () => {
    const s0 = initialSession(42);
    const span = lastSentenceSpan(TEXT, 1000, 1000 + enc(TEXT))!;
    expect(span).toEqual([
      1000 + enc('Begin the morning by saying to thyself. '),
      1000 + enc(TEXT),
    ]);
    const s1 = detach(s0, [span]);
    expect(s1.detached).toEqual([span]);
    expect(undo(s1)).toEqual(s0);
  });

  it('detaches the next word after the last detached span', () => {
    expect(nextWordSpan(TEXT, 0, 0, 'word')).toEqual([0, 5]);
    expect(nextWordSpan(TEXT, 0, 5, 'word')).toEqual([6, 9]);
    expect(nextWordSpan(TEXT, 0, enc(TEXT), 'word')).toBeNull();
  });

  it('counts offsets in UTF-8 bytes past multi-byte text', () => {
    expect(nextWordSpan('é a', 10, 11, 'word')).toEqual([13, 14]);
  });

  it('adds, moves and removes shapes with matching poses', () => {
    const s = moveShape(addShape(initialSession(1), 'circle', { x: 10, y: 20 }, 16), 's1', 5, -5);
    expect(s.shapes[0]).toMatchObject({ id: 's1', type: 'circle', r: 48 });
    expect(s.poses).toEqual([{ shape: 's1', x: 15, y: 15, rot: 0 }]);
    const t = removeShape(addShape(s, 'polygon', { x: 0, y: 0 }, 16), 's1');
    expect(t.shapes.map((x) => x.id)).toEqual(['s2']);
    expect(t.poses.map((p) => p.shape)).toEqual(['s2']);
  });

  it('detaches words, not glyphs, in joining scripts', () => {
    expect(unitFor('glyph', 'كتاب')).toBe('word');
    expect(unitFor('glyph', 'book')).toBe('glyph');
    expect(unitFor('line', 'كتاب')).toBe('line');
  });
});

describe('play spans', () => {
  it('skips spans that overlap ones already taken and finds the word under a byte', () => {
    const last = lastSentenceSpan(TEXT, 0, enc(TEXT))!;
    expect(lastSentenceSpan(TEXT, 0, enc(TEXT), [last])).toEqual([
      0,
      enc('Begin the morning by saying to thyself.'),
    ]);
    expect(nextWordSpan(TEXT, 0, 0, 'word', [[0, 5]])).toEqual([6, 9]);
    expect(wordSpanAt(TEXT, 100, 107)).toEqual([106, 109]);
    expect(wordSpanAt(TEXT, 100, 105)).toBeNull();
  });
});
