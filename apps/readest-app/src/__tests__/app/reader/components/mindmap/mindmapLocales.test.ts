import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const LOCALES_DIR = path.join(process.cwd(), 'public/locales');
const PLURAL_REFERENCE = '{{count}} new item(s) downloaded from OPDS';
const LOCAL_DELETE_KEYS = [
  'Delete from this device',
  'Tap again to delete from this device',
  'A synced copy returns after the app restarts.',
];

const catalog = (locale: string): Record<string, string> =>
  JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, locale, 'translation.json'), 'utf8'));

const pluralSuffixes = (entries: Record<string, string>, key: string): string[] =>
  Object.keys(entries)
    .filter((name) => name.startsWith(`${key}_`))
    .map((name) => name.slice(key.length + 1))
    .sort();

describe('mind map locale strings', () => {
  for (const locale of fs.readdirSync(LOCALES_DIR)) {
    it(`translates the new node count with every plural form in ${locale}`, () => {
      const entries = catalog(locale);
      const expected = pluralSuffixes(entries, PLURAL_REFERENCE);
      expect(pluralSuffixes(entries, '{{count}} new')).toEqual(expected);
      for (const suffix of expected) {
        expect(entries[`{{count}} new_${suffix}`]).toContain('{{count}}');
      }
    });

    if (locale === 'en') continue;
    it(`translates the local-only delete of an unreadable map in ${locale}`, () => {
      const entries = catalog(locale);
      for (const key of LOCAL_DELETE_KEYS) {
        expect(entries[key]).toBeTruthy();
        expect(entries[key]).not.toBe('__STRING_NOT_TRANSLATED__');
      }
    });
    it(`translates the incoming link description in ${locale}`, () => {
      const value = catalog(locale)['{{relation}} (from {{source}})'] ?? '';
      expect(value).toContain('{{relation}}');
      expect(value).toContain('{{source}}');
    });
  }
});
