# UI Animations Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A "UI Animations" switch in Settings → Behavior that turns all decorative UI motion (Rive search bar, CSS transitions/animations) on or off, defaulting to the OS Reduce Motion preference until the user chooses.

**Architecture:** A `uiAnimationsEnabled?: boolean` system setting resolved through `resolveUIAnimationsEnabled()` (undefined falls back to `!prefers-reduced-motion`). When resolved off, `document.documentElement` carries `data-ui-anim="off"` and a global CSS kill rule zeroes transition/animation durations; the Rive component is not mounted at all. Existing `motion-reduce:` Tailwind variants and `@media (prefers-reduced-motion: reduce)` blocks migrate to this single mechanism.

**Tech Stack:** Next.js 16 + React, Zustand stores, Tailwind CSS, vitest + @testing-library/react (jsdom).

**Spec:** `docs/brainstorms/2026-08-09-ui-animations-toggle-requirements.md` (approved).

## Global Constraints

- Working directory for all commands: `apps/readest-app/`.
- No code comments; no `any` (use `unknown`, generics, or casts to concrete types).
- Test-first: write the failing test, watch it fail, implement, watch it pass.
- No entry for `uiAnimationsEnabled` in `DEFAULT_SYSTEM_SETTINGS` (the default is not static).
- The reader's paging animation setting (`viewSettings.animated`, Settings → Behavior → Animation) is untouched.
- i18n: new labels use key-as-content (`_('Interface')`, `_('UI Animations')`); locale JSON updates are out of scope (deferred i18n batch).
- Commit after every task with the exact message given in the task; the pre-commit hook runs lint-staged, let it.
- Full verification before final completion: `pnpm test` and `pnpm lint`.

---

### Task 1: Setting field and resolver utility

**Files:**
- Modify: `src/types/settings.ts` (SystemSettings interface, after `telemetryEnabled: boolean;` around line 258)
- Create: `src/utils/animation.ts`
- Test: `src/__tests__/utils/animation.test.ts`

**Interfaces:**
- Consumes: `SystemSettings` from `@/types/settings`.
- Produces: `prefersReducedMotion(): boolean` and `resolveUIAnimationsEnabled(settings: Pick<SystemSettings, 'uiAnimationsEnabled'>): boolean`, both exported from `@/utils/animation`. Tasks 2, 4, and 5 import `resolveUIAnimationsEnabled`.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/utils/animation.test.ts`:

```typescript
import { afterEach, describe, expect, it, vi } from 'vitest';
import { prefersReducedMotion, resolveUIAnimationsEnabled } from '@/utils/animation';

const stubMatchMedia = (matches: boolean) => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({ matches } as MediaQueryList),
  );
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('prefersReducedMotion', () => {
  it('returns true when the media query matches', () => {
    stubMatchMedia(true);
    expect(prefersReducedMotion()).toBe(true);
  });

  it('returns false when the media query does not match', () => {
    stubMatchMedia(false);
    expect(prefersReducedMotion()).toBe(false);
  });

  it('returns false when matchMedia is unavailable', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(prefersReducedMotion()).toBe(false);
  });
});

