import { ARTWORK_MAX, ELEMENTS_MAX, type Ground, type Motion } from '../payload';
import type { ComposeController, ComposeState, ComposeTool } from './controller';

export interface ComposeIO {
  pickImage(): Promise<File | null>;
  startDrawing(): void;
  addNote(): void;
  addTranslation(mode: 'translation' | 'gloss'): void;
  pickSticker(): void;
}

const MOTIONS: (Motion | undefined)[] = [undefined, 'rise', 'drift', 'breathe'];
const GROUNDS: Ground[] = ['paper', 'ink', 'lime'];

const next = <T>(list: T[], current: T): T => list[(list.indexOf(current) + 1) % list.length]!;

export const newElementId = (): string =>
  `e${Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => (b % 36).toString(36)).join('')}`;

const hasRoom = (s: ComposeState) => s.envelope.elements.length < ELEMENTS_MAX;
const artRoom = (s: ComposeState) =>
  hasRoom(s) && s.envelope.elements.filter((e) => e.kind === 'artwork').length < ARTWORK_MAX;
const selected = (s: ComposeState) => s.envelope.elements.filter((e) => s.selection.includes(e.id));
const single = (s: ComposeState) =>
  s.selection.length === 1 ? s.envelope.elements.findIndex((e) => e.id === s.selection[0]) : -1;

const cycleMotion = (c: ComposeController) => {
  const [first] = selected(c.state);
  if (!first) return;
  const motion = next(MOTIONS, first.motion ?? undefined);
  c.dispatch({ type: 'begin' });
  for (const id of c.state.selection) c.dispatch({ type: 'update', id, patch: { motion } });
  c.dispatch({ type: 'commit' });
};

const move = (c: ComposeController, by: number) => {
  const i = single(c.state);
  if (i >= 0) c.dispatch({ type: 'reorder', id: c.state.selection[0]!, to: i + by });
};

export const builtinTools = (t: (s: string) => string, io: ComposeIO): ComposeTool[] => [
  {
    id: 'select',
    label: t('Select'),
    group: 'arrange',
    enabled: () => true,
    run: (c) => c.dispatch({ type: 'select', ids: [] }),
  },
  { id: 'note', label: t('Note'), group: 'create', enabled: hasRoom, run: () => io.addNote() },
  {
    id: 'translate',
    label: t('Translate'),
    group: 'create',
    enabled: hasRoom,
    run: () => io.addTranslation('translation'),
  },
  {
    id: 'gloss',
    label: t('Gloss'),
    group: 'create',
    enabled: hasRoom,
    run: () => io.addTranslation('gloss'),
  },
  {
    id: 'art.upload',
    label: t('Add image'),
    group: 'create',
    enabled: artRoom,
    run: async () => {
      await io.pickImage();
    },
  },
  {
    id: 'art.draw',
    label: t('Draw'),
    group: 'create',
    enabled: artRoom,
    run: () => io.startDrawing(),
  },
  {
    id: 'sticker',
    label: t('Sticker'),
    group: 'create',
    enabled: hasRoom,
    run: () => io.pickSticker(),
  },
  {
    id: 'animate',
    label: t('Animate'),
    group: 'style',
    enabled: (s) => s.selection.length > 0,
    active: (s) => selected(s).some((e) => e.motion),
    run: cycleMotion,
  },
  {
    id: 'ground',
    label: t('Background'),
    group: 'style',
    enabled: () => true,
    run: (c) => c.dispatch({ type: 'setGround', ground: next(GROUNDS, c.state.envelope.ground) }),
  },
  {
    id: 'arrange.forward',
    label: t('Bring forward'),
    group: 'arrange',
    enabled: (s) => single(s) >= 0 && single(s) < s.envelope.elements.length - 1,
    run: (c) => move(c, 1),
  },
  {
    id: 'arrange.back',
    label: t('Send backward'),
    group: 'arrange',
    enabled: (s) => single(s) > 0,
    run: (c) => move(c, -1),
  },
  {
    id: 'delete',
    label: t('Delete'),
    group: 'arrange',
    enabled: (s) => s.selection.length > 0,
    run: (c) => c.dispatch({ type: 'remove', ids: c.state.selection }),
  },
  {
    id: 'undo',
    label: t('Undo'),
    group: 'history',
    enabled: (s) => s.canUndo,
    run: (c) => c.undo(),
  },
  {
    id: 'redo',
    label: t('Redo'),
    group: 'history',
    enabled: (s) => s.canRedo,
    run: (c) => c.redo(),
  },
];
