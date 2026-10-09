import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
  args: ['--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }),
  errors = [];
const base = process.env.APP_URL || 'http://127.0.0.1:5173';
page.on('pageerror', (error) => errors.push(error.message));
const table = () => page.getByRole('table', { name: 'District risk calculations' });
const row = (district) =>
  table()
    .locator('tbody tr')
    .filter({ has: page.getByRole('cell', { name: district, exact: true }) });
const score = async (district) => row(district).locator('td').nth(2).innerText();
const category = async (district) => row(district).locator('td').nth(3).innerText();
const inspect = async (district) => {
  await row(district)
    .getByRole('button', { name: 'How was this risk calculated?', exact: true })
    .click();
  return page.getByRole('dialog', { name: 'Risk calculation', exact: true });
};
const state = async () => page.evaluate(() => JSON.parse(localStorage.getItem('malariascope-v1')));
// Explicit disconnected/user-import coverage; populated research defaults are tested in research-desktop-iot.mjs.
await page.addInitScript(() => {
  if (!localStorage.getItem('malariascope-v1'))
    localStorage.setItem(
      'malariascope-v1',
      JSON.stringify({ researchMode: 'USER IMPORT', datasets: [], active: '', geometry: null }),
    );
});
try {
  await page.goto(base + '/risk-intelligence');
  await page.getByRole('heading', { name: 'Explainable Risk Engine 2.0', exact: true }).waitFor();
  assert.match(
    await page.locator('main').innerText(),
    /No risk category is inferred from absent evidence/,
  );
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('malariascope-v1'));
    s.datasets = [
      {
        id: 'risk-obs',
        name: 'Isolated risk observations',
        source: 'Automated fixture',
        classification: 'VERIFIED',
        checksum: 'obs-sha',
        created: '2026-01-01T00:00:00Z',
        rows: [2024, 2025].flatMap((year) =>
          ['A', 'B', 'C'].map((district, i) => ({
            district,
            district_code: String(i + 1),
            year,
            cases: [50, 300, 600][i] * (year === 2024 ? 0.5 : 1),
            population: 1000,
          })),
        ),
      },
      {
        id: 'risk-model',
        name: 'Isolated model outputs',
        source: 'Automated fixture',
        classification: 'USER IMPORT',
        checksum: 'model-sha',
        created: '2026-01-01T00:00:00Z',
        rows: [2024, 2025].flatMap((year) =>
          ['A', 'B', 'C'].map((district, i) => ({
            district,
            district_code: String(i + 1),
            year,
            cases: [50, 300, 600][i] * (year === 2024 ? 0.5 : 1),
            population: 1000,
            prediction: [150, 500, 800][i],
            model: 'Random Forest',
          })),
        ),
      },
    ];
    s.active = 'risk-obs';
    s.selection = { year: 2025, district: 'All districts', model: 'Random Forest' };
    s.rules = [];
    s.thresholds = [20, 30, 40];
    s.profile = 'ANALYST';
    delete s.riskScenario;
    s.geometry = {
      type: 'FeatureCollection',
      features: ['A', 'B', 'C'].map((district, i) => ({
        type: 'Feature',
        properties: { district, district_code: String(i + 1) },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [138 + i, -4],
              [139 + i, -4],
              [139 + i, -3],
              [138 + i, -3],
              [138 + i, -4],
            ],
          ],
        },
      })),
    };
    s.geometrySource = {
      name: 'Isolated administrative geometry',
      classification: 'USER IMPORT',
      checksum: 'geometry-sha',
      created: '2026-01-01T00:00:00Z',
    };
    localStorage.setItem('malariascope-v1', JSON.stringify(s));
  });
  await page.goto(base + '/risk-intelligence?year=2025&model=Random+Forest&district=All+districts');
  await table().waitFor();
  const before = await state();
  assert.equal(await score('A'), '50');
  assert.equal(await category('A'), 'LOW');
  assert.equal(await category('C'), 'VERY HIGH');
  let dialog = await inspect('A');
  await dialog.waitFor();
  assert.match(await dialog.innerText(), /No independent formula verification record supplied/);
  assert.match(await dialog.innerText(), /All contributing tabular inputs labeled VERIFIED/);
  assert.match(
    await dialog.getByRole('table', { name: 'Risk input provenance' }).innerText(),
    /obs-sha/,
  );
  await page.keyboard.press('Escape');
  assert.equal(await dialog.count(), 0);
  assert.equal(
    await page.evaluate(() => document.activeElement.textContent),
    'How was this risk calculated?',
  );
  await page.getByLabel('Risk mode', { exact: true }).selectOption('MODEL-ASSISTED RISK');
  assert.equal(await score('A'), '150');
  assert.equal(await category('A'), 'MODERATE');
  await page.getByLabel('Risk mode', { exact: true }).selectOption('SPATIAL RISK');
  assert.equal(await score('A'), '300');
  assert.equal(await score('B'), '325');
  await page.getByLabel('Global district', { exact: true }).selectOption('A');
  assert.equal(await table().locator('tbody tr').count(), 1);
  assert.equal(await score('A'), '300');
  await page.getByLabel('Global district', { exact: true }).selectOption('All districts');
  dialog = await inspect('B');
  assert.match(await dialog.innerText(), /A · 50 incidence/);
  assert.match(await dialog.innerText(), /C · 600 incidence/);
  assert.match(await dialog.locator('pre').first().innerText(), /geometry-sha/);
  await page.keyboard.press('Escape');
  await page.getByLabel('Risk mode', { exact: true }).selectOption('COMPOSITE RESEARCH RISK');
  assert.equal(await score('A'), '100');
  assert.equal(
    await page.getByLabel('Predicted incidence weight', { exact: true }).isDisabled(),
    true,
  );
  await page.getByRole('button', { name: 'Activate Scenario Mode', exact: true }).click();
  await page.getByLabel('Predicted incidence weight', { exact: true }).fill('3');
  assert.equal(await score('A'), '125');
  assert.match(
    await page.getByRole('status').last().innerText(),
    /EXPERIMENTAL RISK CONFIGURATION — NOT VERIFIED RESEARCH OUTPUT/,
  );
  const experimental = await state();
  assert.deepEqual(experimental.datasets, before.datasets);
  assert.deepEqual(experimental.thresholds, before.thresholds);
  assert.deepEqual(experimental.rules, before.rules);
  dialog = await inspect('A');
  const variables = dialog.getByRole('table', { name: 'Risk formula variables' });
  assert.deepEqual(await variables.locator('tbody tr').first().locator('td').allTextContents(), [
    'Observed incidence',
    '50',
    '50 · identity, same units',
    '1',
    '0.25',
    '12.5',
  ]);
  assert.equal(
    await dialog
      .getByLabel('Predicted incidence contribution', { exact: true })
      .getAttribute('value'),
    '112.5',
  );
  assert.match(await dialog.getByLabel('Risk variable contributions').innerText(), /90% of score/);
  await page.screenshot({ path: '/tmp/risk-formula-desktop.png', fullPage: true });
  await page.keyboard.press('Escape');
  await page.getByLabel('Neighbor incidence weight', { exact: true }).fill('-1');
  await page.getByRole('alert').waitFor();
  assert.equal(await score('A'), '125');
  await page.reload();
  await table().waitFor();
  assert.match(await page.getByRole('status').last().innerText(), /EXPERIMENTAL/);
  await page.getByLabel('Risk mode', { exact: true }).selectOption('COMPOSITE RESEARCH RISK');
  assert.equal(await score('A'), '125');
  await page.getByLabel('Global year', { exact: true }).selectOption('2024');
  assert.equal(await score('A'), '118.75');
  await page.getByLabel('Global year', { exact: true }).selectOption('2025');
  await page.getByLabel('Global model', { exact: true }).selectOption('Persistence');
  assert.equal(await category('A'), 'INSUFFICIENT DATA');
  await page.getByLabel('Global model', { exact: true }).selectOption('Random Forest');
  await page.getByLabel('Risk evidence scope', { exact: true }).selectOption('ACTIVE');
  assert.equal(await category('A'), 'INSUFFICIENT DATA');
  await page.getByLabel('Risk evidence scope', { exact: true }).selectOption('ALL');
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export risk calculations', exact: true }).click();
  const exportFile = await pending;
  const report = JSON.parse(await fs.readFile(await exportFile.path(), 'utf8'));
  assert.equal(report.configuration.experimental, true);
  assert.equal(report.calculations[0].score, 125);
  assert.equal(report.defaultResearchModel.weights.predicted, 1);
  assert.equal(report.calculations[0].components[1].contribution, 112.5);
  await page.getByRole('button', { name: 'Reset to research defaults', exact: true }).click();
  assert.equal(await score('A'), '100');
  assert.equal(await page.locator('main').getByRole('status').count(), 0);
  assert.deepEqual((await state()).thresholds, [20, 30, 40]);
  // Local profiles are an interface gate, never a claim of authenticated authorization.
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('malariascope-v1'));
    s.profile = 'VIEWER';
    localStorage.setItem('malariascope-v1', JSON.stringify(s));
  });
  await page.reload();
  await table().waitFor();
  assert.equal(
    await page.getByRole('button', { name: 'Activate Scenario Mode', exact: true }).isDisabled(),
    true,
  );
  assert.equal(
    await page.getByLabel('Observed incidence weight', { exact: true }).isDisabled(),
    true,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  dialog = await inspect('A');
  assert.equal(await dialog.evaluate((el) => el.scrollWidth > el.clientWidth), false);
  await page.screenshot({ path: '/tmp/risk-formula-mobile.png', fullPage: true });
  await dialog.getByRole('button', { name: 'Close', exact: true }).focus();
  await page.keyboard.press('Tab');
  assert.equal(
    await page.evaluate(() => document.activeElement.getAttribute('aria-label')),
    'Close calculation',
  );
  await page.keyboard.press('Escape');
  // A missing neighbor and an unavailable selected year never produce a fabricated spatial category.
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('malariascope-v1'));
    for (const d of s.datasets) for (const r of d.rows) if (r.district === 'C') delete r.population;
    localStorage.setItem('malariascope-v1', JSON.stringify(s));
  });
  await page.reload();
  await table().waitFor();
  await page.getByLabel('Risk mode', { exact: true }).selectOption('SPATIAL RISK');
  assert.equal(await category('B'), 'INSUFFICIENT DATA');
  await page.goto(base + '/risk-intelligence?year=2023&model=Random+Forest&district=All+districts');
  await table().waitFor();
  assert.match(await table().innerText(), /INSUFFICIENT DATA/);
  assert.deepEqual(errors, []);
  console.log(
    'Risk engine: four modes, exact contributions, source/geometry verification, thresholds, scenario isolation/persistence/reset, profile gate, missing inputs, exports, global synchronization, focus/keyboard and mobile layout passed.',
  );
} finally {
  await browser.close();
}
