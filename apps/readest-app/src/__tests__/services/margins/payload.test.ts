import { describe, expect, it } from 'vitest';
import {
  emptyEnvelope,
  envelopeBytes,
  leadKind,
  PAYLOAD_MAX,
  quoteCost,
  translationMax,
  validatePayload,
} from '@/services/margins/payload';
import vectors from '../../fixtures/margins/payload-vectors.json';

describe('payload', () => {
  it.each(vectors.map((v) => [v.name, v] as const))('%s', (_name, v) => {
    const got = validatePayload(v.payload, v.kind, v.quoteCost, v.capped);
    expect(got.ok).toBe(v.ok);
    if (got.ok && v.translationScalars !== undefined)
      expect(got.translationScalars).toBe(v.translationScalars);
  });

  it('counts quote cost in scalars like the server', () => {
    expect(quoteCost({ exact: '\u{1D504}'.repeat(300) })).toBe(300);
    expect(
      quoteCost({ head: 'é'.repeat(150), tail: 'x'.repeat(150), len: 900, spanHash: 'h' }),
    ).toBe(300);
    expect(translationMax(5, true)).toBe(200);
    expect(translationMax(150, true)).toBe(300);
    expect(translationMax(400, true)).toBe(600);
    expect(translationMax(5, false)).toBe(6000);
  });

  it('measures the serialised envelope in UTF-8 bytes', () => {
    const e = emptyEnvelope();
    e.elements = [
      {
        id: 't1',
        kind: 'translation',
        frame: { x: 0.5, y: 0.5, w: 0.5, r: 0 },
        mode: 'translation',
        lang: 'ja',
        text: '語'.repeat(6000),
        source: 'hand',
      },
    ];
    expect(envelopeBytes(e)).toBeGreaterThan(PAYLOAD_MAX);
    expect(envelopeBytes(emptyEnvelope())).toBe(JSON.stringify(emptyEnvelope()).length);
  });

  it('starts empty and leads with the first element kind', () => {
    const e = emptyEnvelope();
    expect(validatePayload(e, 'clip', 10, true).ok).toBe(true);
    expect(leadKind(e)).toBe('clip');
    e.elements = [{ id: 's', kind: 'sticker', frame: e.quote.frame, sticker: 'basic/star' }];
    expect(leadKind(e)).toBe('sticker');
  });

  it('keeps unknown kinds and local refs when not strict', () => {
    const frame = { x: 0.5, y: 0.5, w: 0.5, r: 0 };
    const e = { ...emptyEnvelope(), elements: [{ id: 'p', kind: 'play', frame }] };
    expect(validatePayload(e, 'play', 10, true).ok).toBe(false);
    expect(validatePayload(e, 'play', 10, true, false).ok).toBe(true);
    const local = 'local:7d6c2f3e-8a1b-4c5d-9e0f-1a2b3c4d5e6f';
    const art = {
      ...emptyEnvelope(),
      elements: [
        { id: 'a', kind: 'artwork', frame, asset: local, alt: 'A cat', source: 'drawing' },
      ],
    };
    expect(validatePayload(art, 'artwork', 10, true).ok).toBe(false);
    expect(validatePayload(art, 'artwork', 10, true, false)).toEqual({
      ok: true,
      translationScalars: 0,
      localAssets: [local],
    });
  });
});
