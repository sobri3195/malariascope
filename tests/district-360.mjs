import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const base = process.env.APP_URL || 'http://127.0.0.1:5173';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
  headless: true,
  args: ['--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1080 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
try {
  await page.goto(base + '/dashboard');
  await page.getByRole('heading', { name: 'Command Dashboard', exact: true }).waitFor();
  const fixtures = Array.from({ length: 5 }, (_, i) => ({
    district: `Test District ${i + 1}`,
    year: 2024,
    cases: (i + 1) * 100,
    population: 1000,
  }));
  const history = [2021, 2022, 2023].map((year, i) => ({
    district: 'Test District 5',
    year,
    cases: (i + 1) * 100,
    population: 1000,
  }));
  const climate = [2021, 2022, 2023, 2024].map((year, i) => ({
    district: 'Test District 5',
    year,
    cases: year === 2024 ? 500 : (i + 1) * 100,
    population: 1000,
    rainfall: (i + 1) * 100,
    temperature: year === 2024 ? 24 : 20 + i,
    humidity: 60 + i,
    prediction: year === 2024 ? 550 : (i + 1) * 100 + 10,
    model: 'Random Forest',
  }));
  const geometry = {
    type: 'FeatureCollection',
    features: fixtures.map((r, i) => ({
      type: 'Feature',
      properties: { district: r.district },
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
  await page.evaluate(
    ({ fixtures, history, climate, geometry }) => {
      const state = JSON.parse(localStorage.getItem('malariascope-v1'));
      state.datasets = [
        {
          id: 'obs',
          name: 'Test-only verified observation fixture',
          source: 'Isolated automated fixture; not scientific evidence',
          checksum: 'obs-test',
          created: '2026-10-07',
          classification: 'VERIFIED',
          rows: [...fixtures, ...history],
        },
        {
          id: 'climate',
          name: 'Test-only unverified climate fixture',
          source: 'Isolated automated fixture; not scientific evidence',
          checksum: 'climate-test',
          created: '2026-10-07',
          rows: climate,
        },
      ];
      state.active = 'obs';
      state.geometry = geometry;
      state.geometrySource = {
        name: 'Test-only polygon fixture',
        checksum: 'geometry-test',
        created: '2026-10-07',
        classification: 'USER IMPORT',
      };
      state.selection = { year: 2024, district: 'Test District 5', model: 'Random Forest' };
      state.alertStates = {};
      state.districtChecklists = {};
      state.districtBookmarks = [];
      localStorage.setItem('malariascope-v1', JSON.stringify(state));
    },
    { fixtures, history, climate, geometry },
  );
  await page.goto(
    base + '/district-intelligence?district=Test%20District%205&year=2024&model=Random%20Forest',
  );
  await page.getByRole('heading', { name: 'District Intelligence 360°', exact: true }).waitFor();
  assert.match(await page.locator('.d360-primary-metrics').innerText(), /500/);
  assert.match(await page.locator('.d360-explanation').innerText(), /90\.0th percentile/);
  assert.match(await page.locator('.d360-explanation').innerText(), /3 consecutive periods/);
  await page.getByLabel('Neighbor comparison').selectOption('Test District 4');
  assert.match(await page.locator('tbody').first().innerText(), /Test District 4/);
  await page.getByRole('button', { name: 'Bookmark district', exact: true }).click();
  await page.reload();
  assert.equal(
    await page
      .getByRole('button', { name: 'Bookmarked', exact: true })
      .getAttribute('aria-pressed'),
    'true',
  );
  for (const tab of [
    'Malaria',
    'Climate',
    'Forecast',
    'Spatial',
    'Risk',
    'Readiness',
    'Data Quality',
    'Provenance',
    'Overview',
  ]) {
    await page.getByRole('tab', { name: tab, exact: true }).click();
    await page.getByRole('tabpanel').waitFor();
    if (tab === 'Climate') {
      assert.match(await page.getByRole('tabpanel').innerText(), /2 SD/);
      assert.match(await page.getByRole('tabpanel').innerText(), /3 SD/);
    }
    if (tab === 'Forecast') {
      assert.match(await page.getByRole('tabpanel').innerText(), /550/);
      assert.match(await page.getByRole('tabpanel').innerText(), /50/);
    }
    if (tab === 'Spatial')
      assert.match(await page.getByRole('tabpanel').innerText(), /Test District 4/);
    if (tab === 'Readiness') {
      await page
        .getByLabel('District readiness: Staffing capacity reviewed')
        .selectOption('AVAILABLE');
    }
    if (tab === 'Provenance')
      assert.match(await page.getByRole('tabpanel').innerText(), /USER IMPORT/);
  }
  await page.getByLabel('Global year').selectOption('2023');
  assert.match(await page.locator('.d360-primary-metrics').innerText(), /300/);
  await page.getByLabel('Global year').selectOption('2024');
  await page.getByRole('tab', { name: 'Readiness', exact: true }).click();
  assert.equal(
    await page.getByLabel('District readiness: Staffing capacity reviewed').inputValue(),
    'AVAILABLE',
  );
  await page.getByLabel('360 district').selectOption('Test District 4');
  assert.equal(
    await page.getByLabel('District readiness: Staffing capacity reviewed').inputValue(),
    'NOT REVIEWED',
  );
  await page.getByLabel('360 district').selectOption('Test District 5');
  await page.getByLabel('District evidence scope').selectOption('verified');
  await page.getByRole('tab', { name: 'Climate', exact: true }).click();
  assert.match(await page.getByRole('tabpanel').innerText(), /Current observation unavailable/);
  assert.doesNotMatch(await page.getByRole('tabpanel').innerText(), /2 SD/);
  await page.getByLabel('District evidence scope').selectOption('loaded');
  await page
    .getByRole('button', { name: 'Generate District Intelligence Report', exact: true })
    .click();
  await page.getByLabel('Generated District Intelligence Report').waitFor();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export District Report JSON', exact: true }).click(),
  ]);
  const path = await download.path();
  const fs = await import('node:fs/promises');
  const report = JSON.parse(await fs.readFile(path, 'utf8'));
  assert.equal(report.summary.observedCases, 500);
  assert.equal(report.summary.prediction, 550);
  assert.equal(report.summary.percentile, 90);
  assert.ok(
    report.provenance.some((p) => p.datasetId === 'climate' && p.classification === 'USER IMPORT'),
  );
  assert.equal(report.readiness.find((r) => r.domain === 'Staffing preparedness').status, 'READY');
  await page.emulateMedia({ media: 'print' });
  assert.equal(await page.locator('.d360-workspace.has-report').isVisible(), false);
  assert.equal(await page.getByLabel('Generated District Intelligence Report').isVisible(), true);
  await page.emulateMedia({ media: 'screen' });
  await page.getByRole('button', { name: 'Close report', exact: true }).click();
  await page.getByRole('tab', { name: 'Overview', exact: true }).click();
  await page.locator('h1').first().click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(1800);
  await page.screenshot({ path: '/tmp/district-360-desktop.png', fullPage: true });
  await page.getByRole('link', { name: 'Locate district in GIS' }).click();
  assert.match(page.url(), /year=2024/);
  assert.equal(await page.getByLabel('Global district').inputValue(), 'Test District 5');
  await page.locator('.leaflet-interactive').first().click({ force: true });
  const selected = await page.getByLabel('Global district').inputValue();
  await page.goto(base + '/district-intelligence');
  assert.match(await page.locator('.d360-hero').innerText(), new RegExp(selected));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel('360 district').selectOption('Test District 5');
  await page.getByRole('tab', { name: 'Overview', exact: true }).click();
  await page.locator('h1').first().click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(1800);
  await page.screenshot({ path: '/tmp/district-360-mobile.png', fullPage: true });
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
    false,
  );
  await page.keyboard.press('Tab');
  await page.getByRole('tab', { name: 'Overview', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(
    await page.getByRole('tab', { name: 'Malaria', exact: true }).getAttribute('aria-selected'),
    'true',
  );
  assert.deepEqual(errors, []);
  console.log(
    'District 360 browser checks passed: nine tabs, source joins, trends, anomalies, comparisons, verified scope, bookmarks, district/year readiness isolation, reports, print, GIS/year synchronization, keyboard tabs, mobile layout.',
  );
} finally {
  await browser.close();
}
