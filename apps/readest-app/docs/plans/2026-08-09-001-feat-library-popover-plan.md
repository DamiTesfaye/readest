# Library Popover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the reader toolbar's "leave the reader" library button with an anchored Library popover that browses, searches, and opens books — parallel or on its own — while Go home becomes its own toolbar affordance.

**Architecture:** A new always-mounted `LibraryPopover` wraps the existing `ToolbarPopover`, so the parallel-vs-single prompt it owns survives the popover being dismissed. Pure segmentation/filtering lives in a side-effect-free `selectors.ts` that is unit tested on its own. A shared `PopoverTitleBar` absorbs the title row that `TocPopover` and `ThemeFontsPanel` already duplicate, and gains the trailing slot the search field needs. Opening a book on its own is orchestrated by `ReaderContent` — the only component that owns book save/close — through a new `open-book-single` event.

**Tech Stack:** Next.js App Router, React 18, TypeScript, Zustand stores, Tailwind + daisyUI, `clsx`, `react-icons`, Vitest + `@testing-library/react`.

**Source spec:** `apps/readest-app/docs/brainstorms/2026-08-09-library-popover-requirements.md` (R1–R30).

## Global Constraints

- All paths below are relative to `apps/readest-app/`. Run every command from that directory unless a step says otherwise.
- Run tests with `pnpm test <path> --run`. Do not run the bare `pnpm test` watcher.
- All user-visible strings go through `const _ = useTranslation()` as `_('English string')`. Do **not** edit any file under `public/locales/` — the placeholder extraction across the 34 locale files is a separate batched i18n chore (spec, Out of Scope).
- Toolbar icons resolve through `getToolbarIconSrc(name, themeColor, isDarkMode)` from `@/utils/toolbarIcons`, which picks the full-colour asset only on Neue Paper light and the `-muted` variant everywhere else (R5).
- Commit messages follow the repo's conventional-commit style with a scope, e.g. `feat(reader): …`, `refactor(reader): …`, `chore(reader): …`. Do not add co-author or attribution trailers — no existing commit in this repo has them.
- **Do not write comments in the code you add.** No inline `//`, no JSDoc, no JSX `{/* */}` narration — not in source files, not in tests. Write the code so it reads without them. This applies only to new code: the existing codebase has long explanatory comments (`ReaderContent.tsx`, `BookMenu.tsx`, `ModalPortal.tsx`) that must be left exactly as they are. Where a comment would have carried a load-bearing constraint, this plan already states it in the step's prose — follow the prose, don't transcribe it into a comment.
- Never mutate an array you did not create. `.sort()` is only ever called on a fresh array produced by `.filter()` or a spread.
- Existing component conventions: `React.FC<Props>` with a local `interface`, `clsx` for conditional classes, default export at the bottom.

---

### Task 1: Shared popover title bar

Extracts the title row `TocPopover` and `ThemeFontsPanel` duplicate and gives it the trailing slot the Library popover's search field needs (R7, R8).

**Files:**
- Create: `src/components/PopoverTitleBar.tsx`
- Modify: `src/app/reader/components/TocPopover.tsx:59-63`
- Modify: `src/components/themefonts/ThemeFontsPanel.tsx:16-18`
- Test: `src/__tests__/components/PopoverTitleBar.test.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `PopoverTitleBar` (default export) with props `{ title: string; end?: React.ReactNode; showDivider?: boolean; className?: string; dividerClassName?: string }`. Renders a fragment: a relatively-positioned centred row, then an optional `h-px` divider sibling. It applies **no** padding of its own — the parent owns padding and gaps.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/components/PopoverTitleBar.test.tsx`:

```tsx
import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import PopoverTitleBar from '@/components/PopoverTitleBar';

afterEach(cleanup);

describe('PopoverTitleBar', () => {
  it('renders the title as a heading', () => {
    render(<PopoverTitleBar title='Library' />);
    expect(screen.getByRole('heading', { name: 'Library' })).toBeTruthy();
  });

  it('omits the divider by default and renders it when asked', () => {
    const { container, rerender } = render(<PopoverTitleBar title='Library' />);
    expect(container.querySelector('.h-px')).toBeNull();

    rerender(<PopoverTitleBar title='Contents' showDivider />);
    expect(container.querySelector('.h-px')).not.toBeNull();
  });

  it('applies dividerClassName to the divider only', () => {
    const { container } = render(
      <PopoverTitleBar title='Theme & Fonts' showDivider dividerClassName='mx-4' />,
    );
    const divider = container.querySelector('.h-px');
    expect(divider?.className).toContain('mx-4');
  });

  it('renders the end slot without removing the title from the centred row', () => {
    const { container } = render(
      <PopoverTitleBar title='Library' end={<button type='button'>Search</button>} />,
    );
    const row = container.firstElementChild as HTMLElement;

    expect(row.className).toContain('justify-center');
    expect(row.contains(screen.getByRole('heading', { name: 'Library' }))).toBe(true);

    const endWrapper = screen.getByRole('button', { name: 'Search' }).parentElement!;
    expect(endWrapper.className).toContain('absolute');
    expect(endWrapper.className).toContain('end-0');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/__tests__/components/PopoverTitleBar.test.tsx --run`
Expected: FAIL — `Failed to resolve import "@/components/PopoverTitleBar"`.

- [ ] **Step 3: Write minimal implementation**

Create `src/components/PopoverTitleBar.tsx`:

```tsx
import clsx from 'clsx';
import React from 'react';

interface PopoverTitleBarProps {
  title: string;
  end?: React.ReactNode;
  showDivider?: boolean;
  className?: string;
  dividerClassName?: string;
}

const PopoverTitleBar: React.FC<PopoverTitleBarProps> = ({
  title,
  end,
  showDivider = false,
  className,
  dividerClassName,
}) => (
  <>
    <div className={clsx('relative flex items-center justify-center', className)}>
      <h2 className='text-base-content popover-title text-center text-sm'>{title}</h2>
      {end ? <div className='absolute inset-y-0 end-0 flex items-center'>{end}</div> : null}
    </div>
    {showDivider ? <div className={clsx('bg-base-content/15 h-px', dividerClassName)} /> : null}
  </>
);

export default PopoverTitleBar;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/__tests__/components/PopoverTitleBar.test.tsx --run`
Expected: PASS (4 tests).

- [ ] **Step 5: Adopt it in TocPopover**

In `src/app/reader/components/TocPopover.tsx`, add the import next to the other `@/components` imports:

```tsx
import PopoverTitleBar from '@/components/PopoverTitleBar';
```

Replace these two lines inside the sticky header `div`:

```tsx
          <h2 className='text-base-content popover-title text-center text-sm'>{_('Contents')}</h2>
          <div className='bg-base-content/15 h-px' />
```

with:

```tsx
          <PopoverTitleBar title={_('Contents')} showDivider />
```

The surrounding `<div className='bg-base-200 sticky top-0 z-10 flex flex-col gap-2 px-4 pb-2 pt-4'>` is unchanged — it keeps owning padding and the `gap-2` that used to separate the heading from the divider.

- [ ] **Step 6: Adopt it in ThemeFontsPanel**

In `src/components/themefonts/ThemeFontsPanel.tsx`, add:

```tsx
import PopoverTitleBar from '@/components/PopoverTitleBar';
```

Replace these two lines:

```tsx
      <h2 className='text-base-content popover-title text-center text-sm'>{_('Theme & Fonts')}</h2>
      <div className='bg-base-content/15 mx-4 h-px' />
```

with:

```tsx
      <PopoverTitleBar title={_('Theme & Fonts')} showDivider dividerClassName='mx-4' />
```

- [ ] **Step 7: Verify the two refactors did not regress**

