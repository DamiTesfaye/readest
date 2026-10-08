# Rive remix: caret-tracking eyes for the search character

Paste this whole file as the opening message of the new session.

---

## Context

I have a Rive file open in Chrome at
<https://editor.rive.app/file/interactive-ui-doggo/2490248> — a search character
that cycles gestures deterministically, with a hover state that switches to a
`yay` gesture. I want to add eye-tracking that follows the caret as I type in a
search input.

This animation is consumed by a Next.js reader app:

- Component: `apps/readest-app/src/app/reader/components/sidebar/SearchBarRive.tsx`
- Asset: `apps/readest-app/public/rive/searchbar.riv`
- Runtime: `@rive-app/canvas`, lazily imported; wasm vendored at `/rive/rive.wasm`
- Today it instantiates state machine `State Machine 1` and sets one boolean
  input, `searchHover`, from focus-or-has-text.
- It does **not** name an artboard. It uses the file's default artboard.

You have Chrome access and MAY interact with the editor, within the rules below.

## Constraint: export is paywalled

I am on the free tier and **cannot export a `.riv`** until I subscribe.
Consequences you must accept rather than work around:

- There is no way to test the remix in the app this session. Do not propose
  runtime verification, and do not treat "it works in the editor preview" as
  proof it works in the app.
- All work lands in the cloud file only. The session ends with the rig built and
  a written handoff spec, not with a shipped asset.
- Do not suggest workarounds that involve extracting the file from network
  requests or browser storage. If export is blocked, it stays blocked.

## Step 0 — Safety, before any change

Export-based backup is unavailable, so:

1. **Duplicate the artboard** and do all remix work on the copy. The original
   artboard stays untouched as the in-file rollback point. Tell me the exact
   name of the duplicate.
2. Open the revision/version history panel, screenshot it, and tell me whether
   the free tier gives me named revisions I can roll back to. If it does not,
   say so plainly — that changes how carefully we proceed.
3. Note for context, not action: `dump/assets/rive/searchbar_interactive_placeholder.riv`
   in my repo is an on-disk snapshot of this file from **before** I removed the
   large embedded image. It is stale but recoverable if the cloud file is lost.
4. **Expect the remixed artboard to become the file default.** Because the app
   does not name an artboard, whatever Rive marks as the file default is what
   ships. A remix that lives on a non-default artboard will never reach the app.
   So plan on the remixed artboard ending up as the default, whether that means
   promoting the duplicate, reordering artboards, or creating a fresh artboard
   built to fit these changes and making that the default. This outcome is
   approved in principle — you do not need to argue for it — but tell me which
   route you recommend and show me a before/after of the artboard list before
   you change which one is default.

Do not proceed to Step A until 1 and 2 are visually confirmed.

## Hard rules

1. Do not tell me anything about my file you haven't visually confirmed in a
   screenshot. If you're inferring, prefix with `INFERRED:` and say what you'd
   need to see to confirm.
2. Rive's canvas is GPU-rendered, so the DOM/accessibility tree will be mostly
   empty. Never conclude something is absent because it's not in the DOM.
   Verify visually.
3. If a panel is collapsed or cut off, ask me to open or scroll it. Don't guess.
4. You may do ADDITIVE work without asking each time: create new animations, add
   new inputs, add a new state machine layer and its states — **on the remix
   artboard only** (the duplicate, or a fresh artboard if that is the route we
   agree at the Step A decision gate).
5. Ask me before ANY of: editing or deleting an existing animation, keyframe,
   state, transition, or input; renaming anything that exists; touching the
   gesture layer or the hover → `yay` transition; anything involving artboard
   geometry; anything at all on the original artboard. The one standing
   exception is Step 0 item 4: creating an artboard and changing which artboard
   is the file default is expected work, so show me the before/after and
   proceed, rather than treating it as blocked.
6. Screenshot and stop after each discrete change. Show me what changed and wait
   for my go-ahead. Do not chain edits before checking in.
7. If a click doesn't land where expected, or the UI is not in the state you
   predicted: STOP. Do not attempt corrective clicks. An unexpected canvas state
   means your model of the UI is wrong, and clicking again makes it worse.

## Known facts — RE-CONFIRM, do not trust

Read from the `.riv` in my repo in an earlier session. I have since removed a
large embedded image and may have remixed, so treat all of it as stale until you
see it on screen:

