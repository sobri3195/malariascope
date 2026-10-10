import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
  args: ['--no-sandbox'],
});
const base = process.env.APP_URL || 'http://127.0.0.1:4173';
const context = await browser.newContext({
  viewport: { width: 375, height: 812 },
  hasTouch: true,
  serviceWorkers: 'block',
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const fits = async (path) => {
  assert.ok(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    `${path}: no page overflow`,
  );
};
try {
  for (const size of [
    { width: 320, height: 568 },
    { width: 375, height: 812 },
    { width: 812, height: 375 },
    { width: 768, height: 1024 },
  ]) {
    await page.setViewportSize(size);
    for (const path of [
      '/dashboard',
      '/risk-map',
      '/forecasting',
      '/methodology',
      '/mobile',
      '/mobile/map',
      '/mobile/models',
      '/mobile/report',
    ]) {
      await page.goto(base + path);
      await page.locator(path.startsWith('/mobile') ? '.m-bottom' : '.ux-context').waitFor();
      await page.locator('main h1').first().waitFor();
      if (path === '/risk-map' || path === '/mobile/map')
        await page.locator('.leaflet-container').first().waitFor();
      if (path === '/forecasting') await page.locator('.forecast-controls').waitFor();
      if (path === '/methodology') await page.locator('.coverage-explorer').waitFor();
      await fits(path);
      const nav = page.locator(
        path.startsWith('/mobile') ? '.m-bottom a' : '.mobile-nav > a, .mobile-nav > button',
      );
      assert.ok(
        await nav.evaluateAll((nodes) =>
          nodes.every((n) => {
            const r = n.getBoundingClientRect();
            return r.height >= 44 && r.width >= 44;
          }),
        ),
        `${path}: touch navigation targets`,
      );
    }
  }
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(base + '/dashboard');
  await page.getByLabel('Context year', { exact: true }).waitFor();
  assert.equal(await page.locator('#workspace-navigation').getAttribute('inert'), '');
  const trigger = page.getByRole('button', { name: 'Open navigation', exact: true });
  await trigger.click();
  const drawer = page.getByRole('dialog', { name: 'Workspace navigation' });
  await drawer.waitFor();
  assert.equal(await page.evaluate(() => document.body.style.overflow), 'hidden');
  assert.equal(
    await page
      .getByRole('button', { name: 'Close navigation' })
      .evaluate((el) => el === document.activeElement),
    true,
  );
  await page.keyboard.press('Shift+Tab');
  assert.equal(await drawer.evaluate((el) => el.contains(document.activeElement)), true);
  await page.keyboard.press('Escape');
  await drawer.waitFor({ state: 'hidden' });
  assert.equal(await trigger.evaluate((el) => el === document.activeElement), true);
  assert.notEqual(await page.evaluate(() => document.body.style.overflow), 'hidden');
  await trigger.click();
  await drawer.getByRole('link', { name: 'Methodology & evidence' }).click();
  await drawer.waitFor({ state: 'hidden' });
  assert.match(page.url(), /methodology/);
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await page
    .getByRole('button', { name: 'Dismiss navigation', exact: true })
    .click({ position: { x: 365, y: 100 }, force: true });
  await drawer.waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await page.setViewportSize({ width: 1280, height: 800 });
  await drawer.waitFor({ state: 'hidden' });
  assert.equal(await page.locator('#workspace-navigation').getAttribute('inert'), null);
  assert.notEqual(await page.evaluate(() => document.body.style.overflow), 'hidden');
  await page.setViewportSize({ width: 812, height: 375 });
  await page.goto(base + '/mobile');
  await page.getByRole('button', { name: 'Mobile context filters' }).click();
  const sheet = page.getByRole('dialog', { name: 'Filters', exact: true });
  await sheet.waitFor();
  assert.ok(await sheet.evaluate((el) => el.getBoundingClientRect().height <= innerHeight - 10));
  await page.getByLabel('Mobile year', { exact: true }).selectOption('2024');
  await page.getByRole('button', { name: 'Apply filters' }).click();
  assert.match(await page.locator('.m-context-line').innerText(), /2024/);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.deepEqual(errors, []);
  console.log(
    'Responsive acceptance passed: 320/375 phones, landscape/tablet, desktop restoration, route overflow, touch navigation, drawer focus/escape/backdrop/footer links, landscape filters and shared year.',
  );
} finally {
  await browser.close();
}
