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
});
