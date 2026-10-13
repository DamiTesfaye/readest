import { describe, expect, it } from 'vitest';
import { resolvePlayFont, standInFor } from '@/services/margins/play/fonts';
import type { CustomFont } from '@/styles/fonts';

const ttf = new Uint8Array([0, 1, 0, 0, 9]);
const woff2 = new Uint8Array([0x77, 0x4f, 0x46, 0x32]);
const custom = [
  { id: 'f1', name: 'Literata', family: 'Literata', path: 'x', blobUrl: 'blob:a' },
] as CustomFont[];

describe('play fonts', () => {
  it('picks the stand-in by generic family', () => {
    expect(standInFor('"Literata", serif')).toBe('serif');
    expect(standInFor('Inter, sans-serif')).toBe('sans');
    expect(standInFor('monospace')).toBe('sans');
  });

  it('uses the reader face when its bytes are sfnt or WOFF 1.0', async () => {
    const r = await resolvePlayFont({
      cssFamily: '"Literata", serif',
      customFonts: custom,
      fetchBytes: async () => ttf,
    });
    expect(r).toMatchObject({ tier: 'reader', key: 'custom:f1' });
  });

  it('falls back to the stand-in for WOFF2', async () => {
    const urls: string[] = [];
    const r = await resolvePlayFont({
      cssFamily: 'Literata, serif',
      customFonts: custom,
      fetchBytes: async (u) => {
        urls.push(u);
        return u.startsWith('blob:') ? woff2 : ttf;
      },
    });
    expect(r).toMatchObject({ tier: 'standIn', key: 'SourceSerif4-Regular' });
    expect(urls).toEqual(['blob:a', '/vendor/margin-play/fonts/SourceSerif4-Regular.ttf']);
  });

  it('falls back to the stand-in when the reader face cannot be read', async () => {
    const r = await resolvePlayFont({
      cssFamily: 'Literata',
      customFonts: custom,
      fetchBytes: async (u) => {
        if (u.startsWith('blob:')) throw new Error('revoked');
        return ttf;
      },
    });
    expect(r).toMatchObject({ tier: 'standIn', key: 'SourceSerif4-Regular' });
  });
});
