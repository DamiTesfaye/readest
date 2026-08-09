# UI Animations Toggle — Requirements & Design

**Date:** 2026-08-09
**Status:** Approved design, pending implementation plan

## Problem

Recent work introduced UI animations: a Rive eye-tracking search bar in the TOC popover (`SearchBarRive.tsx`, `public/rive/searchbar.riv`) and CSS transitions in the theme/fonts popover (`themefonts/ControlRow.tsx`, `CustomizeSection.tsx`). Users need an app-level preference to turn these off.

## Decisions

- **Scope:** One switch, "UI Animations", covers all decorative UI motion: the Rive search bar animation and CSS transitions/animations across the app UI. The reader's paging animation keeps its own existing setting and is unaffected.
- **OS Reduce Motion:** The setting defaults to following the OS `prefers-reduced-motion` preference until the user explicitly flips the switch; from then on the user's choice sticks.
- **Placement:** New **Interface** section in Settings → Behavior (`ControlPanel.tsx`), placed above the Device section.
- **Mechanism (Approach A):** Root data attribute + global CSS kill rule, plus gating the Rive component's mount.

## Design

### 1. Setting and default resolution

- `SystemSettings` gains `uiAnimationsEnabled?: boolean` (`src/types/settings.ts`). No entry in `DEFAULT_SYSTEM_SETTINGS` because the default is not static.
- New `src/utils/animation.ts` exports `prefersReducedMotion()` and `resolveUIAnimationsEnabled(settings)`, which returns `settings.uiAnimationsEnabled ?? !prefersReducedMotion()`. The `matchMedia` call is guarded with a `typeof window` check for SSR.
- Flipping the switch persists an explicit boolean via `saveSysSettings(envConfig, 'uiAnimationsEnabled', value)`.

### 2. Root attribute and CSS

- When resolved to off, `document.documentElement` gets `data-ui-anim="off"`, applied by a `useUIAnimationsMode` hook mirroring `useEinkMode` (`src/hooks/useEinkMode.ts`). It runs at startup in `Providers.tsx` (next to the existing `applyEinkMode` startup call) and reactively when the toggle changes in `ControlPanel.tsx`.
- Precedent: eink mode already toggles a `.no-transitions` body class with `transition: none !important`. This setting gets its own attribute rather than reusing that class because eink mode and this toggle are independent writers; sharing one class would let either clobber the other's state.
- One rule in `src/styles/globals.css`:

```css
[data-ui-anim='off'] *,
[data-ui-anim='off'] *::before,
[data-ui-anim='off'] *::after {
  transition-duration: 0s !important;
  transition-delay: 0s !important;
  animation-duration: 0s !important;
}
```

- Book content renders inside the foliate iframe, so this rule cannot reach it; paging animation stays governed by its own setting.

### 3. Rive gate

- `SearchBar.tsx` renders `<SearchBarRive …>` only when animations are enabled.
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
2. `SearchBar` test: Rive canvas does not mount when animations are disabled, does mount when enabled.
3. `ControlPanel` test: flipping the UI Animations switch persists `uiAnimationsEnabled` through the settings save path.

## Out of scope

- Per-animation granularity (single global switch only).
- i18n locale file updates for the new labels (key-as-content fallback covers English; translations follow the project's deferred i18n batch).
- Any change to the reader paging animation setting.
