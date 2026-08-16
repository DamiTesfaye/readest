import { describe, expect, it } from 'vitest';

import { search } from 'foliate-js/search.js';

interface Excerpt {
  pre: string;
  match: string;
  post: string;
}
interface FlatRange {
  startIndex: number;
  startOffset: number;
  endIndex: number;
  endOffset: number;
}
interface Result {
  range: FlatRange;
  excerpt: Excerpt;
}

const run = (strs: string[], query: string, opts: Record<string, unknown>): Result[] =>
  [...search(strs, query, opts)] as Result[];

const matches = (strs: string[], query: string, opts: Record<string, unknown>): string[] =>
  run(strs, query, opts).map((r) => r.excerpt.match);

describe('ignorePunctuation modifier', () => {
  it('matches a query that omits punctuation inside a word', () => {
    expect(matches(["don't stop"], 'dont', { ignorePunctuation: true })).toEqual(["don't"]);
  });

  it('matches a phrase whose punctuation differs from the query', () => {
    expect(matches(['say hello, world now'], 'hello world', { ignorePunctuation: true })).toEqual([
      'hello, world',
    ]);
  });

  it('is off by default', () => {
    expect(matches(["don't stop"], 'dont', {})).toEqual([]);
  });

  it('still honours matchCase', () => {
    expect(matches(["Don't don't"], 'dont', { ignorePunctuation: true }).length).toBe(2);
    expect(matches(["Don't don't"], 'dont', { ignorePunctuation: true, matchCase: true })).toEqual([
      "don't",
    ]);
  });

  it('maps a match spanning multiple text nodes back to a range', () => {
    const r = run(['he said "he', 'llo, world"'], 'hello world', { ignorePunctuation: true });
    expect(r.length).toBe(1);
    expect(r[0]!.range.startIndex).toBe(0);
    expect(r[0]!.range.endIndex).toBe(1);
  });
});

describe('fuzzy modifier', () => {
  it('matches a word with a single transposition', () => {
    expect(matches(['the quick brown fox'], 'quikc', { fuzzy: true })).toEqual(['quick']);
  });

  it('matches a word with a single substitution', () => {
    expect(matches(['the quick brown fox'], 'brawn', { fuzzy: true })).toEqual(['brown']);
  });

  it('rejects a word beyond the edit budget', () => {
    expect(matches(['the quick brown fox'], 'zzzzz', { fuzzy: true })).toEqual([]);
  });

  it('is off by default', () => {
    expect(matches(['the quick brown fox'], 'quikc', {})).toEqual([]);
  });

  it('matches a multi-word phrase with one typo', () => {
    expect(matches(['the quick brown fox'], 'quick brwon', { fuzzy: true })).toEqual([
      'quick brown',
    ]);
  });

  it('still matches the exact term', () => {
    expect(matches(['the quick brown fox'], 'quick', { fuzzy: true })).toEqual(['quick']);
  });
});

describe('fuzzy and ignorePunctuation combined', () => {
  it('tolerates both a typo and differing punctuation', () => {
    expect(
      matches(["he said don't stop"], 'dnot', { fuzzy: true, ignorePunctuation: true }),
    ).toEqual(["don't"]);
  });
});

describe('modifiers with nearby-words mode', () => {
  it('ignorePunctuation lets a punctuated query word match', () => {
    const opts = { mode: 'nearby-words', nearbyWords: 10 };
    expect(run(['the cat and the hat'], 'cat, hat', opts).length).toBe(0);
    expect(
      run(['the cat and the hat'], 'cat, hat', { ...opts, ignorePunctuation: true }).length,
    ).toBe(1);
  });

  it('fuzzy tolerates a typo in one of the words', () => {
    const r = run(['the cat and the hat'], 'cta hat', {
      mode: 'nearby-words',
      fuzzy: true,
      nearbyWords: 10,
    });
    expect(r.length).toBe(1);
  });
});
