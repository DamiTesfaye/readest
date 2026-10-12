import init, * as core from '/vendor/margin-core/margin_core_wasm.js';
import { answer, coreMethods } from './margins-core-methods.js';

const methods = coreMethods(core);
const ready = init();

self.onmessage = async ({ data }) => {
  try {
    await ready;
  } catch (error) {
    self.postMessage({ id: data.id, error: `margin-core failed to load: ${error}` });
    return;
  }
  self.postMessage(answer(methods, data));
};
