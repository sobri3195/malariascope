import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const base = process.env.APP_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
  args: ['--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1080 } });
const errors = [];
const external = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (message) => {
  if (
    /unique.*key|Each child in a list|Unhandled promise|Map container is already initialized/i.test(
      message.text(),
    )
  )
    errors.push(message.text());
});
await page.route('**/*', async (route) => {
  if (!route.request().url().startsWith(base)) {
    external.push(route.request().url());
    await route.abort();
  } else await route.continue();
});
try {
  await page.goto(base + '/risk-map');
  await page.locator('.leaflet-overlay-pane path').first().waitFor();
  assert.match(
    await page.locator('.gis-provider-status').innerText(),
    /LOCAL VECTOR MAP.*DISTRICT GEOMETRY NOT CONNECTED/,
  );
  assert.ok(!external.some((u) => /carto|tile\.openstreetmap/.test(u)));
  await page.getByRole('button', { name: 'Layers', exact: true }).click();
  await page.getByLabel('Map source', { exact: true }).selectOption('osm');
  await page
    .getByText('Online basemap unavailable — analytical vector layers remain available.', {
      exact: true,
    })
    .waitFor();
  assert.ok((await page.locator('.leaflet-overlay-pane path').count()) > 0);
  await page.getByLabel('Map source', { exact: true }).selectOption('local');
  await page.goto(base + '/data-center');
  await page.getByRole('button', { name: 'Inspect /public/data/ surveillance file' }).click();
  await page.getByText(/Zero observations; headers are not a dataset/).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Load validated data' }).isEnabled(), false);
  await page.getByLabel('Import dataset').setInputFiles({
    name: 'bad.geojson',
    mimeType: 'application/json',
    buffer: Buffer.from('{"type":"FeatureCollection","features":[]}'),
  });
  await page
    .getByText('GeoJSON requires a nonempty FeatureCollection.', { exact: true })
    .first()
    .waitFor();
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('malariascope-v1'));
    s.datasets = [
      {
        id: 'audit-fixture',
        name: 'Isolated audit fixture',
        source: 'Synthetic browser acceptance only',
        checksum: 'test',
        created: '2026-01-01',
        classification: 'USER IMPORT',
        rows: [
          { district: 'Alpha', district_code: '1', year: 2025, cases: 100, population: 1000 },
          { district: 'Beta', district_code: '2', year: 2025, cases: NaN },
        ],
      },
    ];
    s.geometry = {
      type: 'FeatureCollection',
      features: ['Alpha', 'Beta'].map((district, i) => ({
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
      name: 'Synthetic isolated geometry',
      checksum: 'test-geometry',
      created: '2026-01-01',
      classification: 'USER IMPORT',
    };
    s.active = 'audit-fixture';
    s.layer = 'risk';
    s.mapContext = 'local';
    s.selection = { year: 2025, district: 'All districts', model: 'Persistence' };
    localStorage.setItem('malariascope-v1', JSON.stringify(s));
  });
  await page.goto(base + '/risk-map?year=2025&model=Persistence&district=All%20districts');
  await page.waitForFunction(() =>
    document.querySelector('.hotspot-stats')?.innerText.includes('2 matched'),
  );
  const paths = page.locator('.hotspot-map-frame .leaflet-overlay-pane path');
  assert.equal(await paths.count(), 2);
  const fills = await paths.evaluateAll((nodes) => nodes.map((n) => n.getAttribute('fill')));
  assert.ok(fills.includes('#cbd4d4'));
  assert.equal(new Set(fills).size, 2);
  await page.getByLabel('Map layer', { exact: true }).selectOption('prediction');
  await page
    .getByText(/Layer unavailable — required dataset not connected/)
    .first()
    .waitFor();
  await page.getByRole('button', { name: 'Layers', exact: true }).click();
  await page.getByText('View Layer Provenance', { exact: true }).click();
  assert.match(await page.locator('.layer-provenance').innerText(), /test-geometry/);
  await page.getByLabel('Map source', { exact: true }).selectOption('osm');
  await page
    .getByText('Online basemap unavailable — analytical vector layers remain available.', {
      exact: true,
    })
    .waitFor();
  assert.equal(await paths.count(), 2);
  await page.getByRole('button', { name: 'Close controls', exact: true }).click();
  await page
    .getByRole('button', { name: 'Load public healthcare facilities', exact: true })
    .click();
  await page.getByText(/Live public facility service unavailable/).waitFor();
  assert.equal(await paths.count(), 2);
  // Public evidence failure must not block local GIS, import controls, or other routes.
  await page.route('**/data/research-summary.json', (route) => route.abort());
  await page.route('**/data/model-performance.json', (route) => route.abort());
  await page.route('**/data/spatial-analysis.json', (route) => route.abort());
  await page.route('**/data/data-provenance.json', (route) => route.abort());
  await page.reload();
  await page
    .getByRole('heading', { name: 'Geospatial Hotspot Intelligence', exact: true })
    .waitFor();
  await paths.first().waitFor();
  assert.match(
    await page.getByLabel('Research evidence load error').innerText(),
    /local evidence remains accessible/,
  );
  await page.goto(base + '/data-center');
  await page.getByLabel('Dataset role', { exact: true }).selectOption('model-predictions');
  await page.getByLabel('Import dataset').setInputFiles({
    name: 'predictions.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      'district_code,district,year,model,prediction,trainingPeriod,validationPeriod,outputClassification\n1,Alpha,2025,Persistence,150,2020-2024,2025,UNVERIFIED\n',
    ),
  });
  await page.getByRole('button', { name: 'Load validated data' }).click();
  await page
    .getByText(
      'Separate analytical source loaded for GIS. Observations and scenarios remain unchanged.',
    )
    .waitFor();
  await page.goto(base + '/risk-map?year=2025&model=Persistence&district=All%20districts');
  await page.getByLabel('Map layer', { exact: true }).selectOption('prediction');
  await page.waitForFunction(() =>
    document.querySelector('.hotspot-stats')?.innerText.includes('150'),
  );
  for (const route of [
    '/',
    '/dashboard',
    '/risk-map',
    '/data-center',
    '/data-quality',
    '/district-intelligence',
    '/forecasting',
    '/spatial-analysis',
    '/risk-intelligence',
    '/force-health',
    '/presentation',
  ]) {
    await page.goto(base + route);
    await page.reload();
    await page.locator('#main h1').first().waitFor();
    assert.equal(
      await page.getByText('The workspace could not be rendered.', { exact: true }).count(),
      0,
      route,
    );
  }
  await page.goto(base + '/risk-map');
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole('button', { name: 'Layers', exact: true }).click();
  assert.ok(await page.getByLabel('GIS layer controls').isVisible());
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.deepEqual(errors, []);
  console.log(
    'GIS reliability passed: no default tiles/keys, blocked online services, country distinction, missing observations/layers, invalid geometry, separate predictions, provenance, mobile controls and direct route refreshes.',
  );
} finally {
  await browser.close();
}
