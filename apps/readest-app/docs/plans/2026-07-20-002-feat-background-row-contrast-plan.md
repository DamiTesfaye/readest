# Background Row + Contrast Guarantee Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every theme card dual-mood, add a per-theme Background swatch row (neutral + 5 theme variants, flips with light/dark), a hue-locked custom shade picker, and a WCAG contrast floor baked into the palette pipeline so no background choice can ever make text illegible.

**Architecture:** All color math stays in pure functions in `src/styles/` (existing `themes.ts` + new `backgrounds.ts`). The single resolution point for book content is `getThemeCode()` in `src/utils/style.ts`; app chrome gets a runtime `<style>` injection overriding daisyUI CSS vars (same pattern as `applyCustomTheme`), because built-in theme CSS is generated at build time from `tailwind.config.ts` and cannot know user background choices. State lives in `themeStore` + `localStorage`, matching `themeColor`/`highContrast`.

**Tech Stack:** TypeScript, React, Zustand, tinycolor2 (already a dependency — `readability`, `mostReadable`), vitest + jsdom, Tailwind/daisyUI.

## Global Constraints

- Test-first (repo rule `.agents/rules/test-first.md`): write the failing test, watch it fail, implement, watch it pass.
- Run **targeted** test files per task (`pnpm --dir apps/readest-app test -- src/__tests__/styles/backgrounds.test.ts`); run the full `pnpm test` + `pnpm lint` only in the final task (user is cost-conscious).
- All commands run from `apps/readest-app/` (or use `pnpm --dir apps/readest-app`).
- Never use `any` (repo rule). Strict mode is on.
- UI strings go through `_('...')` (key-as-content i18n); locale extraction is deferred — do NOT run the i18n scanner.
- New interactive controls must look right under `[data-eink='true']`: use the `eink-bordered` class on custom swatch buttons.
- The branch `feat/ampleread-scene-themes` may hold **uncommitted work** (ThemeModeSelector polish). Run `git status`/`git diff` before editing a file; never revert changes you didn't make.
- Conventional commit messages (`feat:`, `test:`, `refactor:`), no attribution footers.
- Minimum-scope rule (project CLAUDE.md): no extra abstractions, no configurability beyond this spec.
- Out of scope for this plan: the two new themes from the Figma (Ocean Wave, Cherry Bloom — they need artwork; separate plan), i18n extraction, and swatch rows for user-created custom themes (the ThemeEditor already gives customs full color control).

---

### Task 1: Parameterize `boostContrast` with a target ratio + unreachable-target fallback

**Files:**
- Modify: `src/styles/themes.ts:130-147`
- Test: `src/__tests__/styles/ampleThemes.test.ts` (extend the existing `describe('boostContrast (High Contrast)')` block)

**Interfaces:**
- Produces: `boostContrast(palette: Palette, isDarkMode: boolean, targetRatio?: number): Palette` (default stays 7) and `export const BODY_MIN_CONTRAST = 4.5`. Later tasks import both.

- [ ] **Step 1: Write the failing tests**

Append inside the existing `describe('boostContrast (High Contrast)', ...)` block in `src/__tests__/styles/ampleThemes.test.ts`:

```ts
  it('accepts a custom target ratio (AA floor at 4.5)', () => {
    const lowContrast = {
      'base-100': '#f0e8d8',
      'base-200': '#e6dcc8',
      'base-300': '#d8ccb4',
      'base-content': '#b0a890', // ~1.6:1 on the bg — well below AA
      neutral: '#cccccc',
      'neutral-content': '#333333',
      primary: '#c15a1f',
      secondary: '#d97b42',
      accent: '#e0a060',
    };
    const boosted = boostContrast(lowContrast, false, 4.5);
    const ratio = tinycolor.readability(boosted['base-100'], boosted['base-content']);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
    expect(boosted['base-100']).toBe(lowContrast['base-100']);
  });

  it('falls back to the most readable of fg/black/white on a mid-tone trap', () => {
    // Mid-gray background: pushing a light fg lighter in light mode can never
    // reach 7:1. The fallback must land on black or white — whichever reads best.
    const midTone = {
      'base-100': '#808080',
      'base-200': '#8a8a8a',
      'base-300': '#949494',
      'base-content': '#9a9a9a',
      neutral: '#777777',
      'neutral-content': '#222222',
      primary: '#446688',
      secondary: '#557799',
      accent: '#6688aa',
    };
    const boosted = boostContrast(midTone, false, 7);
    const best = tinycolor
      .mostReadable('#808080', ['#000000', '#ffffff'])
      .toHexString()
      .toLowerCase();
    expect(boosted['base-content'].toLowerCase()).toBe(best);
  });
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `pnpm --dir apps/readest-app test -- src/__tests__/styles/ampleThemes.test.ts`
Expected: the first new test FAILS (boostContrast takes 2 args — TS error or wrong ratio); second FAILS (fg stuck near gray, not black/white). Pre-existing tests still pass.

- [ ] **Step 3: Implement**

In `src/styles/themes.ts`, replace the `HIGH_CONTRAST_TARGET_RATIO`/`boostContrast` section (currently lines 130-147) with:

```ts
// High Contrast boost: push the foreground away from the background until body
// text clears the target ratio, keeping the background's character so a scene
// still reads as itself. Pure and idempotent — a palette already at/above the
// target is returned with an equivalent foreground. Defaults to WCAG AAA (7:1),
// the High Contrast toggle's contract; BODY_MIN_CONTRAST (AA, 4.5:1) is the
// unconditional floor the palette pipeline applies to every palette.
const HIGH_CONTRAST_TARGET_RATIO = 7;
export const BODY_MIN_CONTRAST = 4.5;

