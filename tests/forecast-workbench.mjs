import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
  args: ['--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const base = process.env.APP_URL || 'http://127.0.0.1:5173';
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const leaderboard = () => page.getByRole('table', { name: 'Forecast model leaderboard' });
const firstModel = async () =>
  await leaderboard().locator('tbody tr').first().locator('td').nth(1).innerText();
try {
  await page.goto(base + '/forecasting');
  await page.getByRole('heading', { name: 'Forecasting Workbench Pro', exact: true }).waitFor();
  assert.match(
    await page.getByLabel('Scientific interpretation').innerText(),
    /Persistence outperformed (Ridge Regression — no climate|Random Forest) on the primary 2025 MAE metric/,
  );
  await page.getByLabel('Forecast primary metric', { exact: true }).selectOption('rmse');
  assert.match(
    await page.getByLabel('Scientific interpretation').innerText(),
    /Only Random Forest/,
  );
  await page
    .getByLabel('Forecast primary metric', { exact: true })
    .selectOption('medianAbsoluteError');
  assert.match(await page.getByLabel('Scientific interpretation').innerText(), /a model ranking cannot be established/);
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('malariascope-v1'));
    const models = ['Persistence', 'Ridge Regression', 'Random Forest', 'Gradient Boosting'];
    state.datasets = models.map((model, m) => ({
      id: 'forecast-' + m,
      name: model + ' isolated fixture',
      source: 'Automated analytical fixture',
      classification: 'USER IMPORT',
      checksum: 'forecast-sha-' + m,
      created: '2026-01-01T00:00:00Z',
      rows: [2024, 2025].flatMap((year) =>
        ['A', 'B', 'C'].map((district, i) => ({
          district,
          district_code: String(i + 1),
          year,
          cases: (i + 1) * 100,
          population: 1000,
          prediction:
            (i + 1) * 100 +
            [
              [5, 5, 5],
              [8, 8, 8],
              [0, 0, 12],
              [10, 10, 10],
            ][m][i],
          model,
        })),
      ),
    }));
    state.active = 'forecast-0';
    state.selection = { year: 2025, district: 'All districts', model: 'Random Forest' };
    state.rules = [];
    localStorage.setItem('malariascope-v1', JSON.stringify(state));
  });
  await page.goto(base + '/forecasting?year=2025&model=Random+Forest');
  await leaderboard().waitFor();
  assert.equal(await firstModel(), 'Random Forest');
  assert.match(await leaderboard().innerText(), /Median absolute error/);
  await page.getByLabel('Forecast primary metric', { exact: true }).selectOption('rmse');
  assert.equal(await firstModel(), 'Persistence');
  await page.getByLabel('Forecast primary metric', { exact: true }).selectOption('r2');
  assert.equal(await firstModel(), 'Persistence');
  await page.getByLabel('Forecast primary metric', { exact: true }).selectOption('mae');
  await page.getByRole('button', { name: 'Inspect C, 2025', exact: true }).click();
  const detail = page.getByLabel('Selected forecast point', { exact: true });
  await detail.waitFor();
  assert.match(await detail.innerText(), /C · 2025 · Random Forest/);
  assert.deepEqual(await detail.locator('dd').allTextContents(), ['300', '312', '12', '12']);
  await detail.getByText('Exact point provenance', { exact: true }).click();
  assert.match(await detail.locator('pre').innerText(), /forecast-sha-2/);
  await page.getByRole('button', { name: 'Inspect A, 2025', exact: true }).focus();
  await page.keyboard.press('Enter');
  assert.match(await detail.innerText(), /A · 2025/);
  await page.screenshot({ path: '/tmp/forecast-workbench-desktop.png', fullPage: true });
  await page.getByRole('tab', { name: 'Error Analysis', exact: true }).click();
  assert.equal(
    await page
      .getByRole('table', { name: 'District error ranking' })
      .locator('tbody tr')
      .first()
      .locator('td')
      .nth(1)
      .innerText(),
    'C',
  );
  assert.match(
    await page
      .getByRole('heading', { name: 'Model Failure Analysis', exact: true })
      .locator('..')
      .locator('..')
      .innerText(),
    /C/,
  );
  await page.getByRole('tab', { name: 'District Forecast Inspection', exact: true }).click();
  await page.getByLabel('Forecast district', { exact: true }).selectOption('C');
  assert.match(await page.getByRole('tabpanel').innerText(), /312/);
  await page.getByLabel('Multi-year evaluation', { exact: true }).check();
  await page.getByLabel('Forecast validation start', { exact: true }).selectOption('2024');
  await page.getByRole('tab', { name: 'Model Comparison', exact: true }).click();
  assert.match(await leaderboard().innerText(), /2024–2025/);
  assert.equal(
    await leaderboard().locator('tbody tr').first().locator('td').nth(7).innerText(),
    '6',
  );
  await page.getByLabel('Forecast validation end', { exact: true }).selectOption('2024');
  assert.match(page.url(), /year=2024/);
  assert.equal(
    await leaderboard().locator('tbody tr').first().locator('td').nth(7).innerText(),
    '3',
  );
  await page.getByLabel('Forecast data scope', { exact: true }).selectOption('ACTIVE');
  assert.equal(await firstModel(), 'Persistence');
  assert.match(await page.getByLabel('Scientific interpretation').innerText(), /Only Persistence/);
  await page.getByLabel('Forecast data scope', { exact: true }).selectOption('ALL');
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export workbench', exact: true }).click();
  const download = await downloaded;
  const path = await download.path();
  const report = JSON.parse(await fs.readFile(path, 'utf8'));
  assert.equal(report.source, 'LOADED');
  assert.equal(report.evaluations[0].metrics.mae, 4);
  assert.equal(report.evaluations[0].metrics.medianAbsoluteError, 0);
  assert.equal(report.evaluations[0].pairs[2].references[1].checksum, 'forecast-sha-2');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: '/tmp/forecast-workbench-mobile.png', fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.getByRole('tab', { name: 'Model Comparison', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(
    await page
      .getByRole('tab', { name: 'District Forecast Inspection', exact: true })
      .getAttribute('aria-selected'),
    'true',
  );
  await page.getByLabel('Forecast evidence basis', { exact: true }).selectOption('SUPPLIED');
  assert.match(
    await page.getByRole('tabpanel').innerText(),
    /Underlying district forecasts are not supplied/,
  );
  assert.deepEqual(errors, []);
  console.log(
    'Forecast workbench: metric ranking, exact scatter/keyboard selection, provenance, modes, periods, scope, exports, mobile layout and aggregate isolation passed.',
  );
} finally {
  await browser.close();
}
