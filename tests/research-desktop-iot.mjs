import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
  args: ['--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } }),
  base = process.env.APP_URL || 'http://127.0.0.1:4173',
  errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error' && /TypeError|ReferenceError|Map container|unique.*key/.test(m.text()))
    errors.push(m.text());
});
const ready = () =>
  page.waitForFunction(
    () => JSON.parse(localStorage.getItem('malariascope-v1') || '{}').active === 'study-balanced',
  );
const go = async (path) => {
  await page.goto(base + path);
  await ready();
};
const fits = async () =>
  assert.ok(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    'no horizontal document overflow',
  );
const context = '?year=2025&district=Kota%20Jayapura&model=Random%20Forest&dataset=study-balanced';
try {
  await go('/dashboard');
  assert.match(await page.locator('.metric').first().innerText(), /288,131/);
  await page.getByLabel('Context year', { exact: true }).selectOption('2020');
  assert.match(await page.locator('.metric').first().innerText(), /104,544/);
  await go('/dashboard' + context);
  assert.match(await page.locator('.metric').first().innerText(), /69,944/);
  await go('/district-intelligence' + context);
  assert.match(await page.locator('.d360-hero').innerText(), /Kota Jayapura/);
  assert.match(await page.locator('main').innerText(), /69,944/);
  await go('/risk-map' + context);
  await page.waitForFunction(() =>
    document.querySelector('.hotspot-stats')?.innerText.includes('9 matched'),
  );
  assert.match(await page.locator('.gis-provider-status').innerText(), /LOCAL VECTOR MAP/);
  await page.getByLabel('Map layer', { exact: true }).selectOption('cases');
  const geometry = await (
    await page.request.get(base + '/data/verified/papua-study-adm2.geojson')
  ).json();
  const kotaIndex = geometry.features.findIndex((f) => f.properties.district === 'Kota Jayapura');
  assert.ok(kotaIndex >= 0);
  await page.locator('.leaflet-overlay-pane path').nth(kotaIndex).click({ force: true });
  assert.match(await page.locator('.district-drawer').innerText(), /69,944/);
  await go('/forecasting' + context);
  await page.getByRole('heading', { name: 'Forecasting Workbench Pro', exact: true }).waitFor();
  assert.equal(
    await page
      .getByRole('table', { name: 'Forecast model leaderboard' })
      .locator('tbody tr')
      .count(),
    5,
  );
  assert.match(await page.getByLabel('Scientific interpretation').innerText(), /Persistence/);
  assert.match(await page.locator('main').innerText(), /40,940.3/);
  await page.getByRole('tab', { name: 'District Forecast Inspection', exact: true }).click();
  assert.match(await page.locator('main').innerText(), /69,944/);
  await go('/reports' + context);
  await page.getByRole('button', { name: 'Generate report', exact: true }).click();
  assert.match(
    await page.getByRole('article', { name: 'Generated research report' }).innerText(),
    /69,944/,
  );
  await go('/mobile/district' + context);
  await page.getByRole('heading', { name: 'District Intelligence', exact: true }).waitFor();
  assert.match(await page.locator('main').innerText(), /69,944/);
  await go('/smartwatch' + context);
  await page.getByLabel('Watch screen', { exact: true }).selectOption('Surveillance');
  assert.match(
    await page.getByRole('region', { name: 'MALARIASCOPE watch display' }).innerText(),
    /69,944/,
  );
  await go('/presentation' + context);
  await page.getByText(/LIVE RESEARCH PROTOTYPE/).waitFor();
  assert.match(await page.locator('main').innerText(), /LIVE RESEARCH PROTOTYPE/);
  await go('/aplikasi-desktop' + context);
  await page
    .getByRole('heading', { name: 'MALARIASCOPE Desktop Intelligence Workstation' })
    .waitFor();
  assert.match(await page.getByLabel('Desktop district inspector').innerText(), /69,944/);
  for (const width of [1366, 1920, 2560]) {
    await page.setViewportSize({ width, height: 1080 });
    await fits();
  }
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.getByRole('button', { name: 'Compare analyses', exact: true }).click();
  await page.getByLabel('Compare district B').selectOption('Jayapura');
  assert.match(await page.locator('.desk-center').innerText(), /Analysis B/);
  await page.keyboard.press('Control+k');
  await page.getByRole('dialog', { name: 'Desktop command palette' }).waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('dialog').count(), 0);
  await page.keyboard.press('g');
  await page.keyboard.press('m');
  await page.locator('.hotspot-workspace').waitFor();
  await page.getByRole('button', { name: 'Maximize analysis' }).click();
  assert.ok(
    await page.locator('.desktop-workstation').evaluate((n) => n.classList.contains('desk-max')),
  );
  await page.keyboard.press('Escape');
  await page.reload();
  await page.locator('.hotspot-workspace').waitFor();
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await page
    .locator('.desk-sidebar')
    .getByRole('button', { name: 'Dashboard', exact: true })
    .click();
  await page.getByRole('heading', { name: 'Command Dashboard', exact: true }).waitFor();
  await page.waitForTimeout(300);
  await go('/prospective-registry');
  await page.getByRole('heading', { name: 'Prospective Forecast Registry', exact: true }).waitFor();
  assert.match(await page.locator('main').innerText(), /No prospective forecasts registered/);
  await go('/model-monitoring');
  await page.getByRole('heading', { name: 'Model Performance Monitoring', exact: true }).waitFor();
  assert.match(await page.locator('main').innerText(), /INSUFFICIENT NEW OUTCOMES/);
  await go('/iot');
  await page
    .getByRole('heading', { name: 'No IoT sensor dataset connected.', exact: true })
    .waitFor();
  await page.locator('.iot-map .leaflet-overlay-pane path').first().waitFor();
  await page.reload();
  await page.getByRole('heading', { name: 'MALARIASCOPE IoT', exact: true }).waitFor();
  const registry = [
    {
      sensor_id: 'test-env',
      sensor_name: 'Isolated environmental test',
      sensor_type: 'weather station',
      district: 'Kota Jayapura',
      latitude: -2.53,
      longitude: 140.71,
      installation_type: 'Automated test only',
      data_source: 'Synthetic acceptance fixture',
      verification_status: 'USER IMPORT',
    },
  ];
  await page.getByLabel('Import sensor registry', { exact: true }).setInputFiles({
    name: 'isolated-sensors.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(registry)),
  });
  await page.getByRole('button', { name: 'Confirm Environmental Import' }).click();
  const time = new Date(Date.now() - 3600000).toISOString(),
    received = new Date().toISOString();
  const csv = `timestamp,received_timestamp,sensor_id,variable,value,unit,source\n${time},${received},test-env,rainfall_mm,150,mm,Isolated test fixture\n${time},${received},test-env,battery_pct,10,%,Isolated test fixture\n${time},${received},test-env,humidity_pct,120,%,Isolated test fixture\n`;
  await page.getByLabel('Import telemetry', { exact: true }).setInputFiles({
    name: 'isolated-telemetry.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv),
  });
  await page.getByRole('button', { name: 'Confirm Environmental Import' }).click();
  assert.match(await page.locator('body').innerText(), /Impossible measurement/);
  assert.match(await page.locator('body').innerText(), /Low Battery/);
  assert.match(await page.locator('body').innerText(), /Rainfall Threshold/);
  assert.equal(await page.locator('.iot-map .leaflet-interactive').count(), 10);
  await page.getByRole('button', { name: /Isolated environmental test/ }).click();
  assert.match(await page.locator('body').innerText(), /DEGRADED/);
  const original = await page.evaluate(() => localStorage.getItem('malariascope-iot-data'));
  const study = await page.evaluate(
    () => JSON.parse(localStorage.getItem('malariascope-v1')).datasets,
  );
  await page.locator('.iot-map .leaflet-control-zoom-in').click();
  await page.getByLabel('Simulation Mode', { exact: true }).check();
  await page.getByRole('button', { name: 'Start Simulation', exact: true }).click();
  await page.waitForFunction(() =>
    document.querySelector('.iot-metrics')?.innerText.includes('SIMULATED SENSOR STREAM'),
  );
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  assert.match(await page.locator('.iot-warning').innerText(), /SIMULATION MODE ACTIVE/);
  assert.equal(await page.getByLabel('Import telemetry', { exact: true }).isDisabled(), true);
  assert.equal(await page.evaluate(() => localStorage.getItem('malariascope-iot-data')), original);
  assert.deepEqual(
    await page.evaluate(() => JSON.parse(localStorage.getItem('malariascope-v1')).datasets),
    study,
  );
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export Filtered Telemetry', exact: true }).click();
  const download = await pending;
  const exported = JSON.parse(await fs.readFile(await download.path(), 'utf8'));
  assert.ok(
    exported.length &&
      exported.every(
        (r) => r.simulation && r.warning === 'SIMULATED SENSOR STREAM — NOT OBSERVED DATA',
      ),
  );
  await page.getByLabel('Simulation Mode', { exact: true }).uncheck();
  await page.reload();
  await page.getByRole('button', { name: /Isolated environmental test/ }).waitFor();
  assert.match(await page.locator('body').innerText(), /Isolated environmental test/);
  for (const width of [375, 768, 1366]) {
    await page.setViewportSize({ width, height: 900 });
    await fits();
  }
  await page.locator('.iot-map .leaflet-control-zoom-in').click();
  await page.goto(base + '/dashboard');
  await page.getByRole('heading', { name: 'Command Dashboard', exact: true }).waitFor();
  await page.waitForTimeout(300);
  assert.deepEqual(errors, []);
  console.log(
    'Research/desktop/IoT acceptance passed: shared counts across eight modules, all-nine local geometry, five saved models, desktop layouts/shortcuts/comparison/refresh, empty prospective registry, IoT local import/quality/alerts/map/simulation isolation/export/refresh/responsiveness.',
  );
} finally {
  await browser.close();
}
