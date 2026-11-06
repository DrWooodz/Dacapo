// The service worker shares its origin with other apps (drwooodz.github.io/Katalog), so on activation it must
// delete only DaCapo's own old caches. Runs the built sw.js in Node with a fake Cache Storage; no browser needed.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

test('activation deletes only older DaCapo caches', async () => {
  const code = readFileSync(new URL('../docs/sw.js', import.meta.url), 'utf8');
  const current = code.match(/const CACHE = '([^']+)'/)[1];
  const handlers = {};
  const deleted = [];
  const keys = [current, 'dacapo-1.0.0', 'katalog-shell-2026-11-06.3', 'katalog-runtime-1', 'other-app'];
  const self = {
    addEventListener: (t, f) => (handlers[t] = f),
    skipWaiting: () => {},
    clients: { claim: async () => {} },
  };
  const caches = { keys: async () => keys, delete: async k => (deleted.push(k), true) };
  vm.runInNewContext(code, { self, caches, location: { origin: 'https://drwooodz.github.io' } });
  let done;
  handlers.activate({ waitUntil: p => (done = p) });
  await done;
  expect(deleted).toEqual(['dacapo-1.0.0']);
});
