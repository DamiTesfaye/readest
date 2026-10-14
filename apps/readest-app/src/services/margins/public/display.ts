import type { Display } from './api';

export const defaultDisplay = (payload: unknown): Display => {
  const elements = (payload as { elements?: unknown } | null)?.elements;
  return Array.isArray(elements) &&
    elements.some((e) => (e as { kind?: unknown } | null)?.kind === 'play')
    ? 'shape'
    : 'quote';
};
