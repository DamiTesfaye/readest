import { describe, expect, it, vi } from 'vitest';
import { createSfx, landingSound, LANDING } from '@/services/margins/replay/sfx';

const index = new TextEncoder().encode(
  JSON.stringify({ v: 1, effects: [{ id: 'pop-1' }, { id: 'thud-1' }] }),
).buffer;

const fakeAudio = (decode: (bytes: ArrayBuffer) => Promise<AudioBuffer>) => {
  const starts: [string, number][] = [];
  const ctx = {
    currentTime: 5,
    destination: {},
    decodeAudioData: vi.fn(decode),
    createBufferSource: () => {
      const src = {
        buffer: null as unknown,
        onended: null,
        connect: vi.fn(),
        stop: vi.fn(),
        start: (at: number) => starts.push([(src.buffer as { id: string }).id, at]),
      };
      return src;
    },
  };
  const fetchBytes = vi.fn(async (url: string) =>
    url === '/sfx/index.json' ? index : new TextEncoder().encode(url).buffer,
  );
  return { ctx: ctx as unknown as BaseAudioContext, raw: ctx, starts, fetchBytes };
};

const decodeAll = async (bytes: ArrayBuffer) =>
  ({ id: new TextDecoder().decode(bytes).slice(5, -4) }) as unknown as AudioBuffer;

const settle = () => new Promise((r) => setTimeout(r, 0));

describe('sound effects', () => {
  it('starts an effect on the replay clock', async () => {
    const a = fakeAudio(decodeAll);
    const dateNow = vi.spyOn(Date, 'now');
    createSfx(a.ctx, a.fetchBytes).schedule('pop-1', 240, 120);
    await settle();
    expect(a.starts).toEqual([['pop-1', 6]]);
    expect(dateNow).not.toHaveBeenCalled();
  });

  it('starts an effect already due at once', async () => {
    const a = fakeAudio(decodeAll);
    createSfx(a.ctx, a.fetchBytes).schedule('pop-1', 100, 120);
    await settle();
    expect(a.starts).toEqual([['pop-1', 5]]);
  });

  it('skips an unknown id silently without fetching it', async () => {
    const a = fakeAudio(decodeAll);
    createSfx(a.ctx, a.fetchBytes).schedule('nope-1', 0, 0);
    await settle();
    expect(a.starts).toEqual([]);
    expect(a.fetchBytes.mock.calls.map(([u]) => u)).toEqual(['/sfx/index.json']);
  });

  it('skips an effect that fails to decode and does not retry it', async () => {
    const a = fakeAudio(() => Promise.reject(new Error('EncodingError')));
    const sfx = createSfx(a.ctx, a.fetchBytes);
    sfx.schedule('pop-1', 0, 0);
    await settle();
    sfx.schedule('pop-1', 0, 0);
    await settle();
    expect(a.starts).toEqual([]);
    expect(a.raw.decodeAudioData).toHaveBeenCalledTimes(1);
  });

  it('decodes each effect once', async () => {
    const a = fakeAudio(decodeAll);
    const sfx = createSfx(a.ctx, a.fetchBytes);
    sfx.schedule('thud-1', 0, 0);
    sfx.schedule('thud-1', 12, 0);
    await settle();
    expect(a.starts).toEqual([
      ['thud-1', 5],
      ['thud-1', 5.1],
    ]);
    expect(a.raw.decodeAudioData).toHaveBeenCalledTimes(1);
  });

  it('starts nothing scheduled before a stop', async () => {
    const a = fakeAudio(decodeAll);
    const sfx = createSfx(a.ctx, a.fetchBytes);
    sfx.schedule('pop-1', 0, 0);
    sfx.stop();
    await settle();
    expect(a.starts).toEqual([]);
  });

  it('picks a stable landing sound', () => {
    expect(landingSound(7, 0)).toBe('thud-2');
    expect(landingSound(7, 0)).toBe(landingSound(7, 0));
    expect(LANDING.map((_, n) => landingSound(0, n))).toEqual(['thud-1', 'thud-2', 'thud-3']);
  });
});
