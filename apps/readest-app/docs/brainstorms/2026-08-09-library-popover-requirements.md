---
date: 2026-08-09
topic: library-popover
---

# AmpleRead Library Popover — Requirements

## Summary

Replace the reader toolbar's library affordance — which today navigates away from the reader to the library page — with an anchored Library popover. The popover lists the user's books in two segments (Currently reading, then everything else) and carries a lightweight search field in its title bar. Leaving the reader becomes its own toolbar affordance: a Go home button placed first in the header bar, ahead of Contents. Picking a book that isn't already open raises a prompt asking whether to read it in parallel with the open book or on its own; picking one that is already open simply focuses it. The library book-picker that used to live in the View Options menu's Parallel Read submenu is deleted, since the popover now owns that job.

## Problem Frame

The toolbar milestone (`2026-08-01-toolbar-theme-fonts-popover-requirements.md`) shipped seven illustrated affordances with interim behaviors, and explicitly deferred the library popover: "Returning to the library is the library affordance's job (interim: direct navigation; later: the library popover's Go home CTA)." This milestone lands that popover.

Two problems come together here. First, tapping Library is destructive to reading context — it closes every open book and leaves the reader, with no way to glance at the shelf and come back. Second, parallel reading is discoverable only through a nested submenu in the View Options dropdown (`Parallel Read ▸` listing up to 20 books), where a book tap silently pairs it with the open book and gives the user no say in the matter. Both are answered by one surface: a library browser that stays inside the reader, opens books with an explicit parallel-or-alone choice, and keeps leaving the reader as a distinct, labelled action.

Design references: `dump/mm.png` (light and dark popover, segments, item layout) and the follow-up screenshot replacing the title-bar Go home CTA with search. Assets: `dump/assets/go_home.svg`, `dump/assets/go_home_muted.svg`.

---

## Key Decisions

- **`readingStatus === 'reading'` decides the first segment.** The library already tracks explicit reading status; `unread`, `finished`, and `abandoned` all fall to the second segment. Reading percentage renders only in the first segment, matching the design. No progress-based inference — a book the user never marked as reading stays in segment two.
- **Search takes the title bar's trailing slot; Go home becomes a toolbar affordance.** Search is the more frequent action and belongs where the eye lands when the popover opens. Leaving the reader is top-level navigation, not a library-browsing action, so it earns its own button first in the header bar rather than a row buried at the foot of a popover the user must open to reach.
- **Search is a local filter, not the in-book search.** The sidebar's `SearchBar` is full-text in-book search — Rive canvas, history, filters, worker-backed. Reusing it here would be wrong in both behavior and weight. The popover gets a small client-side title/author filter over its own list.
- **Single read replaces; it does not append.** Choosing "read on its own" closes the currently open book(s) after saving progress and opens the tapped one, reusing the existing `openBookInReader` path. Appending unpaired panes is not offered — that state has no affordance to explain itself.
- **Already-open books are focused, never prompted.** Tapping a book that is already loaded closes the popover and makes that pane active. A parallel-or-alone choice for a book that is already open resolves to the same place either way, so asking is noise.
- **The popover replaces the menu's book picker, not the whole parallel feature.** `Parallel Read ▸ [library books]` is deleted from `BookMenu`. `Enter Parallel Read` / `Exit Parallel Read` stay: they pair and un-pair books that are already open, which the popover has no way to express.
- **Fixed-layout books are listed, not hidden.** The old submenu filtered out PDF and CBZ because parallel view can't handle them. A library browser must show the whole library, so the filter moves to the prompt: the parallel option is disabled, with a reason, when either book is fixed-layout.
- **The title bar becomes a shared component.** `TocPopover` and `ThemeFontsPanel` already duplicate the same centered `popover-title` heading and divider. Extracting it is the smallest change that lets the Library popover carry a trailing action without a third copy.

---

## Requirements

**Popover shell**

