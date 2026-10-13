import { describe, expect, it, vi } from 'vitest';
import { createComposeController, HISTORY_MAX } from '@/services/margins/compose/controller';
import { builtinTools, type ComposeIO, newElementId } from '@/services/margins/compose/registry';
import { emptyEnvelope, type Element } from '@/services/margins/payload';

const note = (id: string): Element => ({
  id,
  kind: 'note',
  frame: { x: 0.5, y: 0.5, w: 0.5, r: 0 },
  text: id,
});
const art = (id: string): Element => ({
  id,
  kind: 'artwork',
  frame: { x: 0.5, y: 0.5, w: 0.5, r: 0 },
  asset: `ast_${'0'.repeat(32)}`,
  alt: id,
  source: 'upload',
});
const ctx = { capped: true, quoteCost: 40 };
const io = (): ComposeIO => ({
  pickImage: vi.fn(async () => null),
  startDrawing: vi.fn(),
  addNote: vi.fn(),
  addTranslation: vi.fn(),
  pickSticker: vi.fn(),
});

describe('compose controller', () => {
  it('returns a new state per action and never mutates the old one', () => {
    const c = createComposeController(emptyEnvelope(), ctx);
    const before = c.state;
    const snapshot = JSON.stringify(before);
    c.dispatch({ type: 'add', element: note('n1') });
    expect(c.state).not.toBe(before);
    expect(JSON.stringify(before)).toBe(snapshot);
    const added = c.state;
    c.dispatch({ type: 'select', ids: ['n1'] });
    expect(c.state).not.toBe(added);
    expect(added.selection).toEqual([]);
  });

  it('adds, undoes and redoes', () => {
    const c = createComposeController(emptyEnvelope(), ctx);
    c.dispatch({ type: 'add', element: note('n1') });
    expect(c.canUndo).toBe(true);
    c.undo();
    expect(c.state.envelope.elements).toEqual([]);
    expect(c.canRedo).toBe(true);
    c.redo();
    expect(c.state.envelope.elements.map((e) => e.id)).toEqual(['n1']);
    expect(c.canRedo).toBe(false);
  });

  it('does not record selection', () => {
    const c = createComposeController(emptyEnvelope(), ctx);
    c.dispatch({ type: 'select', ids: ['x'] });
    expect(c.canUndo).toBe(false);
  });

  it('coalesces a gesture into one undo step and cancel restores', () => {
    const c = createComposeController(emptyEnvelope(), ctx);
    c.dispatch({ type: 'add', element: note('n1') });
    c.dispatch({ type: 'begin' });
    expect(c.state.mode).toBe('editing');
    for (const x of [0.1, 0.2, 0.3])
      c.dispatch({ type: 'update', id: 'n1', patch: { frame: { x, y: 0.5, w: 0.5, r: 0 } } });
    c.dispatch({ type: 'commit' });
    expect(c.state.mode).toBe('idle');
    expect(c.state.envelope.elements[0]!.frame.x).toBe(0.3);
    c.undo();
    expect(c.state.envelope.elements[0]!.frame.x).toBe(0.5);
    c.dispatch({ type: 'begin' });
    c.dispatch({ type: 'update', id: 'n1', patch: { frame: { x: 0.9, y: 0.5, w: 0.5, r: 0 } } });
    c.dispatch({ type: 'cancel' });
    expect(c.state.envelope.elements[0]!.frame.x).toBe(0.5);
    expect(c.canRedo).toBe(true);
    c.undo();
    expect(c.state.envelope.elements).toEqual([]);
    expect(c.canUndo).toBe(false);
  });

  it(`keeps ${HISTORY_MAX} undo steps`, () => {
    const c = createComposeController(emptyEnvelope(), ctx);
    for (let i = 0; i < 101; i++)
      c.dispatch({ type: 'setGround', ground: i % 2 ? 'paper' : 'ink' });
    let steps = 0;
    while (c.canUndo) {
      c.undo();
      steps++;
    }
    expect(steps).toBe(100);
    expect(c.state.envelope.ground).toBe('ink');
  });

  it('reorders z-order and removes from selection', () => {
    const c = createComposeController(emptyEnvelope(), ctx);
    for (const id of ['a', 'b', 'c']) c.dispatch({ type: 'add', element: note(id) });
    c.dispatch({ type: 'reorder', id: 'a', to: 2 });
    expect(c.state.envelope.elements.map((e) => e.id)).toEqual(['b', 'c', 'a']);
    c.dispatch({ type: 'select', ids: ['a', 'b'] });
    c.dispatch({ type: 'remove', ids: ['a'] });
    expect(c.state.envelope.elements.map((e) => e.id)).toEqual(['b', 'c']);
    expect(c.state.selection).toEqual(['b']);
  });

  it('sets the quote placement and the ground', () => {
    const c = createComposeController(emptyEnvelope(), ctx);
    c.dispatch({ type: 'setQuote', quote: { frame: { x: 0.2, y: 0.3, w: 0.4, r: 5 }, size: 'l' } });
    c.dispatch({ type: 'setGround', ground: 'lime' });
    expect(c.state.envelope.quote.size).toBe('l');
    expect(c.state.envelope.ground).toBe('lime');
  });

  it('notifies once per dispatch until unsubscribed', () => {
    const c = createComposeController(emptyEnvelope(), ctx);
    const listener = vi.fn();
    const off = c.subscribe(listener);
    c.dispatch({ type: 'add', element: note('n1') });
    c.dispatch({ type: 'select', ids: ['n1'] });
    expect(listener).toHaveBeenCalledTimes(2);
    off();
    c.undo();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('returns its tools', () => {
    expect(createComposeController(emptyEnvelope(), ctx).tools()).toEqual([]);
    const tools = builtinTools((s) => s, io());
    expect(createComposeController(emptyEnvelope(), { ...ctx, tools }).tools()).toBe(tools);
  });
});

describe('compose tools', () => {
  const t = (s: string) => s;
  const byId = (tools: ReturnType<typeof builtinTools>, id: string) =>
    tools.find((x) => x.id === id)!;

  it('lists the built-ins in display order', () => {
    expect(builtinTools(t, io()).map((x) => x.id)).toEqual([
      'select',
      'note',
      'translate',
      'gloss',
      'art.upload',
      'art.draw',
      'sticker',
      'animate',
      'ground',
      'arrange.forward',
      'arrange.back',
      'delete',
      'undo',
      'redo',
    ]);
  });

  it('disables art at four artworks and undo without history', () => {
    const tools = builtinTools(t, io());
    const c = createComposeController(emptyEnvelope(), { ...ctx, tools });
    expect(byId(tools, 'undo').enabled(c.state)).toBe(false);
    for (const id of ['a1', 'a2', 'a3']) c.dispatch({ type: 'add', element: art(id) });
    expect(byId(tools, 'art.upload').enabled(c.state)).toBe(true);
    c.dispatch({ type: 'add', element: art('a4') });
    expect(byId(tools, 'art.upload').enabled(c.state)).toBe(false);
    expect(byId(tools, 'art.draw').enabled(c.state)).toBe(false);
    expect(byId(tools, 'undo').enabled(c.state)).toBe(true);
  });

  it('cycles motion on the selection as one step and marks animate active', async () => {
    const tools = builtinTools(t, io());
    const c = createComposeController(emptyEnvelope(), { ...ctx, tools });
    c.dispatch({ type: 'add', element: note('n1') });
    c.dispatch({ type: 'select', ids: ['n1'] });
    const animate = byId(tools, 'animate');
    expect(animate.active!(c.state)).toBe(false);
    const seen = [];
    for (let i = 0; i < 4; i++) {
      await animate.run(c);
      seen.push(c.state.envelope.elements[0]!.motion);
    }
    expect(seen).toEqual(['rise', 'drift', 'breathe', undefined]);
    await animate.run(c);
    expect(animate.active!(c.state)).toBe(true);
    c.undo();
    expect(c.state.envelope.elements[0]!.motion).toBeUndefined();
  });

  it('cycles the ground, arranges, deletes and calls the io', async () => {
    const calls = io();
    const tools = builtinTools(t, calls);
    const c = createComposeController(emptyEnvelope(), { ...ctx, tools });
    await byId(tools, 'ground').run(c);
    expect(c.state.envelope.ground).toBe('ink');
    for (const id of ['a', 'b']) c.dispatch({ type: 'add', element: note(id) });
    c.dispatch({ type: 'select', ids: ['a'] });
    expect(byId(tools, 'arrange.back').enabled(c.state)).toBe(false);
    await byId(tools, 'arrange.forward').run(c);
    expect(c.state.envelope.elements.map((e) => e.id)).toEqual(['b', 'a']);
    await byId(tools, 'delete').run(c);
    expect(c.state.envelope.elements.map((e) => e.id)).toEqual(['b']);
    expect(byId(tools, 'delete').enabled(c.state)).toBe(false);
    await byId(tools, 'gloss').run(c);
    expect(calls.addTranslation).toHaveBeenCalledWith('gloss');
    await byId(tools, 'art.draw').run(c);
    expect(calls.startDrawing).toHaveBeenCalled();
  });

  it('makes short element ids', () => {
    expect(newElementId()).toMatch(/^e[0-9a-z]{8}$/);
    expect(newElementId()).not.toBe(newElementId());
  });
});
