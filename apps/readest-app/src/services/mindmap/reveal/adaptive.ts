import type { BookMetadata } from '@/libs/document';
import type { ResolvedIntent } from '@/services/mindmap/generate/types';
import type { MapIntent, MapSpoiler } from '@/services/mindmap/schema/types';
import type { ReadingStatus } from '@/types/book';
import { flattenContributors } from '@/utils/book';

export type Genre = 'fiction' | 'non-fiction';
export type ResolvedSpoiler = Exclude<MapSpoiler, 'adaptive'>;

export interface AdaptiveInput {
  intent: MapIntent;
  spoiler: MapSpoiler;
  subject: BookMetadata['subject'];
  readingStatus: ReadingStatus | undefined;
  progress: number;
}

export interface ResolvedMapMode {
  intent: ResolvedIntent;
  spoiler: ResolvedSpoiler;
}

export const FINISHED_PROGRESS = 0.99;

const TERM_SEPARATOR = /\s*(?:[,;/|&]|--)\s*/;
const FICTION_TERM = /\b(?<!non-?)fiction\b|\bnovels?\b/;
const NON_FICTION_TERM = /\bnon-?fiction\b/;
const NON_FICTION_SUBJECTS: ReadonlySet<string> = new Set([
  'history',
  'biography',
  'autobiography',
  'memoir',
  'memoirs',
  'science',
  'business',
  'economics',
  'self-help',
  'self help',
  'philosophy',
  'psychology',
  'politics',
  'political science',
  'religion',
  'reference',
  'education',
  'health',
  'true crime',
  'travel',
  'essays',
  'social science',
  'mathematics',
  'technology',
]);

const subjectTerms = (subject: BookMetadata['subject']): string[] =>
  (subject ? flattenContributors(subject) : '')
    .toLowerCase()
    .split(TERM_SEPARATOR)
    .map((term) => term.trim())
    .filter(Boolean);

export const genreOf = (subject: BookMetadata['subject']): Genre => {
  const terms = subjectTerms(subject);
  if (terms.some((term) => FICTION_TERM.test(term))) return 'fiction';
  const nonFiction = terms.some(
    (term) => NON_FICTION_TERM.test(term) || NON_FICTION_SUBJECTS.has(term),
  );
  return nonFiction ? 'non-fiction' : 'fiction';
};

export const isFinished = (readingStatus: ReadingStatus | undefined, progress: number): boolean =>
  readingStatus === 'finished' || progress >= FINISHED_PROGRESS;

export const resolveAdaptive = (input: AdaptiveInput): ResolvedMapMode => {
  const nonFiction = genreOf(input.subject) === 'non-fiction';
  const intent = input.intent === 'adaptive' ? (nonFiction ? 'study' : 'story') : input.intent;
  if (input.spoiler !== 'adaptive') return { intent, spoiler: input.spoiler };
  const whole = nonFiction || intent !== 'story' || isFinished(input.readingStatus, input.progress);
  return { intent, spoiler: whole ? 'whole' : 'grow' };
};
