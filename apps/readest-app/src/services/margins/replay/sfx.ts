import { STEP_HZ } from './scene';

export const LANDING = ['thud-1', 'thud-2', 'thud-3'] as const;
export const landingSound = (seed: number, n: number) => LANDING[(seed + n) % LANDING.length]!;

export interface Sfx {
  schedule(id: string, stepAt: number, replayNowStep: number): void;
  stop(): void;
}

const SFX_BASE = '/sfx/';

const knownIds = async (fetchBytes: (url: string) => Promise<ArrayBuffer>) => {
  const index = JSON.parse(new TextDecoder().decode(await fetchBytes(`${SFX_BASE}index.json`)));
  return new Set((index as { effects: { id: string }[] }).effects.map((e) => e.id));
};

export const createSfx = (
  ctx: BaseAudioContext,
  fetchBytes: (url: string) => Promise<ArrayBuffer>,
): Sfx => {
  const buffers = new Map<string, Promise<AudioBuffer | null>>();
  const playing = new Set<AudioBufferSourceNode>();
  let ids: Promise<Set<string>> | null = null;
  let generation = 0;

  const bufferOf = (id: string) => {
    let buffer = buffers.get(id);
    if (!buffer) {
      ids ??= knownIds(fetchBytes).catch(() => new Set<string>());
      buffer = ids
        .then((known) =>
          known.has(id)
            ? fetchBytes(`${SFX_BASE}${id}.ogg`).then((bytes) => ctx.decodeAudioData(bytes))
            : null,
        )
        .catch(() => null);
      buffers.set(id, buffer);
    }
    return buffer;
  };

  return {
    schedule(id, stepAt, replayNowStep) {
      const at = ctx.currentTime + Math.max(0, (stepAt - replayNowStep) / STEP_HZ);
      const scheduled = generation;
      void bufferOf(id).then((buffer) => {
        if (!buffer || scheduled !== generation) return;
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.onended = () => playing.delete(source);
        playing.add(source);
        source.start(at);
      });
    },
    stop() {
      generation++;
      for (const source of playing) source.stop();
      playing.clear();
    },
  };
};

let shared: { ctx: AudioContext; sfx: Sfx } | null = null;

export const sharedSfx = (): Sfx | null => {
  if (typeof AudioContext === 'undefined') return null;
  shared ??= (() => {
    const ctx = new AudioContext();
    const fetchBytes = (url: string) =>
      fetch(url).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.statusText))));
    return { ctx, sfx: createSfx(ctx, fetchBytes) };
  })();
  if (shared.ctx.state === 'suspended') void shared.ctx.resume();
  return shared.sfx;
};
