import { round2 } from '../play/element';
import { EV, MAX_EVENTS, MAX_STEPS, STEP_HZ } from './scene';

export interface Recorder {
  push(nowMs: number, kind: number, args: number[]): void;
  events(): number[][];
  truncated(nowMs: number): boolean;
}

export const createRecorder = (startMs: number): Recorder => {
  const out: number[][] = [];
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
    truncated: (nowMs) => dropped || stepAt(nowMs) > MAX_STEPS,
  };
};
