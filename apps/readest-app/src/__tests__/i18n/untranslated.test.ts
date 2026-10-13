import { describe, expect, it } from 'vitest';
import { parseLocaleBundle, UNTRANSLATED_MARKER } from '@/i18n/untranslated';

describe('parseLocaleBundle', () => {
  it('drops entries still holding the untranslated marker', () => {
    const raw = JSON.stringify({
      Library: 'Bibliothek',
      'Return to base': UNTRANSLATED_MARKER,
    });
    expect(parseLocaleBundle(raw)).toEqual({ Library: 'Bibliothek' });
  });

  it('drops empty translations so the English key is shown', () => {
    expect(parseLocaleBundle(JSON.stringify({ Home: '', Back: 'Zurück' }))).toEqual({
      Back: 'Zurück',
    });
  });

  it('keeps plural variants that are translated', () => {
    const raw = JSON.stringify({
      '{{count}} results_one': '{{count}} Ergebnis',
      '{{count}} results_other': UNTRANSLATED_MARKER,
    });
    expect(parseLocaleBundle(raw)).toEqual({ '{{count}} results_one': '{{count}} Ergebnis' });
  });

  it('ignores non-string values', () => {
    expect(parseLocaleBundle(JSON.stringify({ a: 1, b: null, c: 'ok' }))).toEqual({ c: 'ok' });
  });

  it('returns an empty bundle for non-object JSON', () => {
    expect(parseLocaleBundle('[]')).toEqual({});
    expect(parseLocaleBundle('null')).toEqual({});
  });
});
