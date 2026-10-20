import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
import Papa from 'papaparse';
const base = process.env.APP_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
  args: ['--no-sandbox'],
});
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage(),
    errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/*', (route) =>
    route.request().url().startsWith(base) || route.request().url().startsWith('blob:')
      ? route.continue()
      : route.abort(),
  );
  await page.goto(base + '/research-intelligence?year=2025&district=All%20districts');
  await expect(
    page.getByRole('heading', { name: 'Research Intelligence', exact: true }),
  ).toBeVisible();
  const selected = page.getByRole('region', { name: 'Selected analytical cohort', exact: true });
  await expect(selected).toContainText('288,131');
  await expect(selected).toContainText('8 / 8');
  await page.getByLabel('Analytical cohort', { exact: true }).selectOption('snapshot');
  await expect(selected).toContainText('288,879');
  await expect(selected).toContainText('9 / 9');
  await page.getByLabel('Research district', { exact: true }).selectOption('Supiori');
  await expect(selected).toContainText('748');
  await page.getByLabel('Analytical cohort', { exact: true }).selectOption('panel');
  await expect(selected).toContainText('No matching district-year records');
  await page.getByLabel('Research district', { exact: true }).selectOption('All districts');
  await page.getByLabel('Analytical cohort', { exact: true }).selectOption('papua-context');
  await expect(selected).toContainText('No compatible observation table');
  await expect(selected).not.toContainText('288,879');
  await page.getByLabel('Analytical cohort', { exact: true }).selectOption('snapshot');
  await page.getByLabel('Research reporting year').selectOption('2024');
  await expect(selected).toContainText('No matching district-year records');
  await page.getByLabel('Research reporting year').selectOption('2025');
  await page.getByLabel('Research district', { exact: true }).selectOption('Kota Jayapura');
  const jsonDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export selected cohort JSON', exact: true }).click();
  const json = JSON.parse(await readFile(await (await jsonDownload).path(), 'utf8'));
  if (
    json.scope.id !== 'snapshot' ||
    json.observations.length !== 1 ||
    json.observations[0].cases !== 69944 ||
    json.year !== 2025 ||
    json.originalRetrievalDate !== null ||
    !json.referenceStatus.includes('PRIMARY DOCUMENTS NOT REVIEWED')
  )
    throw Error('Cohort JSON loses selected scope, source status or true data');
  const csvDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export selected cohort CSV', exact: true }).click();
  const csv = Papa.parse(await readFile(await (await csvDownload).path(), 'utf8'), {
    header: true,
  }).data;
  if (
    !csv.some((r) => r.Section === 'observations' && r.Field === '0 / cases' && r.Value === '69944')
  )
    throw Error('Cohort CSV does not contain the selected recorded outcome');
  await page.getByRole('button', { name: 'Benchmarks', exact: true }).click();
  const winner = page.getByTestId('benchmark-winner');
  await expect(winner).toContainText('Persistence ranks first');
  await page.getByLabel('Evidence ranking metric').selectOption('rmse');
  await expect(winner).toContainText('Ridge Regression ranks first');
  await page.getByLabel('Evidence ranking metric').selectOption('r2');
  await expect(winner).toContainText('Ridge Regression ranks first');
  await page.getByLabel('Evaluation split').selectOption('validation');
  await expect(winner).toContainText('ranking unavailable');
  await page.getByLabel('Evaluation split').selectOption('test');
  await page.getByLabel('Benchmark source').selectOption('artifact');
  const activeMetrics = page
    .getByRole('region', { name: 'Temporal benchmark evidence', exact: true })
    .locator('table')
    .first();
  await expect(activeMetrics.getByRole('row').filter({ hasText: 'Persistence' })).toContainText(
    'Unavailable',
  );
  await page.getByLabel('Research district', { exact: true }).selectOption('All districts');
  await page.getByLabel('Research model', { exact: true }).selectOption('Random Forest');
  await page.getByRole('button', { name: 'Prediction diagnostics', exact: true }).click();
  const diagnostics = page.getByRole('region', {
    name: 'Observed outcomes and prediction diagnostics',
  });
  await expect(diagnostics).toContainText('194,738.9');
  await expect(diagnostics).toContainText('93,392.1');
  await expect(diagnostics.getByRole('row').filter({ hasText: 'Kota Jayapura' })).toContainText(
    '40,940.3',
  );
  await expect(diagnostics.getByRole('row').filter({ hasText: 'Supiori' })).toContainText(
    'Unavailable',
  );
  await diagnostics.locator('summary').click();
  const intensity = diagnostics.locator('table').nth(1);
  await expect(intensity.getByRole('row').filter({ hasText: 'Biak Numfor' })).toContainText(
    '142,790',
  );
  await expect(intensity.getByRole('row').filter({ hasText: 'Biak Numfor' })).toContainText(
    '152,123',
  );
  await page.getByRole('button', { name: 'Climate evidence', exact: true }).click();
  const climate = page.getByRole('region', {
    name: 'Annual climate research evidence',
    exact: true,
  });
  await expect(climate.getByRole('row').filter({ hasText: 'rainfall' })).toContainText('48');
  await expect(climate).toContainText('not a new calculation or a prediction interval');
  await page.getByLabel('Research district', { exact: true }).selectOption('Biak Numfor');
  await page.getByLabel('Climate analytical period').selectOption('year');
  await expect(climate.getByRole('row').filter({ hasText: 'rainfall' })).toContainText(
    'Unavailable',
  );
  await expect(climate.getByRole('row').filter({ hasText: 'rainfall' })).toContainText('-0.57');
  await page.getByRole('button', { name: 'Provenance', exact: true }).click();
  const provenance = page.getByRole('region', {
    name: 'Research source contract and reconciliation',
  });
  await expect(provenance).toContainText('2011–2020');
  await expect(provenance).toContainText('2010–2019');
  await expect(provenance).toContainText('PRIMARY_DOCUMENTS_MISSING');
  await expect(
    provenance.getByRole('row').filter({ hasText: 'Random Forest / validation / mae' }),
  ).toContainText('11059.8');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Provenance', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByLabel('Research district', { exact: true })).toHaveValue('Biak Numfor');
  await page.getByRole('button', { name: 'Interface status', exact: true }).click();
  await expect(page.getByRole('region', { name: 'System and integration status' })).toContainText(
    'Browser research demonstration',
  );
  await expect(
    page.getByRole('region', { name: 'Force health protection research limits' }),
  ).toContainText('do not estimate individual personnel');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Provenance', exact: true }).click();
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1))
    throw Error('Research workspace overflows on mobile');
  await page.screenshot({ path: '/tmp/malariascope-research-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  const axe = await new AxeBuilder({ page }).include('.research-evidence-workspace').analyze();
  if (axe.violations.length)
    throw Error(
      'Research evidence accessibility violations: ' + axe.violations.map((v) => v.id).join(', '),
    );
  await page.getByRole('button', { name: 'Cohorts & annual data', exact: true }).click();
  await page.getByLabel('Analytical cohort', { exact: true }).selectOption('panel');
  await page.getByLabel('Research district', { exact: true }).selectOption('All districts');
  await page.screenshot({ path: '/tmp/malariascope-research-desktop.png', fullPage: true });
  await page.goto(base + '/dashboard');
  await expect(page.getByRole('link', { name: /Eight-district panel · 2025/ })).toBeVisible();
  await page.goto(base + '/climate');
  await expect(
    page.getByRole('heading', { name: 'Annual climate research evidence', exact: true }),
  ).toBeVisible();
  await page.goto(base + '/model-benchmarking');
  await expect(
    page.getByRole('heading', { name: 'Temporal benchmark evidence', exact: true }),
  ).toBeVisible();
  if (errors.length) throw Error(errors.join('\n'));
  console.log(
    'PASS research evidence: isolated cohorts, missing data, filtered JSON/CSV, metric/source rankings, RF shortfall, denominator separation, Spearman selection, unresolved references, honest interface status, shared URL state, mobile, accessibility and legacy module integration.',
  );
} finally {
  await browser.close();
}
