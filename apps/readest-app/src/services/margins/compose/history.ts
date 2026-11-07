import type { Envelope } from '../payload';

export const HISTORY_MAX = 100;

export interface History {
  past: Envelope[];
  future: Envelope[];
  pending: Envelope | null;
}

export const emptyHistory = (): History => ({ past: [], future: [], pending: null });

export const record = (h: History, before: Envelope): History =>
  h.pending ? h : { past: [...h.past, before].slice(-HISTORY_MAX), future: [], pending: null };

export const beginGesture = (h: History, current: Envelope): History =>
  h.pending ? h : { ...h, pending: current };

export const commitGesture = (h: History, current: Envelope): History =>
  !h.pending || h.pending === current
    ? { ...h, pending: null }
    : { past: [...h.past, h.pending].slice(-HISTORY_MAX), future: [], pending: null };

export const undoStep = (h: History, current: Envelope): [History, Envelope] | null => {
  const previous = h.past[h.past.length - 1];
  if (!previous) return null;
  return [{ past: h.past.slice(0, -1), future: [current, ...h.future], pending: null }, previous];
};

export const redoStep = (h: History, current: Envelope): [History, Envelope] | null => {
  const [next, ...future] = h.future;
  if (!next) return null;
  return [{ past: [...h.past, current].slice(-HISTORY_MAX), future, pending: null }, next];
};