describe('resolveUIAnimationsEnabled', () => {
  it('returns true for an explicit true even under OS reduce motion', () => {
    stubMatchMedia(true);
    expect(resolveUIAnimationsEnabled({ uiAnimationsEnabled: true })).toBe(true);
  });

  it('returns false for an explicit false even without OS reduce motion', () => {
    stubMatchMedia(false);
    expect(resolveUIAnimationsEnabled({ uiAnimationsEnabled: false })).toBe(false);
  });

  it('follows the OS preference when unset: reduce motion on means disabled', () => {
    stubMatchMedia(true);
    expect(resolveUIAnimationsEnabled({})).toBe(false);
  });

  it('follows the OS preference when unset: reduce motion off means enabled', () => {
    stubMatchMedia(false);
    expect(resolveUIAnimationsEnabled({})).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/__tests__/utils/animation.test.ts`
Expected: FAIL (cannot resolve `@/utils/animation`).

- [ ] **Step 3: Implement**

Add to `src/types/settings.ts`, directly after the `telemetryEnabled: boolean;` line inside `SystemSettings`:

```typescript
  uiAnimationsEnabled?: boolean;
```

Create `src/utils/animation.ts`:

```typescript
import { SystemSettings } from '@/types/settings';

export const prefersReducedMotion = (): boolean => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};

export const resolveUIAnimationsEnabled = (
  settings: Pick<SystemSettings, 'uiAnimationsEnabled'>,
): boolean => {
  return settings.uiAnimationsEnabled ?? !prefersReducedMotion();
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/__tests__/utils/animation.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/types/settings.ts src/utils/animation.ts src/__tests__/utils/animation.test.ts
git commit -m "feat(settings): uiAnimationsEnabled setting with reduced-motion-aware resolver"
```

---

### Task 2: useUIAnimationsMode hook, CSS kill rules, startup wiring

**Files:**
- Create: `src/hooks/useUIAnimationsMode.ts`
- Modify: `src/styles/globals.css` (append after the `.no-transitions` rule, around line 827)
- Modify: `src/components/Providers.tsx` (startup settings-loaded block, around line 168)
- Test: `src/__tests__/hooks/useUIAnimationsMode.test.ts`

**Interfaces:**
- Consumes: `resolveUIAnimationsEnabled(settings)` from Task 1.
- Produces: `useUIAnimationsMode(): { applyUIAnimationsMode: (enabled: boolean) => void }` exported from `@/hooks/useUIAnimationsMode`. Task 5 calls `applyUIAnimationsMode` when the switch flips. Sets/removes the `data-ui-anim="off"` attribute on `document.documentElement`.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/hooks/useUIAnimationsMode.test.ts`:

```typescript
import { afterEach, describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useUIAnimationsMode } from '@/hooks/useUIAnimationsMode';

afterEach(() => {
  document.documentElement.removeAttribute('data-ui-anim');
});

describe('useUIAnimationsMode', () => {
  it('sets data-ui-anim="off" on the root when disabled', () => {
    const { result } = renderHook(() => useUIAnimationsMode());
    result.current.applyUIAnimationsMode(false);
    expect(document.documentElement.getAttribute('data-ui-anim')).toBe('off');
  });

  it('removes the attribute when enabled', () => {
    const { result } = renderHook(() => useUIAnimationsMode());
    result.current.applyUIAnimationsMode(false);
    result.current.applyUIAnimationsMode(true);
    expect(document.documentElement.hasAttribute('data-ui-anim')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/__tests__/hooks/useUIAnimationsMode.test.ts`
Expected: FAIL (cannot resolve `@/hooks/useUIAnimationsMode`).

- [ ] **Step 3: Implement the hook**

Create `src/hooks/useUIAnimationsMode.ts`:

```typescript
import { useCallback } from 'react';

export const useUIAnimationsMode = () => {
  const applyUIAnimationsMode = useCallback((enabled: boolean) => {
    if (enabled) {
      document.documentElement.removeAttribute('data-ui-anim');
    } else {
      document.documentElement.setAttribute('data-ui-anim', 'off');
    }
  }, []);

  return { applyUIAnimationsMode };
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/__tests__/hooks/useUIAnimationsMode.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Add the kill rules to globals.css**

In `src/styles/globals.css`, directly after the existing block

```css
.no-transitions * {
  transition: none !important;
}
```

append:

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

The second rule exists because `::view-transition-*` pseudo-elements attach to the root element itself; the descendant selector never matches them.

- [ ] **Step 6: Wire startup application in Providers.tsx**

In `src/components/Providers.tsx`:

Add imports:

```typescript
import { useUIAnimationsMode } from '@/hooks/useUIAnimationsMode';
import { resolveUIAnimationsEnabled } from '@/utils/animation';
```

Inside the `Providers` component, next to `const { applyEinkMode } = useEinkMode();` add:

```typescript
const { applyUIAnimationsMode } = useUIAnimationsMode();
```

In the settings-loaded effect, directly after the block

```typescript
        if (globalViewSettings.isEink) {
          applyEinkMode(true);
        }
```

add:

```typescript
        if (!resolveUIAnimationsEnabled(settings)) {
          applyUIAnimationsMode(false);
        }
```

Add `applyUIAnimationsMode` to that effect's dependency array (the one that already lists `applyEinkMode`).

- [ ] **Step 7: Run the test suite and lint**

Run: `pnpm test -- src/__tests__/hooks && pnpm lint`
Expected: PASS, no new lint errors.

- [ ] **Step 8: Commit**

```bash
git add src/hooks/useUIAnimationsMode.ts src/__tests__/hooks/useUIAnimationsMode.test.ts src/styles/globals.css src/components/Providers.tsx
git commit -m "feat(settings): data-ui-anim kill switch applied from startup settings"
```

---

### Task 3: Migrate existing reduced-motion CSS to the attribute

**Files:**
- Modify: `src/components/themefonts/ControlRow.tsx` (lines 43, 59, 72, 91, 100, 138, 146, 154)
- Modify: `src/components/themefonts/CustomizeSection.tsx` (line 281)
- Modify: `src/components/settings/color/ThemeModeSelector.tsx` (lines 49, 66, 84, 145, 153, 161)
- Modify: `src/components/settings/color/ThemeColorSelector.tsx` (lines 89, 143)
- Modify: `src/app/reader/components/BrightnessOverlay.tsx` (line 37)
- Modify: `src/styles/globals.css` (three `@media (prefers-reduced-motion: reduce)` blocks at lines ~570, ~595, ~916)

**Interfaces:**
- Consumes: the `[data-ui-anim='off']` kill rules from Task 2, which now subsume every gate removed here.
- Produces: nothing new; after this task `grep -rn "motion-reduce" src --include='*.tsx'` and `grep -n "prefers-reduced-motion" src/styles/globals.css` both return zero matches.

- [ ] **Step 1: Remove the Tailwind variants**

In each of the five components, delete the ` motion-reduce:transition-none` token from every className string that contains it (18 occurrences total across the files listed above). Only the token is removed; the surrounding transition classes stay.

- [ ] **Step 2: Remove the three media-query blocks from globals.css**

Delete these blocks entirely:

The squash-stretch gate (~line 570):

```css
@media (prefers-reduced-motion: reduce) {
  .animate-squash-stretch {
    animation: none;
  }
}
```

The wobble gate (~line 595):

```css
@media (prefers-reduced-motion: reduce) {
  .animate-wobble {
    animation: none;
  }
}
```

The view-transition fallback (~line 916), including its nested `simple-fade-out` / `simple-fade-in` keyframes (the whole `@media (prefers-reduced-motion: reduce) { ... }` block that follows the `/* Simpler fade for reduced motion preference */` comment, comment included).

- [ ] **Step 3: Verify zero matches remain**

Run: `grep -rn "motion-reduce" src --include='*.tsx' --include='*.ts'; grep -n "prefers-reduced-motion" src/styles/globals.css`
Expected: no output from either grep.

- [ ] **Step 4: Run the existing suites that touch these components**

Run: `pnpm test -- src/__tests__/settings`
Expected: PASS. If a test asserts an exact className containing `motion-reduce:transition-none`, update the assertion to the new string (behavioral assertions must not change).

- [ ] **Step 5: Commit**

```bash
git add src/components/themefonts/ControlRow.tsx src/components/themefonts/CustomizeSection.tsx src/components/settings/color/ThemeModeSelector.tsx src/components/settings/color/ThemeColorSelector.tsx src/app/reader/components/BrightnessOverlay.tsx src/styles/globals.css
git commit -m "refactor(settings): migrate reduced-motion CSS gates to data-ui-anim attribute"
```

---

### Task 4: Gate the Rive search bar mount

**Files:**
- Modify: `src/app/reader/components/sidebar/SearchBar.tsx` (import block; the `isEink` locals around line 176; the Rive mount at line 366)
- Test: `src/__tests__/reader/searchBarRiveGate.test.tsx`

**Interfaces:**
- Consumes: `resolveUIAnimationsEnabled(settings)` from Task 1; `settings` already in scope in SearchBar via `useSettingsStore()`.
- Produces: the Rive mount condition `{!isEink && animationsEnabled && <SearchBarRive …>}`. No exported API changes.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/reader/searchBarRiveGate.test.tsx`:

```typescript
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import SearchBar from '@/app/reader/components/sidebar/SearchBar';
import type { SystemSettings } from '@/types/settings';

let mockSettings: Partial<SystemSettings> = {};
let mockIsEink = false;

vi.mock('@/app/reader/components/sidebar/SearchBarRive', () => ({
  default: () => <div data-testid='rive-canvas' />,
}));

vi.mock('@/app/reader/components/sidebar/SearchFilter', () => ({
  default: () => null,
}));

vi.mock('@/components/ToolbarPopover', () => ({
  default: () => null,
}));

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({ envConfig: {}, appService: { isMobile: true } }),
}));

vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: () => ({ settings: mockSettings }),
}));

vi.mock('@/store/bookDataStore', () => ({
  useBookDataStore: () => ({
    getBookData: () => ({ book: { primaryLanguage: 'en' } }),
    getConfig: () => ({ searchConfig: { mode: 'text', scope: 'book' } }),
    setConfig: vi.fn(),
    saveConfig: vi.fn(),
  }),
}));

vi.mock('@/store/readerStore', () => ({
  useReaderStore: () => ({
    getView: () => ({ search: vi.fn(), clearSearch: vi.fn() }),
    getProgress: () => ({ section: { current: 0 } }),
    getViewSettings: () => ({ isEink: mockIsEink }),
  }),
}));

vi.mock('@/store/sidebarStore', () => ({
  useSidebarStore: () => ({
    setSearchTerm: vi.fn(),
    setSearchResults: vi.fn(),
    setSearchProgress: vi.fn(),
    setSearchError: vi.fn(),
    getSearchNavState: () => ({ searchTerm: '', searchError: null }),
    getSearchStatus: () => 'idle',
    setSearchStatus: vi.fn(),
  }),
}));

vi.mock('@/store/themeStore', () => ({
  useThemeStore: () => ({ themeColor: 'default', isDarkMode: false }),
}));

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (key: string) => key,
}));

vi.mock('@/hooks/useResponsiveSize', () => ({
  useResponsiveSize: (size: number) => size,
}));

vi.mock('@/hooks/useCaretLookX', () => ({
  useCaretLookX: () => ({ lookX: 0, isTyping: false }),
}));

vi.mock('@/utils/toolbarIcons', () => ({
  getToolbarIconSrc: () => '',
}));

const renderSearchBar = () =>
  render(<SearchBar isVisible={true} bookKey='book-1' onHideSearchBar={vi.fn()} />);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  mockSettings = {};
  mockIsEink = false;
});

describe('SearchBar Rive gate', () => {
  it('mounts the Rive canvas when animations are enabled', () => {
    mockSettings = { uiAnimationsEnabled: true };
    renderSearchBar();
    expect(screen.queryByTestId('rive-canvas')).not.toBeNull();
  });

  it('does not mount the Rive canvas when animations are disabled', () => {
    mockSettings = { uiAnimationsEnabled: false };
    renderSearchBar();
    expect(screen.queryByTestId('rive-canvas')).toBeNull();
  });

  it('does not mount the Rive canvas when unset and the OS prefers reduced motion', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({ matches: true } as MediaQueryList),
    );
    renderSearchBar();
    expect(screen.queryByTestId('rive-canvas')).toBeNull();
  });

  it('never mounts the Rive canvas in eink mode even with animations enabled', () => {
    mockSettings = { uiAnimationsEnabled: true };
    mockIsEink = true;
    renderSearchBar();
    expect(screen.queryByTestId('rive-canvas')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/__tests__/reader/searchBarRiveGate.test.tsx`
Expected: the two disabled-state tests FAIL (canvas mounts regardless); the enabled and eink tests already pass.

- [ ] **Step 3: Implement the gate**

In `src/app/reader/components/sidebar/SearchBar.tsx`:

Add import:

```typescript
import { resolveUIAnimationsEnabled } from '@/utils/animation';
```

Next to the existing `const isEink = !!viewSettings?.isEink;` add:

```typescript
const animationsEnabled = resolveUIAnimationsEnabled(settings);
```

Change the mount at line 366 from

```tsx
{!isEink && <SearchBarRive engaged={isEngaged} lookX={lookX} isTyping={isTyping} />}
```

to

```tsx
{!isEink && animationsEnabled && (
  <SearchBarRive engaged={isEngaged} lookX={lookX} isTyping={isTyping} />
)}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/__tests__/reader/searchBarRiveGate.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/reader/components/sidebar/SearchBar.tsx src/__tests__/reader/searchBarRiveGate.test.tsx
git commit -m "feat(reader): gate rive search bar mount on ui animations setting"
```

---

### Task 5: Interface section with UI Animations switch

**Files:**
- Modify: `src/components/settings/ControlPanel.tsx` (imports; state block around line 69; handlers near `toggleAutoCheckUpdates` around line 257; JSX between the Animation and Device sections, lines 429-431)
- Test: `src/__tests__/settings/ui-animations-toggle.test.tsx`

**Interfaces:**
- Consumes: `resolveUIAnimationsEnabled` (Task 1), `useUIAnimationsMode` (Task 2), existing `saveSysSettings(envConfig, key, value)` from `@/helpers/settings`, existing `BoxedList` / `SettingsSwitchRow` primitives.
- Produces: the user-facing switch. No exported API changes.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/settings/ui-animations-toggle.test.tsx`:

```typescript
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import ControlPanel from '@/components/settings/ControlPanel';
import { saveSysSettings } from '@/helpers/settings';
import { DEFAULT_SYSTEM_SETTINGS } from '@/services/constants';
import { getDefaultViewSettings, type Context } from '@/services/settingsService';
import type { SystemSettings } from '@/types/settings';

const settings = {
  ...DEFAULT_SYSTEM_SETTINGS,
  globalViewSettings: getDefaultViewSettings({ isMobile: false, isEink: false } as Context),
} as SystemSettings;

vi.mock('@/helpers/settings', () => ({
  saveSysSettings: vi.fn(),
  saveViewSettings: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({
    envConfig: {},
    appService: {
      isMobileApp: false,
      isAndroidApp: false,
      appPlatform: 'macos',
      hasScreenBrightness: false,
      hasUpdater: false,
    },
  }),
}));

vi.mock('@/store/readerStore', () => ({
  useReaderStore: () => ({
    getView: () => null,
    getViewSettings: () => null,
    recreateViewer: vi.fn(),
  }),
}));

vi.mock('@/store/bookDataStore', () => ({
  useBookDataStore: () => ({ getBookData: () => null }),
}));

vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: () => ({ settings }),
}));

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (key: string) => key,
}));

