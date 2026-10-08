import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
  args: ['--no-sandbox'],
});
const page = await browser.newPage({
    viewport: { width: 1366, height: 900 },
    reducedMotion: 'reduce',
  }),
  base = process.env.APP_URL || 'http://127.0.0.1:4173',
  errors = [];
page.on('pageerror', (e) => errors.push(e.message));
try {
  await page.goto(base + '/methodology');
  const root = page.locator('.method-dashboard');
  await root
    .getByRole('heading', { name: 'Data Coverage & Research Summary', exact: true })
    .waitFor();
  assert.equal(await root.locator('pre:visible').count(), 0);
  assert.equal(
    await root.getByRole('heading', { name: 'Study at a Glance', exact: true }).count(),
    0,
    'technical module lazy, absent from ordinary UI',
  );
  const summary = root.locator('.coverage-metrics').first();
  assert.match(await summary.innerText(), /288,131/);
  assert.match(await summary.innerText(), /100.0%/);
  assert.match(await root.innerText(), /49 \/ 54.*90.7%/);
  assert.equal(await root.locator('.coverage-bars meter').count(), 8);
  await page.getByLabel('Context district', { exact: true }).selectOption('Kota Jayapura');
  assert.match(await summary.innerText(), /69,944/);
  assert.equal(await root.locator('.coverage-bars meter').count(), 1);
  await page.getByLabel('Context year', { exact: true }).selectOption('2024');
  assert.match(await summary.innerText(), /21,812/);
  await page.getByLabel('Context model', { exact: true }).selectOption('Random Forest');
  await page
    .getByLabel('Context risk configuration', { exact: true })
    .selectOption('COMPOSITE RESEARCH RISK');
  assert.match(
    await root.locator('.coverage-context').innerText(),
    /2024.*Kota Jayapura.*Random Forest.*COMPOSITE/,
  );
  await page.getByLabel('Context district', { exact: true }).selectOption('All districts');
  await page.getByLabel('Context year', { exact: true }).selectOption('2025');
  await page.getByLabel('Context dataset', { exact: true }).selectOption('study-spatial');
  assert.match(await summary.innerText(), /288,879/);
  assert.equal(await root.locator('.coverage-bars meter').count(), 9);
  await page.getByLabel('Context dataset', { exact: true }).selectOption('study-balanced');
  await root.getByLabel('Search evidence sources').fill('climate');
  const catalog = root.locator('.coverage-explorer');
  assert.equal(await catalog.locator('tbody tr').count(), 1);
  assert.match(await catalog.innerText(), /Annual climate archive/);
  const download = page.waitForEvent('download');
  await root.getByRole('button', { name: 'Export filtered evidence JSON', exact: true }).click();
  const file = await download,
    payload = JSON.parse(await fs.readFile(await file.path(), 'utf8'));
  assert.equal(payload.evidence.length, 1);
  assert.equal(payload.filters.year, 2025);
  assert.equal(payload.filters.model, 'Random Forest');
  await root.getByLabel('Search evidence sources').fill('unavailable-source-xyz');
  assert.match(await root.innerText(), /No evidence sources match/);
  await root.getByRole('button', { name: 'Reset evidence filters', exact: true }).click();
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('malariascope-v1')));
  await root.locator('.coverage-demo-disclosure > summary').click();
  const demo = root.getByRole('region', { name: 'Synthetic demo dataset' });
  await demo.getByRole('button', { name: 'Load 100,000 synthetic records', exact: true }).click();
  await demo
    .getByText('100,000 synthetic records loaded', { exact: false })
    .waitFor({ timeout: 60000 });
  assert.equal(await demo.locator('tbody tr').count(), 50);
  assert.match(await demo.innerText(), /SYNTHETIC — NOT OBSERVED DATA/);
  await demo.getByRole('button', { name: 'Next demo page', exact: true }).click();
  assert.match(await demo.locator('tbody tr').first().innerText(), /SYN-000051/);
  await demo.getByLabel('Search synthetic records').fill('SYN-100000');
  assert.equal(await demo.locator('tbody tr').count(), 1);
  await demo.getByLabel('Search synthetic records').fill('invalid-record');
  assert.match(await demo.innerText(), /No synthetic records match/);
  await demo.getByLabel('Search synthetic records').fill('');
  for (const width of [768, 375]) {
    await page.setViewportSize({ width, height: 900 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  }
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('malariascope-v1')));
  assert.deepEqual(after.datasets, before.datasets);
  assert.equal(after.active, before.active);
  assert.deepEqual(after.selection, before.selection);
  await demo.getByRole('button', { name: 'Unload demo', exact: true }).click();
  assert.match(await demo.innerText(), /Demo not loaded/);
  await root.locator('.coverage-demo-disclosure > summary').click();
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: '/tmp/coverage-summary-desktop.png' });
  await page.setViewportSize({ width: 375, height: 900 });
  await page.screenshot({ path: '/tmp/coverage-summary-mobile.png' });
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.emulateMedia({ media: 'print' });
  assert.equal(await root.locator('.coverage-demo-disclosure').isVisible(), false);
  assert.equal(await root.locator('.coverage-advanced').isVisible(), false);
  await page.pdf({ path: '/tmp/coverage-summary.pdf', format: 'A4', printBackground: true });
  await page.emulateMedia({ media: 'screen' });
  const failure = await browser.newPage();
  await failure.goto(base + '/methodology');
  await failure.locator('.coverage-demo-disclosure > summary').click();
  await failure.route('**/data/demo/synthetic-100000.csv', (r) =>
    r.fulfill({ status: 503, body: 'Unavailable' }),
  );
  await failure
    .getByRole('button', { name: 'Load 100,000 synthetic records', exact: true })
    .click();
  await failure.locator('.coverage-demo [role=alert]').waitFor();
  assert.equal(await failure.locator('.coverage-demo tbody tr').count(), 0);
  await failure.close();
  assert.deepEqual(errors, []);
  console.log(
    'Coverage acceptance passed: actual filtered metrics, coverage denominators, source search/filter/export, model/risk context, 100,000-record worker preview and pagination, immutable research storage, mobile/print and demo failure states.',
  );
} finally {
  await browser.close();
}
