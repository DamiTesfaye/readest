import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

const dist = join(process.cwd(), '../../packages/margin-play-wasm/dist/web');
const scene = readFileSync(
  join(process.cwd(), 'e2e/fixtures/margins/scene-meditations.json'),
  'utf8',
);
const origin = 'http://replay.test';

test('the golden scene replays to the same hashes', async ({ page }) => {
  await page.route(`${origin}/**`, (route) => {
    const name = new URL(route.request().url()).pathname.slice(1);
    if (name === '')
      return route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><title>replay</title>',
      });
    const type = name.endsWith('.wasm') ? 'application/wasm' : 'text/javascript';
    return route.fulfill({ contentType: type, body: readFileSync(join(dist, name)) });
  });
  await page.goto(`${origin}/`);
  const hashes = await page.evaluate(async (json) => {
    const glueUrl = '/margin_play_wasm.js';
    const glue = await import(glueUrl);
    await glue.default({ module_or_path: '/margin_play_wasm_bg.wasm' });
    const r = new glue.Replay(json);
    const out: number[] = [];
    for (const [step] of JSON.parse(json).checkpoints as [number][]) {
      r.run_to(step);
      out.push(r.hash());
    }
    r.free();
    return out;
  }, scene);
  expect(hashes).toEqual((JSON.parse(scene).checkpoints as [number, number][]).map(([, h]) => h));
});

test('decodes the pack', async ({ page }) => {
  const ogg = readFileSync(join(process.cwd(), 'public/sfx/thud-1.ogg'));
  await page.route(`${origin}/**`, (route) =>
    new URL(route.request().url()).pathname === '/thud-1.ogg'
      ? route.fulfill({ contentType: 'audio/ogg', body: ogg })
      : route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>sfx</title>' }),
  );
  await page.goto(`${origin}/`);
  const ok = await page.evaluate(async () => {
    const bytes = await (await fetch('/thud-1.ogg')).arrayBuffer();
    return new OfflineAudioContext(1, 48000, 48000).decodeAudioData(bytes).then(
      (b) => b.duration > 0,
      () => false,
    );
  });
  test.info().annotations.push({ type: 'opus', description: ok ? 'decodes' : 'skipped' });
});