vi.mock('@/hooks/useResetSettings', () => ({
  useResetViewSettings: () => vi.fn(),
}));

vi.mock('@/app/reader/components/annotator/AnnotationTools', () => ({
  annotationToolQuickActions: [],
}));

vi.mock('@/utils/share', () => ({
  canShareText: () => false,
}));

vi.mock('@/utils/telemetry', () => ({
  optInTelemetry: vi.fn(),
  optOutTelemetry: vi.fn(),
}));

vi.mock('@/components/settings/PageTurnerSettings', () => ({
  default: () => null,
}));

vi.mock('@/components/settings/AnnotationToolbarCustomizer', () => ({
  default: () => null,
}));

const getUIAnimationsToggle = () => {
  const row = screen.getByText('UI Animations').closest('label');
  expect(row).not.toBeNull();
  return within(row as HTMLElement).getByRole('checkbox') as HTMLInputElement;
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  document.documentElement.removeAttribute('data-ui-anim');
});

describe('UI Animations switch', () => {
  it('renders in an Interface section, on by default without OS reduce motion', () => {
    render(<ControlPanel bookKey='book-1' onRegisterReset={vi.fn()} />);
    expect(screen.getByText('Interface')).not.toBeNull();
    expect(getUIAnimationsToggle().checked).toBe(true);
  });

  it('persists false and sets the root attribute when switched off', () => {
    render(<ControlPanel bookKey='book-1' onRegisterReset={vi.fn()} />);
    fireEvent.click(getUIAnimationsToggle());
    expect(saveSysSettings).toHaveBeenCalledWith(expect.anything(), 'uiAnimationsEnabled', false);
    expect(document.documentElement.getAttribute('data-ui-anim')).toBe('off');
  });

  it('persists true and clears the root attribute when switched back on', () => {
    render(<ControlPanel bookKey='book-1' onRegisterReset={vi.fn()} />);
    const toggle = getUIAnimationsToggle();
    fireEvent.click(toggle);
    fireEvent.click(toggle);
    expect(saveSysSettings).toHaveBeenLastCalledWith(
      expect.anything(),
      'uiAnimationsEnabled',
      true,
    );
    expect(document.documentElement.hasAttribute('data-ui-anim')).toBe(false);
  });
});
```

If the render throws on a missing `appService` property not listed above, add that property to the `appService` mock object with a falsy value; do not change component code to accommodate the test.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/__tests__/settings/ui-animations-toggle.test.tsx`
Expected: FAIL ("Unable to find an element with the text: UI Animations").

