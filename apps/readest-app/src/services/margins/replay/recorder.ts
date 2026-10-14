import { round2 } from '../play/element';
import { EV, MAX_EVENTS, MAX_STEPS, SFX_ID, STEP_HZ } from './scene';

export interface Recorder {
  push(nowMs: number, kind: number, args: number[]): void;
  events(): number[][];
  sound(nowMs: number, id: string): void;
  sfx(): [number, string][];
  truncated(nowMs: number): boolean;
}

export const createRecorder = (startMs: number): Recorder => {
  const out: number[][] = [];
  const sounds: [number, string][] = [];
  let dropped = false;
  const stepAt = (nowMs: number) => Math.floor(((nowMs - startMs) * STEP_HZ) / 1000);
  return {
    push(nowMs, kind, args) {
      const last = out[out.length - 1];
      const step = Math.max(stepAt(nowMs), last?.[0] ?? 0);
      const event = [step, kind, ...args.map(round2)];
      if (kind === EV.MOVE && last?.[0] === step && last[1] === EV.MOVE)
        out[out.length - 1] = event;
      else if (step > MAX_STEPS || out.length >= MAX_EVENTS) dropped = true;
      else out.push(event);
    },
    events: () => out.map((e) => [...e]),
    sound(nowMs, id) {
      const step = stepAt(nowMs);
      if (SFX_ID.test(id) && step <= MAX_STEPS && sounds.length < MAX_EVENTS)
        sounds.push([Math.max(step, sounds[sounds.length - 1]?.[0] ?? 0), id]);
    },
    sfx: () => sounds.map(([step, id]) => [step, id]),
    truncated: (nowMs) => dropped || stepAt(nowMs) > MAX_STEPS,
  };
};
