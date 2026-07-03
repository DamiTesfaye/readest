import { describe, it, expect } from 'vitest';
import tinycolor from 'tinycolor2';
import { themes } from '@/styles/themes';

const SCENE_THEMES = ['night-pond', 'starry-night', 'desert-sunset'];
const QUIET_THEMES = ['paper', 'sepia', 'ink', 'contrast'];

describe('AmpleRead theme list', () => {
  it('contains exactly the 7 curated themes with paper first', () => {
    expect(themes.map((t) => t.name)).toEqual([...QUIET_THEMES, ...SCENE_THEMES]);
  });

  it('scene themes carry a scene field; quiet themes do not', () => {
    for (const t of themes) {
      if (SCENE_THEMES.includes(t.name)) {
        expect(t.scene, `${t.name} should have a scene`).toBeDefined();
      } else {
        expect(t.scene, `${t.name} should be quiet`).toBeUndefined();
      }
    }
  });

  it('uses kebab-case names safe for data-theme attributes', () => {
    for (const t of themes) {
      expect(t.name).toMatch(/^[a-z]+(-[a-z]+)*$/);
    }
  });
});

describe('AmpleRead theme contrast (WCAG)', () => {
  for (const mode of ['light', 'dark'] as const) {
    for (const themeName of [...QUIET_THEMES, ...SCENE_THEMES]) {
      it(`${themeName} ${mode}: fg/bg >= 4.5 and primary/bg >= 3.0`, () => {
        const theme = themes.find((t) => t.name === themeName)!;
        const palette = theme.colors[mode];
        const bodyRatio = tinycolor.readability(palette['base-100'], palette['base-content']);
        const primaryRatio = tinycolor.readability(palette['base-100'], palette.primary);
        expect(bodyRatio, `fg on bg`).toBeGreaterThanOrEqual(4.5);
        expect(primaryRatio, `primary on bg`).toBeGreaterThanOrEqual(3.0);
      });
    }
  }
});
