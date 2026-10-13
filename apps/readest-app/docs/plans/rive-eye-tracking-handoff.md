# Rive caret-tracking eyes: handoff spec

Companion to `rive-eye-tracking-remix-prompt.md`. Updated after a second editor
session (build session). Export is still paywalled, so nothing has shipped. This
records what the cloud file actually contains, what was built, and the exact
recipe for the remaining work.

Editor version: Rive BETA 0.8.5390 (Flutter web app).

## 0. Status at a glance

| Piece | State |
| --- | --- |
| `searchbar` artboard | Built (session 1) |
| Constraint composition semantics | **Resolved** from runtime source (session 2) |
| `[lookController]` target node | **Built** at (-0.9975, -48.8775) |
| 2nd Translation constraint on `[eyesOpen]` | **Built**, 25% → `lookController` |
| 2nd Translation constraint on `[eyesClosed]` | **Built** (session 3), 25% → `lookController` |
| Inputs `lookX`, `isTyping` | **Built** (session 3) |
| Timelines `lookLeft` / `lookCentre` / `lookRight` | **Built** (session 3), `D = 12` |
| `look` state machine layer | **Built** (session 3), verified field by field |
| **Editor-side rig** | **Complete.** |
| Editor scrub proof | **Passed** (session 3). Pupils sweep and return to centre. Section 9 |
| Caret → `lookX` mapping | **Built and tested** (session 4). 16 unit tests, all green |
| App wiring | **Landed, inert** (session 4). Everything except `artboard`, which waits on the export |

Sessions 1 and 2 edited nothing pre-existing. Session 3 has one exception, made
and reverted: `[eyesClosed]`'s original Translation constraint was retargeted
from `faceController` to `lookController` for a few minutes, when the intent was
to *add* a second constraint alongside it. It was set back to `faceController` at
25% and re-verified field by field against its recorded values. Net change to
pre-existing content across all three sessions: none.

## 1. State of the cloud file

### Artboards

| Artboard | Notes |
| --- | --- |
| `pup claude work` | The source artwork. Untouched, serves as the rollback point. |
| `searchbar` | Duplicate of the above. All remix work lives here. 800 x 235. |
| `pup demo 2` | Unrelated demo, grey background. |
| `pup demo 3` | Unrelated demo, grey background. |

Both artboards contain a state machine named `State Machine 1`. This collision
was left alone deliberately, because renaming it would break
`SearchBarRive.tsx`. It is neutralised by passing the artboard explicitly.

### Default artboard resolution

`SearchBarRive.tsx` passes no `artboard` option, so the runtime loads the file
default. The purple `Active` tag on the stage is **not** the default marker; it
tracks the artboard active in the editor and moves on its own.

**Do not rely on default resolution.** Pass the artboard explicitly. One line,
immune to whatever the badge means, and it removes the `State Machine 1`
collision as a risk:

```ts
const ARTBOARD = 'searchbar';
```

Without it, a wrong default renders the un-remixed original with no error, no
warning, and no visual clue beyond eyes that never move.

### Animations

| Timeline | Type | Keyframes |
| --- | --- | --- |
| `blink` | loop | `eyesClosed` Opacity, `eyesOpen` Opacity. Nothing else. |
| `blinkReset` | loop | Never opened. Still unverified. |
| `yayEntry` | one-shot | `pawRight`, `pawLeft`, `Group`, `faceController` Position X/Y, `mouth`, `eyesClosed`, `eyesOpen` |
| `yayLoop` | loop | Same object set as `yayEntry`, including `faceController` Position X/Y |
| `idle` | loop | ~15s. `pawRight`, `pawLeft`, `Group`, `faceController`, `mouth`. **No eye rows.** |
| `lookLeft` | one-shot | NEW, session 3. `lookController` Position X only |
| `lookCentre` | one-shot | NEW, session 3. `lookController` Position X only |
| `lookRight` | one-shot | NEW, session 3. `lookController` Position X only |

**Correction to session 2.** That session recorded "there is no `idle` timeline;
`idle` exists only as a state in the graph". Wrong. The Animations panel lists
`idle` as a loop timeline, alongside `blinkReset`, `blink`, `yayLoop` and
`yayEntry`. It is both a timeline and a state.

