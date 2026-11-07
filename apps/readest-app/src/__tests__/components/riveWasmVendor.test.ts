import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const appRoot = resolve(__dirname, '../../..');

describe('vendored Rive wasm', () => {
  it.each([
    'rive.wasm',
    'rive_fallback.wasm',
  ])('public/rive/%s matches the installed @rive-app/canvas runtime', (file) => {
    const vendored = readFileSync(resolve(appRoot, 'public/rive', file));
    const installed = readFileSync(resolve(appRoot, 'node_modules/@rive-app/canvas', file));
    expect(vendored.equals(installed)).toBe(true);
  });
});