- R1. The reader toolbar's Library button toggles an anchored Library popover instead of navigating to the library page. It reuses `ToolbarPopover` (pointer, outside-click dismiss, edge padding) and pins the header bar open while shown, as the Theme & Fonts popover does.
- R2. The popover is a fixed-height flex column: pinned title bar above a scrolling body. Scrolling happens on the body, not the popover, so the title bar stays put.
- R3. The scroll container hides its scrollbar (`no-scrollbar`) and contains overscroll.
- R4. Popover width is responsive — capped at 720px and shrinking to fit narrow viewports with the standard edge padding. The book grid renders three columns when the popover is at or near its 720px cap and reflows to two below 520px of popover width.
- R5. Icons follow the established rule: full-color assets on Neue Paper light, `muted` variants everywhere else, resolved through `getToolbarIconSrc`.
- R6. The popover stays legible under e-ink mode (`data-eink`), following existing `eink-bordered` conventions.

**Title bar**

- R7. A reusable popover title bar renders a centered `popover-title` heading with an optional trailing action slot, positioned so the heading stays optically centered regardless of the action's width, and an optional divider beneath.
- R8. `TocPopover` and `ThemeFontsPanel` are refactored onto the shared title bar with their dividers enabled; their existing sticky wrappers and padding are unchanged.
- R9. The Library popover shows the title "Library" with the search field in the trailing slot and no divider beneath.

**Search**

- R10. The search field is borderless: magnifier glyph plus a "Search" placeholder, right-aligned, no box or fill.
- R11. Typing filters the popover's book list on title and author, case- and diacritic-insensitive, debounced. Filtering is client-side over the already-loaded library; no network or worker involvement.
- R12. Filtering applies to both segments. A segment with no matches hides itself, its heading, and its divider. When nothing matches at all, the body shows a single centered muted line reading "No books match".
- R13. Interaction inside the search field never dismisses the popover. `Escape` clears a non-empty query; on an already-empty query it closes the popover.

**Book list**

