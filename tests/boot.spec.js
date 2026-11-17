// The app starts cleanly on Play and every screen opens. Also runs against the unbundled source modules.
import { test, expect } from './fixtures.js';

test('opens on Play, with a welcome note the first time', async ({ app }) => {
  const { page } = app;
  await expect(page.locator('#page h1')).toHaveText('Play');
  await expect(page.locator('#plyWelcome')).toContainText('Welcome to DaCapo');
  await app.onboard();
  await expect(page.locator('#plyWelcome')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('#page h1')).toHaveText('Play');
  await expect(page.locator('#plyWelcome')).toHaveCount(0);
});

test('four tabs, every screen opens', async ({ app }) => {
  const { page } = app;
  await expect(page.locator('#tabs [data-view]')).toHaveText(['Play', 'Explore', 'Practice', 'Songs']);
  for (const [tab, heading] of [
    ['explore', 'Explore'],
    ['practice', 'Practice'],
    ['songs', 'Songs'],
    ['play', 'Play'],
  ]) {
    await page.locator(`#tabs [data-view="${tab}"]`).click();
    await expect(page.locator('#page h1').first()).toHaveText(heading);
    await expect(page.locator(`#tabs [data-view="${tab}"]`)).toHaveAttribute('aria-current', 'page');
  }
});

test('settings show the version, and Help opens a problem report', async ({ app }) => {
  const { page } = app;
  await page.locator('#settingsBtn').click();
  await expect(page.locator('.sheet')).toContainText(/DaCapo (\d+\.\d+\.\d+ · site|dev · dev)/);
  await page.locator('#sReport').click();
  await expect(page.locator('.sheet')).toContainText('Report a problem');
});
