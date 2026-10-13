import type { Element, Envelope, Ground } from '../payload';
import {
  beginGesture,
  commitGesture,
  emptyHistory,
  type History,
  record,
  redoStep,
  undoStep,
} from './history';

export { HISTORY_MAX } from './history';

export type BuiltinToolId =
  | 'select'
  | 'note'
  | 'translate'
  | 'gloss'
  | 'art.upload'
  | 'art.draw'
  | 'sticker'
  | 'animate'
  | 'ground'
  | 'arrange.forward'
  | 'arrange.back'
  | 'delete'
  | 'undo'
  | 'redo';
export type ToolId = BuiltinToolId | (string & {});

export type QuotePlacement = Envelope['quote'];

export interface ComposeState {
  envelope: Envelope;
  selection: string[];
  mode: 'idle' | 'drawing' | 'editing';
  canUndo: boolean;
  canRedo: boolean;
}

export interface ComposeTool {
  id: ToolId;
  label: string;
  group: 'create' | 'style' | 'arrange' | 'history';
  enabled(state: ComposeState): boolean;
  active?(state: ComposeState): boolean;
  run(controller: ComposeController): void | Promise<void>;
}

export type ComposeAction =
  | { type: 'add'; element: Element }
  | { type: 'update'; id: string; patch: Partial<Element> }
  | { type: 'remove'; ids: string[] }
  | { type: 'reorder'; id: string; to: number }
  | { type: 'setGround'; ground: Ground }
  | { type: 'setQuote'; quote: QuotePlacement }
  | { type: 'select'; ids: string[] }
  | { type: 'begin' }
  | { type: 'commit' }
  | { type: 'cancel' };

export interface ComposeController {
  readonly state: ComposeState;
  dispatch(action: ComposeAction): void;
  undo(): void;
  redo(): void;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  subscribe(listener: () => void): () => void;
  tools(): readonly ComposeTool[];
}

const apply = (envelope: Envelope, action: ComposeAction): Envelope => {
  const { elements } = envelope;
  switch (action.type) {
    case 'add':
      return { ...envelope, elements: [...elements, action.element] };
    case 'update':
      return {
        ...envelope,
        elements: elements.map((e) =>
          e.id === action.id ? ({ ...e, ...action.patch, id: e.id } as Element) : e,
        ),
      };
    case 'remove':
      return { ...envelope, elements: elements.filter((e) => !action.ids.includes(e.id)) };
    case 'reorder': {
      const from = elements.findIndex((e) => e.id === action.id);
      if (from < 0) return envelope;
      const rest = elements.filter((_, i) => i !== from);
      const to = Math.max(0, Math.min(action.to, rest.length));
      return { ...envelope, elements: [...rest.slice(0, to), elements[from]!, ...rest.slice(to)] };
    }
    case 'setGround':
      return { ...envelope, ground: action.ground };
    case 'setQuote':
      return { ...envelope, quote: action.quote };
    default:
      return envelope;
  }
};

export const createComposeController = (
  initial: Envelope,
  ctx: { capped: boolean; quoteCost: number; tools?: readonly ComposeTool[] },
): ComposeController => {
  let history: History = emptyHistory();
  let state: ComposeState = {
    envelope: initial,
    selection: [],
    mode: 'idle',
    canUndo: false,
    canRedo: false,
  };
  const listeners = new Set<() => void>();

  const set = (envelope: Envelope, selection: string[], mode: ComposeState['mode']) => {
    const ids = new Set(envelope.elements.map((e) => e.id));
    state = {
      envelope,
      selection: selection.filter((id) => ids.has(id)),
      mode,
      canUndo: history.past.length > 0,
      canRedo: history.future.length > 0,
    };
    for (const listener of [...listeners]) listener();
  };

  const step = (move: typeof undoStep) => {
    history = commitGesture(history, state.envelope);
    const moved = move(history, state.envelope);
    if (!moved) return;
    history = moved[0];
    set(moved[1], state.selection, 'idle');
  };

  return {
    get state() {
      return state;
    },
    get canUndo() {
      return state.canUndo;
    },
    get canRedo() {
      return state.canRedo;
    },
    dispatch(action) {
      const { envelope, selection, mode } = state;
      switch (action.type) {
        case 'select':
          return set(envelope, action.ids, mode);
        case 'begin':
          history = beginGesture(history, envelope);
          return set(envelope, selection, 'editing');
        case 'commit':
          history = commitGesture(history, envelope);
          return set(envelope, selection, 'idle');
        case 'cancel': {
          const restored = history.pending ?? envelope;
          history = { ...history, pending: null };
          return set(restored, selection, 'idle');
        }
        default: {
          const next = apply(envelope, action);
          if (next !== envelope) history = record(history, envelope);
          return set(next, selection, mode);
        }
      }
    },
    undo: () => step(undoStep),
    redo: () => step(redoStep),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    tools: () => ctx.tools ?? [],
  };
};