It was opened later in session 3, and the risk it posed is closed. `idle`
keyframes `pawRight`, `pawLeft`, `Group`, `faceController` and `mouth`, over
roughly 15 seconds. **It does not keyframe `[eyesOpen]` or `[eyesClosed]`**, so
`A` is stable and the neutrality identity `L = P₁` holds while `idle` plays.

Two things it does change about the picture in section 2.1:

- **`faceController` is keyframed by `idle`, not only by the `yay` pair.** The
  25% → 18.75% damping therefore also applies to the idle head sway, not just to
  `yay`. Same accepted cost, one more place it shows. At rest the two targets
  coincide exactly, so nothing shifts; the effect is purely that the eyes drift
  slightly less far with the face.
- **`Group` is keyframed too.** Harmless: `lookController` and both eye groups
  are its children, so a parent transform carries them together and the
  world-space relationship between them survives.

### State machine

`State Machine 1`, two layers, listed `base` then `blink`.

`base` graph: `Entry -> idle`, `idle <-> yayEntry` (bidirectional),
`yayEntry -> yayLoop`, plus `Any State` and `Exit`. Transition conditions were
never read.

Inputs: exactly one, `searchHover`, Boolean.

### The face rig

```
[root]
└─ Group                     the face
   ├─ [lookController]       NEW target node, added session 2
   ├─ [faceController]       target node, not a drawable
   ├─ [mouth]                Translation constraint
   ├─ [eyesClosed]           Translation constraint
   ├─ [eyesOpen]             Translation constraint -> faceController @ 25%
   │  │                      Translation constraint -> lookController @ 25%  (NEW)
   │  ├─ Ellipse             eye
   │  └─ Ellipse             eye
   └─ [bodyBase]             no constraints
```

Positions read in session 2, all local to `Group`:

| Object | Position X | Position Y |
| --- | --- | --- |
| `[faceController]` | -1.8 | -55.11 |
| `[eyesOpen]` (authored) | -0.73 | -46.8 |
| `[lookController]` | -0.9975 | -48.8775 |

`[eyesOpen]`'s original constraint, read in full and re-confirmed in session 2:
target `faceController`, strength **25%**, Source/Dest/MinMax space all
**World**, offset **off**, `Copy X` enabled at factor 1, `Copy Y` enabled at
factor 1, no min or max clamps.

`[mouth]` and `[eyesClosed]` each carry a Translation constraint. Their targets
and strengths were **not** opened in either session. `[bodyBase]` has an empty
Constraints section, so the body does not follow.

## 2. How constraints compose — RESOLVED

This was open question #1 and the whole design depended on it. It is now settled
from the open-source runtime, which is stronger evidence than an editor
experiment.

`TransformComponent::updateConstraints()` in `rive-runtime`:

```cpp
void TransformComponent::updateConstraints()
{
    for (auto* constraint : m_Constraints) { constraint->constrain(this); }
}
```

Constraints are applied **sequentially, in list order**, each mutating the world
transform in place. `TranslationConstraint::constrain` reads `translationA`
fresh from the current world transform at the top of every call and ends with:

```cpp
float t = strength(); float ti = 1.0f - t;
transformA[4] = translationA.x * ti + translationB.x * t;
transformA[5] = translationA.y * ti + translationB.y * t;
```

**Conclusion: they stack. The second does not override the first.** But
composition is a sequential lerp, not an additive sum, and that has two
consequences the original design missed.

### 2.1 The second constraint damps the first

With `A` = the eyes' authored position, `F` = `faceController`, `L` =
`lookController`, both strengths 25%:

```
after C1:  P₁ = A + 0.25·(F − A)
after C2:  P₂ = P₁ + 0.25·(L − P₁)

∂P₂/∂F = 0.75 × 0.25 = 0.1875
∂P₂/∂L = 0.25
```

So `yay`'s pull on the eyes drops from **25% to 18.75%**. This is a real change
to how an un-edited animation looks, produced purely by additive work.

**Decision: accepted.** 6.25 points on an already-subtle follow. If it reads as
too weak once testable, the fix is to raise the *first* constraint's strength
from 25% to 33.3% (`0.25 / 0.75`), which restores the original 25% effective
follow. That edits an existing constraint, so it needs explicit approval.

### 2.2 The target's rest position matters — it is not a delta-driver

With `offset` off, the constraint pulls the object toward the target's
**absolute** world position, not by the target's displacement. Neutrality at
rest requires `L = P₁`, i.e. the target must sit exactly where the eyes already
*render* — which is not where they are authored.