Run: `pnpm test src/__tests__/components/toolbarPopover.test.ts src/__tests__/components/themeFonts.test.ts src/__tests__/components/TOCView.test.tsx --run`
Expected: PASS, same counts as before this task.

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/components/PopoverTitleBar.tsx \
        src/__tests__/components/PopoverTitleBar.test.tsx \
        src/app/reader/components/TocPopover.tsx \
        src/components/themefonts/ThemeFontsPanel.tsx
git commit -m "refactor(reader): extract shared PopoverTitleBar with trailing slot"
```

---

### Task 2: Reading-percentage helper

`ReadingProgress` keeps a private `getProgressPercentage`. The popover needs the identical calculation (R17), so it moves to a shared util rather than being copied.

**Files:**
- Create: `src/utils/bookProgress.ts`
- Modify: `src/app/library/components/ReadingProgress.tsx:12-21`
- Test: `src/__tests__/utils/bookProgress.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `getProgressPercentage(book: Book): number | null` — `null` when there is no usable progress, otherwise an integer clamped to 0–100, with `progress[1] === 1` short-circuiting to 100.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/utils/bookProgress.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import type { Book } from '@/types/book';
import { getProgressPercentage } from '@/utils/bookProgress';

const makeBook = (overrides: Partial<Book> = {}): Book =>
  ({
    hash: 'h1',
    format: 'EPUB',
    title: 'Zero to One',
    author: 'Peter Thiel',
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  }) as Book;

