import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures/base';
import type { ReaderPage } from '../pages/ReaderPage';

const openMindmap = async (reader: ReaderPage, page: Page) => {
  await reader.revealHeader();
  await page.getByRole('button', { name: 'Spark' }).click();
  await page.getByRole('button', { name: /^Mindmap/ }).click();
};

const createBlankMap = async (reader: ReaderPage, page: Page) => {
  await openMindmap(reader, page);
  const sheet = page.getByRole('dialog', { name: 'New mind map' });
  await sheet.getByLabel('Blank canvas').check();
  await sheet.getByRole('button', { name: 'Create map' }).click();
  const canvas = page.getByRole('application', { name: /^Mind map:/ });
  await expect(canvas).toBeVisible();
  return canvas;
};

const createGeneratedMap = async (reader: ReaderPage, page: Page) => {
  await openMindmap(reader, page);
  const sheet = page.getByRole('dialog', { name: 'New mind map' });
  await expect(sheet.getByLabel('Generated from the book')).toBeChecked();
  await sheet.getByRole('button', { name: 'Create map' }).click();
  const canvas = page.getByRole('application', { name: /^Mind map:/ });
  await expect(canvas).toBeVisible();
  return canvas;
};

const chapterNode = (page: Page, label: string) =>
  page.getByRole('button', { name: new RegExp(`^${label}, Chapter`), includeHidden: true });

const placeNode = async (page: Page, x: number, y: number, label: string) => {
  await page.keyboard.press('n');
  await page.mouse.click(x, y);
  await expect(page.getByTestId('mm-label-editor')).toBeFocused();
  await page.keyboard.type(label);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: new RegExp(`^${label}, Idea`) })).toBeVisible();
};

const bookLocation = (page: Page) =>
  page.evaluate(() => {
    const view = document.querySelector('foliate-view') as unknown as {
      lastLocation?: { cfi?: string };
    } | null;
    return view?.lastLocation?.cfi ?? '';
  });

