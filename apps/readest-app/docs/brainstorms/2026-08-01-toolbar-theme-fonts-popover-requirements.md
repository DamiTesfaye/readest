---
date: 2026-08-01
topic: toolbar-theme-fonts-popover
---

# AmpleRead Toolbar and Theme & Fonts Popover — Requirements

## Summary

Rebuild the reader toolbar for web/desktop/tablet around seven illustrated items on a scene-themed bar (menu, library, bookmarks & notes, annotations | AI, Theme & Fonts, bookmark), and ship the first of its popovers: Theme & Fonts, a pointer-anchored surface with a compact state (quick controls + six dual-mood theme cards + Customize) and an expanded state (backgrounds, typography, layout) that replaces the settings dialog's Font/Layout/Color panels. On phones the same content ships as a bottom sheet. The theme set becomes Neue Paper, Desert Sunset, Starry Night, Forest Pond (reworked from Night Pond), Ocean Wave, and Cherry Bloom.

## Problem Frame

The current header bar exposes a dense strip of abstract icons (sidebar, search, TOC, pin, library, bookmark, translate, highlighter, settings, notebook, view menu, window buttons) that carries high cognitive load and no relationship to AmpleRead's scene-driven identity. Reading-appearance controls are split across three settings-dialog panels (Font, Layout, Color) plus a footer strip, so adjusting the reading experience means leaving the page for a modal. The new mockups (`dump/bs_0.png` and companions) collapse the toolbar to seven illustrated affordances, progressively reveal everything else behind popovers, and let the chrome itself take on the active scene's color. This milestone lands the toolbar shell and the Theme & Fonts popover; the remaining popovers follow one at a time.

---

## Key Decisions

- **Interim wiring over staged appearance.** All seven toolbar items ship now with their new icons, but the six whose popovers aren't built yet trigger today's equivalent behaviors (menu → TOC sidebar, library → go to library, bookmarks & notes → notebook, annotations → notebook annotations, ribbon → bookmark toggle). Popovers swap in one milestone at a time without the toolbar composition changing.
- **The popover replaces, not duplicates, the settings panels.** Font, Layout, and Color panels leave the settings dialog on all screen sizes; the Theme & Fonts surface is the single place to adjust reading appearance. Remaining panels (Control, Custom CSS, TTS, etc.) stay in a slimmed settings dialog.
- **One shared content component, two presentations.** Large screens render Theme & Fonts as an anchored popover with a tooltip pointer; phones render the same content as a bottom sheet, both shipping this milestone.
- **Muted icon variants everywhere except Neue Paper light.** The full-color illustrated icons render only on Neue Paper light; every other theme — including Neue Paper dark — uses the `muted` asset variants for a single easy-to-manage rule.
- **Night Pond becomes Forest Pond.** The night-pond theme is reworked into dual-mood Forest Pond; Ocean Wave and Cherry Bloom are new themes whose palettes are derived from their card artwork and require the user's visual sign-off.
- **Close-book button removed; OS window controls untouched.** Minimize/maximize/close window buttons stay wherever the platform requires them. Returning to the library is the library affordance's job (interim: direct navigation; later: the library popover's Go home CTA).
- **Control-row semantics.** In the popover's top row, the A|A pill is a quick font-size stepper, the half-circle toggles follow-system appearance, and the day/night sky pill picks light/dark explicitly.
- **Slimmed settings dialog opens from the menu affordance.** Interim: an entry in the existing ViewMenu/sidebar area; later: the redesigned menu popover. The toolbar stays at seven items.

---

## Requirements

**Toolbar (large screens)**

- R1. The header bar shows, left to right: menu, a divider, library, bookmarks & notes, annotations; centered book title; then AI, Theme & Fonts, and bookmark on the right, per `dump/bs_0.png`.
- R2. Toolbar icons use the illustrated assets from the design set, with the full-color variants only when Neue Paper light is the effective appearance and the `muted` variants for every other theme and mode, including Neue Paper dark.
- R3. The toolbar surface takes the active theme's background color (scene chrome, per `dump/bs_0.png` and `dump/n5.png`); the title and icons stay legible on every built-in theme in both moods.
- R4. Until their own popovers ship, the six non-theme items trigger existing behaviors: menu opens the TOC sidebar, library navigates to the library, bookmarks & notes opens the notebook, annotations opens the notebook's annotations, and the ribbon toggles a bookmark on the current page. The AI item's interim behavior is decided in planning (wire to existing TTS or hidden).
- R5. The close-book button is removed from the toolbar. OS window buttons (minimize/maximize/close) are not touched on any platform.
- R6. The toolbar and popover stay legible under e-ink mode (`data-eink`), following the existing `eink-bordered` conventions.

