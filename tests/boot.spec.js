// The app starts cleanly and every screen opens. Also runs against the unbundled source modules.
import { test, expect } from './fixtures.js';

test('opens on the welcome screen', async ({ app }) => {
  const { page } = app;
  await expect(page.locator('#page')).toContainText('Welcome to DaCapo');
  await expect(page.locator('.brand')).toContainText('DaCapo');
});

test('every screen opens', async ({ app }) => {
  const { page } = app;
  // three tabs: Home (the welcome screen until you have started), Library and Free play
  await expect(page.locator('#tabs [data-view]')).toHaveCount(3);
  for (const [tab, heading] of [
    ['library', 'Library'],
    ['free', 'Free play'],
    ['home', 'Open it, and play.'],
  ]) {
    await page.locator(`#tabs [data-view="${tab}"]`).click();
    await expect(page.locator('#page h1').first()).toContainText(heading);
  }
});

test('settings show the version, and Help opens a problem report', async ({ app }) => {
  const { page } = app;
  await page.locator('#settingsBtn').click();
  await expect(page.locator('.sheet')).toContainText(/DaCapo (\d+\.\d+\.\d+ · site|dev · dev)/);
  await page.locator('#sReport').click();
  await expect(page.locator('.sheet')).toContainText('Report a problem');
});