- [ ] **Step 3: Implement**

In `src/components/settings/ControlPanel.tsx`:

Add imports:

```typescript
import { useUIAnimationsMode } from '@/hooks/useUIAnimationsMode';
import { resolveUIAnimationsEnabled } from '@/utils/animation';
```

Next to `const { applyEinkMode } = useEinkMode();` add:

```typescript
const { applyUIAnimationsMode } = useUIAnimationsMode();
```

In the state block (after the `isTelemetryEnabled` line):

```typescript
const [isUIAnimationsEnabled, setIsUIAnimationsEnabled] = useState(() =>
  resolveUIAnimationsEnabled(settings),
);
```

Next to `toggleAutoCheckUpdates`:

```typescript
const toggleUIAnimations = () => {
  const newValue = !isUIAnimationsEnabled;
  saveSysSettings(envConfig, 'uiAnimationsEnabled', newValue);
  setIsUIAnimationsEnabled(newValue);
  applyUIAnimationsMode(newValue);
};
```

In the JSX, between the closing `</BoxedList>` of the Animation section and the opening `<BoxedList title={_('Device')}`:

```tsx
<BoxedList title={_('Interface')} data-setting-id='settings.control.uiAnimations'>
  <SettingsSwitchRow
    label={_('UI Animations')}
    checked={isUIAnimationsEnabled}
    onChange={toggleUIAnimations}
  />
</BoxedList>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/__tests__/settings/ui-animations-toggle.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/settings/ControlPanel.tsx src/__tests__/settings/ui-animations-toggle.test.tsx
git commit -m "feat(settings): ui animations switch in behavior interface section"
```

---

### Task 6: Full verification

**Files:**
- No new files; fixes only if verification fails.

**Interfaces:**
- Consumes: everything above.
- Produces: a green suite and lint.

- [ ] **Step 1: Run the full unit suite**

Run: `pnpm test`
Expected: PASS, apart from any failures already present on the branch before this feature (compare against a pre-feature baseline run if unsure).

- [ ] **Step 2: Run lint**

Run: `pnpm lint`
Expected: no new errors.

- [ ] **Step 3: Fix anything this feature broke, then commit fixes**

Only if Steps 1-2 surfaced regressions caused by these changes:

```bash
git add <changed files>
git commit -m "fix(settings): address verification fallout for ui animations toggle"
```
