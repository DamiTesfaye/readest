import { describe, expect, test } from 'vitest';
import { MetadataService } from '@/services/metadata/service';

describe('MetadataService default providers', () => {
  test('registers no external catalog provider without configuration', () => {
    expect(new MetadataService().getProviders()).toEqual([]);
  });

  test('registers Google Books only when an API key is configured', () => {
    expect(new MetadataService({ googleBooksApiKeys: 'key' }).getProviders()).toEqual([
      'googlebooks',
    ]);
  });
});
