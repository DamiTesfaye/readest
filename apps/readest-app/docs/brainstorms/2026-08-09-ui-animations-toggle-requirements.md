# UI Animations Toggle — Requirements & Design

**Date:** 2026-08-09
**Status:** Approved design, pending implementation plan

## Problem

Recent work introduced UI animations: a Rive eye-tracking search bar (`SearchBarRive.tsx`, `public/rive/searchbar.riv`, rendered via `SearchBar.tsx` in both the TOC popover and the sidebar) and CSS transitions in the theme/fonts popover (`themefonts/ControlRow.tsx`, `CustomizeSection.tsx`). Users need an app-level preference to turn these off.

Today these animations respond to the OS Reduce Motion preference piecemeal: the themefonts transitions (plus `ThemeModeSelector.tsx`, `ThemeColorSelector.tsx`, `BrightnessOverlay.tsx`) carry Tailwind `motion-reduce:` variants, and `globals.css` has three `@media (prefers-reduced-motion: reduce)` blocks (squash-stretch, wobble, view transitions). These CSS gates answer only to the media query, not to any app setting, and there is no user-facing switch.

## Decisions

- **Scope:** One switch, "UI Animations", covers all decorative UI motion: the Rive search bar animation and CSS transitions/animations across the app UI. The reader's paging animation keeps its own existing setting and is unaffected.
- **OS Reduce Motion:** The setting defaults to following the OS `prefers-reduced-motion` preference until the user explicitly flips the switch; from then on the user's choice sticks in both directions. For an explicit ON to actually override OS Reduce Motion, the setting must be the single source of truth for CSS too: the existing `motion-reduce:` Tailwind variants and `@media (prefers-reduced-motion: reduce)` blocks migrate to key off the `data-ui-anim` attribute (see Design §2a). Without that migration, a user with OS Reduce Motion on who enables the switch would get the Rive animation (JS-gated on the resolved value) while every CSS transition stayed dead.
- **Placement:** New **Interface** section in Settings → Behavior (`ControlPanel.tsx`), placed above the Device section. This lands directly below the existing **Animation** section (reader paging animation, `settings.control.pagingAnimation`). The two stay separate on purpose: Animation governs reader/book motion, Interface governs app chrome. The switch does not join the Animation section because that would blur the scope line this feature depends on.
- **Mechanism (Approach A):** Root data attribute + global CSS kill rule, plus gating the Rive component's mount.

## Design

### 1. Setting and default resolution

- `SystemSettings` gains `uiAnimationsEnabled?: boolean` (`src/types/settings.ts`). No entry in `DEFAULT_SYSTEM_SETTINGS` because the default is not static.
- New `src/utils/animation.ts` exports `prefersReducedMotion()` and `resolveUIAnimationsEnabled(settings)`, which returns `settings.uiAnimationsEnabled ?? !prefersReducedMotion()`. The `matchMedia` call is guarded with a `typeof window` check for SSR.
- Flipping the switch persists an explicit boolean via `saveSysSettings(envConfig, 'uiAnimationsEnabled', value)`.

### 2. Root attribute and CSS

- When resolved to off, `document.documentElement` gets `data-ui-anim="off"`, applied by a `useUIAnimationsMode` hook modeled on `useEinkMode` (`src/hooks/useEinkMode.ts`). One deliberate divergence from that model: `useEinkMode` always writes `data-eink="true"/"false"`, while this hook applies the attribute only when off and removes it when on. It runs at startup in `Providers.tsx` (next to the existing `applyEinkMode` startup call) and reactively when the toggle changes in `ControlPanel.tsx`.
- Precedent: eink mode already toggles a `.no-transitions` body class with `transition: none !important`. This setting gets its own attribute rather than reusing that class because eink mode and this toggle are independent writers; sharing one class would let either clobber the other's state.
- Kill rules in `src/styles/globals.css`:

