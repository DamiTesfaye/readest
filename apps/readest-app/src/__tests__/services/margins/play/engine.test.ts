import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createPlayEngine, FONT_BUDGET, type PlayGlue } from '@/services/margins/play/engine';

const vendor = join(process.cwd(), 'public/vendor/margin-play');
const wasm = readFileSync(join(vendor, 'margin_play_wasm_bg.wasm'));
const serif = new Uint8Array(readFileSync(join(vendor, 'fonts/SourceSerif4-Regular.ttf')));

const loader = () => {
  let loads = 0;
  const load = async (i: number) => {
    loads++;
    const glue = await import(
      /* @vite-ignore */ `${pathToFileURL(join(vendor, 'margin_play_wasm.js')).href}?i=${i}`
    );
    glue.initSync({ module: wasm });
    return glue as PlayGlue;
  };
  return { load, loads: () => loads };
};

describe('play engine', () => {
  it('adds a face once per content key', async () => {
    const engine = createPlayEngine(loader().load);
    expect(await engine.addFont('serif', serif)).toBe('Source Serif 4');
    expect(await engine.addFont('serif', serif)).toBe('Source Serif 4');
    expect(engine.fontBytes).toBe(serif.length);
  });

  it("keeps a page's faces on one instance across a re-instantiation", async () => {
    const added: number[][] = [];
    const engine = createPlayEngine(async (i) => {
      added[i] = [];
      return {
        add_font: (b: Uint8Array) => {
          added[i]!.push(b.length);
          return 'F';
        },
      } as unknown as PlayGlue;
    });
    await engine.addFont('a', new Uint8Array(FONT_BUDGET / 2));
    await engine.addFont('b', new Uint8Array(FONT_BUDGET / 2 - 10));
    await engine.addFonts([
      { key: 'italic', bytes: new Uint8Array(5) },
      { key: 'regular', bytes: new Uint8Array(20) },
    ]);
    expect(added[1]).toEqual([5, 20]);
  });

  it('recreates_instance_past_font_budget', async () => {
    const l = loader();
    const engine = createPlayEngine(l.load);
    for (let i = 0; i < Math.ceil(FONT_BUDGET / serif.length) + 1; i++) {
      await engine.addFont(`k${i}`, serif);
    }
    expect(l.loads()).toBe(2);
    expect(engine.fontBytes).toBeLessThanOrEqual(FONT_BUDGET);
    engine.glue.set_page(
      JSON.stringify({
        width: 300,
        height: 400,
        columns: 1,
        gutter: 0,
        body: {
          family: 'Source Serif 4',
          size: 16,
          lineHeight: 24,
          justify: false,
          rtl: false,
          paraSpace: 0,
          indent: 0,
        },
        window: 'Begin the morning.',
        windowStart: 0,
        runs: [],
        fixed: [],
      }),
    );
    expect(engine.glue.compose()).toBe(true);
  });
});
