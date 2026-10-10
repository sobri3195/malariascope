import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
const base = process.env.APP_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
  args: ['--no-sandbox'],
});
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.route('**/*', (r) =>
  new URL(r.request().url()).origin === new URL(base).origin ? r.continue() : r.abort(),
);
await context.addInitScript(() => {
  if (!localStorage.getItem('ml-fixture')) {
    localStorage.setItem('ml-fixture', '1');
    localStorage.setItem(
      'malariascope-v1',
      JSON.stringify({
        researchMode: 'USER IMPORT',
        active: 'fixture',
        datasets: [
          {
            id: 'fixture',
            name: 'Synthetic test only',
            source: 'Test fixture',
            checksum: 'fixture',
            created: '2026-10-10',
            rows: ['A', 'B', 'C'].map((district, i) => ({
              district,
              year: 2025,
              cases: (i + 1) * 100,
              population: 1000,
            })),
          },
        ],
      }),
    );
  }
});
const file = (name, data) => ({
  name,
  mimeType: 'application/json',
  buffer: Buffer.from(JSON.stringify(data)),
});
try {
  await page.goto(base + '/research-operations');
  await page.getByRole('button', { name: 'Models', exact: true }).click();
  const run = JSON.parse(
    await readFile(new URL('./fixtures/ml-run.json', import.meta.url), 'utf8'),
  );
  const broken = structuredClone(run);
  broken.leaderboard[0].metrics.mae = 0;
  await page
    .getByLabel('Import training run', { exact: true })
    .setInputFiles(file('invalid.json', broken));
  await expect(
    page.getByRole('alert').filter({ hasText: 'Reported metrics disagree' }),
  ).toBeVisible();
  assert.equal(await page.evaluate(() => localStorage.getItem('malariascope-training-runs')), null);
  await page
    .getByLabel('Import training run', { exact: true })
    .setInputFiles(file('run.json', run));
  const leaderboard = page.getByRole('table', { name: 'Training run leaderboard', exact: true });
  await expect(leaderboard.locator('tbody tr').first()).toContainText('Random Forest');
  await page.getByLabel('Training run primary metric').selectOption('rmse');
  await expect(leaderboard.locator('tbody tr').first()).toContainText('Persistence');
  await page.getByLabel('Training run primary metric').selectOption('r2');
  await expect(leaderboard.locator('tbody tr').first()).toContainText('Persistence');
  await page.getByLabel('Context year', { exact: true }).selectOption('2024');
  await expect(page.getByText('No captured holdout pairs match', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Show captured holdout year' }).click();
  await page.getByLabel('Context district', { exact: true }).selectOption('A');
  await expect(leaderboard.locator('tbody tr')).toHaveCount(0);
  await expect(
    page.getByText('Selected metric is unavailable for this cohort.', { exact: false }),
  ).toBeVisible();
  await page.getByLabel('Training run primary metric').selectOption('mae');
  await expect(leaderboard.locator('tbody tr').first()).toContainText('Random Forest');
  await page.getByLabel('Context district', { exact: true }).selectOption('All districts');
  const artifact = {
    schema: 'malariascope-portable-model-v1',
    model: 'Ridge Regression',
    version: 'fit-' + 'd'.repeat(64),
    datasetHash: 'a'.repeat(64),
    classification: 'SYNTHETIC',
    features: [{ name: 'cases_lag1', unit: 'cases' }],
    trainingEnd: 2024,
    validationPeriod: '2025',
    mean: [10],
    scale: [2],
    coefficients: [3],
    intercept: 5,
    provenance: {
      modelIdentity: 'fit-' + 'd'.repeat(64),
      trainingHash: 'b'.repeat(64),
      trainingStart: 2020,
      trainingRows: 15,
      seed: 19,
      source: 'Test only',
      license: 'Fixture',
      parameters: { alpha: 1 },
      environment: { python: 'test', numpy: 'test', scikitLearn: 'test' },
      codeHashes: { 'train.py': 'c'.repeat(64) },
      selection: { status: 'FIXED', parameters: { alpha: 1 }, folds: [], candidates: [] },
      inputRanges: [{ minimum: 5, maximum: 15 }],
    },
  };
  await page
    .getByLabel('Import trained artifact', { exact: true })
    .setInputFiles(file('artifact.json', artifact));
  await page.getByLabel('cases_lag1 (cases)', { exact: true }).fill('100');
  await page.getByRole('button', { name: 'Calculate exploratory model output' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'outside observed training range' }),
  ).toBeVisible();
  for (const width of [320, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    assert.ok(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
      `Overflow at ${width}`,
    );
  }
  const axe = await new AxeBuilder({ page })
    .include('main')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  assert.deepEqual(
    axe.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
    [],
  );
  await page.evaluate(() =>
    localStorage.setItem('malariascope-training-runs', '[{invalid saved original'),
  );
  await page.reload();
  await page.getByRole('button', { name: 'Models', exact: true }).click();
  await expect(page.getByLabel('Import training run', { exact: true })).toBeDisabled();
  assert.equal(
    await page.evaluate(() => localStorage.getItem('malariascope-training-runs')),
    '[{invalid saved original',
  );
  assert.deepEqual(errors, []);
  console.log(
    'ML workbench passed: false metric rejection, dynamic ranking, global filters, applicability warnings, preserved corrupt evidence, responsive layout and main-content accessibility.',
  );
} finally {
  await browser.close();
}