```
P₁ₓ = -0.73  + 0.25·(-1.8   − -0.73) = -0.9975
P₁ᵧ = -46.8  + 0.25·(-55.11 − -46.8) = -48.8775
```

Dropping `lookController` at `faceController`'s position instead — the obvious
reading of the original plan — would have yanked the eyes to
`lerp(A, F, 0.4375)`, about **1.6 units up**, permanently.

Because `L = P₁` exactly, `lerp(P₁, P₁, s) = P₁` for *any* strength, so the
constraint is neutral at rest regardless of what strength is later tuned to.
That was verified visually: attaching the target produced no movement.

## 3. What was built in session 2

1. **`[lookController]`** — created by duplicating `[faceController]` (which
   gives the correct `Target` style, correct parent, and no inherited
   constraints), renamed, and positioned at **(-0.9975, -48.8775)**. Rive
   displays this rounded as `-1` and `-48.88`.
2. **Second Translation constraint on `[eyesOpen]`** — target `lookController`,
   strength **25%**, Source/Dest/MinMax Space **World**, Offset **off**,
   `Copy X` 1, `Copy Y` 1, no clamps. Confirmed by screenshot.

Verification performed: a pixel comparison of the eye region before and after
attaching the target, at identical window size and zoom region, showed no
movement. This confirms `L = P₁` and validates the whole second-target design.

## 4. Input contract

`lookX` as Number 0..100 with 50 as centre is workable but awkward: it forces
the app to encode "centre" as a magic number and the rig to subtract 50. A
signed range is cleaner on both sides, and Rive Number inputs are plain floats.

`isTyping` is worth keeping distinct from `searchHover`. `searchHover` is
already focus-or-has-text; typing is narrower, and conflating them would make
the eyes track whenever the field merely has focus.

| Input | Type | Range | At rest | Meaning |
| --- | --- | --- | --- | --- |
| `lookX` | Number | `-1.0` to `1.0`, `0` centre | `0` | Caret position across the input. `-1` far left, `+1` far right. |
| `isTyping` | Boolean | | `false` | True while the field has focus **and** non-empty text. |
| `searchHover` | Boolean | | `false` | Existing. Unchanged. Do not rename. |

Rive Number inputs carry no declared min/max. The `-1..1` range is a convention
enforced by the app clamping; values beyond it clamp to the end timelines of the
blend state, so overshoot degrades gracefully rather than breaking.

Names are string-matched at runtime. A typo produces silence, not an error:
`stateMachineInputs()` simply never yields the input and the animation never
moves. Copy them verbatim.

## 5. Why layer order turns out not to matter

The original plan called for the new layer to sit **above** `base` so pupil
transforms would win where they overlap. With the second-target design there is
no overlap to win: the new layer animates `lookController` Position X, and
nothing else in the file touches `lookController`. `base` keyframes
`faceController`; `blink` keyframes Opacity.

Place the new layer above `base` anyway for clarity, but **ordering is not
load-bearing** and does not need verifying.

## 6. Remaining build recipe

Everything below is additive and needs no approval. Build it in one pass.

### 6.1 Second constraint on `[eyesClosed]` — BUILT (session 3)

Purpose: stop the eyes snapping to centre for the few frames a blink shows the
closed pair.

**Values read in session 3**, closing the first half of open question #4:

| | `[eyesOpen]` | `[eyesClosed]` |
| --- | --- | --- |
| Position | (-0.73, -46.8) | **(-1.49, -46.8)** |
| Constraint target | `faceController` | **`faceController`** |
| Strength | 25% | **25%** |
| Spaces / Offset / Copy | World ×3, off, X 1, Y 1 | **identical** |

**Branch taken: the first one.** ΔX is 0.76, well inside the ~2-unit bar, ΔY is
0, and the strengths match, so no `lookControllerClosed` node was needed. A
second Translation constraint was added targeting `lookController` at 25%,
World ×3, Offset off, Copy X/Y = 1, ordered *after* the `faceController` one to
match `[eyesOpen]`. Order matters, because composition is sequential.

The residual was checked directly rather than taken from the formula.
`[eyesClosed]`'s own neutral point is

```
P₁ₓ = -1.49 + 0.25·(-1.8   − -1.49)  = -1.5675
P₁ᵧ = -46.8 + 0.25·(-55.11 − -46.8)  = -48.8775
```