- R14. Books come from the library store's visible library, excluding deleted books and books that aren't downloaded (they can't be opened from here).
- R15. Segment one is headed "Currently reading" and holds books with `readingStatus === 'reading'`. Segment two holds the rest, separated by an inset divider and carrying no heading, per the design.
- R16. Each segment sorts by `updatedAt`, most recent first.
- R17. Each item shows cover, title, and author. Segment-one items also show the reading percentage, computed the same way the library's `ReadingProgress` computes it.
- R18. Books currently open in the reader carry an "Open" text marker in place of the reading percentage, so the item's height is unchanged.
- R19. Covers load lazily.

**Opening a book**

- R20. Tapping a book already open in the reader closes the popover and makes that book the active/sidebar book. No prompt.
- R21. Tapping any other book raises a prompt showing that book's cover and title, offering "read in parallel" and "read on its own", plus dismissal.
- R22. "Read in parallel" opens the book paired with the currently open one, via the existing parallel-view path.
- R23. "Read on its own" opens the tapped book and closes the currently open book(s), saving their progress first.
- R24. The parallel option is disabled when the tapped book or the open book is a fixed-layout format (PDF, CBZ), with a single muted line beneath the actions reading "Parallel read isn't available for PDF or CBZ books."
- R25. The prompt survives the popover closing — it is owned by a component that stays mounted, not by the dismissable popover surface.

**Go home**

- R26. A Go home button is added to the header bar as the first item of the left tool group, ahead of Contents, using the `go_home` illustration through `getToolbarIconSrc` at the same button size and spacing as its neighbours. It has no popover.
- R27. Go home also ships on phones, as the first item of the header's mobile tool group (the `sm:hidden` cluster that holds the bookmark and translation togglers). It is the one affordance from this milestone that is not desktop-only: without it, turning the Library button into a popover trigger would leave phones with no labelled way out of the reader.
- R28. Go home performs today's library navigation exactly — the same `onGoToLibrary` handler the Library button invoked before this change, including its Tauri multi-window path, on both breakpoints.
- R29. The Library popover has no footer; Go home appears nowhere inside it.

**Menu cleanup**

- R30. The `Parallel Read ▸ [library books]` submenu is removed from the View Options menu, along with imports it alone required.
- R31. `Enter Parallel Read` and `Exit Parallel Read` remain unchanged.

**Scale**

- R32. The popover stays responsive on a large library. Virtualization is not built up front: the plain grid ships first, and the book list is virtualized only if scrolling or filtering measurably janks, using the `react-virtuoso` dependency the TOC view already relies on.

---

## Architecture

**New**

| File | Responsibility |
|---|---|
| `src/components/PopoverTitleBar.tsx` | Centered title, optional trailing slot, optional divider. Shared by all three popovers. |
| `src/app/reader/components/library/LibraryPopover.tsx` | Always-mounted shell: gates `ToolbarPopover`, owns search query and pending-book state, renders the prompt. |
| `src/app/reader/components/library/LibrarySearchInput.tsx` | Borderless filter input. |
| `src/app/reader/components/library/LibraryBookItem.tsx` | Cover + title + author + optional percentage + open marker. |
| `src/app/reader/components/library/ParallelReadPrompt.tsx` | Two-choice modal over `ModalPortal`. |
| `src/app/reader/components/library/selectors.ts` | Pure segmentation, filtering, and sorting over `Book[]`. |
| `public/images/toolbar/go-home.svg`, `go-home-muted.svg` | Copied from `dump/assets/`, renamed to the toolbar convention. |

**Modified**

- `HeaderBar.tsx` — Library button becomes a popover toggle with an anchor ref and renders `LibraryPopover`; a new Go home button is prepended to the left tool group and takes over the `onGoToLibrary` handler.
- `TocPopover.tsx`, `themefonts/ThemeFontsPanel.tsx` — adopt `PopoverTitleBar`.
- `sidebar/BookMenu.tsx` — book-picker submenu deleted.

**Data flow.** `LibraryPopover` reads the library from `useLibraryStore` and open books from `useReaderStore`/`useSidebarStore`, runs them through `selectors.ts` together with the search query, and renders two segments. Selection routes through one handler: already-open → `setSideBarBookKey` and close; otherwise → set pending book, which renders the prompt. The prompt's two branches call `useBooksManager`'s existing `openParallelView` and the `open-book-in-reader` replace path respectively. `LibraryPopover` itself never unmounts while the reader is open, so the prompt outlives the popover's dismissal without an event round-trip.

**Error handling.** A book whose cover fails to load falls back to the same hidden-image behavior the old menu used. A book that disappears from the library between popover render and prompt confirmation resolves to a no-op with the popover closed. Neither path throws.

---

## Testing

- Unit tests for `selectors.ts`: segmentation by `readingStatus`, exclusion of deleted and not-downloaded books, `updatedAt` ordering, and title/author filtering including case and diacritic folding.
- Component tests for `LibraryPopover` selection routing: already-open focuses without a prompt; any other book prompts; the parallel option is disabled for fixed-layout pairings.
- Component test for search behavior: filtering hides an emptied segment's heading, `Escape` clears before it closes, and typing does not dismiss the popover.
- Component test for `PopoverTitleBar`: the trailing slot renders without shifting the centered title.

---

## Out of Scope

- Phone presentation of the popover itself. This milestone ships the large-screen popover only. The one exception is Go home (R27), which ships on phones too — otherwise retargeting the Library button would leave the mobile reader with no labelled exit. The rest of the mobile strip is untouched, and search, segments and the prompt remain desktop-only for now.
- Grouping, tags, sorting controls, or any other library-management affordance inside the popover.
- Pairing two books that are already open — that stays with `Enter Parallel Read`.
- Locale JSON updates. New strings ship as English through `_()`; the placeholder extraction across the 34 locale files is the separate i18n chore already being batched.
