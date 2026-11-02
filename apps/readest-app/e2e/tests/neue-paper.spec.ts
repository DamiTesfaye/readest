import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures/base';
import { LibraryPage } from '../pages/LibraryPage';
import { ReaderPage } from '../pages/ReaderPage';
import { SAMPLE_EPUB } from '../fixtures/books';

const shot = (page: Page, name: string) =>
  page.screenshot({ path: test.info().outputPath(`${name}.png`) });

const openMindmap = async (reader: ReaderPage, page: Page) => {
  await reader.revealHeader();
  await page.getByRole('button', { name: 'More' }).click();
  await page.getByRole('button', { name: /^Mindmap/ }).click();
  const sheet = page.getByRole('dialog', { name: 'New mind map' });
  await sheet.getByRole('button', { name: 'Create map' }).click();
  await expect(page.getByRole('application', { name: /^Mind map:/ })).toBeVisible();
  await expect(page.locator('[data-testid^="mm-record-"]').first()).toBeVisible();
  await page.waitForTimeout(800);
};

for (const mode of ['light', 'dark'] as const) {
  test(`Neue Paper ${mode} skins the reader, mindmap, settings and library`, async ({ page }) => {
    await page.addInitScript((themeMode) => {
      localStorage.setItem('themeColor', 'paper');
      localStorage.setItem('themeMode', themeMode);
    }, mode);
    const library = new LibraryPage(page);
    await library.goto();
    await library.importBook(SAMPLE_EPUB);
    await expect(library.bookCards()).toHaveCount(1);
    await page.waitForTimeout(800);
    await shot(page, `library-paper-${mode}`);
    await library.openFirstBook();
    const reader = new ReaderPage(page);
    await reader.waitForReady();

    const html = page.locator(`html[data-theme="paper-${mode}"][data-ink-skin]`);
    await expect(html).toHaveCount(1);
    await expect(page.locator('#ink-skin')).toHaveCount(1);
    const frames = await page.evaluate(() => {
      const row = document.body.appendChild(document.createElement('div'));
      row.innerHTML =
        '<button class="btn"></button>'.repeat(3) +
        '<button class="btn btn-ghost"></button>'.repeat(2);
      const sources = [...row.children].map((el) => getComputedStyle(el).borderImageSource);
      row.remove();
      return sources;
    });
    expect(new Set(frames.slice(0, 3)).size).toBe(3);
    expect(frames.slice(0, 3)).not.toContain('none');
    expect(frames.slice(3)).toEqual(['none', 'none']);
    const headerFont = await reader.headerBar.evaluate((el) => getComputedStyle(el).fontFamily);
    expect(headerFont).toContain('Kevin Sans Hand');

    await reader.selectText();
    await reader.highlightSelection();
    await reader.dismissPopup();
    const sketched = page.locator('foliate-view g[style*="color"] path[fill="currentColor"]');
    await expect(sketched.first()).toBeAttached();
    await reader.revealHeader();
    await reader.openSidebar();
    await shot(page, `reader-paper-${mode}`);
    await page.keyboard.press('s');
    await expect(reader.sidebar).toBeHidden();

    await reader.openSettings();
    await expect(page.getByRole('dialog').first()).toBeVisible();
    await shot(page, `settings-paper-${mode}`);
    await page.keyboard.press('Escape');

    await openMindmap(reader, page);
    await shot(page, `mindmap-paper-${mode}`);
  });
}

test('the default theme carries no ink skin', async ({ page, openBook }) => {
  const reader = await openBook();
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', /^paper-/);
  await expect(page.locator('#ink-skin')).toHaveCount(0);
  await expect(page.locator('html[data-ink-skin]')).toHaveCount(0);
  await reader.openSidebar();
  await shot(page, 'reader-default');
});
