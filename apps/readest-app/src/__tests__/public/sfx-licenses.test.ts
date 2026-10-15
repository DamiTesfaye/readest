import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const dir = join(process.cwd(), 'public/sfx');
const files = readdirSync(dir).filter((f) => f.endsWith('.ogg'));
const licenses = readFileSync(join(dir, 'LICENSES.md'), 'utf8');
const index = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8')) as {
  effects: { id: string; file: string }[];
};

describe('sound effects pack', () => {
  it('lists every file in LICENSES.md with a CC0 source', () => {
    for (const f of files)
      expect(licenses).toMatch(
        new RegExp(`\\| ${f.replace('.', '\\.')} \\|[^\\n]*https://[^\\n]*\\| CC0 1\\.0 \\|`),
      );
  });
  it('indexes every file once with a valid id', () => {
    expect(index.effects.map((e) => e.file).sort()).toEqual([...files].sort());
    for (const e of index.effects) expect(e.id).toMatch(/^[a-z0-9-]{1,32}$/);
    expect(index.effects.map((e) => e.id)).toEqual(
      expect.arrayContaining(['thud-1', 'thud-2', 'thud-3']),
    );
  });
  it('keeps each effect small', () => {
    for (const f of files) expect(statSync(join(dir, f)).size).toBeLessThanOrEqual(64 * 1024);
  });
});
