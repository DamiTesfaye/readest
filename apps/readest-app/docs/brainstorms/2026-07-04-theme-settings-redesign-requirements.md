---
date: 2026-07-04
topic: theme-settings-redesign
---

# Theme Settings Redesign — Requirements

## Summary

Redesign the Color settings theme section into two tiers: a "Select a default appearance" row (system/light/dark with the sky-pill toggle and a rubbery squash-and-stretch auto button) and a masonry grid of scene-artwork theme cards — Paper and Desert Sunset (light-locked), Starry Night and Night Pond (dark-locked) — plus Custom. Cards override an implicit default theme; the always-live mode controls double as the way back to it. A new High Contrast toggle replaces the Contrast theme and works on top of any theme.

## Problem Frame

The current picker shows seven flat color swatches, and the mode selector disappears entirely when a fixed-mood theme is active — the user loses the controls with no visible explanation. The AmpleRead direction treats themes as scenes with artwork, and the new mockup (`dump/img_r22.png`) collapses the picker to four scene cards with the appearance controls always present. Sepia, Ink, and Contrast have no artwork and no place in the new set; Contrast's accessibility value needs to survive in another form.

---

## Key Decisions

- **Implicit default appearance instead of Paper-as-default.** No card selected means the app follows system/light/dark using the default palette pair (today's paper light + paper dark). Paper becomes a light-locked scene card like the others, so the mode controls always mean "the default appearance."
- **Mode controls are never hidden or greyed.** When a mode-locked card is active they stay fully interactive and reflect the locked mood (moon for dark scenes, sun for light) — clicking them deselects the card and returns to default with the clicked intent. This replaces the current hide-when-fixed-mood behavior.
- **Sepia and Ink are removed outright**, migrated to default via the existing `resolveThemeName()` legacy mechanism, not hidden.
- **Contrast becomes a High Contrast toggle**, not a theme: a switch that boosts foreground/background contrast on whatever theme is active, including scenes and custom themes. Users with `contrast` selected migrate to default + toggle on.
- **Mockup copy wins over the written spec**: "Select a default appearance" with a "(System/Light/Dark)" hint, and "Prefer something different? Create your own theme" as the cards-section heading.
- **Masonry grid** for the theme cards, matching the mockup's varied card sizes, rather than the current uniform 3-column grid.

---

## Requirements

**Default appearance row**

- R1. The mode row is headed "Select a default appearance" with a smaller "(System/Light/Dark)" hint, replacing the current "Theme Mode" label.
- R2. Clicking the auto (A) button plays a rubbery squash-and-stretch animation; it must respect `prefers-reduced-motion`.
- R3. The mode row (auto button + sky-pill toggle) is always visible and interactive, regardless of which theme is active.
- R4. While a mode-locked theme is active, the toggle and auto button reflect the theme's effective mood (moon shown for dark-locked, sun for light-locked) without appearing disabled.

**Theme cards**

- R5. The theme picker becomes a masonry grid of scene-artwork cards: Paper (light-locked), Desert Sunset (light-locked), Starry Night (dark-locked), Night Pond (dark-locked), plus a dashed Custom tile retaining the existing create/edit flow.
- R6. Each preset card shows its scene artwork with a name pill containing a radio indicator, per the mockup.
- R7. Selecting a preset card applies that theme and locks the effective mode to the card's mood.
- R8. User-created custom themes keep the existing dual-mood behavior: they follow the default-appearance mode controls.
- R9. All new card and control UI stays legible under e-ink mode (`data-eink`), following the existing `eink-bordered` conventions.

**Default state and escape hatch**

- R10. The implicit default state (no card selected) follows system/light/dark using the default palette pair.
- R11. While a card is selected: clicking the sun/moon toggle returns to default in the mode toggled toward; clicking the auto button returns to default in system-follow mode; re-tapping the selected card returns to default keeping the previous mode preference.

**Legacy migration**

- R12. Sepia, Ink, and Contrast are removed from `themes.ts`; persisted selections resolve via `resolveThemeName()` — sepia and ink to default, contrast to default with High Contrast enabled.

**High Contrast**

- R13. A new High Contrast toggle in Color settings applies a contrast-boosting treatment over the active theme's effective palette, for any theme (preset, scene, or custom). The exact palette transform is decided in planning.

**Assets**

- R14. Card artwork moves out of `dump/` into the app's public images path under a dedicated subfolder (e.g., `apps/readest-app/public/images/theme-cards/`), following the precedent of `public/images/theme-toggle/`.

---

## Acceptance Examples

- AE1. **Covers R4, R11.** Given Starry Night is selected (toggle shows moon), when the user clicks the toggle, then the card deselects and the app shows the default theme in light mode.
- AE2. **Covers R2, R11.** Given Desert Sunset is selected, when the user clicks the auto button, then the squash-and-stretch animation plays, the card deselects, and the app follows the system scheme with the default theme.
- AE3. **Covers R11.** Given Night Pond is selected and the user's prior preference was auto, when the user re-taps the Night Pond card, then the app returns to the default theme in auto mode.
- AE4. **Covers R12.** Given a user whose saved theme is `contrast`, when they open the app after the update, then they see the default theme with High Contrast toggled on.
- AE5. **Covers R7, R13.** Given High Contrast is on, when the user selects Night Pond, then Night Pond's dark palette renders with the contrast boost applied.

---

## Scope Boundaries

- Other mode-cycle entry points (ViewMenu, reader footer bar, library SettingsMenu) stay as-is; adapting them to the new default/lock model is a known follow-up.
- Per-theme ambient effects (`scene.atmospherePreset`) remain Phase 2.
- No artwork or masonry treatment for user-created custom themes — the Custom tile stays a simple dashed card.
- i18n extraction for the new strings follows the existing deferred workflow (run after WIP commits land); new labels render as English keys until then.

---

## Dependencies / Assumptions

- The user supplies the four card artwork files (they exist; sharing is pending). Implementation of R5/R6/R14 blocks on receiving them.
- Default palettes are assumed to be today's paper light + paper dark pair; no separate default-dark design exists.
- The uncommitted `ThemeModeSelector.tsx` polish on the working tree should be committed before this work starts, so the animation change builds on approved visuals.

---

## Outstanding Questions

**Deferred to planning**

- Exact high-contrast palette transform (forced pure black/white vs. contrast-curve boost) and whether it needs per-mood variants.
- Masonry implementation approach (CSS columns vs. grid row spans) and responsive column count.
- Animation timing/easing specifics for the squash-and-stretch effect.
- How the "previous mode preference" for card re-tap deselection is stored.

---

## Sources

- New mockup: `dump/img_r22.png`; current modal reference: `dump/img_r24.png`
- Current implementation: `apps/readest-app/src/styles/themes.ts` (theme defs, `mood`, `resolveThemeName`, `getEffectiveDarkMode`), `apps/readest-app/src/components/settings/ColorPanel.tsx`, `apps/readest-app/src/components/settings/color/ThemeColorSelector.tsx`, `apps/readest-app/src/components/settings/color/ThemeModeSelector.tsx`
- AmpleRead design spec: `apps/readest-app/docs/superpowers/specs/2026-06-19-ampleread-experience-layer-design.md`; Phase 1 plan: `apps/readest-app/.agents/plans/2026-06-19-ampleread-phase1-scene-themes.md`