Y lands exactly on `lookController`'s -48.8775, so vertical is perfectly
neutral. X sits 0.57 away, so the closed eyes rest 0.1425 units right of where
they render today — matching the predicted `δ = 0.1875 × 0.76`, and visible only
during the two or three frames of a blink.

The original recipe follows, for reference.

**First read two values** that were never opened: `[eyesClosed]`'s Position, and
its existing Translation constraint's target and strength.

- **If** its authored position is within ~2 units of `[eyesOpen]`'s
  `(-0.73, -46.8)` **and** its existing strength is 25% → just add a second
  Translation constraint targeting the same `lookController`, 25%, World/World,
  Copy X/Y = 1. The residual error is small and only visible mid-blink:

  ```
  δ = 0.1875 × (A_open − A_closed)
  ```

  For a 2-unit authoring difference that is 0.375 units. Imperceptible.

- **If** it differs substantially, compute its own neutral point
  `P₁_closed = A_c + s_c·(F − A_c)` and create a second target node
  `lookControllerClosed` there, driven by the same timelines. Uglier, but
  correct.

### 6.2 Inputs — BUILT (session 3)

Verified in the Inputs panel: `isTyping` (Boolean), `lookX` (Number, default
`0`), `searchHover` (Boolean, pre-existing, unchanged).

On `searchbar`'s `State Machine 1`, via the Inputs panel (the pencil-in-box icon
in the graph toolbar, next to the layers icon):

| Name | Type | Default |
| --- | --- | --- |
| `lookX` | Number | `0` |
| `isTyping` | Boolean | `false` |

Exact spelling and casing. These are the strings the app matches.

### 6.3 Timelines

Three new single-keyframe animations on `searchbar`. Each keys **only**
`lookController` Position X, at frame 0. Leave Y alone.

| Timeline | `lookController` Position X | Note |
| --- | --- | --- |
| `lookLeft` | `-0.9975 − D` | character looks toward viewer's left |
| `lookCentre` | `-0.9975` | the rest value, unchanged |
| `lookRight` | `-0.9975 + D` | |

`D` is the lateral travel of the *target*, and the eyes move a quarter of it:

```
eye travel = 0.25 × D
```

**Start with `D = 12`**, giving ±3 units of pupil movement. This is the one
number in the rig that cannot be derived and must be tuned by eye — the artboard
is 800 x 235 and the head is a small part of it, so verify at real display size,
not zoomed in. If it reads as a subtle glance, it is right; if the pupils leave
the eye whites, reduce it.

So with `D = 12`: `lookLeft` X = `-12.9975`, `lookRight` X = `11.0025`.

**BUILT in session 3, with `D = 12`.** The three timelines were entered at the
rounded values Rive displays rather than the exact ones:

| Timeline | Entered | Verified |
| --- | --- | --- |
| `lookLeft` | `-13` | Position X only, one keyframe at frame 0 |
| `lookCentre` | `-1` | Position X only, one keyframe at frame 0 |
| `lookRight` | `11` | Position X only, one keyframe at frame 0 |

No Y was keyframed on any of them, and the five pre-existing animations were
left alone.

Rounding is harmless and was accepted deliberately. The only value where
exactness mattered was `lookCentre`, since it defines where `isTyping: false`
returns the eyes; `-1` against the true rest value of `-0.9975` offsets the
resting pupils by `0.25 × 0.0025` = **0.000625 units**, a thousandth of a unit on
an 800-unit artboard. The left/right travel asymmetry (12.0025 against 11.9975)
is the same order. `D` is still to be tuned by eye.

### 6.4 The `look` layer — BUILT (session 3)

Verified in the editor, every field read from a screenshot:

| Piece | Verified state |
| --- | --- |
| Layer | `look`, ordered above `base` and `blink` |
| `lookRest` | Type `Single`, Timeline `lookCentre`, Speed 1x |
| `lookBlend` | Type `1D`, Input `lookX` |
| `lookBlend` thresholds | `lookRight` 1, `lookCentre` 0, `lookLeft` -1 |
| `Entry` → `lookRest` | connected |
| `lookRest` → `lookBlend` | `if isTyping true`, 100 ms, Exit Time unchecked |
| `lookBlend` → `lookRest` | `if isTyping false`, 250 ms, no exit time |

`Entry`, `Any State` and `Exit` appear on every new layer by default. They were
left alone. `Entry` is load-bearing, since it is what makes `lookRest` the
layer's start state and therefore what returns the eyes to centre; `Any State`
and `Exit` are inert because nothing connects to them.

