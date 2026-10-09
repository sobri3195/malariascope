import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const base = process.env.APP_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
  args: ['--no-sandbox'],
});
const errors = [];
const watch = (page) => page.on('pageerror', (e) => errors.push(e.message));
try {
  const recovery = await browser.newContext({
    viewport: { width: 375, height: 812 },
    serviceWorkers: 'block',
  });
  const raw = '{"datasets":null,"audit":"broken","retained":"original evidence"}';
  await recovery.addInitScript((raw) => {
    if (localStorage.getItem('malariascope-v1') === null)
      localStorage.setItem('malariascope-v1', raw);
  }, raw);
  const page = await recovery.newPage();
  watch(page);
  for (const path of ['/dashboard', '/mobile', '/aplikasi-desktop', '/iot', '/smartwatch']) {
    await page.goto(base + path);
    await page.getByLabel('Workspace storage status', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => localStorage.getItem('malariascope-v1')), raw);
    assert.ok(
      await page.getByRole('button', { name: 'Export current workspace', exact: true }).isVisible(),
    );
  }
  await page.goto(base + '/dashboard');
  await page.getByLabel('Context year', { exact: true }).selectOption('2024');
  assert.equal(await page.evaluate(() => localStorage.getItem('malariascope-v1')), raw);
  const download = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Download original saved workspace', exact: true })
    .click();
  assert.equal(await fs.readFile(await (await download).path(), 'utf8'), raw);
  await page
    .getByRole('button', { name: 'Replace saved workspace with current session', exact: true })
    .click();
  await page.getByLabel('Workspace storage status', { exact: true }).waitFor({ state: 'hidden' });
  assert.equal(
    await page.evaluate(() => JSON.parse(localStorage.getItem('malariascope-v1')).selection.year),
    2024,
  );
  await page.reload();
  await page.getByLabel('Context year', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('Workspace storage status', { exact: true }).count(), 0);
  await recovery.close();

  const quota = await browser.newContext({ serviceWorkers: 'block' });
  await quota.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (window.failWorkspaceWrites && key === 'malariascope-v1')
        throw new DOMException('Full', 'QuotaExceededError');
      return original.call(this, key, value);
    };
  });
  const q = await quota.newPage();
  watch(q);
  await q.goto(base + '/dashboard');
  await q.getByLabel('Context year', { exact: true }).waitFor();
  await q.waitForFunction(() =>
    JSON.parse(localStorage.getItem('malariascope-v1'))?.datasets.some(
      (d) => d.id === 'study-balanced',
    ),
  );
  const before = await q.evaluate(() => {
    window.failWorkspaceWrites = true;
    return localStorage.getItem('malariascope-v1');
  });
  await q.getByLabel('Context year', { exact: true }).selectOption('2024');
  await q.getByLabel('Workspace storage status', { exact: true }).waitFor();
  assert.equal(await q.evaluate(() => localStorage.getItem('malariascope-v1')), before);
  const sessionDownload = q.waitForEvent('download');
  await q.getByRole('button', { name: 'Export current workspace', exact: true }).click();
  const session = JSON.parse(await fs.readFile(await (await sessionDownload).path(), 'utf8'));
  assert.equal(session.selection.year, 2024);
  assert.ok(session.datasets.some((d) => d.id === 'study-balanced'));
  await q.evaluate(() => {
    window.failWorkspaceWrites = false;
  });
  await q.getByRole('button', { name: 'Retry saving workspace', exact: true }).click();
  await q.getByLabel('Workspace storage status', { exact: true }).waitFor({ state: 'hidden' });
  assert.equal(
    await q.evaluate(() => JSON.parse(localStorage.getItem('malariascope-v1')).selection.year),
    2024,
  );
  await q.evaluate(() => localStorage.setItem('unrelated-application', 'preserve'));
  await q.goto(base + '/settings');
  await q.getByRole('button', { name: 'Reset application data', exact: true }).waitFor();
  q.once('dialog', (d) => d.accept());
  await q.getByRole('button', { name: 'Reset application data', exact: true }).click();
  await q.waitForURL((url) => url.searchParams.get('year') === '2025');
  assert.equal(await q.getByLabel('Context year', { exact: true }).inputValue(), '2025');
  assert.equal(await q.evaluate(() => localStorage.getItem('unrelated-application')), 'preserve');
  await quota.close();

  const source = await browser.newContext({ serviceWorkers: 'block' });
  let unavailable = true;
  await source.route('**/data/verified/manifest.json', (route) =>
    unavailable ? route.fulfill({ status: 503, body: 'Temporary failure' }) : route.continue(),
  );
  const s = await source.newPage();
  watch(s);
  await s.goto(base + '/risk-map');
  await s.getByRole('button', { name: 'Retry supplied research data', exact: true }).waitFor();
  unavailable = false;
  await s.getByRole('button', { name: 'Retry supplied research data', exact: true }).click();
  await s
    .getByRole('button', { name: 'Retry supplied research data', exact: true })
    .waitFor({ state: 'hidden' });
  await s.waitForFunction(() =>
    JSON.parse(localStorage.getItem('malariascope-v1'))?.datasets.some(
      (d) => d.id === 'study-balanced',
    ),
  );
  await s.locator('.leaflet-interactive').first().waitFor();
  assert.equal(await s.locator('.leaflet-interactive').count(), 9);
  await source.close();
  const blocked = await browser.newContext({ serviceWorkers: 'block' });
  await blocked.addInitScript(() => {
    Storage.prototype.getItem = () => {
      throw new DOMException('Blocked', 'SecurityError');
    };
    Storage.prototype.setItem = () => {
      throw new DOMException('Blocked', 'SecurityError');
    };
  });
  const blockedPage = await blocked.newPage();
  watch(blockedPage);
  for (const path of ['/dashboard', '/mobile', '/aplikasi-desktop', '/iot', '/smartwatch']) {
    await blockedPage.goto(base + path);
    await blockedPage.getByLabel('Workspace storage status', { exact: true }).waitFor();
    await blockedPage.getByLabel('Analytical data source', { exact: true }).waitFor();
    assert.equal(
      await blockedPage
        .getByRole('heading', { name: 'Research workspace unavailable', exact: true })
        .count(),
      0,
    );
  }
  await blocked.close();
  assert.deepEqual(errors, []);
  console.log(
    'Workspace recovery passed: five shells, invalid-state preservation/export/replacement, quota warning and current-session export/retry, study-source retry and restored nine-district GIS.',
  );
} finally {
  await browser.close();
}