**Theme & Fonts popover — compact state**

- R7. Activating the Theme & Fonts item opens a popover anchored to it, with a tooltip pointer aimed at the trigger. The pointer stays on the trigger even when the popover body must shift inward because the trigger sits near the screen edge (first/last toolbar items).
- R8. The compact state shows the "Theme & Fonts" title, the control row, a 3×2 grid of theme cards, and a Customize button.
- R9. Control row: the A|A pill steps the font size down/up (writing the same value the Customize size field edits); the half-circle toggles follow-system appearance; the day/night sky pill selects light or dark explicitly.
- R10. Six dual-mood theme cards render with their scene artwork and an Aa type preview: Neue Paper, Desert Sunset, Starry Night, Forest Pond, Ocean Wave, Cherry Bloom. The active card shows a selected outline. Selecting a card applies it immediately (chrome color and icon variants included).
- R11. The popover surface itself is themed: its background, text, and controls follow the active theme's palette in both moods (per `dump/n2.png`, `dump/as_2.png`).

**Theme & Fonts popover — expanded (Customize) state**

- R12. Customize expands the popover in place, adding: a Background swatch row (per-mode background slots plus the custom palette affordance), and Typography and Layout Options — font family, size, bold, line height, letter spacing, word spacing, margins (with per-side expansion), columns (auto, count, gaps), and a preview text block with scale slider, per `dump/n3.png`.
- R13. Adjustments in the expanded state preview live on the page. Done keeps them; Cancel reverts everything changed since Customize was opened; Reset restores the defaults (exact reset scope decided in planning).

**Theme set**

- R14. Night Pond is reworked into dual-mood Forest Pond; persisted `night-pond` selections resolve to Forest Pond via the existing legacy-name mechanism.
- R15. Ocean Wave and Cherry Bloom are added as dual-mood themes with palettes derived from their card artwork, including per-mode background slots. Palette drafts require the user's visual sign-off before they're considered final.

**Mobile bottom sheet**

- R16. On small screens, the existing Theme & Fonts (Aa) trigger opens the same content as a bottom-sheet modal instead of the settings dialog; popover and sheet share one content component.
- R17. The bottom sheet adapts the popover layout to sheet proportions (the taller variant in `dump/n3.png` is the reference until the user shares dedicated mobile designs).

**Settings dialog**

- R18. The Font, Layout, and Color panels are removed from the settings dialog on all screen sizes; remaining panels stay in a slimmed dialog. Users landing on removed panels' entry points are routed to the Theme & Fonts surface.

**Assets**

- R19. Toolbar and popover assets move out of `dump/assets/` into the app's public images path (following the `public/images/theme-cards/` precedent), covering colored + muted icon variants, theme card artwork, and per-theme Aa preview images.

---

## Key Flows

- F1. Theme switch from the toolbar
  - **Trigger:** Reader clicks the Aa item, popover opens in compact state.
  - **Steps:** Reader taps the Ocean Wave card; the book content, toolbar chrome, icon variants, and the popover itself re-theme immediately; the popover stays open.
  - **Outcome:** Reading continues in Ocean Wave; no modal round-trip.
- F2. Customize session
  - **Trigger:** Reader clicks Customize in the compact popover.
  - **Steps:** Popover expands in place; reader adjusts font, line height, margins with live preview; clicks Done (keep) or Cancel (revert to pre-Customize state).
  - **Outcome:** Appearance settings persist through the same stores the settings panels used.
- F3. Quick size change
  - **Trigger:** Reader clicks the larger A in the control-row pill twice.
  - **Outcome:** Font size steps up twice; reopening Customize shows the size field reflecting the stepped value.

---

## Acceptance Examples