| Thing | Value |
| --- | --- |
| State machine | `State Machine 1` |
| Input | `searchHover` |
| Animations | `idle`, `blink`, `blinkReset`, `yayEntry`, `yayLoop` |
| Named objects | `eyesOpen`, `bodyBase`, `earRight`, `earLeft`, `hairTop` |

Flag any discrepancy immediately rather than adapting silently.

## Step A — Inspect and report. Change nothing.

- **Hierarchy**: are the pupils their own group/bone, or baked into `eyesOpen`
  or a larger face group? Quote exact layer names. This decides whether the rig
  is possible at all — if pupils cannot be transformed independently, say so and
  stop, because fixing it is artboard geometry and needs my approval.
- **Conflicts**: do `blink`, `yayEntry`, or `yayLoop` keyframe the pupils or
  `eyesOpen`? Name which properties. Any overlap will fight the new layer.
- **Animations**: exact names of every animation.
- **State machine**: how many layers, states per layer, layer ORDER, and how
  hover → `yay` is conditioned.
- **Inputs**: every existing input, exact name and type.
- **Artboards**: list every artboard, tell me which one is the file default, and
  explain exactly how the default is determined in this version of the editor
  (naming, ordering, an explicit setting, or something else). I need the
  mechanism, not just the current state, because we will have to change it.
- **File size** after my image removal.

Report CONFIRMED (naming the screenshot that showed it) separately from
INFERRED. List explicitly what you could not determine.

**Decision gate.** Before any building in Step C, we settle how the remixed
artboard becomes the default, using what you found above. Give me the concrete
options with their trade-offs, including whether a fresh purpose-built artboard
is cleaner than promoting the duplicate. Do not defer this to the end: it is
cheap to resolve in the editor now and expensive to discover after I subscribe,
export, and find the app rendering the untouched original.

## Step B — Agree the runtime contract before building

Input names are string-matched by app code. A typo fails silently: the animation
simply never moves, with no error anywhere. Propose exact names and types and
wait for my approval. My starting proposal, critique it:

| Input | Type | Meaning |
| --- | --- | --- |
| `lookX` | Number 0–100, 50 = centre | Caret position across the input |
| `isTyping` | Boolean | True while the field has focus and non-empty text |

State which value each input takes **at rest**, so the character has a defined
neutral pose when the app sets nothing.

## Step C — Rig proposal, then build incrementally under rules 4–7

My starting design, critique it before building:

- A NEW state machine layer, ordered ABOVE the gesture layer so pupil transforms
  win where they overlap. Confirm Rive's mixing order rather than assuming it.
- A 1D blend state driven by `lookX`, blending single-pose timelines
  `lookLeft` / `lookCentre` / `lookRight` that translate only the pupils.
- `isTyping` gates entry: false returns to a pass-through state so the existing
  gesture loop is visually untouched when I'm not typing.
- The hover → `yay` transition is NOT edited. If `yay` and typing can both be
  active at once, tell me what that looks like before building it. I'll decide
  whether to suppress `yay` during typing or retire it later.

Build one piece at a time. Screenshot after each.

## Step D — Handoff, since export is blocked

Finish with a written spec I can act on after subscribing:

1. **Artboard resolution.** Confirm, with a screenshot, that the remixed artboard
   is the file default, per the decision we made after Step A. If for any reason
   it is not, say so loudly: the app would silently render the original
   un-remixed artboard with no error, and the fallback is passing
   `artboard: '<exact name>'` in `SearchBarRive.tsx`. Either way, give me the
   exact artboard name as a string.
2. **Input contract.** Which inputs the app must set, their value ranges, and
   when to set them.
3. **Caret mapping.** Deriving caret x-offset in a text input is the fiddly part:
   a text input exposes no caret coordinate, so it must be measured against the
   rendered font via canvas `measureText` or a mirror element. Describe the
   approach; do not hand-wave it.
4. **Post-subscription checklist.** The exact sequence: export `.riv` → replace
   `apps/readest-app/public/rive/searchbar.riv` → confirm new byte size → wire
   the inputs in `SearchBarRive.tsx`.

## Done when

- The remix lives on a duplicate artboard; the original is untouched.
- The existing gesture loop and hover → `yay` behave exactly as before when I am
  not typing.
- Scrubbing `lookX` manually in the editor moves the pupils left to right, and
  `isTyping` false returns them to neutral.
- No input renamed, no existing animation or transition edited without my
  explicit approval.
- I have the Step D spec written down.
