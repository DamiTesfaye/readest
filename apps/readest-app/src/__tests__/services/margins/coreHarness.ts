import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import init, * as wasm from '../../../../../../packages/margin-core-wasm/dist/web/margin_core_wasm.js';
import { answer, coreMethods } from '../../../../public/workers/margins-core-methods.js';
import { createMarginsCore } from '@/services/margins/marginsClient';

export const marginsPkg = resolve(__dirname, '../../../../../../packages/margin-core-wasm');

export const createTestCore = async () => {
  await init({ module_or_path: readFileSync(`${marginsPkg}/dist/web/margin_core_wasm_bg.wasm`) });
  const methods = coreMethods(wasm);
  const listeners: ((e: MessageEvent) => void)[] = [];
  return createMarginsCore({
    postMessage: (req: { id: number; method: string; args: unknown[] }) =>
      queueMicrotask(() => {
        const data = answer(methods, req);
        listeners.forEach((l) => l({ data } as MessageEvent));
      }),
    addEventListener: (type: string, l: (e: MessageEvent) => void) => {
      if (type === 'message') listeners.push(l);
    },
  } as unknown as Worker);
};