**The editor-side rig is complete.** Everything from here is section 9, which
starts with scrubbing `lookX` and cannot be finished until export is unlocked.

The original recipe follows, for reference.

Add a new layer to `State Machine 1` on `searchbar`, named `look`, above `base`.

**States:**

| State | Type | Contents |
| --- | --- | --- |
| `lookRest` | normal | plays `lookCentre` |
| `lookBlend` | 1D blend state | input `lookX` |

`lookBlend` thresholds:

| Timeline | Threshold |
| --- | --- |
| `lookLeft` | `-1` |
| `lookCentre` | `0` |
| `lookRight` | `1` |

**Transitions:**

| From | To | Condition | Duration |
| --- | --- | --- | --- |
| `Entry` | `lookRest` | — | — |
| `lookRest` | `lookBlend` | `isTyping` is true | 100 ms |
| `lookBlend` | `lookRest` | `isTyping` is false | 250 ms |

No exit time on either — they are condition-only so they respond immediately.
The asymmetry is deliberate: engage quickly, settle back gently.

This satisfies the requirement that `isTyping: false` **returns**
`lookController` to origin rather than merely ceasing to update it, because
`lookRest` actively plays `lookCentre`.

Note that `lookBlend` at `lookX = 0` also plays `lookCentre`, so a centred caret
while typing is identical to rest. Correct and intended.

### 6.5 Interaction with `yay`

Not addressed, deliberately. `yay` keeps full control of `faceController`;
looking and yay-ing now compose rather than fight, which is the whole point of
the second-target design. Whether `yay` should be suppressed during typing is an
independent decision that can be made once it is testable. It requires editing
the `idle <-> yayEntry` conditions, which needs approval.

## 7. Caret mapping

A text input exposes no caret coordinate. `selectionStart` gives a character
index; converting to pixels requires measuring the rendered text.

**Canvas `measureText`** is cheap and layout-free, but ignores `letter-spacing`
and will not reflect font fallback. Accuracy degrades exactly where the search
bar uses tracking, which this design system does in places.

**Mirror element** — a hidden node duplicating the input's text metrics, holding
`value.slice(0, selectionStart)`. Its measured width is the caret offset.
Honours letter-spacing, font fallback and font-feature settings because the
browser does the same shaping work it did for the real input.

**Use the mirror element.** The extra cost is one offscreen node and a
`getBoundingClientRect` per keystroke, which is nothing next to being visibly
wrong.

```ts
const mirror = document.createElement('span');
const cs = getComputedStyle(input);
for (const prop of [
  'fontFamily', 'fontSize', 'fontWeight', 'fontStyle',
  'letterSpacing', 'textTransform', 'fontVariant', 'fontFeatureSettings',
]) {
  mirror.style[prop] = cs[prop];
}
mirror.style.position = 'absolute';
mirror.style.visibility = 'hidden';
mirror.style.whiteSpace = 'pre';
mirror.setAttribute('aria-hidden', 'true');
```

Per update:

```ts
mirror.textContent = input.value.slice(0, input.selectionStart ?? 0);
const caretPx = mirror.getBoundingClientRect().width - input.scrollLeft;
const usable = input.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
const lookX = clamp((caretPx / Math.max(usable, 1)) * 2 - 1, -1, 1);
```

Details that will bite if skipped:

- **Subtract `scrollLeft`.** Once the text outgrows the field the caret stops
  moving in viewport terms and the text scrolls under it. Without this the eyes
  drift to one side and stay pinned.
- **Clamp.** Overscroll and IME composition push the raw ratio out of range.
- **Listen to `selectionchange`, not just `input`.** Arrow keys, clicks and
  Home/End move the caret without changing the value.
- **Throttle with `requestAnimationFrame`.** Setting a Rive input per keystroke
  is fine; measuring layout per keystroke on a slow device is not.
- **RTL.** The app supports RTL locales. For `direction: rtl` the mapping
  inverts, so negate `lookX` or measure from the right edge.
- **Re-measure on font load.** If the search font arrives via webfont after
  first paint, cached measurements are wrong until something forces an update.

## 8. Wiring in `SearchBarRive.tsx` — LANDED, INERT (session 4)

Built and verified against the *current* `searchbar.riv`, which has none of the
new rig in it. That is the point: the wiring is a no-op today and becomes live
the moment the new export lands, with one line still to add.

