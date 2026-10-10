import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const base = process.env.APP_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
  args: ['--no-sandbox'],
});
const context = await browser.newContext({ serviceWorkers: 'block' });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.route('**/*', (r) =>
  new URL(r.request().url()).origin === new URL(base).origin ? r.continue() : r.abort(),
);
await mkdir('/tmp/malariascope-mobile-design', { recursive: true });
await page.goto(`${base}/mobile`);
await expect(page.getByRole('heading', { name: 'Current Intelligence', exact: true })).toBeVisible({
  timeout: 30000,
});
await expect(page.locator('.m-map-preview .map-canvas')).toBeVisible({ timeout: 30000 });
const manifest = await (await page.request.get(`${base}/data/verified/manifest.json`)).json();
await expect(page.locator('.m-home-kpis .m-number')).toHaveText(
  manifest.allNineTotals.cases.toLocaleString('en-GB'),
);
assert.equal(await page.locator('.analytical-demo-controls').count(), 0);
assert.equal(await page.locator('.m-header .m-source-status').count(), 0);
for (const [width, height] of [
  [320, 568],
  [360, 800],
  [390, 844],
  [430, 932],
  [480, 1040],
  [844, 390],
  [1440, 900],
]) {
  await page.setViewportSize({ width, height });
  await page.waitForTimeout(150);
  assert.ok(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    `No overflow at ${width}`,
  );
  assert.ok(
    await page.locator('.mobile-app').evaluate((el) => el.getBoundingClientRect().width <= 520),
    'Centered constrained mobile canvas',
  );
  assert.ok(
    await page
      .locator('.m-bottom a')
      .evaluateAll((els) => els.every((el) => el.getBoundingClientRect().height >= 44)),
    'Navigation touch targets',
  );
  await page.locator('h1').evaluate((el) => el.blur());
  await page.screenshot({
    path: `/tmp/malariascope-mobile-design/home-${width}.png`,
    fullPage: true,
  });
}
await page.setViewportSize({ width: 390, height: 844 });
for (const kind of ['year', 'district', 'risk mode']) {
  await page.getByRole('button', { name: new RegExp(`Change mobile ${kind}:`) }).click();
  await expect(page.getByRole('dialog', { name: 'Filters', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
}
await page.getByRole('button', { name: 'Mobile context filters' }).click();
await page.getByLabel('Mobile year', { exact: true }).selectOption('2024');
await page.getByLabel('Mobile district', { exact: true }).selectOption('Keerom');
await page.getByLabel('Mobile filter model', { exact: true }).selectOption('Random Forest');
await page.getByRole('button', { name: 'Apply filters', exact: true }).click();
await expect(page.locator('.m-context-line')).toContainText('2024');
await expect(page.locator('.m-context-line')).toContainText('Keerom');
await expect(page.locator('.m-district-name')).toHaveText('Data not available');
await page.getByRole('button', { name: 'Mobile context filters' }).click();
await page.getByLabel('Mobile year', { exact: true }).selectOption('2025');
await page.getByRole('button', { name: 'Apply filters', exact: true }).click();
await expect(page.locator('.m-district-name')).toHaveText('Keerom');
await page.getByRole('button', { name: 'Mobile context filters' }).click();
await page.getByRole('button', { name: 'Reset', exact: true }).click();
await expect(page.getByLabel('Mobile filter model', { exact: true })).toHaveValue('Persistence');
await page.getByRole('button', { name: 'Apply filters', exact: true }).click();
const routes = [
  '',
  '/map',
  '/alerts',
  '/district',
  '/surveillance',
  '/models',
  '/readiness',
  '/more',
  '/provenance',
  '/quality',
  '/report',
];
for (const route of routes) {
  const response = await page.goto(`${base}/mobile${route}`);
  assert.equal(response.status(), 200);
  await expect(page.locator('.m-main h1').first()).toBeVisible({ timeout: 30000 });
  await page.reload();
  await expect(page.locator('.m-main h1').first()).toBeVisible({ timeout: 30000 });
  assert.ok(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    `Route ${route} fits`,
  );
  const result = await new AxeBuilder({ page }).include('.mobile-app').analyze();
  assert.deepEqual(
    result.violations.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) })),
    [],
    `Mobile accessibility ${route}`,
  );
}
await page.goto(`${base}/mobile/more`);
await page.getByText('Synthetic demo and source details', { exact: true }).click();
await page.getByRole('button', { name: 'Activate connected synthetic demo', exact: true }).click();
await expect(page.locator('.m-source-title')).toContainText('SYNTHETIC DEMO — NOT OBSERVED DATA');
await page.getByRole('button', { name: 'Use research data', exact: true }).click();
// Isolated disconnected source, loading placeholders, and failed public-asset recovery.
const empty = await browser.newContext({
  serviceWorkers: 'block',
  viewport: { width: 390, height: 844 },
});
await empty.addInitScript(() =>
  localStorage.setItem(
    'malariascope-v1',
    JSON.stringify({
      researchMode: 'USER IMPORT',
      datasets: [],
      active: '',
      geometry: null,
      reduced: true,
    }),
  ),
);
const disconnected = await empty.newPage();
await disconnected.route('**/*', (r) =>
  new URL(r.request().url()).origin === new URL(base).origin ? r.continue() : r.abort(),
);
let release;
const gate = new Promise((resolve) => {
  release = resolve;
});
await disconnected.route('**/data/research-summary.json', async (r) => {
  await gate;
  await r.continue();
});
await disconnected.goto(`${base}/mobile`, { waitUntil: 'domcontentloaded' });
await expect(disconnected.locator('.m-skeleton').first()).toBeVisible({ timeout: 30000 });
assert.equal(await disconnected.locator('.m-number').count(), 0);
assert.equal(
  await disconnected
    .locator('.m-skeleton i')
    .first()
    .evaluate((el) => getComputedStyle(el).animationName),
  'none',
);
release();
await expect(
  disconnected.getByRole('heading', { name: 'Current Intelligence', exact: true }),
).toBeVisible({ timeout: 30000 });
await expect(disconnected.locator('.m-risk-card')).toContainText('Data not available');
await expect(disconnected.locator('.m-map-preview')).toContainText(
  'District geometry not connected',
);
await disconnected.screenshot({
  path: '/tmp/malariascope-mobile-design/home-disconnected.png',
  fullPage: true,
});
await disconnected.unroute('**/data/research-summary.json');
await disconnected.route('**/data/research-summary.json', (r) =>
  r.fulfill({ status: 503, body: 'Unavailable' }),
);
await disconnected.reload();
await expect(
  disconnected.getByRole('heading', { name: 'Research files unavailable', exact: true }),
).toBeVisible({ timeout: 30000 });
await expect(disconnected.locator('.m-home-kpis .m-number')).toHaveText('Data not available');
await disconnected.unroute('**/data/research-summary.json');
await disconnected.getByRole('button', { name: 'Retry research files', exact: true }).click();
await expect(disconnected.locator('.m-home-kpis .m-number')).not.toHaveText('Data not available');
await empty.close();
assert.deepEqual(errors, []);
await browser.close();
console.log(
  'Mobile redesign: seven screen sizes; all 11 direct/refresh routes; mobile-only shell; actual study totals; filters/model/reset; all-route axe; synthetic separation; skeleton/empty/error/retry states passed.',
);
