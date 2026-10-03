import { describe, it, expect } from 'vitest';
import { POPULAR_CATALOG_GROUPS } from '@/app/opds/utils/popularCatalogs';

describe('POPULAR_CATALOG_GROUPS', () => {
  const allCatalogs = POPULAR_CATALOG_GROUPS.flatMap((group) => group.catalogs);

  it('defines the classics and world literature groups', () => {
    expect(POPULAR_CATALOG_GROUPS.map((group) => group.title)).toEqual([
      'Classics & Digital Libraries',
      'World Literature',
    ]);
  });

  it('keeps the original four catalogs in the classics group', () => {
    const classics = POPULAR_CATALOG_GROUPS[0]!.catalogs.map((c) => c.id);
    expect(classics).toEqual(
      expect.arrayContaining(['gutenberg', 'standardebooks', 'manybooks', 'unglue.it']),
    );
  });

  it('includes the verified OPDS additions with their feed URLs', () => {
    const byId = new Map(allCatalogs.map((c) => [c.id, c.url]));
    expect(byId.get('internetarchive')).toBe('https://archive.org/services/opds');
    expect(byId.get('openlibrary')).toBe('https://openlibrary.org/opds');
    expect(byId.get('gallica')).toBe('https://gallica.bnf.fr/opds');
    expect(byId.get('wolnelektury')).toBe('https://wolnelektury.pl/opds/');
    expect(byId.get('ebooksgratuits')).toBe('https://www.ebooksgratuits.com/opds/');
    expect(byId.get('textosinfo')).toBe('https://www.textos.info/opds');
  });

  it('has unique ids and urls across all groups', () => {
    const ids = allCatalogs.map((c) => c.id);
    const urls = allCatalogs.map((c) => c.url);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it('uses https urls and names every entry', () => {
    for (const catalog of allCatalogs) {
      expect(catalog.url).toMatch(/^https:\/\//);
      expect(catalog.name.length).toBeGreaterThan(0);
      expect(catalog.description?.length ?? 0).toBeGreaterThan(0);
    }
  });
});