| File | State |
| --- | --- |
| `src/utils/caretLook.ts` | New. `computeLookX({textWidth, scrollLeft, contentWidth, rtl})`, pure |
| `src/hooks/useCaretLookX.ts` | New. Mirror element, listeners, rAF throttle, returns `{lookX, isTyping}` |
| `src/__tests__/utils/caretLook.test.ts` | New. 10 tests |
| `src/__tests__/hooks/useCaretLookX.test.tsx` | New. 6 tests |
| `SearchBar.tsx` | Calls `useCaretLookX(inputRef)`, passes both values down |
| `SearchBarRive.tsx` | Resolves `lookX` and `isTyping`, writes them when present |

**Why it is safe against the un-remixed file.** Input resolution goes through
`stateMachineInputs(...).find(...)`, which yields `undefined` for a name the
file does not declare. The refs stay `null` and every write is guarded, so on
today's `searchbar.riv` the two new inputs simply never resolve and nothing is
written. `searchHover` resolves and behaves exactly as before.

**The one line deliberately not written.** `artboard: 'searchbar'` is *not*
passed. Per section 10 the shipped `.riv` is a pre-remix snapshot with no
`searchbar` artboard, so passing it would break the working search bar. Add it
in the same commit that replaces the `.riv`, not before.

Deviations from the recipe above, both deliberate:

- **`scrollLeft` is used as a magnitude**, `textWidth - Math.abs(scrollLeft)`.
  Spec-compliant browsers report `scrollLeft` as negative in `direction: rtl`,
  so a bare subtraction would *add* the scroll offset there. `Math.abs` is a
  no-op in LTR and correct in RTL.
- **RTL inverts the final value** rather than measuring from the right edge, as
  section 7 permits. Cheaper and it keeps one measurement path.

`isTyping` is derived as `document.activeElement === input && value.length > 0`,
matching the section 4 contract: focus alone does not engage the eyes. Note this
is *narrower* than the existing `engaged` prop, which is focus-or-non-empty.

Not covered by tests, because jsdom cannot exercise it: real text shaping. The
mirror's width comes from a stubbed `getBoundingClientRect` at 10px per
character. The mapping arithmetic is proven; the measurement fidelity is not,
and only the running app can show it.

The original notes follow, for reference.

Current state: instantiates `State Machine 1`, resolves one input `searchHover`
from the `engaged` prop, passes no artboard.

```ts
const ARTBOARD = 'searchbar';
const STATE_MACHINE = 'State Machine 1';
const HOVER_INPUT = 'searchHover';
const LOOK_X_INPUT = 'lookX';
const IS_TYPING_INPUT = 'isTyping';
```

Pass `artboard: ARTBOARD` into the `new Rive({ ... })` options. Resolve the two
new inputs in `onLoad` alongside `searchHover`, using the same
`stateMachineInputs(...).find(...)` pattern, and hold them in refs.

The component currently takes a single `engaged` boolean and needs the caret
signal too. Keep the measurement in the parent that owns the `<input>`, since
`SearchBarRive` has no access to the field and should not acquire one; pass down
a normalised number plus a typing flag.

Guard every write. The refs are null until `onLoad` fires and null again after
`cleanup()`, and a stale write after unmount throws inside the wasm runtime.

## 9. Post-subscription checklist

**Step 2 was performed in session 3 and passed.** With the state machine playing
and `isTyping` true, scrubbing `lookX` from -1 to +1 swept the pupils left to
right, and setting `isTyping` false returned them to centre. This is the first
behavioural evidence in the project. Taken together it confirms:

- the `look` layer reaches `lookController`
- `lookBlend`'s thresholds are the right way round
- `lookRest` actively playing `lookCentre` *returns* the eyes rather than merely
  ceasing to update them, which was an explicit requirement
- the second-target design composes as the runtime source predicted

Still unperformed: triggering `yay` while typing, to confirm the two compose.

**`SearchBarRive.tsx` wiring, confirmed by reading the file.** It declares `lookX`
and `isTyping` props, resolves both inputs in `onLoad` alongside `searchHover`,
holds them in refs, guards every write, and pushes changes through `useEffect`.
It does **not** pass `artboard`, which is correct until the new export lands: the
shipped `.riv` predates the `searchbar` artboard, so adding that line now would
break the working search bar. This matches the section 0 rows recorded for
session 4.

