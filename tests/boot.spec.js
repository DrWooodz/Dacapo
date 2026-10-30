// The app starts cleanly and every screen opens. Also runs against the unbundled source modules.
import { test, expect } from './fixtures.js';

test('opens on the welcome screen', async ({ app }) => {
  const { page } = app;
  await expect(page.locator('#page')).toContainText('Welcome to DaCapo');
  await expect(page.locator('.brand')).toContainText('DaCapo');
});

test('every screen opens', async ({ app }) => {
  const { page } = app;
  for (const [tab, heading] of [
    ['skills', 'Skills'],
    ['library', 'Library'],
    ['free', 'Free play'],
    ['practice', 'Welcome'],
  ]) {
    await page.locator(`#tabs [data-view="${tab}"]`).click();
    await expect(page.locator('#page .eyebrow').first()).toContainText(heading, { ignoreCase: true });
  }
});

test('settings show the version, and the flag opens a report', async ({ app }) => {
  const { page } = app;
  await page.locator('#settingsBtn').click();
  await expect(page.locator('.sheet')).toContainText(/DaCapo (\d+\.\d+\.\d+ · site|dev · dev)/);
  await page.locator('[data-closebtn]').click();
  await page.locator('#reportBtn').click();
  await expect(page.locator('.sheet')).toContainText('Report a problem');
});
