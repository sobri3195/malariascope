import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
  args: ['--no-sandbox'],
});
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  serviceWorkers: 'block',
});
const page = await context.newPage(),
  errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const base = process.env.APP_URL || 'http://127.0.0.1:4173';
await context.addInitScript(() => {
  if (localStorage.getItem('malariascope-v1')) return;
  localStorage.setItem(
    'malariascope-v1',
    JSON.stringify({
      researchMode: 'USER IMPORT',
      active: 'ux-polish',
      datasets: [
        {
          id: 'ux-polish',
          name: 'UX acceptance fixture',
          source: 'Isolated synthetic browser fixture',
          classification: 'USER IMPORT',
          checksum: 'test-only',
          created: new Date().toISOString(),
          rows: [{ district: 'A', year: 2025, cases: 400, population: 1000 }],
        },
      ],
      rules: [
        {
          id: 'a',
          name: 'Burden review',
          metric: 'cases',
          operator: '>',
          value: 100,
          enabled: true,
          severity: 'HIGH',
          priority: 'NORMAL',
        },
        {
          id: 'b',
          name: 'Inactive review',
          metric: 'cases',
          operator: '>',
          value: 10000,
          enabled: false,
          severity: 'WATCH',
          priority: 'LOW',
        },
        {
          id: 'c',
          name: 'Priority review',
          metric: 'cases',
          operator: '>',
          value: 1000,
          enabled: true,
          severity: 'HIGH',
          priority: 'URGENT',
        },
      ],
    }),
  );
});
const state = () => page.evaluate(() => JSON.parse(localStorage.getItem('malariascope-v1')));
try {
  await page.goto(base + '/early-warning');
  const heading = page.getByRole('heading', { name: 'Early Warning Center', exact: true });
  await expect(heading).toBeFocused();
  await expect(page.locator('.workspace-route-announcement')).toHaveText(
    'Early Warning Center page opened',
  );
  const before = await state();
  const card = page.getByRole('article', { name: 'Rule Burden review', exact: true });
  await expect(card.getByRole('button', { name: 'Save rule', exact: true })).toBeDisabled();
  await card.getByLabel('Rule threshold', { exact: true }).fill('999');
  await expect(card.getByText(/Unsaved edits/)).toBeVisible();
  await page.getByLabel('Search saved rules', { exact: true }).fill('no-match');
  await expect(page.getByText('No matching rules', { exact: true })).toBeVisible();
  assert.equal(await page.getByRole('article').count(), 0);
  await page.getByRole('button', { name: 'Show all rules', exact: true }).click();
  assert.equal(await card.getByLabel('Rule threshold', { exact: true }).inputValue(), '999');
  assert.deepEqual((await state()).rules, before.rules);
  await card.getByRole('button', { name: 'Discard edits', exact: true }).click();
  assert.equal(await card.getByLabel('Rule threshold', { exact: true }).inputValue(), '100');
  await page.getByLabel('Rule status', { exact: true }).selectOption('INACTIVE');
  assert.equal(await page.getByRole('article').count(), 1);
  await page.getByRole('button', { name: 'Clear rule filters', exact: true }).click();
  await page.getByLabel('Rule priority filter', { exact: true }).selectOption('URGENT');
  assert.equal(await page.getByRole('article').count(), 1);
  assert.deepEqual((await state()).rules, before.rules);
  await page.getByRole('button', { name: 'Clear rule filters', exact: true }).click();
  await card.getByLabel('Rule threshold', { exact: true }).fill('120');
  await card.getByRole('button', { name: 'Save rule', exact: true }).click();
  await expect(card.getByRole('button', { name: 'Save rule', exact: true })).toBeDisabled();
  assert.equal((await state()).rules[0].value, 120);
  await page.getByLabel('Search saved rules', { exact: true }).fill('no-match');
  await page.getByRole('button', { name: 'Add rule', exact: true }).click();
  const custom = page.getByRole('article', { name: 'Rule Custom rule', exact: true });
  await expect(custom.getByLabel('Rule name', { exact: true })).toBeFocused();
  assert.equal(await page.getByLabel('Search saved rules', { exact: true }).inputValue(), '');
  await page.getByRole('link', { name: 'Review generated alerts', exact: false }).click();
  await expect(page.getByRole('heading', { name: 'Alert Center', exact: true })).toBeFocused();
  const year = page.getByLabel('Context year', { exact: true });
  await year.selectOption('2024');
  await year.focus();
  await expect(year).toBeFocused();
  await page.getByRole('link', { name: 'Forecasting Workbench Pro', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Forecasting Workbench Pro', exact: true }),
  ).toBeFocused();
  await page.goto(base + '/mobile');
  await expect(
    page.getByRole('heading', { name: 'Current Intelligence', exact: true }),
  ).toBeFocused();
  await page.locator('.m-bottom').getByRole('link', { name: 'Map', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Risk Map', exact: true })).toBeFocused();
  await page.locator('.m-bottom').getByRole('link', { name: 'More', exact: true }).click();
  await page.getByRole('heading').first().waitFor();
  for (const width of [320, 375, 768]) {
    await page.setViewportSize({ width, height: 812 });
    await page.goto(base + '/early-warning');
    await page.getByLabel('Search saved rules', { exact: true }).waitFor();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  }
  assert.deepEqual(errors, []);
  console.log(
    'UX polish passed: lazy route focus/announcements, mobile navigation, query focus, rule filters, empty state, draft preservation, save/discard, creation focus, engine isolation and responsive layout.',
  );
} finally {
  await browser.close();
}
