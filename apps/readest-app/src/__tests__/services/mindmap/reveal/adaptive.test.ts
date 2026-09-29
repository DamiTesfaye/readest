import { describe, expect, it } from 'vitest';
import {
  type AdaptiveInput,
  genreOf,
  isFinished,
  resolveAdaptive,
} from '@/services/mindmap/reveal/adaptive';

describe('genreOf', () => {
  it('reads every subject shape through the contributor flattening', () => {
    expect(genreOf('History')).toBe('non-fiction');
    expect(genreOf(['Travel', 'Europe'])).toBe('non-fiction');
    expect(genreOf({ name: { en: 'Business' } })).toBe('non-fiction');
  });

  it('matches whole subject terms, so genre fiction about a topic stays fiction', () => {
    expect(genreOf('Science Fiction')).toBe('fiction');
    expect(genreOf(['Alternative History'])).toBe('fiction');
    expect(genreOf(['Fiction', 'History'])).toBe('fiction');
    expect(genreOf('Juvenile Fiction / Science')).toBe('fiction');
  });

  it('splits compound subject headings into terms', () => {
    expect(genreOf('Biography & Autobiography')).toBe('non-fiction');
    expect(genreOf('History -- Modern -- 20th century')).toBe('non-fiction');
    expect(genreOf('Juvenile Nonfiction; Animals')).toBe('non-fiction');
  });

  it('recognises the common non-fiction subject headings', () => {
    const subjects = [
      'Computers / Programming / General',
      'Cooking',
      'Art',
      'Law',
      'Medical',
      'Nature',
      'Language Arts & Disciplines',
      'Literary Criticism',
      'Non Fiction',
      'Sports & Recreation',
      'Music',
      'Family & Relationships',
      'Technology & Engineering',
      'Health & Fitness',
    ];
    expect(subjects.filter((subject) => genreOf(subject) !== 'non-fiction')).toEqual([]);
  });

  it('keeps novels about those subjects fiction', () => {
    expect(genreOf(['Fiction / Sports', 'Music'])).toBe('fiction');
    expect(genreOf('Cooking -- Fiction')).toBe('fiction');
  });

  it('counts unknown, empty and non-English subjects as fiction', () => {
    expect(genreOf(undefined)).toBe('fiction');
    expect(genreOf([])).toBe('fiction');
    expect(genreOf('Geschichte')).toBe('fiction');
  });
});

describe('isFinished', () => {
  it('is finished by reading status or by progress', () => {
    expect(isFinished('finished', 0.2)).toBe(true);
    expect(isFinished('reading', 0.99)).toBe(true);
    expect(isFinished('reading', 0.98)).toBe(false);
    expect(isFinished(undefined, 0)).toBe(false);
  });
});

describe('resolveAdaptive', () => {
  const novel: AdaptiveInput = {
    intent: 'adaptive',
    spoiler: 'adaptive',
    subject: 'Fiction',
    readingStatus: 'reading',
    progress: 0.3,
  };

  it('reads fiction as a story that grows with reading', () => {
    expect(resolveAdaptive(novel)).toEqual({ intent: 'story', spoiler: 'grow' });
  });

  it('reads non-fiction as a study map of the whole book', () => {
    expect(resolveAdaptive({ ...novel, subject: 'History' })).toEqual({
      intent: 'study',
      spoiler: 'whole',
    });
  });

  it('switches an adaptive story map to the whole book once finished', () => {
    expect(resolveAdaptive({ ...novel, readingStatus: 'finished' }).spoiler).toBe('whole');
    expect(resolveAdaptive({ ...novel, progress: 0.995 }).spoiler).toBe('whole');
  });

  it('shows the whole book for study and personal maps', () => {
    expect(resolveAdaptive({ ...novel, intent: 'study' })).toEqual({
      intent: 'study',
      spoiler: 'whole',
    });
    expect(resolveAdaptive({ ...novel, intent: 'personal' }).spoiler).toBe('whole');
  });

  it('keeps a chosen spoiler scope, fogged included', () => {
    expect(resolveAdaptive({ ...novel, spoiler: 'fogged' }).spoiler).toBe('fogged');
    const chosen = resolveAdaptive({ ...novel, spoiler: 'grow', readingStatus: 'finished' });
    expect(chosen.spoiler).toBe('grow');
  });
});
