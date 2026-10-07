import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
  args: ['--no-sandbox'],
});
const context = await browser.newContext({
  viewport: { width: 375, height: 812 },
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage(),
  errors = [],
  assets = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('request', (r) => {
  if (r.url().includes('/assets/')) assets.push(r.url());
});
const base = process.env.APP_URL || 'http://127.0.0.1:4173';
const state = () => page.evaluate(() => JSON.parse(localStorage.getItem('malariascope-v1')));
const heading = async (name) => page.getByRole('heading', { name, exact: true }).first().waitFor();
const navigate = async (path) => {
  await page.goto(base + '/mobile' + path);
};
const fits = async () =>
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    true,
    'mobile layout must not scroll horizontally',
  );
const filters = async (year, district) => {
  await page.getByRole('button', { name: 'Mobile context filters' }).click();
  if (year) await page.getByLabel('Mobile year', { exact: true }).selectOption(String(year));
  if (district) await page.getByLabel('Mobile district', { exact: true }).selectOption(district);
  await page.getByRole('button', { name: 'Apply / close' }).click();
};
try {
  await navigate('');
  await heading('Current Intelligence');
  assert.equal(await page.locator('.m-bottom a').count(), 5);
  assert.equal(await page.locator('aside').count(), 0);
  await fits();
  assert.ok(
    !assets.some((s) => /DesktopApp-|charts-|gis-.*\.js|hotspot-spatial|MobileAnalysis/.test(s)),
    'home must not load desktop, charts, GIS or heavy analytical modules',
  );
  assert.match(
    await page.locator('main').innerText(),
    /Supplied study aggregate — not independently verified/,
  );
  await page.getByRole('link', { name: 'Compare Models', exact: true }).click();
  await heading('Model Comparison');
  assert.match(
    await page.locator('main').innerText(),
    /Persistence outperformed Random Forest on the primary 2025 MAE metric/,
  );
  await page.getByLabel('Mobile primary metric').selectOption('rmse');
  assert.match(await page.locator('main').innerText(), /Only Random Forest/);
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('malariascope-v1'));
    s.datasets = [
      {
        id: 'mobile-fixture',
        name: 'Isolated mobile acceptance fixture',
        source: 'Synthetic automated test only',
        classification: 'USER IMPORT',
        checksum: 'fixture-not-research',
        created: new Date().toISOString(),
        rows: [2022, 2023, 2024, 2025].flatMap((year) =>
          ['A', 'B'].map((district, i) => ({
            district,
            district_code: String(i + 1),
            year,
            cases: district === 'A' ? (year === 2025 ? 400 : year === 2024 ? 200 : 100) : 50,
            population: 1000,
            rainfall: 100 + (year - 2022) * 10,
            temperature: 24 + (year - 2022),
            prediction: district === 'A' ? 450 : 70,
            model: 'Random Forest',
          })),
        ),
      },
    ];
    s.active = 'mobile-fixture';
    s.rules = [
      {
        id: 'mobile-burden',
        metric: 'incidence',
        operator: '>',
        value: 300,
        severity: 'HIGH',
        category: 'High Burden',
        enabled: true,
        persistence: 1,
        suppress: false,
      },
    ];
    s.geometry = {
      type: 'FeatureCollection',
      features: ['A', 'B'].map((district, i) => ({
        type: 'Feature',
        properties: { district, district_code: String(i + 1) },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [137 + i, -4],
              [138 + i, -4],
              [138 + i, -3],
              [137 + i, -3],
              [137 + i, -4],
            ],
          ],
        },
      })),
    };
    s.selection = { year: 2025, district: 'All districts', model: 'Random Forest' };
    localStorage.setItem('malariascope-v1', JSON.stringify(s));
  });
  await navigate('?year=2025&district=All+districts&model=Random+Forest');
  await heading('Current Intelligence');
  assert.match(await page.locator('main').innerText(), /450/);
  assert.match(await page.getByLabel('Mobile data status').innerText(), /Connected/);
  await filters(2024, 'A');
  assert.match(await page.locator('main').innerText(), /200/);
  await filters(2025, 'A');
  await page.locator('.m-bottom').getByRole('link', { name: 'District', exact: true }).click();
  await heading('District Intelligence');
  assert.match(await page.locator('main').innerText(), /HIGH/);
  assert.match(await page.locator('main').innerText(), /300 ≤ score < 500/);
  assert.match(await page.locator('main').innerText(), /100/);
  await page.getByRole('button', { name: 'Bookmark district', exact: true }).click();
  assert.deepEqual((await state()).districtBookmarks, ['A']);
  await page.locator('.m-bottom').getByRole('link', { name: 'Alerts', exact: true }).click();
  await heading('Alert Center');
  await page.getByRole('button', { name: 'Trigger Data', exact: true }).click();
  assert.match(await page.getByRole('dialog').innerText(), /fixture-not-research/);
  await page.getByRole('button', { name: 'Close panel' }).click();
  await page.getByRole('button', { name: 'Review', exact: true }).click();
  await page.getByRole('button', { name: 'Acknowledge', exact: true }).click();
  assert.equal(Object.values((await state()).alertStates)[0].status, 'ACKNOWLEDGED');
  await page.getByLabel('Alert filter').selectOption('Reviewed');
  assert.equal(await page.getByRole('button', { name: 'Acknowledge', exact: true }).count(), 1);
  await page.locator('.m-bottom').getByRole('link', { name: 'Map', exact: true }).click();
  await heading('Risk Map');
  await page.locator('.leaflet-interactive').first().waitFor();
  assert.equal(
    await page.evaluate(() => !!document.querySelector('.map-canvas')._leaflet_id),
    true,
  );
  await page.locator('.leaflet-interactive').first().tap();
  await page.getByRole('dialog', { name: 'A · District evidence' }).waitFor();
  assert.match(await page.getByRole('dialog').innerText(), /400/);
  await page.getByRole('button', { name: 'Close panel' }).click();
  await page.getByLabel('Mobile map mode').selectOption('prediction_risk');
  await page.getByRole('button', { name: 'Advanced layers' }).click();
  await page.getByLabel('Advanced mobile layer').selectOption('rainfall_anomaly');
  await page.getByRole('button', { name: 'Close panel' }).click();
  await page.getByRole('button', { name: 'Locate selected' }).click();
  await page.getByRole('button', { name: 'Fullscreen', exact: true }).click();
  assert.equal(await page.locator('.m-map-fullscreen').count(), 1);
  await page.getByRole('button', { name: 'Exit fullscreen' }).click();
  await fits();
  await navigate('/readiness');
  await heading('Readiness Review');
  const diagnostics = page
    .locator('.m-card')
    .filter({ has: page.getByRole('heading', { name: 'Diagnostics', exact: true }) });
  assert.match(await diagnostics.innerText(), /ATTENTION/);
  await diagnostics.getByText('Evidence and local checklist', { exact: true }).click();
  await page
    .getByLabel('A Diagnostic capability documented', { exact: true })
    .selectOption('AVAILABLE');
  await page
    .getByLabel('A Diagnostic capability documented note', { exact: true })
    .fill('Locally reviewed fixture');
  assert.equal(
    (await state()).districtChecklists['a:2025']['Diagnostic capability documented'],
    'AVAILABLE',
  );
  await page.reload();
  await heading('Readiness Review');
  await diagnostics.getByText('Evidence and local checklist', { exact: true }).click();
  assert.equal(
    await page.getByLabel('A Diagnostic capability documented', { exact: true }).inputValue(),
    'AVAILABLE',
  );
  await fits();
  await navigate('/surveillance');
  await heading('Surveillance');
  await filters(2025, 'All districts');
  await page.getByLabel('Search districts').fill('B');
  assert.equal(await page.locator('main .m-card').count(), 1);
  assert.match(await page.locator('main .m-card').innerText(), /50/);
  await page.getByLabel('Sort surveillance').selectOption('Risk');
  await navigate('/report');
  await heading('Mobile Research Report');
  await page.getByRole('button', { name: 'Generate mobile report' }).click();
  await page.locator('.m-report-output').waitFor();
  assert.match(await page.locator('.m-report-output').innerText(), /fixture-not-research/);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export JSON', exact: true }).click();
  const d = await download,
    report = JSON.parse(await fs.readFile(await d.path(), 'utf8'));
  assert.equal(report.metadata.period.end, 2025);
  assert.match(report.disclaimer, /RESEARCH PROTOTYPE/);
  const csv = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV' }).click();
  assert.match(await fs.readFile(await (await csv).path(), 'utf8'), /Source|District|district/);
  await page.emulateMedia({ media: 'print' });
  assert.equal(await page.locator('.m-bottom').isVisible(), false);
  await page.emulateMedia({ media: 'screen' });
  await fits();
  await navigate('/quality');
  await heading('Scientific Integrity');
  assert.match(await page.locator('main').innerText(), /Field completeness/);
  for (const size of [
    { width: 320, height: 568 },
    { width: 812, height: 375 },
    { width: 1024, height: 768 },
  ]) {
    await page.setViewportSize(size);
    await navigate('');
    await heading('Current Intelligence');
    await fits();
    const min = await page
      .locator('.m-bottom a')
      .evaluateAll((nodes) => Math.min(...nodes.map((n) => n.getBoundingClientRect().height)));
    assert.ok(min >= 44);
  }
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByText('DATA CACHED', { exact: true }).waitFor();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await context.setOffline(true);
  await page.reload();
  await heading('Current Intelligence');
  assert.match(await page.locator('.m-header').innerText(), /OFFLINE/);
  assert.match(await page.locator('.m-header').innerText(), /freshness is not established/);
  assert.deepEqual((await state()).districtBookmarks, ['A']);
  await page.locator('.m-bottom').getByRole('link', { name: 'District', exact: true }).click();
  await heading('District Intelligence');
  await page.locator('.m-bottom').getByRole('link', { name: 'Map', exact: true }).click();
  await heading('Risk Map');
  await page.locator('.leaflet-interactive').first().waitFor();
  await context.setOffline(false);
  await page.goto(base + '/alerts');
  await page.getByLabel('Context year', { exact: true }).waitFor();
  assert.equal(Object.values((await state()).alertStates)[0].status, 'ACKNOWLEDGED');
  assert.equal(await page.locator('.mobile-app').count(), 0);
  const unavailable = await browser.newContext({
    viewport: { width: 375, height: 812 },
    serviceWorkers: 'block',
  });
  await unavailable.route('**/data/model-performance.json', (route) =>
    route.fulfill({ status: 503, body: 'Research source unavailable' }),
  );
  const partial = await unavailable.newPage();
  partial.on('pageerror', (e) => errors.push(e.message));
  await partial.goto(base + '/mobile');
  await partial.getByRole('heading', { name: 'Current Intelligence', exact: true }).waitFor();
  assert.match(
    await partial.locator('main').innerText(),
    /Public research files unavailable: model-performance/,
  );
  assert.match(await partial.locator('main').innerText(), /Data not available/);
  await partial.getByRole('link', { name: 'Compare Models', exact: true }).click();
  await partial.getByRole('heading', { name: 'Model Comparison', exact: true }).waitFor();
  assert.match(await partial.locator('main').innerText(), /a model ranking cannot be established/);
  await unavailable.close();
  assert.deepEqual(errors, []);
  console.log(
    'Mobile acceptance passed: direct routing, lazy home, phone/landscape/tablet layouts, filters, GIS tap/sheet/fullscreen, risk evidence, alerts, persisted readiness/bookmarks, model ranking, exports, offline reload and desktop shared state.',
  );
} finally {
  await browser.close();
}