test.describe('Mind map', () => {
  test('creates a blank map, drags a node and keeps its position after reload', async ({
    openBook,
    page,
  }) => {
    const reader = await openBook();
    const canvas = await createBlankMap(reader, page);
    await canvas.press('n');
    const box = (await canvas.boundingBox())!;
    await page.mouse.click(box.x + 300, box.y + 240);
    await page.keyboard.type('Elizabeth');
    await page.keyboard.press('Enter');
    const node = page.getByRole('button', { name: /^Elizabeth, Idea/ });
    await expect(node).toBeVisible();

    const start = (await node.boundingBox())!;
    await page.mouse.move(start.x + 20, start.y + 20);
    await page.mouse.down();
    await page.mouse.move(start.x + 180, start.y + 116, { steps: 8 });
    await page.mouse.up();
    await expect.poll(async () => (await node.boundingBox())!.x).toBeGreaterThan(start.x + 100);
    const moved = (await node.boundingBox())!;

    await page.getByRole('button', { name: /Back to page/ }).click();
    await expect(canvas).toBeHidden();
    await page.reload();
    await reader.waitForReady();
    await openMindmap(reader, page);

    const reopened = page.getByRole('button', { name: /^Elizabeth, Idea/ });
    await expect(reopened).toBeVisible();
    const after = (await reopened.boundingBox())!;
    expect(Math.abs(after.x - moved.x)).toBeLessThanOrEqual(2);
    expect(Math.abs(after.y - moved.y)).toBeLessThanOrEqual(2);
  });

  test('renders the map in light and dark mode', async ({ openBook, page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    const reader = await openBook();
    const canvas = await createBlankMap(reader, page);
    await expect(canvas).toHaveAttribute('data-mm-mode', 'light');
    const light = await canvas.evaluate((element) => getComputedStyle(element).backgroundColor);

    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(canvas).toHaveAttribute('data-mm-mode', 'dark');
    await expect
      .poll(() => canvas.evaluate((element) => getComputedStyle(element).backgroundColor))
      .not.toBe(light);
  });

  test('keeps map shortcuts away from the reader', async ({ openBook, page }) => {
    const reader = await openBook();
    const canvas = await createBlankMap(reader, page);
    await canvas.press('n');
    await expect(page.getByRole('button', { name: 'Node', pressed: true })).toBeVisible();
    await expect(reader.notebook).toBeHidden();
  });

  test('keeps the reader shortcuts dialog closed when ? is pressed in the map', async ({
    openBook,
    page,
  }) => {
    const reader = await openBook();
    const canvas = await createBlankMap(reader, page);
    await canvas.focus();
    await page.keyboard.press('Shift+?');
    await page.waitForTimeout(300);
    await expect(page.getByRole('dialog', { name: 'Keyboard Shortcuts' })).toBeHidden();
  });

  test('keeps arrow keys in the map when a page turner key is bound to them', async ({
    openBook,
    page,
  }) => {
    const reader = await openBook();
    await page.keyboard.press('Shift+F');
    await page.locator('[data-tab="Control"]').click();
    const turner = page.locator('[data-setting-id="settings.control.pageTurner"]');
    await turner.getByRole('checkbox').first().click();
    await page.getByRole('button', { name: /^Next Page: Set key/ }).click();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('button', { name: /^Next Page: / })).not.toHaveText(/Set key/);
    await page.keyboard.press('Escape');
    const canvas = await createBlankMap(reader, page);
    const box = (await canvas.boundingBox())!;
    await canvas.focus();
    await placeNode(page, box.x + 300, box.y + 240, 'Left');
    await placeNode(page, box.x + 700, box.y + 240, 'Right');
    const left = (await page.getByRole('button', { name: /^Left, Idea/ }).boundingBox())!;
    await page.mouse.click(left.x + left.width / 2, left.y + left.height / 2);
    const before = await bookLocation(page);
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(500);
    await expect(page.getByRole('button', { name: /^Right, Idea/ })).toBeFocused();
    expect(await bookLocation(page)).toBe(before);
  });

  test('forces Ink & margin without animation on e-ink', async ({ openBook, page }) => {
    const reader = await openBook();
    await page.keyboard.press('Shift+F');
    await page.locator('[data-tab="Control"]').click();
    await page
      .locator('[data-setting-id="settings.control.einkMode"]')
      .getByRole('checkbox')
      .click();
    await page.keyboard.press('Escape');
    const canvas = await createBlankMap(reader, page);
    await expect(canvas).toHaveAttribute('data-mm-mode', 'eink');
    await expect(canvas).toHaveAttribute('data-mm-style', 'ink');
    await canvas.press('n');
    const box = (await canvas.boundingBox())!;
    await page.mouse.click(box.x + 300, box.y + 240);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: /^Untitled, Idea/ })).toBeVisible();
    await expect(canvas.locator('.animate-mm-pop')).toHaveCount(0);
  });

  test('creates a generated map from the book and fogs the chapters ahead', async ({
    openBook,
    page,
  }) => {
    const reader = await openBook();
    await createGeneratedMap(reader, page);
    await expect(page.getByTestId('mm-reveal-chip')).toContainText('of 14');
    await expect(page.getByTestId('mm-fog-cluster')).toContainText('Keep reading to reveal');
    await expect(chapterNode(page, 'Chapter 12 - Alice’s Evidence')).toHaveCount(0);
  });

  test('shows the fog cluster next to what is revealed after the first fill', async ({
    openBook,
    page,
  }) => {
    const reader = await openBook();
    const canvas = await createGeneratedMap(reader, page);
    const cluster = page.getByTestId('mm-fog-cluster');
    await expect(cluster).toContainText('Keep reading to reveal');
    await expect
      .poll(async () => {
        const view = (await canvas.boundingBox())!;
        const fog = (await cluster.boundingBox())!;
        return fog.y >= view.y && fog.y + fog.height <= view.y + view.height;
      })
      .toBe(true);
  });

  test('keeps the fitted nodes in view when a full-screen map is docked', async ({
    openBook,
    page,
  }) => {
    const reader = await openBook();
    await reader.revealHeader();
    await page.getByRole('button', { name: 'Contents' }).click();
    await page.getByRole('treeitem', { name: /Chapter 6 - Pig and Pepper/ }).click();
    await expect.poll(() => bookLocation(page)).toMatch(/^epubcfi\(\/6\/18[!,)]/);
    await page.keyboard.press('Escape');
    const canvas = await createGeneratedMap(reader, page);
    const node = chapterNode(page, 'Chapter 6 - Pig and Pepper');
    await expect(node).toBeVisible();
    await page.getByRole('button', { name: 'Dock beside book' }).click();
    await expect(page.getByTestId('mm-view')).toHaveAttribute('data-layout', 'docked');
    await expect
      .poll(async () => {
        const view = (await canvas.boundingBox())!;
        const box = await node.boundingBox();
        return !!box && box.x >= view.x && box.x + box.width <= view.x + view.width;
      })
      .toBe(true);
  });

  test('places a PDF outline entry whose destination is a page number', async ({
    openBook,
    page,
  }) => {
    const reader = await openBook('src/__tests__/fixtures/data/sample-paper.pdf');
    await createGeneratedMap(reader, page);
    await expect(page.getByTestId('mm-reveal-chip')).toContainText('1 of 1');
    await expect(chapterNode(page, 'ABSTRACT')).toHaveCount(1);
  });

  test('grow mode reveals new nodes after advancing a chapter', async ({ openBook, page }) => {
    const reader = await openBook();
    await createGeneratedMap(reader, page);
    await expect(page.getByTestId('mm-reveal-chip')).toContainText('of 14');
    await expect(chapterNode(page, 'Chapter 6 - Pig and Pepper')).toHaveCount(0);
    await page.getByRole('button', { name: /^Back to page/ }).click();
    await reader.revealHeader();
    await page.getByRole('button', { name: 'Contents' }).click();
    await page.getByRole('treeitem', { name: /Chapter 6 - Pig and Pepper/ }).click();
    await expect.poll(() => bookLocation(page)).toMatch(/^epubcfi\(\/6\/18[!,)]/);
    await page.keyboard.press('Escape');
    await openMindmap(reader, page);
    await expect(chapterNode(page, 'Chapter 6 - Pig and Pepper')).toHaveCount(1);
    await expect(chapterNode(page, 'Chapter 12 - Alice’s Evidence')).toHaveCount(0);
    await expect(page.getByTestId('mm-reveal-chip')).toContainText('new');
    await expect(page.getByTestId('mm-reveal-chip')).toContainText('Revealed to ch. 6');
  });

  test('keeps the next chapter hidden on the last spread of the current one', async ({
    openBook,
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    const reader = await openBook();
    await reader.revealHeader();
    await page.getByRole('button', { name: 'Contents' }).click();
    await page.getByRole('treeitem', { name: /Chapter 2 - The Pool of Tears/ }).click();
    await expect.poll(() => bookLocation(page)).toMatch(/^epubcfi\(\/6\/10[!,)]/);
    await page.keyboard.press('Escape');
    await reader.prevPage();
    await expect.poll(() => bookLocation(page)).toMatch(/^epubcfi\(\/6\/8[!,)]/);
    await createGeneratedMap(reader, page);
    await expect(page.getByTestId('mm-reveal-chip')).toContainText('of 14');
    await expect(chapterNode(page, 'Chapter 1 - Down the Rabbit Hole')).toHaveCount(1);
    await expect(chapterNode(page, 'Chapter 2 - The Pool of Tears')).toHaveCount(0);
  });

  test('keeps a heading inside a file hidden until the reader reaches it', async ({
    openBook,
    page,
  }) => {
    await page.setViewportSize({ width: 700, height: 900 });
    const reader = await openBook('src/__tests__/fixtures/data/mindmap-midfile-heading.epub');
    const probe = () =>
      page.evaluate(() => {
        const view = document.querySelector('foliate-view') as unknown as {
          lastLocation?: { fraction?: number; range?: Range; tocItem?: { label?: string } };
          book: {
            sections: Array<{
              linear: string;
              size: number;
              fragments?: Array<{ href: string; size: number }>;
            }>;
          };
        };
        const sizes = view.book.sections.map((s) => (s.linear !== 'no' && s.size > 0 ? s.size : 0));
        const total = sizes.reduce((sum, size) => sum + size, 0);
        const heading = view.book.sections[0]?.fragments?.find((f) => f.href.endsWith('#ch2'));
        return {
          ahead: heading ? (view.lastLocation?.fraction ?? 0) >= heading.size / total : false,
          onScreen: (view.lastLocation?.range?.toString() ?? '').includes('Chapter Two Secret'),
          toc: view.lastLocation?.tocItem?.label ?? '',
        };
      });
    await expect
      .poll(async () => {
        const state = await probe();
        if (!state.ahead) await reader.nextPage();
        return state.ahead;
      })
      .toBe(true);
    expect(await probe()).toMatchObject({ onScreen: false, toc: 'Chapter One' });
    await createGeneratedMap(reader, page);
    await expect(chapterNode(page, 'Chapter One')).toHaveCount(1);
    await expect(chapterNode(page, 'Chapter Two Secret')).toHaveCount(0);
  });

  test('returns focus from the new map sheet when it is dismissed', async ({ openBook, page }) => {
    const reader = await openBook();
    await openMindmap(reader, page);
    const sheet = page.getByRole('dialog', { name: 'New mind map' });
    await expect(sheet).toBeVisible();
    await expect(sheet).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.getAttribute('title') ?? 'BODY'))
      .toBe('Spark');
  });

  test('keeps Tab inside the full-screen map', async ({ openBook, page }) => {
    const reader = await openBook();
    const canvas = await createBlankMap(reader, page);
    await expect(canvas).toBeFocused();
    const outside: string[] = [];
    for (let i = 0; i < 30; i += 1) {
      await page.keyboard.press('Tab');
      const where = await page.evaluate(() => {
        const active = document.activeElement;
        if (!active || active === document.body || active.closest('[data-mindmap-view]')) {
          return null;
        }
        return active.outerHTML.slice(0, 80);
      });
      if (where) outside.push(where);
    }
    expect(outside).toEqual([]);
    await page.getByRole('button', { name: /^Back to page/ }).click();
    await expect(canvas).toBeHidden();
    await expect(page.locator('[inert]')).toHaveCount(0);
  });
});
