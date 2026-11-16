import { chromium, expect } from '@playwright/test';
import { createProspective, lockProspective } from '../src/prospective-engine.ts';
const base = process.env.APP_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
  args: ['--no-sandbox'],
});
try {
  const historical = lockProspective(
    createProspective(
      {
        issue_date: '2024-01-01',
        data_cutoff: '2023-12-31',
        target_period: '2025',
        dataset_version: 'test-only',
        dataset_hash: 'a'.repeat(64),
        model_version: 'test-v1',
        model: 'Ridge Regression',
        district: 'Historical Fixture',
        prediction: 120,
        persistence_prediction: 100,
      },
      '2024-01-01',
    ),
    '2024-01-02',
  );
  const context = await browser.newContext();
  await context.addInitScript((record) => {
    if (!localStorage.getItem('prospective-test-installed')) {
      localStorage.setItem('prospective-test-installed', '1');
      localStorage.setItem('malariascope-prospective', JSON.stringify([record]));
    }
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (window.failProspectiveWrites && key === 'malariascope-prospective')
        throw new DOMException('Full', 'QuotaExceededError');
      return original.call(this, key, value);
    };
  }, historical);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + '/prospective-registry');
  await expect(
    page.getByRole('heading', { name: 'Prospective Forecast Registry', exact: true }),
  ).toBeVisible();
  const fields = {
    issue_date: '2026-01-01T00:00',
    data_cutoff: '2025-12-31T00:00',
    target_period: '2027',
    dataset_version: 'test-only',
    dataset_hash: 'b'.repeat(64),
    model_version: 'test-v2',
    model: 'Ridge Regression',
    district: 'Future Fixture',
    prediction: '150',
    persistence_prediction: '100',
  };
  for (const [key, value] of Object.entries(fields))
    await page.getByLabel('Prospective ' + key, { exact: true }).fill(value);
  await page.evaluate(() => {
    window.failProspectiveWrites = true;
  });
  await page.getByRole('button', { name: 'Create forecast record', exact: true }).click();
  await expect(page.getByRole('alert', { name: 'Pemulihan penyimpanan' })).toBeVisible();
  await expect(page.getByLabel('Prospective district', { exact: true })).toHaveValue(
    'Future Fixture',
  );
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('malariascope-prospective')).length),
  ).toBe(1);
  await expect(page.getByRole('status').last()).not.toContainText('Registry updated locally.');
  await page.evaluate(() => {
    window.failProspectiveWrites = false;
  });
  await page.getByRole('button', { name: 'Muat ulang data tersimpan', exact: true }).click();
  await page.getByRole('button', { name: 'Create forecast record', exact: true }).click();
  await expect(page.locator('article').filter({ hasText: 'Future Fixture' })).toContainText(
    'DRAFT',
  );
  await page
    .locator('article')
    .filter({ hasText: 'Future Fixture' })
    .getByRole('button', { name: 'Lock forecast', exact: true })
    .click();
  await expect(page.locator('article').filter({ hasText: 'Future Fixture' })).toContainText(
    'LOCKED',
  );
  const input = page.getByLabel('Import prospective outcomes', { exact: true });
  const file = {
    name: 'test-only.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify([{ forecast_id: historical.forecast_id, outcome: 110 }])),
  };
  await input.setInputFiles(file);
  await expect(page.getByRole('region', { name: 'Outcome import preview' })).toContainText(
    'Historical Fixture',
  );
  expect(
    await page.evaluate(
      (id) =>
        JSON.parse(localStorage.getItem('malariascope-prospective')).find(
          (r) => r.forecast_id === id,
        ).outcome,
      historical.forecast_id,
    ),
  ).toBeNull();
  await page.getByRole('button', { name: 'Cancel outcomes', exact: true }).click();
  await input.setInputFiles(file);
  await page.getByRole('button', { name: 'Apply outcomes', exact: true }).click();
  await expect(page.locator('article').filter({ hasText: 'Historical Fixture' })).toContainText(
    'OUTCOME AVAILABLE',
  );
  await page.goto(base + '/model-monitoring');
  await expect(page.getByRole('table', { name: 'Prospective model cohorts' })).toContainText(
    '10.00',
  );
  await page.reload();
  await expect(page.getByRole('table', { name: 'Prospective model cohorts' })).toContainText(
    '10.00',
  );
  await context.close();
  const broken = await browser.newContext();
  const raw = '{"records":null,"retained":"test-only-original"}';
  await broken.addInitScript((raw) => localStorage.setItem('malariascope-prospective', raw), raw);
  const b = await broken.newPage();
  await b.goto(base + '/prospective-registry');
  await expect(b.getByRole('alert', { name: 'Pemulihan penyimpanan' })).toBeVisible();
  await expect(
    b.getByRole('button', { name: 'Create forecast record', exact: true }),
  ).toBeDisabled();
  expect(await b.evaluate(() => localStorage.getItem('malariascope-prospective'))).toBe(raw);
  await broken.close();
  expect(errors).toEqual([]);
  console.log(
    'PASS prospective: create, quota failure/input preservation, retry, lock, outcome preview/cancel/apply, monitoring cohort/reload, corrupt original preservation. Test-only records.',
  );
} finally {
  await browser.close();
}
