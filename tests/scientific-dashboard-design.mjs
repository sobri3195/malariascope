import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const base = process.env.APP_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
  args: ['--no-sandbox'],
});
const context = await browser.newContext();
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.route('**/*', (r) =>
  new URL(r.request().url()).origin === new URL(base).origin ? r.continue() : r.abort(),
);
await mkdir('/tmp/malariascope-design', { recursive: true });
await page.goto(`${base}/dashboard`);
await expect(page.getByRole('heading', { name: 'Evidence coverage', exact: true })).toBeVisible({
  timeout: 30000,
});
await expect(page.locator('.hotspot-map-frame')).toBeVisible({ timeout: 30000 });
await page.emulateMedia({ reducedMotion: 'reduce' });
for (const [width, height] of [
  [1440, 900],
  [1600, 1000],
  [1920, 1080],
  [2560, 1440],
  [768, 1024],
  [390, 844],
  [320, 740],
]) {
  await page.setViewportSize({ width, height });
  await page.getByRole('button', { name: 'Update view →' }).click();
  await page.waitForTimeout(200);
  assert.ok(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    `No document overflow at ${width}`,
  );
  assert.ok(
    await page
      .locator('.hotspot-map-frame')
      .evaluate((el) => el.getBoundingClientRect().width > 200),
    `Map remains visible at ${width}`,
  );
  await page.locator('h1').evaluate((el) => el.blur());
  await page.screenshot({
    path: `/tmp/malariascope-design/dashboard-${width}.png`,
    fullPage: true,
    style: '.ux-notifications { visibility: hidden; }',
  });
}
await page.setViewportSize({ width: 1600, height: 1000 });
assert.equal(await page.locator('.evidence-card').count(), 6);
assert.equal(await page.locator('.evidence-technical').getAttribute('open'), null);
await page.locator('.evidence-technical > summary').click();
await expect(page.locator('.evidence-technical pre')).toContainText('candidatePanel');
await page.locator('.evidence-technical > summary').click();
await page.getByLabel('Context year', { exact: true }).selectOption('2024');
await expect(page.locator('.chart-stat')).toContainText('2024');
await page.getByLabel('Context district', { exact: true }).selectOption('Keerom');
await expect(page.locator('.ranking')).toContainText('Keerom');
await page.getByLabel('Context district', { exact: true }).selectOption('All districts');
await page.getByLabel('Context year', { exact: true }).selectOption('2025');
await page.getByLabel('Context dataset', { exact: true }).selectOption('');
await expect(page.locator('.analytical-demo-controls summary')).toContainText('No primary dataset');
await expect(page.locator('.metric').nth(2)).toContainText('—');
await expect(page.locator('.ranking')).toHaveCount(0);
await page.screenshot({ path: '/tmp/malariascope-design/dashboard-empty.png', fullPage: true });
await page.getByRole('button', { name: 'Use supplied research data', exact: true }).click();
await expect(page.locator('.ranking')).toBeVisible();
await page.locator('.analytical-demo-controls summary').click();
await page.getByRole('button', { name: 'Activate connected synthetic demo', exact: true }).click();
await expect(page.locator('.analytical-demo-controls summary')).toContainText(
  'SYNTHETIC DEMO — NOT OBSERVED DATA',
);
await expect(page.locator('.coverage-cards')).toHaveCount(0);
await page.getByRole('button', { name: 'Use supplied research data', exact: true }).click();
await page.keyboard.press('Control+k');
await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeVisible();
await page.keyboard.press('Escape');
const a11y = await new AxeBuilder({ page }).include('#main').analyze();
assert.deepEqual(
  a11y.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
  [],
);
await page.goto(`${base}/mobile`);
await expect(page.locator('main')).toBeVisible();
const failure = await browser.newPage();
failure.on('pageerror', (e) => errors.push(e.message));
await failure.route('**/*', (r) =>
  new URL(r.request().url()).origin === new URL(base).origin ? r.continue() : r.abort(),
);
await failure.route('**/data/verified/manifest.json', (r) =>
  r.fulfill({ status: 503, body: 'Unavailable' }),
);
await failure.goto(`${base}/dashboard`);
await expect(failure.getByRole('heading', { name: 'Evidence coverage unavailable' })).toBeVisible({
  timeout: 30000,
});
await failure.unroute('**/data/verified/manifest.json');
await failure.getByRole('button', { name: 'Retry evidence loading', exact: true }).click();
await expect(failure.getByRole('heading', { name: 'Evidence coverage', exact: true })).toBeVisible({
  timeout: 30000,
});
await failure.close();
assert.deepEqual(errors, []);
await browser.close();
console.log(
  'Scientific dashboard: seven viewport sizes, real/empty/synthetic states, global filters, map, command palette, and accessibility passed. Screenshots: /tmp/malariascope-design',
);