**Tuning `D` must account for `Fit.Fill`.** The component uses
`new Layout({ fit: Fit.Fill, ... })`, which scales the artboard non-uniformly to
the canvas box. Only horizontal scale affects the sweep:

```
on-screen pupil travel (px) = 0.25 × D × (canvasWidth / 800)
```

At `D = 12` and a 300px-wide canvas that is about **1.1 px**, which probably
reads as nothing. The competing limit is the eye whites, fixed in artboard
units, so there may be a real ceiling on how legible this effect can be at the
search bar's rendered size. Measure the canvas width before tuning, and settle
this before anyone pays to unlock export.

1. Build the remaining rig per section 6. Do this **before** exporting.
2. In the editor, scrub `lookX` from -1 to 1 with `isTyping` true and confirm
   the pupils sweep left to right. Set `isTyping` false and confirm they return
   to centre. Trigger `yay` while typing and confirm the two compose.
3. Subscribe, then **File > Export > For runtime**.
4. Replace `apps/readest-app/public/rive/searchbar.riv` with the export.
5. **Confirm the new byte size differs from 3,755,749.** See section 10. If it
   matches, the wrong file was copied.
6. Wire per section 8. **Only `artboard: 'searchbar'` is left** — the rest
   landed in session 4 and is inert until the export arrives. Add that option in
   the same commit that replaces the `.riv`.
7. Verify in the running app, not the editor preview: type in the search field
   and confirm the eyes track, then blur and confirm they return to centre.
   Editor preview proves nothing about runtime artboard resolution, which is the
   single most likely failure.
8. Tune `D` (section 6.3) at real display size if the movement reads wrong.

## 10. Unrelated bug found along the way

`apps/readest-app/public/rive/searchbar.riv` is **byte-identical** to
`dump/assets/rive/searchbar_interactive_placeholder.riv`:

```
3,755,749 bytes   d0ad1c60fa4c9f0ee5c2c4fc048ffc4b   public/rive/searchbar.riv
3,755,749 bytes   d0ad1c60fa4c9f0ee5c2c4fc048ffc4b   dump/assets/rive/searchbar_interactive_placeholder.riv
```

The `dump/` copy is the snapshot taken *before* the large embedded image was
removed from the cloud file. Identical hashes mean that removal never reached
the repo, so the app ships roughly 3.7 MB of Rive with the image still embedded.
Worth fixing regardless of this feature, and step 4 above fixes it incidentally.

## 11. Open questions

| # | Question | Status |
| --- | --- | --- |
| 1 | Do two Translation constraints compose additively? | **Resolved.** Section 2. They stack sequentially; not additive; the second damps the first. |
| 2 | Is the `Default` badge file-level or per-artboard? | **Moot.** Pass the artboard explicitly. |
| 3 | Conditions on the `idle <-> yayEntry` transitions? | Open. Needed only to suppress `yay` while typing. |
| 4 | What do `[mouth]` and `[eyesClosed]` constraints target, at what strength? | **Half resolved.** `[eyesClosed]`: `faceController` at 25%, World ×3, offset off, Copy X/Y = 1 — identical to `[eyesOpen]`'s. `[mouth]` still unread, and nothing depends on it. |
| 5 | What does `blinkReset` keyframe? | Open. Never opened. |
| 7 | What does the `idle` timeline keyframe? | **Resolved.** `pawRight`, `pawLeft`, `Group`, `faceController`, `mouth`. No eye rows, so `L = P₁` holds during idle. It does mean the 18.75% damping applies to the idle sway as well as to `yay`. See section 1. |
| 6 | Is there a fourth artboard off-screen? | Resolved: four artboards, listed in section 1. |

## 12. Safety notes

The file has **no rollback**. On the free tier, `Revision History` and
`Create revision...` are both Upgrade-gated, as are `Export > For runtime` and
`Export > For backup`. The only in-file safety net is the untouched
`pup claude work` artboard. The only out-of-file one is the stale
`dump/assets/rive/searchbar_interactive_placeholder.riv`.

## 13. Editor gotchas

Session 1 notes, corrected and extended by session 2. These cost real time and
real money.

- **Writes through browser automation are unreliable; reads are not.** Every
  read (positions, constraint parameters, hierarchy) worked first time. Four of
  five *writes* failed silently. Drive the editor by hand and use automation to
  inspect and verify.
