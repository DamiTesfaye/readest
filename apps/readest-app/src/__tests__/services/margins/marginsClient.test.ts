import { describe, expect, it } from 'vitest';
import { createMarginsCore } from '@/services/margins/marginsClient';

type Request = { id: number; method: string; args: unknown[] };

const fakeWorker = () => {
  const listeners: ((e: MessageEvent) => void)[] = [];
  const reply = (data: unknown) => listeners.forEach((l) => l({ data } as MessageEvent));
  return {
    sent: [] as Request[],
    reply,
    postMessage(req: Request) {
      this.sent.push(req);
    },
    addEventListener(type: string, l: (e: MessageEvent) => void) {
      if (type === 'message') listeners.push(l);
    },
  };
};

describe('createMarginsCore', () => {
  it('routes concurrent replies to their own calls', async () => {
    const w = fakeWorker();
    const core = createMarginsCore(w as unknown as Worker);
    const a = core.mapOffset('ab', 'abc', 1);
    const b = core.fromRaw('h', 2, 3, 4);
    expect(w.sent.map((r) => r.method)).toEqual(['mapOffset', 'fromRaw']);
    const [ra, rb] = w.sent;
    w.reply({ id: rb!.id, result: [rb!.method, rb!.args] });
    w.reply({ id: ra!.id, result: [ra!.method, ra!.args] });
    expect(await a).toEqual(['mapOffset', ['ab', 'abc', 1]]);
    expect(await b).toEqual(['fromRaw', ['h', 2, 3, 4]]);
  });

  it('rejects with the worker error message', async () => {
    const w = fakeWorker();
    const core = createMarginsCore(w as unknown as Worker);
    const p = core.fingerprint('missing');
    w.reply({ id: w.sent[0]!.id, error: 'book not loaded' });
    await expect(p).rejects.toThrow('book not loaded');
  });

  it('rejects pending calls when the worker fails', async () => {
    const listeners: ((e: Event) => void)[] = [];
    const w = {
      postMessage() {},
      addEventListener(type: string, l: (e: Event) => void) {
        if (type === 'error') listeners.push(l);
      },
    };
    const core = createMarginsCore(w as unknown as Worker);
    const p = core.fingerprint('h');
    listeners.forEach((l) => l(new Event('error')));
    await expect(p).rejects.toThrow('margins core worker failed');
  });
});

describe('margins-core worker methods', () => {
  it('drive the real wasm through the client', async () => {
    const { createTestCore } = await import('./coreHarness');
    const core = await createTestCore();
    await core.loadBook('h', [{ runs: ['Alice was ', 'beginning'], breaks: [], skip: false }]);
    expect((await core.canonicalSection('h', 0)).text).toBe('Alice was beginning');
    expect(await core.fromRaw('h', 0, 1, 2)).toBe(12);
    await expect(core.fingerprint('nope')).rejects.toThrow('book not loaded');
  });
});
