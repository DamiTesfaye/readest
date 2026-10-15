import { describe, expect, it, vi } from 'vitest';

const session = vi.hoisted(() => ({
  getSession: vi.fn(async () => ({ me: { id: 'usr_1' } })),
  amplereadFetch: vi.fn(),
}));

vi.mock('@/services/ampleread/auth/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/ampleread/auth/session')>()),
  getSession: session.getSession,
  amplereadFetch: session.amplereadFetch,
}));

import { CARD_HEIGHT, CARD_WIDTH, renderCard, uploadCard } from '@/services/margins/public/card';

const artBlob = async () => {
  const canvas = new OffscreenCanvas(64, 64);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#C8F135';
  ctx.fillRect(0, 0, 64, 64);
  return canvas.convertToBlob({ type: 'image/png' });
};

const quote = 'To live a good life: we have the potential for it. '.repeat(6).slice(0, 280);

describe('Margin preview card', () => {
  it('renders the quote, art, handle and title to a 1200 × 630 PNG', async () => {
    const png = await renderCard({
      quote,
      handle: 'reader_1',
      bookTitle: 'Meditations',
      ground: 'ink',
      art: [await artBlob()],
    });
    expect(png.type).toBe('image/png');
    expect(png.size).toBeLessThan(8 * 1024 * 1024);
    expect([...new Uint8Array(await png.slice(0, 4).arrayBuffer())]).toEqual([
      0x89, 0x50, 0x4e, 0x47,
    ]);
    const bitmap = await createImageBitmap(png);
    expect([bitmap.width, bitmap.height]).toEqual([CARD_WIDTH, CARD_HEIGHT]);
    const canvas = new OffscreenCanvas(CARD_WIDTH, CARD_HEIGHT);
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(bitmap, 0, 0);
    const colours = new Set<string>();
    for (const x of [0.1, 0.5, 0.9])
      for (const y of [0.1, 0.5, 0.9]) {
        const radius = 40;
        const { data } = ctx.getImageData(
          x * CARD_WIDTH - radius,
          y * CARD_HEIGHT - radius,
          2 * radius,
          2 * radius,
        );
        for (let i = 0; i < data.length; i += 4)
          colours.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
      }
    expect(colours.size).toBeGreaterThan(1);
  });

  it('renders without art or a title', async () => {
    const png = await renderCard({
      quote: 'Short.',
      handle: 'r',
      bookTitle: null,
      ground: 'paper',
      art: [],
    });
    const bitmap = await createImageBitmap(png);
    expect([bitmap.width, bitmap.height]).toEqual([CARD_WIDTH, CARD_HEIGHT]);
  });

  it('uploads the PNG as a layer asset and returns its id', async () => {
    session.amplereadFetch.mockResolvedValue(
      new Response(JSON.stringify({ id: 'ast_card' }), { status: 201 }),
    );
    const png = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' });
    expect(await uploadCard(png)).toBe('ast_card');
    const [path, init] = session.amplereadFetch.mock.calls[0]!;
    expect(path).toBe('/v1/layer-assets');
    expect(init.method).toBe('POST');
    expect(new Headers(init.headers).get('content-type')).toBe('image/png');
    expect(init.body).toBe(png);
  });

  it('rejects a refused upload', async () => {
    session.amplereadFetch.mockResolvedValue(
      new Response(JSON.stringify({ error: 'asset_too_large', message: 'Too big' }), {
        status: 413,
      }),
    );
    await expect(uploadCard(new Blob([], { type: 'image/png' }))).rejects.toMatchObject({
      status: 413,
      code: 'asset_too_large',
    });
  });
});