```css
[data-ui-anim='off'] *,
[data-ui-anim='off'] *::before,
[data-ui-anim='off'] *::after {
  transition-duration: 0s !important;
  transition-delay: 0s !important;
  animation-duration: 0s !important;
  animation-delay: 0s !important;
}

[data-ui-anim='off']::view-transition-old(root),
[data-ui-anim='off']::view-transition-new(root) {
  animation: none !important;
}
```

- `animation-delay` is zeroed so delayed one-shot animations snap immediately instead of waiting out their delay before jumping.
- View transitions need the second rule: `::view-transition-*` pseudo-elements attach to the root element itself, so the descendant selector `[data-ui-anim='off'] *` never matches them. The theme-switch view transition (`globals.css`) is decorative UI motion and is in scope.
- The `settings-highlight-pulse` command-palette animation is killed by the descendant rule; that is intended, it is decorative.
- Book content renders inside the foliate iframe, so these rules cannot reach it; paging animation stays governed by its own setting.

### 2a. Migrating existing reduced-motion CSS

The setting becomes the single source of truth for decorative motion, with the OS preference feeding only the default. Existing media-query-based gates migrate to the attribute:

- Tailwind `motion-reduce:transition-none` variants in `themefonts/ControlRow.tsx`, `themefonts/CustomizeSection.tsx`, `settings/color/ThemeModeSelector.tsx`, `settings/color/ThemeColorSelector.tsx`, and `reader/components/BrightnessOverlay.tsx` are removed; the `data-ui-anim` kill rule covers them.
- The `@media (prefers-reduced-motion: reduce)` blocks in `globals.css` for `.animate-squash-stretch`, `.animate-wobble`, and the view-transition fallback are removed; the kill rules cover them.
- Net effect: with OS Reduce Motion on and the switch untouched, the resolver defaults to off, the attribute is set, and motion is killed. For the Tailwind variants, squash-stretch, and wobble this matches today's behavior exactly (all fully disabled). View transitions get stricter: today reduce-motion users see a simplified 0.15s cross-fade (`simple-fade-out`/`simple-fade-in`); after migration they get no view-transition animation at all, which is the honest meaning of "off". The `simple-fade-*` keyframes are deleted along with their media block. With the switch explicitly on, all decorative motion runs at full fidelity, including on reduce-motion systems.

### 3. Rive gate

- `SearchBar.tsx` already gates the Rive mount on eink (`{!isEink && <SearchBarRive …>}`); the animations condition composes with it: `{!isEink && animationsEnabled && <SearchBarRive …>}`.
- Off means no canvas element, no WASM fetch, no `.riv` download. The search bar's existing static styling (its pre-load state) is the fallback.
- Toggling back on mounts the component fresh.

### 4. Settings UI

- New `BoxedList title={_('Interface')}` in `ControlPanel.tsx` with a single `SettingsSwitchRow` labeled `_('UI Animations')`.
- Follows the Screen Wake Lock/telemetry toggle pattern: local state initialized from the resolved value, persisted with `saveSysSettings`.
- The switch displays the resolved value, so a user with OS Reduce Motion enabled sees it off by default.

### 5. Error handling

- `prefersReducedMotion()` returns `false` when `window` or `matchMedia` is unavailable, so the resolver degrades to animations-on rather than throwing.
- The Rive loader already catches load failures and logs a warning; gating the mount adds no new failure modes.

### 6. Testing (test-first)

1. Resolver unit tests: explicit `true`, explicit `false`, `undefined` with OS reduce-motion on, `undefined` with it off (matchMedia mocked).
2. `SearchBar` test: Rive canvas does not mount when animations are disabled, does mount when enabled, and stays unmounted in eink mode regardless of the animations setting.
3. `ControlPanel` test: flipping the UI Animations switch persists `uiAnimationsEnabled` through the settings save path.

## Out of scope

- Per-animation granularity (single global switch only).
- i18n locale file updates for the new labels (key-as-content fallback covers English; translations follow the project's deferred i18n batch).
- Any change to the reader paging animation setting.