- AE1. **Covers R2, R10.** Given Neue Paper light is active, when the user selects Desert Sunset, then the toolbar background becomes the Desert Sunset chrome color and all toolbar icons switch to their muted variants.
- AE2. **Covers R7.** Given Theme & Fonts sits near the right screen edge, when its popover opens, then the popover body shifts left to stay within the viewport while the pointer remains aimed at the Aa trigger.
- AE3. **Covers R9.** Given Starry Night is active with follow-system off, when the user taps the sky pill toward day, then Starry Night's light-mood palette renders (dual-mood, no card deselection).
- AE4. **Covers R13.** Given the user opened Customize and changed line height and margins, when they click Cancel, then both revert to their values from before Customize was opened.
- AE5. **Covers R14.** Given a user whose saved theme is `night-pond`, when they open the app after the update, then Forest Pond is active.
- AE6. **Covers R16, R18.** Given a phone user taps the Aa toolbar button, then the Theme & Fonts bottom sheet opens, and the settings dialog no longer lists Font, Layout, or Color panels.

---

## Scope Boundaries

**Deferred to later milestones (one popover at a time)**

- Library popover (currently-reading grid, search, Go home CTA) and the two-book concurrency / auto-close-with-progress model that ships with it.
- Bookmarks & Notes popover, Annotations popover, and the decorative bookmark-style picker.
- AI experience popover (Mindmap, Summarise, TTS, host-led podcast, Gallery, assistant prompt) — this milestone at most re-points the AI icon at existing behavior.
- In-text selection popover (`dump/pp.png`) replacing the horizontal annotator, including relocated search, translate, and annotation quick actions.
- Menu/TOC popover redesign; the menu item keeps opening the existing sidebar for now.
- Mobile toolbar revamp — the user will share dedicated mobile designs later; this milestone only swaps the phone's appearance-settings surface for the bottom sheet.

**Standing constraints**

- i18n extraction for new strings follows the existing deferred workflow; new labels render as English keys until then.

---

## Dependencies / Assumptions

- The current branch's background swatch model (per-mode equivalent slots) and themeBackground chrome override are the substrate for R3, R11, and R12; this work builds on, not around, them.
- The needed SVG assets exist in `dump/assets/` (colored + muted icons, six theme cards, per-theme Aa images, sky-pill artwork); gaps found during implementation go back to the user.
- Ocean Wave and Cherry Bloom have artwork but no palettes; deriving them is in-scope design work with a propose → sign-off loop (the user corrects fast on hue drift, e.g. the rejected purplish desert).
- Large-screen vs phone presentation follows the app's existing responsive boundary; the exact breakpoint is confirmed in planning.

---

## Outstanding Questions

**Deferred to planning**

- AI icon interim behavior: wire to existing TTS entry or hide until the AI popover milestone.
- Font-size stepper increment, bounds, and its relationship to the default font size.
- Exact Reset scope in the expanded state (theme defaults vs app defaults; whether it touches theme selection).
- Popover dimensions/scroll behavior when the expanded state exceeds viewport height.
- Whether the font-family dropdown default display ("Inter" in mockups) reflects the current default serif stack or a new default.

---

## Sources

- Definitive toolbar: `dump/bs_0.png`; themed variants: `dump/n5.png`
- Theme & Fonts popover: `dump/as_2.png`, `dump/n2.png`; expanded states: `dump/n3.png`, `dump/n1.png`
- Later-milestone references (context only): `dump/bs_1.png` (library), `dump/bs_2.png` (bookmarks & notes), `dump/bs_3.png` (annotations), `dump/as_1.png` (AI), `dump/as_3.png` (bookmark styles), `dump/hm.png` (Go home), `dump/pp.png` (in-text popover), `dump/n6.png` (popover family)
- Assets: `dump/assets/` (colored + `_muted` icon variants, `builtin_*_theme.svg` cards, `font_*_small|large.svg` previews)
- Current implementation: `apps/readest-app/src/app/reader/components/HeaderBar.tsx`, `apps/readest-app/src/components/settings/ColorPanel.tsx`, `apps/readest-app/src/styles/themes.ts`, `apps/readest-app/src/styles/backgrounds.ts`, `apps/readest-app/src/components/settings/color/BackgroundSwatchRow.tsx`
- Prior decisions: `apps/readest-app/docs/brainstorms/2026-07-04-theme-settings-redesign-requirements.md`, `apps/readest-app/docs/plans/2026-07-20-002-feat-background-row-contrast-plan.md`