describe('getProgressPercentage', () => {
  it('returns null when there is no progress', () => {
    expect(getProgressPercentage(makeBook())).toBeNull();
  });

  it('returns null when the total is zero', () => {
    expect(getProgressPercentage(makeBook({ progress: [3, 0] }))).toBeNull();
  });

  it('treats a single-page total as complete', () => {
    expect(getProgressPercentage(makeBook({ progress: [1, 1] }))).toBe(100);
  });

  it('rounds to a whole percent', () => {
    expect(getProgressPercentage(makeBook({ progress: [6, 100] }))).toBe(6);
    expect(getProgressPercentage(makeBook({ progress: [1, 24] }))).toBe(4);
  });

  it('clamps out-of-range progress', () => {
    expect(getProgressPercentage(makeBook({ progress: [-5, 100] }))).toBe(0);
    expect(getProgressPercentage(makeBook({ progress: [150, 100] }))).toBe(100);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/__tests__/utils/bookProgress.test.ts --run`
Expected: FAIL — `Failed to resolve import "@/utils/bookProgress"`.

- [ ] **Step 3: Write minimal implementation**

Create `src/utils/bookProgress.ts`:

```ts
import type { Book } from '@/types/book';

export const getProgressPercentage = (book: Book): number | null => {
  if (!book.progress || !book.progress[1]) {
    return null;
  }
  if (book.progress[1] === 1) {
    return 100;
  }
  const percentage = Math.round((book.progress[0] / book.progress[1]) * 100);
  return Math.max(0, Math.min(100, percentage));
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/__tests__/utils/bookProgress.test.ts --run`
Expected: PASS (5 tests).

- [ ] **Step 5: Point ReadingProgress at the shared helper**

In `src/app/library/components/ReadingProgress.tsx`, delete the local `const getProgressPercentage = (book: Book) => { … };` block in full, and add to the imports:

```tsx
import { getProgressPercentage } from '@/utils/bookProgress';
```

Nothing else in the file changes — `useMemo(() => getProgressPercentage(book), [book])` now resolves to the shared helper.

- [ ] **Step 6: Verify no regression**

Run: `pnpm exec tsc --noEmit`
Expected: no errors. The file's `import type { Book }` must stay — `ReadingProgressProps` still uses it.

- [ ] **Step 7: Commit**

```bash
git add src/utils/bookProgress.ts \
        src/__tests__/utils/bookProgress.test.ts \
        src/app/library/components/ReadingProgress.tsx
git commit -m "refactor(library): share reading-percentage helper"
```

---

### Task 3: Popover book selectors

Pure segmentation, availability filtering, search matching and ordering (R11, R12, R14, R15, R16).

**Files:**
- Create: `src/app/reader/components/library/selectors.ts`
- Test: `src/__tests__/reader/libraryPopoverSelectors.test.ts`

**Interfaces:**
- Consumes: `Book` from `@/types/book`.
- Produces:
  - `isOpenableBook(book: Book): boolean`
  - `matchesQuery(book: Book, query: string): boolean`
  - `selectLibraryPopoverBooks(library: Book[], query: string): { reading: Book[]; others: Book[] }`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/reader/libraryPopoverSelectors.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import type { Book } from '@/types/book';
import {
  isOpenableBook,
  matchesQuery,
  selectLibraryPopoverBooks,
} from '@/app/reader/components/library/selectors';

const makeBook = (overrides: Partial<Book>): Book =>
  ({
    hash: 'h',
    format: 'EPUB',
    title: 'Untitled',
    author: 'Anonymous',
    createdAt: 0,
    updatedAt: 0,
    downloadedAt: 1,
    ...overrides,
  }) as Book;

describe('isOpenableBook', () => {
  it('rejects deleted books', () => {
    expect(isOpenableBook(makeBook({ deletedAt: 123 }))).toBe(false);
  });

  it('rejects books that are not downloaded', () => {
    expect(isOpenableBook(makeBook({ downloadedAt: null }))).toBe(false);
    expect(isOpenableBook(makeBook({ downloadedAt: undefined }))).toBe(false);
  });

  it('accepts a downloaded, undeleted book', () => {
    expect(isOpenableBook(makeBook({}))).toBe(true);
  });
});

describe('matchesQuery', () => {
  it('matches everything on an empty or whitespace query', () => {
    const book = makeBook({ title: 'Moby-Dick' });
    expect(matchesQuery(book, '')).toBe(true);
    expect(matchesQuery(book, '   ')).toBe(true);
  });

  it('matches title and author case-insensitively', () => {
    const book = makeBook({ title: 'Moby-Dick', author: 'Herman Melville' });
    expect(matchesQuery(book, 'MOBY')).toBe(true);
    expect(matchesQuery(book, 'melville')).toBe(true);
    expect(matchesQuery(book, 'tolstoy')).toBe(false);
  });

  it('folds diacritics in both the query and the book', () => {
    const book = makeBook({ title: 'Les Misérables', author: 'Victor Hugo' });
    expect(matchesQuery(book, 'miserables')).toBe(true);
    expect(matchesQuery(makeBook({ title: 'Les Miserables' }), 'misérables')).toBe(true);
  });

  it('tolerates a missing author', () => {
    expect(matchesQuery(makeBook({ title: 'Anon', author: undefined as never }), 'anon')).toBe(true);
  });
});

describe('selectLibraryPopoverBooks', () => {
  const reading1 = makeBook({ hash: 'r1', title: 'Zero to One', readingStatus: 'reading', updatedAt: 10 });
  const reading2 = makeBook({ hash: 'r2', title: 'A Tale of Two Cities', readingStatus: 'reading', updatedAt: 30 });
  const unread = makeBook({ hash: 'o1', title: 'Moby-Dick', readingStatus: 'unread', updatedAt: 20 });
  const finished = makeBook({ hash: 'o2', title: 'The Art of War', readingStatus: 'finished', updatedAt: 40 });
  const abandoned = makeBook({ hash: 'o3', title: 'Ulysses', readingStatus: 'abandoned', updatedAt: 5 });
  const statusless = makeBook({ hash: 'o4', title: 'Pride and Prejudice', updatedAt: 1 });
  const deleted = makeBook({ hash: 'd1', title: 'Deleted', readingStatus: 'reading', deletedAt: 1 });
  const remote = makeBook({ hash: 'n1', title: 'Not downloaded', downloadedAt: null });

  const library = [reading1, reading2, unread, finished, abandoned, statusless, deleted, remote];

  it("puts only readingStatus 'reading' in the first segment", () => {
    const { reading, others } = selectLibraryPopoverBooks(library, '');
    expect(reading.map((b) => b.hash)).toEqual(['r2', 'r1']);
    expect(others.map((b) => b.hash)).toEqual(['o2', 'o1', 'o3', 'o4']);
  });

  it('excludes deleted and not-downloaded books from both segments', () => {
    const { reading, others } = selectLibraryPopoverBooks(library, '');
    const hashes = [...reading, ...others].map((b) => b.hash);
    expect(hashes).not.toContain('d1');
    expect(hashes).not.toContain('n1');
  });

  it('orders each segment by updatedAt, newest first', () => {
    const { reading, others } = selectLibraryPopoverBooks(library, '');
    expect(reading.map((b) => b.updatedAt)).toEqual([30, 10]);
    expect(others.map((b) => b.updatedAt)).toEqual([40, 20, 5, 1]);
  });

  it('applies the query to both segments', () => {
    const { reading, others } = selectLibraryPopoverBooks(library, 'zero');
    expect(reading.map((b) => b.hash)).toEqual(['r1']);
    expect(others).toEqual([]);
  });

  it('does not mutate the input array', () => {
    const input = [...library];
    selectLibraryPopoverBooks(input, '');
    expect(input.map((b) => b.hash)).toEqual(library.map((b) => b.hash));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/__tests__/reader/libraryPopoverSelectors.test.ts --run`
Expected: FAIL — `Failed to resolve import ".../library/selectors"`.

- [ ] **Step 3: Write minimal implementation**

Create `src/app/reader/components/library/selectors.ts`:

```ts
import type { Book } from '@/types/book';

export interface LibraryPopoverSegments {
  reading: Book[];
  others: Book[];
}

const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

export const isOpenableBook = (book: Book): boolean => !book.deletedAt && !!book.downloadedAt;

export const matchesQuery = (book: Book, query: string): boolean => {
  const needle = normalize(query.trim());
  if (!needle) return true;
  return (
    normalize(book.title ?? '').includes(needle) || normalize(book.author ?? '').includes(needle)
  );
};

const byUpdatedAtDesc = (a: Book, b: Book) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0);

export const selectLibraryPopoverBooks = (
  library: Book[],
  query: string,
): LibraryPopoverSegments => {
  const visible = library.filter((book) => isOpenableBook(book) && matchesQuery(book, query));
  return {
    reading: visible.filter((book) => book.readingStatus === 'reading').sort(byUpdatedAtDesc),
    others: visible.filter((book) => book.readingStatus !== 'reading').sort(byUpdatedAtDesc),
  };
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/__tests__/reader/libraryPopoverSelectors.test.ts --run`
Expected: PASS (12 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/reader/components/library/selectors.ts \
        src/__tests__/reader/libraryPopoverSelectors.test.ts
git commit -m "feat(reader): add library popover book selectors"
```

---

### Task 4: Book item and search input

The two leaf presentational pieces (R10, R13, R17, R18, R19).

**Files:**
- Create: `src/app/reader/components/library/LibraryBookItem.tsx`
- Create: `src/app/reader/components/library/LibrarySearchInput.tsx`
- Test: `src/__tests__/reader/librarySearchInput.test.tsx`

**Interfaces:**
- Consumes: `getProgressPercentage` from `@/utils/bookProgress` (Task 2).
- Produces:
  - `LibraryBookItem` with props `{ book: Book; isOpen: boolean; showProgress: boolean; onSelect: (book: Book) => void }`. Its root is a `<button>` carrying `title={book.title}`, which is how later tests select it.
  - `LibrarySearchInput` with props `{ value: string; onChange: (value: string) => void; onEscape: () => void }`. `onEscape` fires **only** when Escape is pressed on an already-empty query; a non-empty query is cleared instead.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/reader/librarySearchInput.test.tsx`:

```tsx
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import LibrarySearchInput from '@/app/reader/components/library/LibrarySearchInput';

vi.mock('@/hooks/useTranslation', () => ({ useTranslation: () => (s: string) => s }));

afterEach(cleanup);

describe('LibrarySearchInput', () => {
  it('reports typed text', () => {
    const onChange = vi.fn();
    render(<LibrarySearchInput value='' onChange={onChange} onEscape={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText('Search'), { target: { value: 'moby' } });
    expect(onChange).toHaveBeenCalledWith('moby');
  });

  it('clears a non-empty query on Escape instead of escalating', () => {
    const onChange = vi.fn();
    const onEscape = vi.fn();
    render(<LibrarySearchInput value='moby' onChange={onChange} onEscape={onEscape} />);

    fireEvent.keyDown(screen.getByPlaceholderText('Search'), { key: 'Escape' });
    expect(onChange).toHaveBeenCalledWith('');
    expect(onEscape).not.toHaveBeenCalled();
  });

  it('escalates Escape when the query is already empty', () => {
    const onChange = vi.fn();
    const onEscape = vi.fn();
    render(<LibrarySearchInput value='' onChange={onChange} onEscape={onEscape} />);

    fireEvent.keyDown(screen.getByPlaceholderText('Search'), { key: 'Escape' });
    expect(onEscape).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('stops pointer events from reaching the popover dismiss overlay', () => {
    const onOuterMouseDown = vi.fn();
    render(
      <div onMouseDown={onOuterMouseDown}>
        <LibrarySearchInput value='' onChange={vi.fn()} onEscape={vi.fn()} />
      </div>,
    );

    fireEvent.mouseDown(screen.getByPlaceholderText('Search'));
    expect(onOuterMouseDown).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/__tests__/reader/librarySearchInput.test.tsx --run`
Expected: FAIL — `Failed to resolve import ".../library/LibrarySearchInput"`.

- [ ] **Step 3: Write LibrarySearchInput**

Create `src/app/reader/components/library/LibrarySearchInput.tsx`:

```tsx
import React from 'react';
import { MdSearch } from 'react-icons/md';

import { useTranslation } from '@/hooks/useTranslation';

interface LibrarySearchInputProps {
  value: string;
  onChange: (value: string) => void;
  onEscape: () => void;
}

const LibrarySearchInput: React.FC<LibrarySearchInputProps> = ({ value, onChange, onEscape }) => {
  const _ = useTranslation();

  return (
    <div
      className='text-base-content/60 flex items-center gap-1.5'
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <MdSearch aria-hidden='true' className='h-4 w-4 shrink-0' />
      <input
        type='text'
        value={value}
        placeholder={_('Search')}
        aria-label={_('Search')}
        className='placeholder:text-base-content/50 text-base-content w-24 border-0 bg-transparent p-0 text-sm outline-none focus:outline-none focus:ring-0'
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== 'Escape') return;
          e.stopPropagation();
          if (value) {
            onChange('');
          } else {
            onEscape();
          }
        }}
      />
    </div>
  );
};

export default LibrarySearchInput;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/__tests__/reader/librarySearchInput.test.tsx --run`
Expected: PASS (4 tests).

- [ ] **Step 5: Write LibraryBookItem**

Create `src/app/reader/components/library/LibraryBookItem.tsx`:

```tsx
import clsx from 'clsx';
import React from 'react';

import type { Book } from '@/types/book';
import { useTranslation } from '@/hooks/useTranslation';
import { getProgressPercentage } from '@/utils/bookProgress';

interface LibraryBookItemProps {
  book: Book;
  isOpen: boolean;
  showProgress: boolean;
  onSelect: (book: Book) => void;
}

const LibraryBookItem: React.FC<LibraryBookItemProps> = ({
  book,
  isOpen,
  showProgress,
  onSelect,
}) => {
  const _ = useTranslation();
  const percentage = showProgress ? getProgressPercentage(book) : null;
  const status = isOpen ? _('Open') : percentage !== null ? `${percentage}%` : '';

  return (
    <button
      type='button'
      title={book.title}
      className='hover:bg-base-content/5 flex items-start gap-3 rounded-md p-2 text-start'
      onClick={() => onSelect(book)}
    >
      <img
        src={book.coverImageUrl ?? ''}
        alt=''
        loading='lazy'
        className='aspect-auto max-h-24 w-16 shrink-0 rounded-sm object-cover shadow-md'
        onError={(e) => {
          (e.target as HTMLImageElement).style.visibility = 'hidden';
        }}
      />
      <div className='flex min-w-0 flex-col gap-0.5'>
        <span className='text-base-content line-clamp-3 text-sm font-bold'>{book.title}</span>
        <span className='text-base-content/60 line-clamp-2 text-xs'>{book.author}</span>
        <span className='text-base-content/60 mt-1 text-xs'>{status || ' '}</span>
      </div>
    </button>
  );
};

export default LibraryBookItem;
```

- [ ] **Step 6: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/app/reader/components/library/LibraryBookItem.tsx \
        src/app/reader/components/library/LibrarySearchInput.tsx \
        src/__tests__/reader/librarySearchInput.test.tsx
git commit -m "feat(reader): add library popover book item and search input"
```

---

### Task 5: Single-read replace path

Wires the "read on its own" branch end to end before the UI needs it: open books are saved and closed, then the tapped book replaces them (R23).

**Files:**
- Modify: `src/app/reader/hooks/useBooksManager.ts:93-99` (the returned object)
- Modify: `src/app/reader/components/ReaderContent.tsx` (imports, hook destructuring, and a new effect after `handleCloseBook`)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: an `eventDispatcher` event `'open-book-single'` with detail `{ bookHash: string }`. Any component may dispatch it; `ReaderContent` is the sole listener. `useBooksManager` additionally returns its existing `openBookInReader(bookHash: string): void`.

- [ ] **Step 1: Expose openBookInReader from useBooksManager**

In `src/app/reader/hooks/useBooksManager.ts`, extend the returned object:

```ts
  return {
    bookKeys,
    appendBook,
    dismissBook,
    getNextBookKey,
    openParallelView,
    openBookInReader,
  };
```

`openBookInReader` is defined earlier in the same hook and already replaces `bookKeys` with a single new key, sets the sidebar book, and syncs the URL. Nothing about its body changes.

- [ ] **Step 2: Add the listener in ReaderContent**

In `src/app/reader/components/ReaderContent.tsx`, add to the imports:

```tsx
import { useParallelViewStore } from '@/store/parallelViewStore';
```

Extend the existing destructuring:

```tsx
  const { bookKeys, dismissBook, getNextBookKey, openBookInReader } = useBooksManager();
  const { unsetParallel } = useParallelViewStore();
```

Then, immediately after the `handleCloseBook` definition, add the block below. Two things about it are load-bearing and must not be "simplified" during implementation:

1. **Books are saved and closed before the swap, not after.** Replacing `bookKeys` unmounts their viewers, and a removed view can no longer flush its progress — so the `await Promise.all(...)` has to complete before `openBookInReader`.
2. **It must not call `handleCloseBook`.** That path navigates back to the library once the last book closes, which is precisely what this flow exists to avoid.

```tsx
  const openBookSingleRef = useRef<(bookHash: string) => Promise<void>>();
  openBookSingleRef.current = async (bookHash: string) => {
    const existing = bookKeys.find((key) => key.startsWith(bookHash));
    if (existing) {
      setSideBarBookKey(existing);
      return;
    }
    const previousKeys = [...bookKeys];
    unsetParallel(previousKeys);
    await Promise.all(previousKeys.map((key) => saveConfigAndCloseBook(key)));
    openBookInReader(bookHash);
  };

  useEffect(() => {
    const handle = (event: CustomEvent) => {
      const { bookHash } = event.detail as { bookHash: string };
      openBookSingleRef.current?.(bookHash);
    };
    eventDispatcher.on('open-book-single', handle);
    return () => eventDispatcher.off('open-book-single', handle);
  }, []);
```

`useRef`, `useEffect` and `eventDispatcher` are already imported in this file.

- [ ] **Step 3: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: no errors. If `eventDispatcher.on` rejects the new event name, add `'open-book-single'` to the event-name union in `src/utils/event.ts` alongside `'open-book-in-reader'`.

- [ ] **Step 4: Verify no regression in existing reader tests**

Run: `pnpm test src/__tests__/reader --run`
Expected: PASS, same counts as before this task.

- [ ] **Step 5: Commit**

```bash
git add src/app/reader/hooks/useBooksManager.ts \
        src/app/reader/components/ReaderContent.tsx
git commit -m "feat(reader): add open-book-single replace path"
```

---

### Task 6: Parallel-vs-single prompt

The two-choice modal raised when a book that is not already open is picked (R21, R22, R23, R24).

**Files:**
- Create: `src/app/reader/components/library/ParallelReadPrompt.tsx`
- Test: `src/__tests__/reader/parallelReadPrompt.test.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `ParallelReadPrompt` with props `{ book: Book; canReadParallel: boolean; onReadParallel: () => void; onReadSingle: () => void; onCancel: () => void }`. It renders inside `ModalPortal` with `role='dialog'` and decides nothing — the caller computes `canReadParallel`.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/reader/parallelReadPrompt.test.tsx`:

```tsx
import React from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Book } from '@/types/book';

vi.mock('@/hooks/useTranslation', () => ({ useTranslation: () => (s: string) => s }));
vi.mock('@/components/ModalPortal', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import ParallelReadPrompt from '@/app/reader/components/library/ParallelReadPrompt';

const book = {
  hash: 'h1',
  format: 'EPUB',
  title: 'Moby-Dick',
  author: 'Herman Melville',
  createdAt: 0,
  updatedAt: 0,
} as Book;

afterEach(cleanup);

describe('ParallelReadPrompt', () => {
  it('shows the book being opened', () => {
    render(
      <ParallelReadPrompt
        book={book}
        canReadParallel
        onReadParallel={vi.fn()}
        onReadSingle={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText('Moby-Dick')).toBeTruthy();
  });

  it('reports each choice', () => {
    const onReadParallel = vi.fn();
    const onReadSingle = vi.fn();
    render(
      <ParallelReadPrompt
        book={book}
        canReadParallel
        onReadParallel={onReadParallel}
        onReadSingle={onReadSingle}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Read in parallel' }));
    expect(onReadParallel).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Read on its own' }));
    expect(onReadSingle).toHaveBeenCalledTimes(1);
  });

  it('disables parallel and explains why when it is unavailable', () => {
    const onReadParallel = vi.fn();
    render(
      <ParallelReadPrompt
        book={book}
        canReadParallel={false}
        onReadParallel={onReadParallel}
        onReadSingle={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const parallel = screen.getByRole('button', { name: 'Read in parallel' }) as HTMLButtonElement;
    expect(parallel.disabled).toBe(true);
    fireEvent.click(parallel);
    expect(onReadParallel).not.toHaveBeenCalled();
    expect(screen.getByText("Parallel read isn't available for PDF or CBZ books.")).toBeTruthy();
  });

  it('omits the explanation when parallel is available', () => {
    render(
      <ParallelReadPrompt
        book={book}
        canReadParallel
        onReadParallel={vi.fn()}
        onReadSingle={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.queryByText("Parallel read isn't available for PDF or CBZ books.")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/__tests__/reader/parallelReadPrompt.test.tsx --run`
Expected: FAIL — `Failed to resolve import ".../library/ParallelReadPrompt"`.

- [ ] **Step 3: Write minimal implementation**

Create `src/app/reader/components/library/ParallelReadPrompt.tsx`. Note that `ModalPortal` already renders a fixed, centred, dimmed layer at `z-[120]` — do **not** add a z-index of your own. `src/__tests__/styles/zIndexScale.test.ts` enforces the documented scale, and `z-[130]` is the toast tier.

```tsx
import React from 'react';

import type { Book } from '@/types/book';
import { useTranslation } from '@/hooks/useTranslation';
import ModalPortal from '@/components/ModalPortal';

interface ParallelReadPromptProps {
  book: Book;
  canReadParallel: boolean;
  onReadParallel: () => void;
  onReadSingle: () => void;
  onCancel: () => void;
}

const ParallelReadPrompt: React.FC<ParallelReadPromptProps> = ({
  book,
  canReadParallel,
  onReadParallel,
  onReadSingle,
  onCancel,
}) => {
  const _ = useTranslation();

  return (
    <ModalPortal>
      <div className='flex w-full items-center justify-center px-4'>
        <div
          role='none'
          className='absolute inset-0'
          onClick={onCancel}
          onContextMenu={(e) => {
            e.preventDefault();
            onCancel();
          }}
        />
        <div
          role='dialog'
          aria-modal='true'
          aria-label={_('Open book')}
          className='bg-base-300 relative flex w-full max-w-md flex-col gap-4 rounded-lg p-4 shadow-2xl'
        >
          <div className='flex items-start gap-3'>
            <img
              src={book.coverImageUrl ?? ''}
              alt=''
              className='aspect-auto max-h-20 w-14 shrink-0 rounded-sm object-cover shadow-md'
              onError={(e) => {
                (e.target as HTMLImageElement).style.visibility = 'hidden';
              }}
            />
            <div className='flex min-w-0 flex-col gap-1'>
              <span className='text-base-content text-sm font-bold'>{book.title}</span>
              <span className='text-base-content/60 text-xs'>{book.author}</span>
              <span className='text-base-content/80 mt-1 text-sm'>
                {_('How do you want to open this book?')}
              </span>
            </div>
          </div>
          <div className='flex flex-col gap-2 sm:flex-row sm:justify-end'>
            <button type='button' className='btn btn-ghost btn-sm' onClick={onCancel}>
              {_('Cancel')}
            </button>
            <button
              type='button'
              disabled={!canReadParallel}
              className='btn btn-sm'
              onClick={onReadParallel}
            >
              {_('Read in parallel')}
            </button>
            <button type='button' className='btn btn-primary btn-sm' onClick={onReadSingle}>
              {_('Read on its own')}
            </button>
          </div>
          {!canReadParallel && (
            <span className='text-base-content/60 text-xs'>
              {_("Parallel read isn't available for PDF or CBZ books.")}
            </span>
          )}
        </div>
      </div>
    </ModalPortal>
  );
};

export default ParallelReadPrompt;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/__tests__/reader/parallelReadPrompt.test.tsx --run`
Expected: PASS (4 tests).

- [ ] **Step 5: Verify the z-index scale invariants still hold**

Run: `pnpm test src/__tests__/styles/zIndexScale.test.ts --run`
Expected: PASS. This is the guard that the prompt did not invent a new overlay tier — it must ride `ModalPortal`'s `z-[120]`.

- [ ] **Step 6: Commit**

```bash
git add src/app/reader/components/library/ParallelReadPrompt.tsx \
        src/__tests__/reader/parallelReadPrompt.test.tsx
git commit -m "feat(reader): add parallel-vs-single read prompt"
```

---

### Task 7: Library popover

Composes Tasks 1, 3, 4 and 6 into the surface itself and routes selection (R1–R4, R9, R11, R12, R15, R20–R23, R28).

**Files:**
- Create: `src/app/reader/components/library/LibraryPopover.tsx`
- Test: `src/__tests__/reader/libraryPopover.test.tsx`

**Interfaces:**
- Consumes: `PopoverTitleBar` (Task 1), `selectLibraryPopoverBooks` (Task 3), `LibraryBookItem` and `LibrarySearchInput` (Task 4), the `'open-book-single'` event (Task 5), `ParallelReadPrompt` (Task 6).
- Produces: `LibraryPopover` with props `{ bookKey: string; isOpen: boolean; anchorEl: HTMLElement | null; onClose: () => void }`. Like `TocPopover`, it is rendered unconditionally by `HeaderBar` and gates itself on `isOpen`, so the prompt outlives dismissal (R25).

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/reader/libraryPopover.test.tsx`:

```tsx
import React from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Book } from '@/types/book';

const dispatch = vi.fn();
const openParallelView = vi.fn();
const setSideBarBookKey = vi.fn();
let bookKeys: string[] = [];
let library: Book[] = [];
let currentBookFormat = 'EPUB';

vi.mock('@/hooks/useTranslation', () => ({ useTranslation: () => (s: string) => s }));
vi.mock('@/utils/event', () => ({ eventDispatcher: { dispatch, on: vi.fn(), off: vi.fn() } }));
vi.mock('@/store/libraryStore', () => ({
  useLibraryStore: () => ({ visibleLibrary: library }),
}));
vi.mock('@/store/readerStore', () => ({ useReaderStore: () => ({ bookKeys }) }));
vi.mock('@/store/sidebarStore', () => ({ useSidebarStore: () => ({ setSideBarBookKey }) }));
vi.mock('@/store/bookDataStore', () => ({
  useBookDataStore: () => ({ getBookData: () => ({ book: { format: currentBookFormat } }) }),
}));
vi.mock('@/app/reader/hooks/useBooksManager', () => ({ default: () => ({ openParallelView }) }));
vi.mock('@/components/ToolbarPopover', () => ({
  default: ({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) =>
    isOpen ? <div>{children}</div> : null,
}));
vi.mock('@/components/ModalPortal', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import LibraryPopover from '@/app/reader/components/library/LibraryPopover';

const makeBook = (overrides: Partial<Book>): Book =>
  ({
    hash: 'h',
    format: 'EPUB',
    title: 'Untitled',
    author: 'Anonymous',
    createdAt: 0,
    updatedAt: 0,
    downloadedAt: 1,
    ...overrides,
  }) as Book;

const renderPopover = (onClose = vi.fn()) =>
  render(<LibraryPopover bookKey='open1-abc' isOpen anchorEl={document.body} onClose={onClose} />);

beforeEach(() => {
  dispatch.mockReset();
  openParallelView.mockReset();
  setSideBarBookKey.mockReset();
  currentBookFormat = 'EPUB';
  bookKeys = ['open1-abc'];
  library = [
    makeBook({ hash: 'open1', title: 'Zero to One', readingStatus: 'reading', updatedAt: 10 }),
    makeBook({ hash: 'other1', title: 'Moby-Dick', readingStatus: 'unread', updatedAt: 5 }),
  ];
});

afterEach(cleanup);

describe('LibraryPopover', () => {
  it('renders both segments with the Currently reading heading', () => {
    renderPopover();
    expect(screen.getByText('Currently reading')).toBeTruthy();
    expect(screen.getByTitle('Zero to One')).toBeTruthy();
    expect(screen.getByTitle('Moby-Dick')).toBeTruthy();
  });

  it('focuses an already-open book without prompting', () => {
    const onClose = vi.fn();
    renderPopover(onClose);

    fireEvent.click(screen.getByTitle('Zero to One'));
    expect(setSideBarBookKey).toHaveBeenCalledWith('open1-abc');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('prompts for a book that is not open', () => {
    renderPopover();

    fireEvent.click(screen.getByTitle('Moby-Dick'));
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(openParallelView).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('opens in parallel when that choice is taken', () => {
    renderPopover();
    fireEvent.click(screen.getByTitle('Moby-Dick'));
    fireEvent.click(screen.getByRole('button', { name: 'Read in parallel' }));

    expect(openParallelView).toHaveBeenCalledWith('other1');
  });

  it('dispatches open-book-single when read-on-its-own is taken', () => {
    renderPopover();
    fireEvent.click(screen.getByTitle('Moby-Dick'));
    fireEvent.click(screen.getByRole('button', { name: 'Read on its own' }));

    expect(dispatch).toHaveBeenCalledWith('open-book-single', { bookHash: 'other1' });
  });

  it('disables parallel when the open book is fixed-layout', () => {
    currentBookFormat = 'PDF';
    renderPopover();
    fireEvent.click(screen.getByTitle('Moby-Dick'));

    const parallel = screen.getByRole('button', { name: 'Read in parallel' }) as HTMLButtonElement;
    expect(parallel.disabled).toBe(true);
  });

  it('disables parallel when the picked book is fixed-layout', () => {
    library = [...library, makeBook({ hash: 'cbz1', title: 'Comics', format: 'CBZ', updatedAt: 1 })];
    renderPopover();
    fireEvent.click(screen.getByTitle('Comics'));

    const parallel = screen.getByRole('button', { name: 'Read in parallel' }) as HTMLButtonElement;
    expect(parallel.disabled).toBe(true);
  });

  it('filters both segments and hides an emptied heading', () => {
    renderPopover();

    fireEvent.change(screen.getByPlaceholderText('Search'), { target: { value: 'moby' } });
    expect(screen.getByTitle('Moby-Dick')).toBeTruthy();
    expect(screen.queryByTitle('Zero to One')).toBeNull();
    expect(screen.queryByText('Currently reading')).toBeNull();
  });

  it('shows an empty line when nothing matches', () => {
    renderPopover();

    fireEvent.change(screen.getByPlaceholderText('Search'), { target: { value: 'zzzz' } });
    expect(screen.getByText('No books match')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/__tests__/reader/libraryPopover.test.tsx --run`
Expected: FAIL — `Failed to resolve import ".../library/LibraryPopover"`.

- [ ] **Step 3: Write minimal implementation**

Create `src/app/reader/components/library/LibraryPopover.tsx`:

```tsx
import React, { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';

import type { Book } from '@/types/book';
import { FIXED_LAYOUT_FORMATS } from '@/types/book';
import { useBookDataStore } from '@/store/bookDataStore';
import { useLibraryStore } from '@/store/libraryStore';
import { useReaderStore } from '@/store/readerStore';
import { useSidebarStore } from '@/store/sidebarStore';
import { useTranslation } from '@/hooks/useTranslation';
import { eventDispatcher } from '@/utils/event';
import { POPOVER_EDGE_PADDING } from '@/utils/popover';
import ToolbarPopover from '@/components/ToolbarPopover';
import PopoverTitleBar from '@/components/PopoverTitleBar';
import useBooksManager from '../../hooks/useBooksManager';
import LibraryBookItem from './LibraryBookItem';
import LibrarySearchInput from './LibrarySearchInput';
import ParallelReadPrompt from './ParallelReadPrompt';
import { selectLibraryPopoverBooks } from './selectors';

const MAX_POPOVER_WIDTH = 720;
const TWO_COLUMN_MAX_WIDTH = 520;
const MAX_POPOVER_HEIGHT = 520;

interface LibraryPopoverProps {
  bookKey: string;
  isOpen: boolean;
  anchorEl: HTMLElement | null;
  onClose: () => void;
}

const LibraryPopover: React.FC<LibraryPopoverProps> = ({ bookKey, isOpen, anchorEl, onClose }) => {
  const _ = useTranslation();
  const { visibleLibrary } = useLibraryStore();
  const { bookKeys } = useReaderStore();
  const { setSideBarBookKey } = useSidebarStore();
  const { getBookData } = useBookDataStore();
  const { openParallelView } = useBooksManager();

  const [query, setQuery] = useState('');
  const [pendingBook, setPendingBook] = useState<Book | null>(null);
  const [width, setWidth] = useState(MAX_POPOVER_WIDTH);

  useEffect(() => {
    const update = () =>
      setWidth(Math.min(MAX_POPOVER_WIDTH, window.innerWidth - 2 * POPOVER_EDGE_PADDING));
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  useEffect(() => {
    if (!isOpen) setQuery('');
  }, [isOpen]);

  const deferredQuery = useDeferredValue(query);
  const { reading, others } = useMemo(
    () => selectLibraryPopoverBooks(visibleLibrary, deferredQuery),
    [visibleLibrary, deferredQuery],
  );

  const openHashes = useMemo(() => new Set(bookKeys.map((key) => key.split('-')[0]!)), [bookKeys]);

  const handleSelect = useCallback(
    (book: Book) => {
      const existing = bookKeys.find((key) => key.split('-')[0] === book.hash);
      if (existing) {
        setSideBarBookKey(existing);
        onClose();
        return;
      }
      setPendingBook(book);
      onClose();
    },
    [bookKeys, onClose, setSideBarBookKey],
  );

  const currentBook = getBookData(bookKey)?.book;
  const canReadParallel = Boolean(
    pendingBook &&
      !FIXED_LAYOUT_FORMATS.has(pendingBook.format) &&
      currentBook &&
      !FIXED_LAYOUT_FORMATS.has(currentBook.format),
  );

  const columns = width < TWO_COLUMN_MAX_WIDTH ? 2 : 3;
  const gridStyle = { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` };
  const isEmpty = reading.length === 0 && others.length === 0;

  return (
    <>
      <ToolbarPopover
        isOpen={isOpen}
        anchorEl={anchorEl}
        width={width}
        maxHeight={MAX_POPOVER_HEIGHT}
        className='!overflow-hidden'
        onClose={onClose}
      >
        <div className='flex max-h-full flex-col'>
          <div className='bg-base-200 flex flex-col px-4 pb-2 pt-4'>
            <PopoverTitleBar
              title={_('Library')}
              end={<LibrarySearchInput value={query} onChange={setQuery} onEscape={onClose} />}
            />
          </div>
          <div className='no-scrollbar flex flex-col gap-2 overflow-y-auto overscroll-contain px-4 pb-4'>
            {reading.length > 0 && (
              <>
                <span className='text-base-content/70 text-sm'>{_('Currently reading')}</span>
                <div className='grid gap-2' style={gridStyle}>
                  {reading.map((book) => (
                    <LibraryBookItem
                      key={book.hash}
                      book={book}
                      isOpen={openHashes.has(book.hash)}
                      showProgress
                      onSelect={handleSelect}
                    />
                  ))}
                </div>
              </>
            )}
            {reading.length > 0 && others.length > 0 && (
              <div className='bg-base-content/15 mx-2 my-2 h-px' />
            )}
            {others.length > 0 && (
              <div className='grid gap-2' style={gridStyle}>
                {others.map((book) => (
                  <LibraryBookItem
                    key={book.hash}
                    book={book}
                    isOpen={openHashes.has(book.hash)}
                    showProgress={false}
                    onSelect={handleSelect}
                  />
                ))}
              </div>
            )}
            {isEmpty && (
              <span className='text-base-content/60 py-6 text-center text-sm'>
                {_('No books match')}
              </span>
            )}
          </div>
        </div>
      </ToolbarPopover>
      {pendingBook && (
        <ParallelReadPrompt
          book={pendingBook}
          canReadParallel={canReadParallel}
          onReadParallel={() => {
            openParallelView(pendingBook.hash);
            setPendingBook(null);
          }}
          onReadSingle={() => {
            eventDispatcher.dispatch('open-book-single', { bookHash: pendingBook.hash });
            setPendingBook(null);
          }}
          onCancel={() => setPendingBook(null)}
        />
      )}
    </>
  );
};

export default LibraryPopover;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/__tests__/reader/libraryPopover.test.tsx --run`
Expected: PASS (9 tests).

`fireEvent` wraps updates in `act`, which flushes the `useDeferredValue` pass, so the two filtering assertions see the filtered list. If either proves flaky, wrap just that assertion in `await waitFor(() => …)` from `@testing-library/react` and make the test `async` — do not remove `useDeferredValue`.

- [ ] **Step 5: Commit**

```bash
git add src/app/reader/components/library/LibraryPopover.tsx \
        src/__tests__/reader/libraryPopover.test.tsx
git commit -m "feat(reader): add library popover with segments and search"
```

---

### Task 8: Toolbar wiring — Go home button and Library toggle

Adds the Go home asset and button on both breakpoints, and turns the Library button into the popover's trigger (R1, R5, R26, R27, R28).

**Files:**
- Create: `public/images/toolbar/go-home.svg` (copied from `dump/assets/go_home.svg`)
- Create: `public/images/toolbar/go-home-muted.svg` (copied from `dump/assets/go_home_muted.svg`)
- Modify: `src/app/reader/components/HeaderBar.tsx` (imports, state, left tool group, popover render)

**Interfaces:**
- Consumes: `LibraryPopover` (Task 7).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Copy the assets**

Run from the **repo root**, not from `apps/readest-app/`:

```bash
cp dump/assets/go_home.svg apps/readest-app/public/images/toolbar/go-home.svg
cp dump/assets/go_home_muted.svg apps/readest-app/public/images/toolbar/go-home-muted.svg
```

The rename from `_` to `-` is required: `getToolbarIconSrc` builds `/images/toolbar/${icon}.svg` and `${icon}-muted.svg`, and every existing icon uses kebab-case.

- [ ] **Step 2: Add popover state to HeaderBar**

In `src/app/reader/components/HeaderBar.tsx`, next to the existing TOC state (`const [isTocOpen, setIsTocOpen] = useState(false);`):

```tsx
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const libraryAnchorRef = useRef<HTMLButtonElement>(null);
```

And next to `handleToggleToc`:

```tsx
  const handleToggleLibrary = () => {
    const next = !isLibraryOpen;
    setIsLibraryOpen(next);
    handleToggleDropdown(next);
  };

  const handleCloseLibrary = () => {
    setIsLibraryOpen(false);
    handleToggleDropdown(false);
  };
```

- [ ] **Step 3: Add the Go home button and retarget Library**

In the `<div className='hidden items-center gap-x-3 sm:flex'>` group, insert this **before** the existing Contents button so Go home is first:

```tsx
              <button
                title={_('Go home')}
                className='btn btn-ghost hover:bg-transparent h-8 min-h-8 w-8 p-0'
                onClick={onGoToLibrary}
              >
                <img
                  src={getToolbarIconSrc('go-home', themeColor, isDarkMode)}
                  alt=''
                  className='h-5 w-auto object-contain'
                />
              </button>
```

Then replace the existing Library button — which currently calls `onGoToLibrary` — with:

```tsx
              <button
                ref={libraryAnchorRef}
                title={_('Library')}
                aria-expanded={isLibraryOpen}
                className='btn btn-ghost hover:bg-transparent h-8 min-h-8 w-8 p-0'
                onClick={handleToggleLibrary}
              >
                <img
                  src={getToolbarIconSrc('library', themeColor, isDarkMode)}
                  alt=''
                  className='h-5 w-auto object-contain'
                />
              </button>
```

- [ ] **Step 4: Add Go home to the mobile tool group**

The buttons in Step 3 live in a `hidden … sm:flex` group and never render on phones. Because the Library button no longer navigates anywhere, phones would be left with no labelled way out of the reader — so Go home ships on mobile too (R27).

Find the sibling mobile cluster in the same `header-tools-start` block:

```tsx
            <div className='flex items-center gap-x-4 max-[350px]:gap-x-2 sm:hidden'>
              <BookmarkToggler bookKey={bookKey} />
              <TranslationToggler bookKey={bookKey} />
            </div>
```

Insert the Go home button as its first child:

```tsx
            <div className='flex items-center gap-x-4 max-[350px]:gap-x-2 sm:hidden'>
              <button
                title={_('Go home')}
                className='btn btn-ghost hover:bg-transparent h-8 min-h-8 w-8 p-0'
                onClick={onGoToLibrary}
              >
                <img
                  src={getToolbarIconSrc('go-home', themeColor, isDarkMode)}
                  alt=''
                  className='h-5 w-auto object-contain'
                />
              </button>
              <BookmarkToggler bookKey={bookKey} />
              <TranslationToggler bookKey={bookKey} />
            </div>
```

Do not add the Library button here — the popover stays desktop-only this milestone.

- [ ] **Step 5: Render the popover**

Add the import beside the `TocPopover` import:

```tsx
import LibraryPopover from './library/LibraryPopover';
```

And render it directly after the existing `<TocPopover … />` element:

```tsx
          <LibraryPopover
            bookKey={bookKey}
            isOpen={isLibraryOpen}
            anchorEl={libraryAnchorRef.current}
            onClose={handleCloseLibrary}
          />
```

- [ ] **Step 6: Type-check and run the suite**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

Run: `pnpm test src/__tests__/reader src/__tests__/components --run`
Expected: PASS.

- [ ] **Step 7: Verify in the running app**

Run `pnpm dev`, open a book, then confirm by hand:
1. The left tool group reads Go home, Contents, Library, Bookmarks & Notes, Annotations.
2. Go home leaves the reader exactly as the Library button used to.
3. Library opens the popover anchored under its button; the header stays pinned while it is open.
4. Currently-reading books show a percentage; the rest do not; the open book shows "Open".
5. Typing in Search filters both segments and does not dismiss the popover; Escape clears, then a second Escape closes.
6. The body scrolls with no visible scrollbar while the title row stays put.
7. Picking an unopened book prompts; "Read in parallel" pairs it; "Read on its own" replaces the open book — then reopen the replaced book and confirm its progress survived.
8. Picking the open book just closes the popover and focuses that pane.
9. Repeat 3–4 on a dark theme and confirm the muted icon variants render.
10. Narrow the window below the `sm` breakpoint (or use device emulation) and confirm Go home appears first in the mobile tool group, ahead of the bookmark and translation togglers, and that it leaves the reader. Confirm the Library button is absent there.
11. Turn on e-ink mode and confirm the popover, its search field, and both buttons stay legible under `data-eink='true'` (R6). If the borderless search input disappears against the e-ink surface, give it the `eink-bordered` treatment the other controls use rather than inventing new styling.

- [ ] **Step 8: Commit**

```bash
git add public/images/toolbar/go-home.svg \
        public/images/toolbar/go-home-muted.svg \
        src/app/reader/components/HeaderBar.tsx
git commit -m "feat(reader): library popover toggle and go home toolbar button"
```

---

### Task 9: Retire the menu's parallel book picker

The View Options menu no longer owns book selection (R30, R31).

**Files:**
- Modify: `src/app/reader/components/sidebar/BookMenu.tsx:130-166` (the `Parallel Read` MenuItem) plus its now-dead imports

**Interfaces:**
- Consumes: nothing.
- Produces: nothing.

- [ ] **Step 1: Delete the submenu**

In `src/app/reader/components/sidebar/BookMenu.tsx`, remove the whole `<MenuItem label={_('Parallel Read')} …>` element, including its nested `<ul className='max-h-60 overflow-y-auto'>` block and its closing `</MenuItem>`. The `{bookKeys.length > 1 && (parallelViews.length > 0 ? … )}` block that follows stays exactly as it is.

- [ ] **Step 2: Remove what only that block used**

Delete these, which then have no remaining reference in the file:

```tsx
import { useLibraryStore } from '@/store/libraryStore';
import { FIXED_LAYOUT_FORMATS } from '@/types/book';
import useBooksManager from '../../hooks/useBooksManager';
```

```tsx
  const { getVisibleLibrary } = useLibraryStore();
  const { openParallelView } = useBooksManager();
```

```tsx
  const handleParallelView = (id: string) => {
    openParallelView(id);
    setIsDropdownOpen?.(false);
  };
```

Keep `useParallelViewStore`, `parallelViews`, `setParallel`, `unsetParallel`, `bookKeys`, and both `handleSetParallel` / `handleUnsetParallel` — the Enter/Exit entries still use them.

- [ ] **Step 3: Verify nothing dangles**

Run: `pnpm exec tsc --noEmit`
Expected: no errors. Any "declared but never read" complaint names something from Step 2 that was missed.

Run: `pnpm exec eslint src/app/reader/components/sidebar/BookMenu.tsx`
Expected: clean.

- [ ] **Step 4: Confirm by hand**

With `pnpm dev` running and a book open, open the View Options (≡) menu and confirm the `Parallel Read ▸` submenu is gone, while `Enter Parallel Read` still appears once two books are open and `Exit Parallel Read` replaces it after pairing.

- [ ] **Step 5: Commit**

```bash
git add src/app/reader/components/sidebar/BookMenu.tsx
git commit -m "chore(reader): drop parallel-read book picker from view menu"
```

---

### Task 10 (conditional): Virtualize the book grid

**Run this task only if Step 1's measurement fails.** The spec (R32) deliberately ships the plain grid first: `VirtuosoGrid` fights this layout — two independent grids with a heading and a divider between them, inside a popover whose height is already capped — so it is only worth that cost if the popover measurably janks.

**Files:**
- Modify: `src/app/reader/components/library/LibraryPopover.tsx`
- Test: `src/__tests__/reader/libraryPopover.test.tsx` (mock update only)

**Interfaces:**
- Consumes: `LibraryPopover` (Task 7) unchanged in its props; this is an internal change.
- Produces: nothing new. `selectLibraryPopoverBooks` and both leaf components are untouched.

- [ ] **Step 1: Measure before changing anything**

With `pnpm dev` running and a library of at least 300 downloaded books, open the popover and record in Chrome DevTools' Performance panel:
- time from click to first paint of the popover,
- scripting time for one full scroll of the body,
- scripting time for typing a five-character query.

**Proceed only if any of the three exceeds roughly 100 ms.** If all three are under it, tick this step, write the measured numbers into the plan under this task, and skip Steps 2–5 — the plain grid is doing its job and virtualization would be complexity for nothing. That is a legitimate, expected outcome.

- [ ] **Step 2: Flatten the two segments into one virtualized list**

`VirtuosoGrid` renders a single flat item list, so the "Currently reading" heading and the inter-segment divider cannot stay as siblings of two grids. Build one row model instead, above the return:

```tsx
type LibraryRow =
  | { kind: 'heading'; key: string; label: string }
  | { kind: 'divider'; key: string }
  | { kind: 'book'; key: string; book: Book; showProgress: boolean };

const rows = useMemo<LibraryRow[]>(() => {
  const next: LibraryRow[] = [];
  if (reading.length > 0) {
    next.push({ kind: 'heading', key: 'reading-heading', label: _('Currently reading') });
    reading.forEach((book) => next.push({ kind: 'book', key: book.hash, book, showProgress: true }));
  }
  if (reading.length > 0 && others.length > 0) {
    next.push({ kind: 'divider', key: 'segment-divider' });
  }
  others.forEach((book) => next.push({ kind: 'book', key: book.hash, book, showProgress: false }));
  return next;
}, [_, reading, others]);
```

- [ ] **Step 3: Swap the two grids for a Virtuoso list**

Add the import:

```tsx
import { Virtuoso } from 'react-virtuoso';
```

Replace everything between the title-bar block and the closing `</div>` of the scroll body — that is, both `{reading.length > 0 && (…)}` blocks, the divider block, the `others` block and the `isEmpty` block — with:

```tsx
          {isEmpty ? (
            <div className='no-scrollbar flex-1 overflow-y-auto px-4 pb-4'>
              <span className='text-base-content/60 block py-6 text-center text-sm'>
                {_('No books match')}
              </span>
            </div>
          ) : (
            <Virtuoso
              className='no-scrollbar flex-1 overscroll-contain'
              style={{ height: MAX_POPOVER_HEIGHT }}
              data={rows}
              computeItemKey={(_index, row) => row.key}
              itemContent={(_index, row) => {
                if (row.kind === 'heading') {
                  return (
                    <span className='text-base-content/70 block px-4 pt-2 text-sm'>{row.label}</span>
                  );
                }
                if (row.kind === 'divider') {
                  return <div className='bg-base-content/15 mx-6 my-2 h-px' />;
                }
                return (
                  <div className='px-4'>
                    <LibraryBookItem
                      book={row.book}
                      isOpen={openHashes.has(row.book.hash)}
                      showProgress={row.showProgress}
                      onSelect={handleSelect}
                    />
                  </div>
                );
              }}
            />
          )}
```

This trades the three-column grid for a single column of full-width rows. That is the deliberate cost of virtualizing a mixed heading/divider/book list: multi-column `VirtuosoGrid` cannot interleave non-book rows. If the three-column layout must survive, stop and raise it rather than improvising — it needs two nested `VirtuosoGrid` instances and a redesign of the sticky/scroll split, which is a bigger change than this task covers.

- [ ] **Step 4: Update the popover test's mocks and re-run**

`Virtuoso` does not render in jsdom without a height. Add this mock alongside the existing ones in `src/__tests__/reader/libraryPopover.test.tsx`, mirroring the stub pattern already used in `src/__tests__/components/TOCView.test.tsx`:

```tsx
vi.mock('react-virtuoso', () => ({
  Virtuoso: ({
    data,
    itemContent,
    computeItemKey,
  }: {
    data: unknown[];
    itemContent: (index: number, item: unknown) => React.ReactNode;
    computeItemKey: (index: number, item: unknown) => string;
  }) => (
    <div>
      {data.map((item, index) => (
        <div key={computeItemKey(index, item)}>{itemContent(index, item)}</div>
      ))}
    </div>
  ),
}));
```

Run: `pnpm test src/__tests__/reader/libraryPopover.test.tsx --run`
Expected: PASS (9 tests) — every assertion targets book titles, headings and buttons, none of which the flattening changes.

- [ ] **Step 5: Re-measure and commit**

Repeat Step 1's three measurements and confirm each improved. Record before/after numbers in the commit body.

```bash
git add src/app/reader/components/library/LibraryPopover.tsx \
        src/__tests__/reader/libraryPopover.test.tsx
git commit -m "perf(reader): virtualize library popover book list"
```

---

## Final verification

- [ ] Run the full unit suite: `pnpm test:pr:web:unit`
- [ ] Run the type-checker: `pnpm exec tsc --noEmit`
- [ ] Run lint: `pnpm exec eslint src`
- [ ] Confirm `git status` shows no modified files under `public/locales/`

---

## Known gaps carried from the spec

- **Phone.** Go home ships on phones (Task 8, Step 4) so the mobile reader keeps a labelled exit. The popover itself does not: search, segments and the prompt stay desktop-only, and the Library button is absent below the `sm` breakpoint. Bringing the popover to phones as a bottom sheet — the pattern the Theme & Fonts milestone used — is a separate milestone.
- **`ReaderContent`'s `open-book-single` listener has no automated test.** Covering it needs a mounted `ReaderContent` with the env, book-data, settings and Tauri surfaces stubbed, which is disproportionate here. The dispatch side is tested in Task 7; the handler is verified by Task 8's Step 6 item 7 (reopen the replaced book and confirm its progress survived).
- **Virtualization is conditional, not skipped.** Task 10 measures first and only virtualizes if the popover janks; if it does run, the three-column grid collapses to a single column, which is a visible departure from the design and should be raised before shipping.
