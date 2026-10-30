// End-to-end tests: a real browser plays simulated MIDI into the app. Run with `npm test`.
import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

export default defineConfig({
  testDir: 'tests',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  // the tests play in real time against the metronome, so they run one at a time
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    ...devices['Pixel 7'],
    defaultBrowserType: 'chromium',
    // phones need a tap before sound; tests/robustness.spec.js simulates that separately
    launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] },
    trace: 'retain-on-failure',
  },
  projects: [
    // the built single file, as published to GitHub Pages
    { name: 'site', use: { baseURL: `http://localhost:${PORT}/docs/` } },
    // the source modules, loaded directly by the browser
    { name: 'source', use: { baseURL: `http://localhost:${PORT}/src/` }, testMatch: /boot\.spec\.js/ },
  ],
  webServer: {
    command: `python3 -m http.server ${PORT}`,
    url: `http://localhost:${PORT}/docs/index.html`,
    reuseExistingServer: !process.env.CI,
    stderr: 'ignore', // python's request log
  },
});
