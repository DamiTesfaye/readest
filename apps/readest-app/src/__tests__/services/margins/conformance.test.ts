import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import init, * as core from '../../../../../../packages/margin-core-wasm/dist/web/margin_core_wasm.js';

const pkg = resolve(__dirname, '../../../../../../packages/margin-core-wasm');
const P =
  'it is a truth universally acknowledged that a single man in possession of a good fortune must be in want of a wife however little known the feelings or views of such a man may be';

describe('margin-core wasm conformance (level 1)', () => {
  beforeAll(async () => {
    await init({ module_or_path: readFileSync(`${pkg}/dist/web/margin_core_wasm_bg.wasm`) });
  });

  it('matches every token-stream vector', () => {
    const vectors = JSON.parse(readFileSync(`${pkg}/conformance/token-stream.json`, 'utf8')) as {
      name: string;
      tokens: (string | null)[];
      canonical: string;
    }[];
    expect(vectors.length).toBeGreaterThan(0);
    for (const v of vectors) {
      const runs: string[] = [];
      const breaks: number[] = [];
      for (const t of v.tokens) {
        if (t === null) breaks.push(runs.length);
        else runs.push(t);
      }
      core.load_book(v.name, JSON.stringify([{ runs, breaks, skip: false }]));
      expect(JSON.parse(core.canonical_section(v.name, 0)).text, v.name).toBe(v.canonical);
    }
  });

  it('produces the same band as Rust', () => {
    core.load_book('band', JSON.stringify([{ runs: [P], breaks: [], skip: false }]));
    expect(JSON.parse(core.fingerprint('band'))[0][0]).toBe(
      readFileSync(`${pkg}/conformance/band0.txt`, 'utf8').trim(),
    );
  });

  it('counts scalars, not UTF-16 units', () => {
    expect(core.scalar_len('\u{1D400}')).toBe(1);
  });
});
