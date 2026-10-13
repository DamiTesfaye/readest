# Rive eye-tracking: session 4 resumption prompt

Paste this whole file as the opening message of the new session.

---

## What this is

Resuming a Rive remix. Read this first, before doing anything else:

`apps/readest-app/docs/plans/rive-eye-tracking-handoff.md` — the live spec.
Section 0 is a status table, section 9 is the checklist this session works
through. It is accurate and was written from screenshots and from the
rive-runtime source, not from memory. `rive-eye-tracking-remix-prompt.md` is the
original brief, background only.

The Rive file is at <https://editor.rive.app/file/interactive-ui-doggo/2490248>.
It is consumed by `apps/readest-app/src/app/reader/components/sidebar/SearchBarRive.tsx`.

## Where session 3 stopped

**The editor-side rig is complete.** Sections 6.1 through 6.4 are built and were
verified field by field from screenshots:

- Second Translation constraint on `[eyesClosed]` → `lookController` @ 25%,
  alongside the original `faceController` @ 25%, in that order
- Inputs `lookX` (Number, 0) and `isTyping` (Boolean)
- Timelines `lookLeft` / `lookCentre` / `lookRight`, keying `lookController`
  Position X only at frame 0, at `-13` / `-1` / `11`, so `D = 12`
- Layer `look` above `base`, with `lookRest` (Single → `lookCentre`) and
  `lookBlend` (1D on `lookX`, thresholds `lookRight` 1, `lookCentre` 0,
  `lookLeft` -1), and three transitions: `Entry → lookRest`, `lookRest →
  lookBlend` on `isTyping` true at 100 ms, `lookBlend → lookRest` on `isTyping`
  false at 250 ms, neither with exit time

**None of it has been proven.** Nothing has been scrubbed, nothing exported.

Also resolved in session 3: `idle` is a timeline, not only a state, and it
keyframes `faceController` as well as `Group`, the paws and `mouth`. It does
**not** keyframe the eyes, so the `L = P₁` neutrality holds. Open questions 4 and
7 are closed; 3 and 5 remain and nothing depends on them.

## The job this session

Two tracks. The first is free, the second is gated.

### Track 1 — prove the rig, in the editor (no subscription needed)

Section 9 steps 1 and 2. This is the first actual evidence the rig moves
anything:

1. Scrub `lookX` from -1 to +1 with `isTyping` true. The pupils should sweep
   left to right.
2. Set `isTyping` false. They should return to centre.
3. Trigger `yay` while typing. The two should compose, not fight.
4. If the sweep reads wrong, tune `D` (handoff 6.3) at **real display size**,
   not zoomed in. The artboard is 800 x 235 and the head is a small part of it.
   A subtle glance is right; pupils leaving the eye whites means reduce it.

### Track 2 — the app-side work, which is NOT blocked by the paywall

Sections 7 and 8. The caret-to-`lookX` mapping is pure logic and unit-testable
today, with no Rive file involved. Per the project's test-first rule, write the
failing test first. The mirror-element approach, the `scrollLeft` subtraction,
the clamp, the `selectionchange` listener and the RTL inversion are all specified
in section 7 with code.

**One trap.** Section 8 says to pass `artboard: 'searchbar'`. Do **not** ship
that against the current `public/rive/searchbar.riv`. That file is byte-identical
to a pre-remix snapshot (section 10) and almost certainly has no `searchbar`
artboard, so passing it would break the search bar that works today. Land the
caret measurement and its tests; gate or defer the Rive wiring until the new
export is in the repo.

## Read this before you plan anything

Session 2 spent $40, session 3 spent $63. Both overran for the same reason in
two different disguises.

**Every read through browser automation worked. Writes fail silently** — numeric
fields drop leading minus signs, percentage fields ignore typed values. That was
session 2's lesson and it held.

**Session 3's addition: searching by screenshot is as expensive as writing.**
Hunting for a UI affordance by clicking around cost more than building sections
6.1 to 6.3 combined. The operator found it instantly when finally asked. So:

**The operator drives the editor. You compute, verify, and read values from
screenshots. When you do not know where a control is, ask — do not go looking.**

Verification is the part that earns its cost. Session 3's field-by-field checks
caught a constraint that had been retargeted rather than added, which would have
silently broken `yay`'s grip on the closed eyes.

The full gotcha list is section 13 of the handoff. Read it rather than
rediscovering it.

## Cost discipline

**Flag at $10 and say what the money is buying.** Both prior sessions flagged too
late to change anything. If spend is going to clicking rather than thinking, say
so and switch to asking the operator.

Do not keep a second live editor tab open to watch the operator's changes.
Session 3 did, and the partial sync between tabs produced an ambiguous read that
cost several reloads to resolve. Ask the operator for a screenshot instead.

## Hard rules, carried forward

1. Do not state anything about the file you have not seen in a screenshot.
   Prefix inferences with `INFERRED:` and say what would confirm them.
2. The editor is a Flutter web app. The DOM and accessibility tree are empty,
   including the side panels. Never conclude something is absent because it is
   not in the DOM. Verify visually.
3. Additive work on `searchbar` needs no permission: new animations, new inputs,
   new layers and states, new target nodes, new constraints.
4. Ask before any of: editing or deleting an existing animation, keyframe,
   state, transition, or input; renaming anything that already exists; touching
   the gesture layer or the hover to `yay` transition; anything on the original
   `pup claude work` artboard.
5. **Never batch mutating actions.** Batch reads freely; serialise writes and
   verify each one.
6. If a click does not land where predicted, STOP. Do not take corrective
   clicks. The one exception is Escape to dismiss an accidental rename or value
   field, which must happen before any other keystroke.

## Constraints on the work

- **Export is paywalled**, as are Revision History and Create revision. There is
  no rollback. The untouched `pup claude work` artboard is the only safety net.
- Do not propose extracting the file from network requests or browser storage.
- Editor preview is not proof of runtime behaviour. Artboard resolution is the
  single most likely runtime failure and only the running app can prove it.

## When a Rive behaviour question comes up

Read the runtime source before experimenting in the editor. `rive-runtime` is
public and definitive, and a WebFetch costs cents where an editor experiment
costs dollars and proves less. Useful paths:
`src/constraints/translation_constraint.cpp`, `src/transform_component.cpp`.

## Housekeeping

`apps/readest-app/docs/plans/` is **untracked** in git. Three sessions of
analysis live there uncommitted. Decide early whether it should be committed.

## Finish with

An updated `rive-eye-tracking-handoff.md`:

- Record what the scrub actually showed, in section 9. This is the first
  behavioural evidence in the whole project; describe what moved, not just
  pass or fail.
- Record the final tuned `D` if it changed from 12.
- Note any app-side work landed, and whether its tests pass.
- Add new editor gotchas to section 13.