export const boostContrast = (
  palette: Palette,
  isDarkMode: boolean,
  targetRatio: number = HIGH_CONTRAST_TARGET_RATIO,
): Palette => {
  const bg = palette['base-100'];
  let fg = palette['base-content'];
  let guard = 0;
  while (tinycolor.readability(bg, fg) < targetRatio && guard < 100) {
    fg = isDarkMode
      ? tinycolor(fg).lighten(2).toHexString()
      : tinycolor(fg).darken(2).toHexString();
    guard += 1;
  }
  // Mid-tone backgrounds can make the target unreachable in the push
  // direction; land on whichever of the pushed fg, black, or white reads best.
  if (tinycolor.readability(bg, fg) < targetRatio) {
    fg = tinycolor.mostReadable(bg, [fg, '#000000', '#ffffff']).toHexString();
  }
  return { ...palette, 'base-content': fg };
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --dir apps/readest-app test -- src/__tests__/styles/ampleThemes.test.ts`
Expected: PASS (all, including the pre-existing purity/idempotency tests).

- [ ] **Step 5: Commit**

```bash
git add src/styles/themes.ts src/__tests__/styles/ampleThemes.test.ts
git commit -m "feat(themes): parameterize boostContrast target ratio with mostReadable fallback"
```

---

### Task 2: Apply the AA floor unconditionally in `getThemeCode`

**Files:**
- Modify: `src/utils/style.ts:835` (inside `getThemeCode`) and the `boostContrast` import at `src/utils/style.ts:17`
- Test: `src/__tests__/store/theme-store.test.ts` (or `src/__tests__/utils/style-dom.test.ts` if `getThemeCode` coverage lives there — check both, add where `getThemeCode` is already exercised)

**Interfaces:**
- Consumes: `boostContrast(palette, isDarkMode, targetRatio)`, `BODY_MIN_CONTRAST` from Task 1.
- Produces: `getThemeCode()` now guarantees `readability(bg, fg) >= 4.5` for every palette it returns (7 when High Contrast is on). No signature change.

- [ ] **Step 1: Write the failing test**

Add to the test file that already exercises `getThemeCode` (localStorage fixtures exist in `theme-store.test.ts`):

```ts
import tinycolor from 'tinycolor2';
import { getThemeCode } from '@/utils/style';

describe('getThemeCode contrast floor', () => {
  afterEach(() => localStorage.clear());

  it('floors a low-contrast custom theme to AA (4.5:1) even without High Contrast', () => {
    localStorage.setItem(
      'customThemes',
      JSON.stringify([
        {
          name: 'washed-out',
          label: 'Washed Out',
          colors: {
            light: { fg: '#b8b0a0', bg: '#efe8da', primary: '#c15a1f' }, // ~1.5:1
            dark: { fg: '#4a4a4a', bg: '#1f1f1f', primary: '#f49e5c' },
          },
        },
      ]),
    );
    localStorage.setItem('themeColor', 'washed-out');
    localStorage.setItem('themeMode', 'light');
    localStorage.setItem('highContrast', 'false');
    const { bg, fg } = getThemeCode();
    expect(tinycolor.readability(bg, fg)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps built-in palettes byte-identical (they already pass AA)', () => {
    localStorage.setItem('themeColor', 'desert-sunset');
    localStorage.setItem('themeMode', 'light');
    localStorage.setItem('highContrast', 'false');
    const { fg } = getThemeCode();
    // desert-sunset light fg seed — floor must be a no-op for compliant themes
    expect(fg.toLowerCase()).toBe('#4a3222');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir apps/readest-app test -- src/__tests__/store/theme-store.test.ts`
Expected: first test FAILS (ratio ~1.5); second PASSES already (documents the no-op contract).

- [ ] **Step 3: Implement**

In `src/utils/style.ts`, import `BODY_MIN_CONTRAST` alongside `boostContrast` (line 17 area), and change line 835 from:

```ts
const defaultPalette = highContrast ? boostContrast(basePalette, isDarkMode) : basePalette;
```

to:

```ts
// Unconditional AA floor: no theme, custom theme, or (later) custom background
// may render body text below 4.5:1. High Contrast raises the target to AAA.
const flooredPalette = boostContrast(basePalette, isDarkMode, BODY_MIN_CONTRAST);
const defaultPalette = highContrast ? boostContrast(flooredPalette, isDarkMode) : flooredPalette;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --dir apps/readest-app test -- src/__tests__/store/theme-store.test.ts src/__tests__/utils/style-dom.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/style.ts src/__tests__/store/theme-store.test.ts
git commit -m "feat(themes): unconditional WCAG AA contrast floor in getThemeCode"
```

---

### Task 3: Unlock all card themes to dual-mood

**Files:**
- Modify: `src/styles/themes.ts` (remove the four `mood:` lines at 166, 176, 186, 196; keep the `mood?` field and `getEffectiveDarkMode`'s mood branch — minimal diff, custom/future themes unaffected)
- Modify: `src/components/settings/ColorPanel.tsx:48-60` (remove the mode-lock escape hatch)
- Test: `src/__tests__/styles/ampleThemes.test.ts` (replace the `describe('single-mood themes')` block), plus fix any mood expectations in `src/__tests__/store/theme-store.test.ts` (grep `mood`)

**Interfaces:**
- Produces: every entry in `themes` has `mood === undefined`; `getEffectiveDarkMode(name, themeMode, systemIsDarkMode)` now follows `themeMode` for every theme. UI contract: switching light/dark keeps the selected card (no more snap-back to `default`).

- [ ] **Step 1: Rewrite the mood contract tests (failing first)**

In `src/__tests__/styles/ampleThemes.test.ts`, replace the entire `describe('single-mood themes', ...)` block with:

```ts
describe('dual-mood themes', () => {
  it('no theme is mode-locked — every card follows the appearance toggle', () => {
    for (const t of themes) {
      expect(t.mood, `${t.name} must be dual-mood`).toBeUndefined();
    }
  });

  it('getEffectiveDarkMode follows themeMode and system for every theme', () => {
    for (const name of [DEFAULT_THEME, ...CARD_THEMES]) {
      expect(getEffectiveDarkMode(name, 'dark', false)).toBe(true);
      expect(getEffectiveDarkMode(name, 'light', true)).toBe(false);
      expect(getEffectiveDarkMode(name, 'auto', true)).toBe(true);
      expect(getEffectiveDarkMode(name, 'auto', false)).toBe(false);
    }
  });

  it('custom/unknown theme names follow themeMode', () => {
    expect(getEffectiveDarkMode('my-custom-theme', 'dark', false)).toBe(true);
    expect(getEffectiveDarkMode('my-custom-theme', 'auto', false)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify the new contract fails**

Run: `pnpm --dir apps/readest-app test -- src/__tests__/styles/ampleThemes.test.ts`
Expected: FAIL — `paper` etc. still carry `mood`.

- [ ] **Step 3: Remove the mood locks**

In `src/styles/themes.ts`, delete the `mood: 'light',` lines from `paper` (line 166) and `desert-sunset` (line 176), and the `mood: 'dark',` lines from `starry-night` (line 186) and `night-pond` (line 196). Do not touch the `Theme` type or `getEffectiveDarkMode`.

- [ ] **Step 4: Remove the ColorPanel escape hatch**

In `src/components/settings/ColorPanel.tsx`, delete lines 48-60 (the `activeThemeMood` lookup, its comments, and the `handleThemeModeChange` wrapper) and pass the store setter straight through. The `ThemeModeSelector` usage changes from `onThemeModeChange={handleThemeModeChange}` to:

```tsx
onThemeModeChange={setThemeMode}
```

Keep `handleThemeColorChange` (re-tapping a card still returns to `default`). Check `git diff` on this file first — it may already hold uncommitted polish; only remove the escape-hatch lines.

- [ ] **Step 5: Fix collateral test expectations**

Run: `pnpm --dir apps/readest-app test -- src/__tests__/styles/ampleThemes.test.ts src/__tests__/store/theme-store.test.ts src/__tests__/styles/themes.test.ts`
Grep `mood` in failing tests: any assertion that a card theme pins `isDarkMode` regardless of `themeMode` now inverts — the correct expectation is that `themeMode` wins (mirror the `dual-mood themes` contract above). Update those assertions; do not delete whole tests.
Expected after fixes: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/styles/themes.ts src/components/settings/ColorPanel.tsx src/__tests__/
git commit -m "feat(themes): all theme cards are dual-mood, drop mode-lock escape hatch"
```

---

### Task 4: Background swatch model (`src/styles/backgrounds.ts`)

**Files:**
- Create: `src/styles/backgrounds.ts`
- Test: `src/__tests__/styles/backgrounds.test.ts`

**Interfaces:**
- Consumes: `themes`, `Palette`, `generateLightPalette`, `generateDarkPalette`, `boostContrast`, `BODY_MIN_CONTRAST`, `hexToOklch` from `@/styles/themes`.
- Produces (used by Tasks 5-7):
  - `type ThemeBackground = { kind: 'preset'; index: number } | { kind: 'custom'; light?: string; dark?: string }`
  - `BACKGROUND_SWATCH_COUNT = 6`, `BASE_SWATCH_INDEX = 3`
  - `getBackgroundSwatches(themeName: string, isDarkMode: boolean): string[]`
  - `resolveBackgroundColor(background: ThemeBackground | null, themeName: string, isDarkMode: boolean): string | null`
  - `applyBackgroundToPalette(palette: Palette, bg: string, isDarkMode: boolean): Palette`
  - `applyBackgroundOverride(themeName: string, background: ThemeBackground | null): void` (DOM style injection)

- [ ] **Step 1: Write the failing contract tests**

Create `src/__tests__/styles/backgrounds.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import tinycolor from 'tinycolor2';
import { themes, boostContrast, BODY_MIN_CONTRAST } from '@/styles/themes';
import {
  BACKGROUND_SWATCH_COUNT,
  BASE_SWATCH_INDEX,
  getBackgroundSwatches,
  resolveBackgroundColor,
  applyBackgroundToPalette,
} from '@/styles/backgrounds';

const CARD_THEMES = ['default', 'paper', 'desert-sunset', 'starry-night', 'night-pond'];

describe('getBackgroundSwatches', () => {
  for (const name of CARD_THEMES) {
    for (const mode of [false, true]) {
      const label = `${name} ${mode ? 'dark' : 'light'}`;
      it(`${label}: 6 unique swatches, neutral first, theme bg at the base slot`, () => {
        const swatches = getBackgroundSwatches(name, mode);
        expect(swatches).toHaveLength(BACKGROUND_SWATCH_COUNT);
        expect(swatches[0]).toBe(mode ? '#000000' : '#ffffff');
        const theme = themes.find((t) => t.name === name)!;
        expect(swatches[BASE_SWATCH_INDEX]!.toLowerCase()).toBe(
          theme.colors[mode ? 'dark' : 'light']['base-100'].toLowerCase(),
        );
        expect(new Set(swatches.map((s) => s.toLowerCase())).size).toBe(BACKGROUND_SWATCH_COUNT);
      });

      it(`${label}: every swatch supports AA text after the pipeline floor`, () => {
        const theme = themes.find((t) => t.name === name)!;
        const palette = theme.colors[mode ? 'dark' : 'light'];
        for (const swatch of getBackgroundSwatches(name, mode)) {
          const rebuilt = boostContrast(
            applyBackgroundToPalette(palette, swatch, mode),
            mode,
            BODY_MIN_CONTRAST,
          );
          const ratio = tinycolor.readability(rebuilt['base-100'], rebuilt['base-content']);
          expect(ratio, `${swatch} on ${label}`).toBeGreaterThanOrEqual(BODY_MIN_CONTRAST);
        }
      });
    }
  }

  it('falls back to the default theme for unknown names', () => {
    expect(getBackgroundSwatches('nope', false)).toEqual(getBackgroundSwatches('default', false));
  });
});

describe('resolveBackgroundColor', () => {
  it('null background resolves to null (theme default)', () => {
    expect(resolveBackgroundColor(null, 'paper', false)).toBeNull();
  });

  it('preset index maps through the mode-appropriate swatch row', () => {
    const light = resolveBackgroundColor({ kind: 'preset', index: 4 }, 'paper', false);
    const dark = resolveBackgroundColor({ kind: 'preset', index: 4 }, 'paper', true);
    expect(light).toBe(getBackgroundSwatches('paper', false)[4]);
    expect(dark).toBe(getBackgroundSwatches('paper', true)[4]);
    expect(light).not.toBe(dark); // same slot, mode-equivalent value
  });

  it('out-of-range preset index resolves to null', () => {
    expect(resolveBackgroundColor({ kind: 'preset', index: 99 }, 'paper', false)).toBeNull();
  });

  it('custom background returns the hex for the active mode only', () => {
    const bg = { kind: 'custom' as const, light: '#f6e7cf' };
    expect(resolveBackgroundColor(bg, 'desert-sunset', false)).toBe('#f6e7cf');
    expect(resolveBackgroundColor(bg, 'desert-sunset', true)).toBeNull();
  });
});

describe('applyBackgroundToPalette', () => {
  it('re-derives base-200/300 and neutral from the new bg, keeps fg and primary seeds', () => {
    const paperLight = themes.find((t) => t.name === 'paper')!.colors.light;
    const rebuilt = applyBackgroundToPalette(paperLight, '#ffffff', false);
    expect(rebuilt['base-100']).toBe('#ffffff');
    expect(rebuilt['base-content']).toBe(paperLight['base-content']);
    expect(rebuilt.primary).toBe(paperLight.primary);
    expect(rebuilt['base-200']).not.toBe(paperLight['base-200']);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --dir apps/readest-app test -- src/__tests__/styles/backgrounds.test.ts`
Expected: FAIL — module `@/styles/backgrounds` does not exist.

- [ ] **Step 3: Implement `src/styles/backgrounds.ts`**

```ts
import tinycolor from 'tinycolor2';
import {
  BODY_MIN_CONTRAST,
  Palette,
  boostContrast,
  generateDarkPalette,
  generateLightPalette,
  hexToOklch,
  themes,
} from './themes';

// A user-chosen page background for the active theme. Presets are stored by
// slot index so the selection survives a light/dark flip (slot i in one mode
// maps to slot i in the other); custom shades are stored per mode because a
// hex has no mode-independent identity.
export type ThemeBackground =
  | { kind: 'preset'; index: number }
  | { kind: 'custom'; light?: string; dark?: string };

export const BACKGROUND_SWATCH_COUNT = 6;
// Slot 3 is the theme's own background; selecting it means "theme default".
export const BASE_SWATCH_INDEX = 3;

// Slot 0 is the neutral page (pure white / pure black); slots 1-5 are shades
// of the theme's background. Both modes order slots from "furthest from the
// page tone" to "deepest", so slot i is the same design intent across modes.
export const getBackgroundSwatches = (themeName: string, isDarkMode: boolean): string[] => {
  const theme = themes.find((t) => t.name === themeName) ?? themes[0]!;
  const bg = theme.colors[isDarkMode ? 'dark' : 'light']['base-100'];
  const hex = (c: tinycolor.Instance) => c.toHexString();
  if (isDarkMode) {
    return [
      '#000000',
      hex(tinycolor(bg).darken(6)),
      hex(tinycolor(bg).darken(3)),
      bg,
      hex(tinycolor(bg).lighten(4)),
      hex(tinycolor(bg).lighten(8)),
    ];
  }
  return [
    '#ffffff',
    hex(tinycolor(bg).lighten(6)),
    hex(tinycolor(bg).lighten(3)),
    bg,
    hex(tinycolor(bg).darken(4)),
    hex(tinycolor(bg).darken(8)),
  ];
};

export const resolveBackgroundColor = (
  background: ThemeBackground | null,
  themeName: string,
  isDarkMode: boolean,
): string | null => {
  if (!background) return null;
  if (background.kind === 'preset') {
    return getBackgroundSwatches(themeName, isDarkMode)[background.index] ?? null;
  }
  return (isDarkMode ? background.dark : background.light) ?? null;
};

// Swap the background and re-derive the dependent palette slots (base-200/300,
// neutral) from it, keeping the theme's fg and primary as seeds. Contrast is
// NOT guaranteed here — callers run the palette through the boostContrast
// floor, same as every other palette in the pipeline.
export const applyBackgroundToPalette = (
  palette: Palette,
  bg: string,
  isDarkMode: boolean,
): Palette => {
  const seeds = { bg, fg: palette['base-content'], primary: palette.primary };
  return isDarkMode ? generateDarkPalette(seeds) : generateLightPalette(seeds);
};

// App chrome counterpart of the getThemeCode() integration: built-in theme CSS
// is generated at build time (tailwind.config.ts), so a user background needs
// a runtime override of the daisyUI base vars for both modes of the active
// theme. Mirrors applyCustomTheme's style-injection pattern.
export const applyBackgroundOverride = (
  themeName: string,
  background: ThemeBackground | null,
): void => {
  if (typeof document === 'undefined') return;
  const styleId = 'theme-background-override';
  document.getElementById(styleId)?.remove();
  if (!background) return;
  const theme = themes.find((t) => t.name === themeName);
  if (!theme) return; // custom themes manage their colors via ThemeEditor
  const css = (['light', 'dark'] as const)
    .map((mode) => {
      const isDark = mode === 'dark';
      const bg = resolveBackgroundColor(background, themeName, isDark);
      if (!bg) return '';
      const palette = boostContrast(
        applyBackgroundToPalette(theme.colors[mode], bg, isDark),
        isDark,
        BODY_MIN_CONTRAST,
      );
      return `[data-theme="${themeName}-${mode}"] {
        --b1: ${hexToOklch(palette['base-100'])};
        --b2: ${hexToOklch(palette['base-200'])};
        --b3: ${hexToOklch(palette['base-300'])};
        --bc: ${hexToOklch(palette['base-content'])};
        --n: ${hexToOklch(palette.neutral)};
        --nc: ${hexToOklch(palette['neutral-content'])};
      }`;
    })
    .join('\n');
  const styleElement = document.createElement('style');
  styleElement.id = styleId;
  styleElement.textContent = css;
  document.head.appendChild(styleElement);
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --dir apps/readest-app test -- src/__tests__/styles/backgrounds.test.ts`
Expected: PASS. If a specific theme swatch fails uniqueness (a `lighten(6)` clipping to white on a very light bg), adjust that derivation step (e.g. `lighten(4)`) — the contract test is the source of truth.

- [ ] **Step 5: Commit**

```bash
git add src/styles/backgrounds.ts src/__tests__/styles/backgrounds.test.ts
git commit -m "feat(themes): background swatch model with per-mode equivalent slots"
```

---

### Task 5: Wire background into `themeStore` and `getThemeCode`

**Files:**
- Modify: `src/store/themeStore.ts` (state + `setThemeBackground`; reset in `setThemeColor`; init-time `applyBackgroundOverride`)
- Modify: `src/utils/style.ts` (`getThemeCode`, lines 802-843)
- Test: `src/__tests__/store/theme-store.test.ts`

**Interfaces:**
- Consumes: everything Task 4 produces; `BODY_MIN_CONTRAST`/`boostContrast` from Task 1.
- Produces: `themeStore` gains `themeBackground: ThemeBackground | null` and `setThemeBackground(background: ThemeBackground | null): void`; localStorage key `themeBackground` (JSON; absent = null). `getThemeCode()` resolves it for book content.

- [ ] **Step 1: Write the failing tests**

Add to `src/__tests__/store/theme-store.test.ts` (follow the file's existing store-reset/localStorage fixture patterns):

```ts
import { getBackgroundSwatches } from '@/styles/backgrounds';

describe('themeBackground', () => {
  afterEach(() => localStorage.clear());

  it('setThemeBackground persists and getThemeCode picks the preset bg per mode', () => {
    localStorage.setItem('themeColor', 'desert-sunset');
    localStorage.setItem('themeMode', 'light');
    useThemeStore.getState().setThemeBackground({ kind: 'preset', index: 4 });
    expect(JSON.parse(localStorage.getItem('themeBackground')!)).toEqual({
      kind: 'preset',
      index: 4,
    });
    const { bg } = getThemeCode();
    expect(bg.toLowerCase()).toBe(
      getBackgroundSwatches('desert-sunset', false)[4]!.toLowerCase(),
    );
  });

  it('background survives a mode flip by slot, not by hex', () => {
    localStorage.setItem('themeColor', 'desert-sunset');
    localStorage.setItem('themeMode', 'light');
    useThemeStore.getState().setThemeBackground({ kind: 'preset', index: 4 });
    localStorage.setItem('themeMode', 'dark');
    const { bg } = getThemeCode();
    expect(bg.toLowerCase()).toBe(
      getBackgroundSwatches('desert-sunset', true)[4]!.toLowerCase(),
    );
  });

  it('custom background is floored to AA by the pipeline', () => {
    localStorage.setItem('themeColor', 'paper');
    localStorage.setItem('themeMode', 'light');
    useThemeStore.getState().setThemeBackground({ kind: 'custom', light: '#e8e4da' });
    const { bg, fg } = getThemeCode();
    expect(bg.toLowerCase()).toBe('#e8e4da');
    expect(tinycolor.readability(bg, fg)).toBeGreaterThanOrEqual(4.5);
  });

  it('changing theme resets the background (swatches are theme-specific)', () => {
    useThemeStore.getState().setThemeBackground({ kind: 'preset', index: 1 });
    useThemeStore.getState().setThemeColor('starry-night');
    expect(useThemeStore.getState().themeBackground).toBeNull();
    expect(localStorage.getItem('themeBackground')).toBeNull();
  });

  it('setThemeBackground injects and removes the chrome override style tag', () => {
    localStorage.setItem('themeColor', 'paper');
    useThemeStore.getState().setThemeColor('paper');
    useThemeStore.getState().setThemeBackground({ kind: 'preset', index: 0 });
    expect(document.getElementById('theme-background-override')).not.toBeNull();
    useThemeStore.getState().setThemeBackground(null);
    expect(document.getElementById('theme-background-override')).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --dir apps/readest-app test -- src/__tests__/store/theme-store.test.ts`
Expected: FAIL — `setThemeBackground` does not exist.

- [ ] **Step 3: Implement — `getThemeCode`**

In `src/utils/style.ts` `getThemeCode()` (lines 802-843): read the stored background alongside the other localStorage reads, then apply it between `basePalette` and the floor added in Task 2:

```ts
import {
  ThemeBackground,
  applyBackgroundToPalette,
  resolveBackgroundColor,
} from '@/styles/backgrounds';

// inside getThemeCode(), with the other localStorage reads:
let themeBackground: ThemeBackground | null = null;
if (typeof window !== 'undefined') {
  try {
    themeBackground = JSON.parse(localStorage.getItem('themeBackground') || 'null');
  } catch {
    themeBackground = null;
  }
}

// after `const basePalette = ...`:
const overrideBg = customTheme
  ? null // custom themes manage their colors via ThemeEditor
  : resolveBackgroundColor(themeBackground, themeColor, isDarkMode);
const withBackground = overrideBg
  ? applyBackgroundToPalette(basePalette, overrideBg, isDarkMode)
  : basePalette;
const flooredPalette = boostContrast(withBackground, isDarkMode, BODY_MIN_CONTRAST);
const defaultPalette = highContrast ? boostContrast(flooredPalette, isDarkMode) : flooredPalette;
```

- [ ] **Step 4: Implement — `themeStore`**

In `src/store/themeStore.ts`:

```ts
import { ThemeBackground, applyBackgroundOverride } from '@/styles/backgrounds';

const getInitialThemeBackground = (): ThemeBackground | null => {
  if (typeof window === 'undefined' || !localStorage) return null;
  try {
    return JSON.parse(localStorage.getItem('themeBackground') || 'null');
  } catch {
    return null;
  }
};
```

Add to `ThemeState`: `themeBackground: ThemeBackground | null;` and `setThemeBackground: (background: ThemeBackground | null) => void;`.

In the store initializer: `themeBackground: getInitialThemeBackground(),` and after `applyHighContrastAttr(initialHighContrast);` add `applyBackgroundOverride(initialThemeColor, getInitialThemeBackground());`.

Add the action (same shape as `setHighContrast`):

```ts
setThemeBackground: (background) => {
  if (typeof window !== 'undefined' && localStorage) {
    if (background) {
      localStorage.setItem('themeBackground', JSON.stringify(background));
    } else {
      localStorage.removeItem('themeBackground');
    }
  }
  applyBackgroundOverride(get().themeColor, background);
  set({ themeBackground: background });
  // Recompute themeCode so the reader restyles book content with the new bg.
  set({ themeCode: getThemeCode() });
},
```

In `setThemeColor`, before the existing `set(...)` calls, clear the previous theme's background:

```ts
if (typeof window !== 'undefined' && localStorage) {
  localStorage.removeItem('themeBackground');
}
applyBackgroundOverride(color, null);
set({ themeBackground: null });
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --dir apps/readest-app test -- src/__tests__/store/theme-store.test.ts src/__tests__/styles/backgrounds.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/store/themeStore.ts src/utils/style.ts src/__tests__/store/theme-store.test.ts
git commit -m "feat(themes): themeBackground state wired through getThemeCode and chrome override"
```

---

### Task 6: Background swatch row UI

**Files:**
- Create: `src/components/settings/color/BackgroundSwatchRow.tsx`
- Modify: `src/components/settings/ColorPanel.tsx` (render the row after `ThemeColorSelector`; add `themeBackground`/`setThemeBackground` to the `useThemeStore()` destructure; reset it in `handleReset`)
- Test: pure selection helpers in `src/styles/backgrounds.ts` via `src/__tests__/styles/backgrounds.test.ts` (UI itself is verified visually in `pnpm dev-web` — owner signs off on aesthetics)

**Interfaces:**
- Consumes: `getBackgroundSwatches`, `BASE_SWATCH_INDEX`, `ThemeBackground` (Task 4); `themeBackground`, `setThemeBackground`, `themeColor`, `isDarkMode` from `useThemeStore` (Task 5).
- Produces: `getSelectedSwatchIndex(background: ThemeBackground | null): number` and `backgroundForSwatchTap(index: number): ThemeBackground | null` exported from `src/styles/backgrounds.ts`; `<BackgroundSwatchRow />` component (no props — reads the store).

- [ ] **Step 1: Write the failing helper tests**

Append to `src/__tests__/styles/backgrounds.test.ts`:

```ts
import { getSelectedSwatchIndex, backgroundForSwatchTap } from '@/styles/backgrounds';

describe('swatch row selection helpers', () => {
  it('null (theme default) highlights the base slot', () => {
    expect(getSelectedSwatchIndex(null)).toBe(BASE_SWATCH_INDEX);
  });
  it('presets highlight their slot; custom highlights nothing', () => {
    expect(getSelectedSwatchIndex({ kind: 'preset', index: 1 })).toBe(1);
    expect(getSelectedSwatchIndex({ kind: 'custom', light: '#ffffff' })).toBe(-1);
  });
  it('tapping the base slot stores null (theme default), others store a preset', () => {
    expect(backgroundForSwatchTap(BASE_SWATCH_INDEX)).toBeNull();
    expect(backgroundForSwatchTap(0)).toEqual({ kind: 'preset', index: 0 });
    expect(backgroundForSwatchTap(5)).toEqual({ kind: 'preset', index: 5 });
  });
});
```

- [ ] **Step 2: Run to verify failure, then implement the helpers**

Run: `pnpm --dir apps/readest-app test -- src/__tests__/styles/backgrounds.test.ts` → FAIL (helpers missing). Add to `src/styles/backgrounds.ts`:

```ts
// Selecting the theme's own bg slot is stored as null ("theme default") so the
// choice survives tweaks to the swatch derivation formula.
export const getSelectedSwatchIndex = (background: ThemeBackground | null): number => {
  if (!background) return BASE_SWATCH_INDEX;
  return background.kind === 'preset' ? background.index : -1;
};

export const backgroundForSwatchTap = (index: number): ThemeBackground | null => {
  return index === BASE_SWATCH_INDEX ? null : { kind: 'preset', index };
};
```

Re-run → PASS.

- [ ] **Step 3: Build the component**

Create `src/components/settings/color/BackgroundSwatchRow.tsx`:

```tsx
import clsx from 'clsx';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeStore } from '@/store/themeStore';
import {
  backgroundForSwatchTap,
  getBackgroundSwatches,
  getSelectedSwatchIndex,
} from '@/styles/backgrounds';
import { SettingLabel } from '../primitives';

// One row, mode-aware: each slot swaps to its light/dark equivalent when the
// appearance flips, so the user's choice (a slot, not a hex) carries across.
const BackgroundSwatchRow = () => {
  const _ = useTranslation();
  const { themeColor, isDarkMode, themeBackground, setThemeBackground } = useThemeStore();
  const swatches = getBackgroundSwatches(themeColor, isDarkMode);
  const selectedIndex = getSelectedSwatchIndex(themeBackground);

  return (
    <div className='px-4' data-setting-id='settings.color.background'>
      <SettingLabel>{_('Background')}</SettingLabel>
      <div role='radiogroup' aria-label={_('Background')} className='mt-2 flex items-center gap-3'>
        {swatches.map((hex, index) => (
          <button
            key={index}
            type='button'
            role='radio'
            aria-checked={selectedIndex === index}
            aria-label={
              index === 0 ? _('Neutral background') : `${_('Theme background')} ${index}`
            }
            onClick={() => setThemeBackground(backgroundForSwatchTap(index))}
            className={clsx(
              'eink-bordered h-8 w-8 rounded-full border transition-transform hover:scale-110',
              'border-base-content/20',
              selectedIndex === index
                ? 'ring-base-content ring-2 ring-offset-2 ring-offset-base-100'
                : 'ring-0',
            )}
            style={{ backgroundColor: hex }}
          />
        ))}
      </div>
    </div>
  );
};

export default BackgroundSwatchRow;
```

- [ ] **Step 4: Wire into ColorPanel**

In `src/components/settings/ColorPanel.tsx`:
- Import: `import BackgroundSwatchRow from './color/BackgroundSwatchRow';`
- Destructure `setThemeBackground` from `useThemeStore()` (line 33-43 block).
- In `handleReset` (after `setThemeMode('auto');`): `setThemeBackground(null);`
- Render after `<ThemeColorSelector ... />`, only for built-in themes:

```tsx
{themes.some((t) => t.name === themeColor) && <BackgroundSwatchRow />}
```

- [ ] **Step 5: Visual check (owner sign-off gate)**

Run: `pnpm --dir apps/readest-app dev-web`, open the reader settings → Color panel. Verify: row renders 6 circles; first is white (light) / black (dark); tapping changes chrome + book page immediately; flipping light/dark keeps the same slot selected with mode-equivalent colors; E-ink mode (Settings → Misc) shows crisp borders. **Do not commit visual changes until the owner approves the look.**

- [ ] **Step 6: Commit (after sign-off)**

```bash
git add src/components/settings/color/BackgroundSwatchRow.tsx src/components/settings/ColorPanel.tsx src/styles/backgrounds.ts src/__tests__/styles/backgrounds.test.ts
git commit -m "feat(themes): background swatch row with mode-equivalent slots"
```

---

### Task 7: Hue-locked custom shade picker (paint palette button)

**Files:**
- Modify: `src/styles/backgrounds.ts` (add `clampShadeToTheme`, `shadeFromHex`)
- Create: `src/components/settings/color/BackgroundShadePicker.tsx`
- Modify: `src/components/settings/color/BackgroundSwatchRow.tsx` (append the palette button + popover)
- Test: `src/__tests__/styles/backgrounds.test.ts`

**Interfaces:**
- Consumes: Task 4-6 exports; `boostContrast`, `BODY_MIN_CONTRAST` from themes.
- Produces:
  - `clampShadeToTheme(themeName: string, isDarkMode: boolean, shade: { s: number; l: number }): string` — hex with the theme bg's hue, saturation clamped to [0, 0.75], lightness clamped to the mode's readable band (light: [0.82, 1], dark: [0.04, 0.28]).
  - `shadeFromHex(hex: string): { s: number; l: number }` — HSL round-trip for initializing sliders.

- [ ] **Step 1: Write the failing tests**

Append to `src/__tests__/styles/backgrounds.test.ts`:

```ts
import { clampShadeToTheme, shadeFromHex } from '@/styles/backgrounds';

describe('clampShadeToTheme', () => {
  it('locks the hue to the theme background hue', () => {
    const themeHue = tinycolor(
      themes.find((t) => t.name === 'desert-sunset')!.colors.light['base-100'],
    ).toHsl().h;
    const out = tinycolor(clampShadeToTheme('desert-sunset', false, { s: 0.5, l: 0.9 })).toHsl();
    expect(Math.abs(out.h - themeHue)).toBeLessThanOrEqual(1);
  });

  it('clamps lightness into the readable band per mode', () => {
    // A mid-tone request in light mode must be lifted into the light band.
    const light = tinycolor(clampShadeToTheme('paper', false, { s: 0.3, l: 0.5 })).toHsl();
    expect(light.l).toBeGreaterThanOrEqual(0.82);
    // And pushed down into the dark band in dark mode.
    const dark = tinycolor(clampShadeToTheme('paper', true, { s: 0.3, l: 0.5 })).toHsl();
    expect(dark.l).toBeLessThanOrEqual(0.28);
  });

  it('any clamped shade reaches AAA after the boost pipeline (no mid-tone trap)', () => {
    for (const mode of [false, true]) {
      for (const s of [0, 0.4, 0.75, 1]) {
        for (const l of [0, 0.3, 0.5, 0.7, 1]) {
          const bg = clampShadeToTheme('desert-sunset', mode, { s, l });
          const theme = themes.find((t) => t.name === 'desert-sunset')!;
          const rebuilt = boostContrast(
            applyBackgroundToPalette(theme.colors[mode ? 'dark' : 'light'], bg, mode),
            mode,
            7,
          );
          expect(
            tinycolor.readability(rebuilt['base-100'], rebuilt['base-content']),
            `${bg} ${mode ? 'dark' : 'light'} s=${s} l=${l}`,
          ).toBeGreaterThanOrEqual(7);
        }
      }
    }
  });

  it('shadeFromHex round-trips through clampShadeToTheme', () => {
    const hex = clampShadeToTheme('paper', false, { s: 0.2, l: 0.9 });
    const { s, l } = shadeFromHex(hex);
    expect(clampShadeToTheme('paper', false, { s, l })).toBe(hex);
  });
});
```

- [ ] **Step 2: Run to verify failure, then implement the helpers**

Run: `pnpm --dir apps/readest-app test -- src/__tests__/styles/backgrounds.test.ts` → FAIL. Add to `src/styles/backgrounds.ts`:

```ts
// Readable lightness bands: within these, black (light mode) or white (dark
// mode) text always clears AAA, so the picker physically cannot produce a
// mid-tone trap. Saturation is capped so extreme chroma can't tank contrast.
const LIGHT_BAND = { min: 0.82, max: 1 };
const DARK_BAND = { min: 0.04, max: 0.28 };
const MAX_SATURATION = 0.75;

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

export const clampShadeToTheme = (
  themeName: string,
  isDarkMode: boolean,
  shade: { s: number; l: number },
): string => {
  const theme = themes.find((t) => t.name === themeName) ?? themes[0]!;
  const baseHue = tinycolor(theme.colors[isDarkMode ? 'dark' : 'light']['base-100']).toHsl().h;
  const band = isDarkMode ? DARK_BAND : LIGHT_BAND;
  return tinycolor({
    h: baseHue,
    s: clamp(shade.s, 0, MAX_SATURATION),
    l: clamp(shade.l, band.min, band.max),
  }).toHexString();
};

export const shadeFromHex = (hex: string): { s: number; l: number } => {
  const { s, l } = tinycolor(hex).toHsl();
  return { s, l };
};
```

Re-run → PASS. If the AAA sweep fails at band edges, tighten the band constants (e.g. `LIGHT_BAND.min` up, `DARK_BAND.max` down) until the sweep passes — the test is the contract, the constants serve it.

- [ ] **Step 3: Build the picker popover**

Create `src/components/settings/color/BackgroundShadePicker.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react';
import tinycolor from 'tinycolor2';
import { CgColorPicker } from 'react-icons/cg';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeStore } from '@/store/themeStore';
import {
  clampShadeToTheme,
  resolveBackgroundColor,
  shadeFromHex,
  applyBackgroundToPalette,
} from '@/styles/backgrounds';
import { BODY_MIN_CONTRAST, boostContrast, themes } from '@/styles/themes';

// Paint-palette button: pick a custom shade of the ACTIVE theme. Hue is locked
// to the theme background; lightness is clamped per mode, so every reachable
// color stays readable. Writes only the active mode's slot of a custom
// background (the other mode keeps its own value or the theme default).
const BackgroundShadePicker = () => {
  const _ = useTranslation();
  const { themeColor, isDarkMode, themeBackground, setThemeBackground } = useThemeStore();
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  const currentHex =
    resolveBackgroundColor(themeBackground, themeColor, isDarkMode) ??
    (themes.find((t) => t.name === themeColor) ?? themes[0]!).colors[
      isDarkMode ? 'dark' : 'light'
    ]['base-100'];
  const [shade, setShade] = useState(() => shadeFromHex(currentHex));

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const previewHex = clampShadeToTheme(themeColor, isDarkMode, shade);
  const theme = themes.find((t) => t.name === themeColor) ?? themes[0]!;
  const previewPalette = boostContrast(
    applyBackgroundToPalette(theme.colors[isDarkMode ? 'dark' : 'light'], previewHex, isDarkMode),
    isDarkMode,
    BODY_MIN_CONTRAST,
  );
  const ratio = tinycolor.readability(previewPalette['base-100'], previewPalette['base-content']);

  const applyShade = (next: { s: number; l: number }) => {
    setShade(next);
    const hex = clampShadeToTheme(themeColor, isDarkMode, next);
    const custom =
      themeBackground?.kind === 'custom' ? themeBackground : { kind: 'custom' as const };
    setThemeBackground({ ...custom, [isDarkMode ? 'dark' : 'light']: hex });
  };

  return (
    <div className='relative'>
      <button
        type='button'
        onClick={() => setIsOpen(!isOpen)}
        aria-label={_('Custom background shade')}
        title={_('Custom background shade')}
        className='eink-bordered text-base-content/60 hover:bg-base-200 hover:text-base-content inline-flex h-8 w-8 items-center justify-center rounded-full border border-base-content/20 transition-colors'
      >
        <CgColorPicker className='h-5 w-5' />
      </button>
      {isOpen && (
        <div
          ref={popoverRef}
          className='bg-base-100 border-base-300 absolute end-0 top-full z-50 mt-2 w-56 rounded-lg border p-3 shadow-lg'
        >
          <div
            className='eink-bordered mb-3 flex h-12 items-center justify-center rounded'
            style={{ backgroundColor: previewPalette['base-100'] }}
          >
            <span className='text-sm' style={{ color: previewPalette['base-content'] }}>
              {_('Aa')} · {ratio.toFixed(1)}:1 {ratio >= 7 ? 'AAA' : 'AA'}
            </span>
          </div>
          <label className='mb-2 block text-xs'>
            {_('Shade')}
            <input
              type='range'
              min={0}
              max={100}
              value={Math.round(shade.l * 100)}
              onChange={(e) => applyShade({ ...shade, l: Number(e.target.value) / 100 })}
              className='range range-xs mt-1 w-full'
            />
          </label>
          <label className='block text-xs'>
            {_('Tint')}
            <input
              type='range'
              min={0}
              max={100}
              value={Math.round(shade.s * 100)}
              onChange={(e) => applyShade({ ...shade, s: Number(e.target.value) / 100 })}
              className='range range-xs mt-1 w-full'
            />
          </label>
        </div>
      )}
    </div>
  );
};

export default BackgroundShadePicker;
```

- [ ] **Step 4: Append the button to the row**

In `BackgroundSwatchRow.tsx`, import and render `<BackgroundShadePicker />` as the last child of the `radiogroup` flex container (after the mapped swatches). Custom-active state: when `getSelectedSwatchIndex(themeBackground) === -1`, no radio is checked — the picker button is the active control; give the picker button the same selected ring classes (`ring-base-content ring-2 ring-offset-2 ring-offset-base-100`) when `selectedIndex === -1`.

- [ ] **Step 5: Visual check (owner sign-off gate)**

`pnpm --dir apps/readest-app dev-web`: open the picker on Desert Sunset light — sliders only produce warm light shades; ratio badge updates live and never drops below 4.5; flipping to dark keeps a custom light shade for light mode and shows theme default in dark until customized. **Wait for owner approval before committing.**

- [ ] **Step 6: Commit (after sign-off)**

```bash
git add src/components/settings/color/BackgroundShadePicker.tsx src/components/settings/color/BackgroundSwatchRow.tsx src/styles/backgrounds.ts src/__tests__/styles/backgrounds.test.ts
git commit -m "feat(themes): hue-locked custom background shade picker with live contrast badge"
```

---

### Task 8: Full verification + design docs

**Files:**
- Modify: `DESIGN.md` (document the Background row + contrast floor conventions)
- No source changes expected.

- [ ] **Step 1: Full test suite**

Run: `pnpm --dir apps/readest-app test`
Expected: PASS (modulo the pre-existing baseline noise noted in project memory — compare failures against `main`, not zero).

- [ ] **Step 2: Lint + types**

Run: `pnpm --dir apps/readest-app lint`
Expected: clean for changed files.

- [ ] **Step 3: Document the conventions**

Append to `DESIGN.md` (Settings/theming section):

```markdown
### Background row & contrast floor

- Every palette that reaches the screen passes `boostContrast(palette, isDark, BODY_MIN_CONTRAST)` (WCAG AA 4.5:1) in `getThemeCode()`; High Contrast raises the target to AAA (7:1). Never bypass `getThemeCode`/`applyBackgroundOverride` when introducing a new color surface.
- The Background row stores presets by **slot index** (`{ kind: 'preset', index }`) so a choice survives light/dark flips; slot 3 (`BASE_SWATCH_INDEX`) is the theme's own background and is stored as `null`.
- Custom shades come only from `clampShadeToTheme` — hue locked to the theme, lightness clamped to per-mode readable bands. Do not expose a free color wheel for page backgrounds; the ThemeEditor is the power-user escape hatch.
```

- [ ] **Step 4: Commit**

```bash
git add DESIGN.md
git commit -m "docs: background row and contrast floor conventions"
```
