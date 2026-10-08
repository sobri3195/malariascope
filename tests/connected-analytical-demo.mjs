import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
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
await page.addInitScript(() => {
  if (!sessionStorage.getItem('seeded-demo-test')) {
    localStorage.setItem(
      'malariascope-v1',
      JSON.stringify({
        datasets: [
          {
            id: 'saved-user',
            name: 'Saved upload',
            source: 'Test user upload',
            checksum: 'user-hash',
            created: '2026-01-01',
            classification: 'USER IMPORT',
            rows: [{ district: 'Saved district', year: 2025, cases: 5 }],
          },
        ],
        active: '',
        researchMode: 'USER IMPORT',
        geometry: null,
      }),
    );
    sessionStorage.setItem('seeded-demo-test', 'true');
  }
});
const controls = () => page.getByRole('region', { name: 'Analytical data source', exact: true });
async function go(path) {
  await page.goto(base + path);
  await controls().waitFor();
  await page.waitForFunction(
    () => JSON.parse(localStorage.getItem('malariascope-v1') || '{}').researchMode === 'DEMO',
  );
  assert.match(await controls().innerText(), /SYNTHETIC DEMO — NOT OBSERVED DATA/);
}
try {
  await page.goto(base + '/risk-map');
  await controls()
    .getByRole('button', { name: 'Activate connected synthetic demo', exact: true })
    .click();
  await page.waitForFunction(
    () => JSON.parse(localStorage.getItem('malariascope-v1') || '{}').researchMode === 'DEMO',
  );
  await page.waitForFunction(() =>
    document.querySelector('.hotspot-stats')?.innerText.includes('9 matched'),
  );
  const initial = await page.evaluate(() => JSON.parse(localStorage.getItem('malariascope-v1')));
  assert.equal(initial.datasets.find((d) => d.id === 'saved-user').rows[0].cases, 5);
  assert.equal(initial.geometry, null, 'original geometry remains untouched in storage');
  assert.equal(initial.datasets.find((d) => d.id === 'synthetic-analytics-base').rows.length, 54);
  await go('/surveillance');
  assert.match(await page.locator('main').innerText(), /9 observations/);
  await go('/district-intelligence');
  await page.getByLabel('360 district', { exact: true }).selectOption('Kota Jayapura');
  await page.locator('.d360-hero').waitFor();
  assert.match(await page.locator('.d360-hero').innerText(), /Kota Jayapura/);
  await page.getByLabel('Context district', { exact: true }).selectOption('All districts');
  await go('/climate');
  assert.match(await page.locator('main').innerText(), /matched observations/);
  assert.ok(
    !(await page.locator('main').innerText()).includes('Climate observations not connected'),
  );
  await go('/forecasting');
  assert.equal(
    await page.getByLabel('Forecast evidence basis', { exact: true }).inputValue(),
    'LOADED',
  );
  assert.equal(
    await page.getByLabel('Forecast evidence basis', { exact: true }).isDisabled(),
    true,
  );
  assert.ok(!(await page.locator('main').innerText()).includes('2025 scientific interpretation'));
  const pairedCounts = await page
    .getByRole('table', { name: 'Forecast model leaderboard' })
    .locator('tbody tr')
    .evaluateAll((rows) => rows.map((row) => row.cells[7].textContent));
  assert.deepEqual(pairedCounts, ['9', '9', '9', '9', '9']);
  assert.ok(
    (await page
      .getByLabel('Observed-versus-predicted scatterplot', { exact: true })
      .locator('svg')
      .count()) > 0,
  );
  await page.getByRole('tab', { name: 'Error Analysis', exact: true }).click();
  assert.ok(
    !(await page.locator('main').innerText()).includes(
      'District-level model failure analysis is unavailable',
    ),
  );
  await go('/model-benchmarking');
  assert.equal(
    await page.getByLabel('Forecast evidence basis', { exact: true }).inputValue(),
    'LOADED',
  );
  await go('/early-warning');
  assert.match(await page.locator('main').innerText(), /[1-9]\d* current signals/);
  await go('/alerts');
  assert.match(await page.locator('main').innerText(), /SYNTHETIC/);
  assert.ok(!(await page.locator('main').innerText()).includes('No alerts'));
  await go('/risk-intelligence');
  assert.match(await page.locator('main').innerText(), /9 displayed districts/);
  await go('/spatial-analysis');
  assert.equal(
    await page.getByRole('heading', { name: 'Supplied global Moran’s I', exact: true }).count(),
    0,
  );
  await page.getByRole('button', { name: 'Run spatial analysis', exact: true }).click();
  await page
    .getByRole('heading', { name: 'Global spatial association · loaded observations', exact: true })
    .waitFor();
  await go('/risk-map');
  await page.waitForFunction(() =>
    document.querySelector('.hotspot-stats')?.innerText.includes('9 matched'),
  );
  await page.reload();
  await page.waitForFunction(() =>
    document.querySelector('.hotspot-stats')?.innerText.includes('9 matched'),
  );
  const demoState = await page.evaluate(() => JSON.parse(localStorage.getItem('malariascope-v1')));
  assert.ok(
    !(demoState.alertLog || []).some((a) => a.sourceDataset.classification === 'SYNTHETIC'),
    'demo signals do not contaminate historical alerts',
  );
  for (const width of [768, 375]) {
    await page.setViewportSize({ width, height: 900 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  }
  await page.setViewportSize({ width: 1366, height: 900 });
  await controls().getByRole('button', { name: 'Use supplied research data', exact: true }).click();
  await page.waitForFunction(
    () => JSON.parse(localStorage.getItem('malariascope-v1')).active === 'study-balanced',
  );
  const restored = await page.evaluate(() => JSON.parse(localStorage.getItem('malariascope-v1')));
  assert.equal(restored.datasets.find((d) => d.id === 'saved-user').rows[0].cases, 5);
  assert.ok(restored.geometry?.features.length === 9);
  await page.goto(base + '/dashboard');
  await page.locator('.metric').first().waitFor();
  assert.match(await page.locator('.metric').first().innerText(), /288,131/);
  const failed = await browser.newPage();
  await failed.route('**/data/demo/analytical-workspace.json', (r) =>
    r.fulfill({ status: 503, body: 'Unavailable' }),
  );
  await failed.goto(base + '/dashboard');
  await failed.locator('.analytical-demo-controls summary').click();
  await failed
    .getByRole('button', { name: 'Activate connected synthetic demo', exact: true })
    .click();
  await failed.locator('.analytical-demo-controls [role=alert]').waitFor();
  assert.equal(
    await failed.evaluate(() => JSON.parse(localStorage.getItem('malariascope-v1')).active),
    'study-balanced',
  );
  await failed.close();
  assert.deepEqual(errors, []);
  console.log(
    'Connected demo acceptance passed: empty-source activation, nine mapped districts, surveillance/climate/district/model/risk/alert/spatial workspaces, refresh, responsive layout, source/geometry preservation, research restoration and failure isolation.',
  );
} finally {
  await browser.close();
}