- **Numeric fields silently drop a leading minus sign.** Typing `-0.9975` into
  Position X yields `0.9975`. Inserting the `-` afterwards at position 0 also
  fails. Negative values must be typed by a human.
- **Percentage fields reject typed values** the same way. `Strength` stayed at
  100% across a triple-click-select-and-type.
- **The whole UI dims and silently ignores clicks when Chrome is not
  frontmost.** Clicks still dispatch and the cursor moves in screenshots, so it
  looks like a broken selector rather than a focus problem. If the page renders
  greyed, focus the window rather than retrying.
- **Screenshot dimensions vary between captures** (1190x726, 1325x726, 1411x726,
  1482x812, 1524x784 all seen), and the window can resize *between* an action
  and its screenshot. Always take coordinates from the most recent capture, and
  never pixel-compare across a resize.
- **Clicking a name can open a rename field** with the text pre-selected. It
  happened once on `[eyesOpen]` when two hierarchy clicks were batched close
  together, and once on the `Translation` constraint in session 1. Escape
  immediately, before any keystroke. Clicking blank row space to the right of
  the name selects without this risk.
- **Rename could not be triggered on demand.** Single click, second click and
  double click on a hierarchy label were all no-ops when *wanted*. Session 1's
  note that "double-clicking a hierarchy row does not rename" is unreliable in
  both directions. Rename by hand.
- **Do not batch mutating actions.** Batching eight steps to save round trips
  produced a mangled two-field edit that took three round trips to diagnose.
  Batch reads freely; serialise writes and screenshot each one.
- **A Rive "target" is just a group with `Style: Target`.** Duplicating an
  existing target is the safest way to create a new one — correct style, correct
  parent, no inherited constraints.
- **`Zoom to fit` fits the selection, not all artboards.**
- **The Inputs panel** is the pencil-in-box icon in the state machine graph
  toolbar, next to the layers icon.
- Panels clip silently. Use the Hierarchy `Maximize` button before clicking deep
  tree rows.

Added in session 3:

- **Reads through automation stayed 100% reliable, and stayed cheap.** Every
  position, constraint field, input and keyframe in this session was read first
  time. The split in the session-2 note holds exactly: read by automation, write
  by hand.
- **"Add a second constraint" is easy to perform as "retarget the first one."**
  The `+` that adds a constraint is on the `Constraints` *header* row, far
  right. Working inside an already-open constraint popover changes that
  constraint. After adding, confirm the list shows *two* `Translation` rows;
  `[eyesOpen]` is the reference for what correct looks like.
- **The timeline tab bar reflows when the active tab changes.** The active tab
  renders wider, so every tab to its right shifts. Coordinates taken from a
  screenshot before a tab switch are stale immediately after one. This cost a
  misclick that landed in a keyframe value field.
- **Clicking a value in the timeline's property row opens it for editing**, the
  same trap as the hierarchy rename field. Escape dismisses it cleanly and
  leaves the keyframe untouched — verified by re-reading the value afterwards.
- **Hierarchy rows grow hover controls on the right.** Lock, solo and visibility
  toggles appear over the blank space to the right of the name, which session 1
  recommended as the safe place to click. It is not, any more. Click the object
  glyph immediately left of the name instead; it selects, and at worst expands
  the row.
- **In Animate mode the left panel swaps between Hierarchy and Animations** via
  the bottom-left icon strip. Hierarchy is `⌘1` and the first icon; Animations is
  the fourth.
- **A blend state is not a separate object.** It is the `Type` segmented control
  on an ordinary state: `Single | 1D | Additive`. Do not go looking for an "add
  blend state" menu item; add a normal state and switch its Type to `1D`.
- **A state's animation is called `Timeline`** in the state inspector, not
  "Animation". Select a state and the right panel shows `Name`, `Caption`,
  `Type`, `Timeline`, `Speed`, and an `Events` section.
- **Right-clicking the state machine graph canvas does nothing.** No context
  menu appears. The `+` in the graph toolbar also produced no menu and no
  visible state. Session 3 never established the intended affordance by
  inspection; the operator found it directly and unblocked it. Hunting for UI
  affordances by clicking cost more than sections 6.1 to 6.3 combined, so treat
  "how do I add X" as a question for the operator, not an exploration.
- **A screenshot can capture the frame before a click repaints.** One zoom
  showed the pre-click tab still active; the click had in fact registered. Do
  not conclude a click failed from a single stale capture — re-read before
  reacting, and never take a corrective click on that evidence alone.
