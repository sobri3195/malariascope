import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const base = process.env.APP_URL || 'http://127.0.0.1:5173';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
  headless: true,
  args: ['--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1080 } }),
  errors = [];
page.on('pageerror', (error) => errors.push(error.message));
try {
  await page.goto(base + '/risk-map');
  await page
    .getByRole('heading', { name: 'Geospatial Hotspot Intelligence', exact: true })
    .waitFor();
  assert.match(
    await page.locator('.hotspot-workspace').innerText(),
    /Country outlines provide geographic context only/,
  );
  // Isolated analytical and public-response fixtures; never production seed evidence.
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('malariascope-v1'));
    state.datasets = [
      {
        id: 'map-fixture',
        name: 'Isolated map surveillance fixture',
        source: 'Automated fixture',
        checksum: 'map-sha',
        classification: 'USER IMPORT',
        created: '2026-01-01T00:00:00Z',
        rows: [2024, 2025, 2026].flatMap((year) =>
          ['A', 'B', 'C'].map((district, i) => ({
            district,
            district_code: String(i + 1),
            year,
            cases: [100, 400, 600][i] * (year === 2024 ? 0.5 : year === 2026 ? 1.5 : 1),
            population: 1000,
            rainfall: 1000 + i * 100,
            temperature: 24 + i,
            humidity: 70,
            prediction: [120, 420, 620][i],
            model: 'Random Forest',
          })),
        ),
      },
    ];
    state.geometry = {
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
    state.geometrySource = {
      name: 'Isolated district geometry',
      checksum: 'geometry-sha',
      classification: 'USER IMPORT',
      created: '2026-01-01T00:00:00Z',
    };
    state.active = 'map-fixture';
    state.layer = 'cases';
    state.selection = { year: 2025, district: 'All districts', model: 'Random Forest' };
    localStorage.setItem('malariascope-v1', JSON.stringify(state));
  });
  await page.goto(base + '/risk-map?year=2025&district=All%20districts&model=Random%20Forest');
  await page.getByLabel('Map statistics 2025').waitFor();
  await page.locator('.hotspot-map-frame .leaflet-interactive').first().waitFor();
  let stats = page.getByLabel('Map statistics 2025');
  await page.waitForFunction(() =>
    document.querySelector('.hotspot-stats')?.innerText.includes('3 matched'),
  );
  assert.match(await stats.innerText(), /600/);
  assert.match(await stats.innerText(), /400 \/ 366.67/);
  assert.match(await stats.innerText(), /1 \/ 1/);
  assert.equal(await page.getByLabel('Spatial analysis mode').locator('option').count(), 7);
  await page.getByLabel('Map time slider').fill('0');
  assert.equal(await page.getByLabel('Global year').inputValue(), '2024');
  await page.getByLabel('Map time slider').fill('1');
  assert.equal(await page.getByLabel('Global year').inputValue(), '2025');
  await page.getByLabel('Compare map years').check();
  await page.getByLabel('Comparison year B').selectOption('2024');
  assert.equal(await page.locator('.hotspot-map-frame').count(), 2);
  assert.match(await page.locator('.hotspot-maps').innerText(), /Shared scale across/);
  const comparison = page
    .getByRole('heading', { name: 'District comparison · 2025 versus 2024' })
    .locator('..')
    .locator('..');
  assert.match(await comparison.innerText(), /100\s+50\s+-50/);
  await page.getByLabel('Global district').selectOption('B');
  await page.waitForFunction(
    () =>
      document.querySelectorAll('.hotspot-selected').length === 2 &&
      document.querySelectorAll('.hotspot-neighbor').length === 4,
  );
  const context = page.getByLabel('Spatial Context');
  assert.match(await context.innerText(), /A, C/);
  assert.match(await context.innerText(), /HIGH–LOW/);
  assert.match(await context.innerText(), /1.14 × mean neighbor cases/);
  await page.getByLabel('Spatial analysis mode').selectOption('prediction_risk');
  assert.match(await page.getByLabel('Map statistics 2025').innerText(), /HIGH/);
  await page.getByLabel('Global model').selectOption('Persistence');
  await page.waitForFunction(() =>
    document.querySelector('.hotspot-stats')?.innerText.includes('0 known values'),
  );
  await page.getByLabel('Global model').selectOption('Random Forest');
  await page.getByLabel('Spatial analysis mode').selectOption('residual');
  assert.match(await page.getByLabel('Map statistics 2025').innerText(), /20 \/ 20/);
  await page.getByLabel('Spatial analysis mode').selectOption('completeness');
  assert.match(await page.getByLabel('Map statistics 2025').innerText(), /100 \/ 100/);
  await page.getByLabel('Spatial analysis mode').selectOption('cluster');
  await page.waitForFunction(() =>
    document.querySelector('.hotspot-stats')?.innerText.includes('HIGH–HIGH'),
  );
  await page.getByLabel('Map Moran permutations').selectOption('99');
  await page.getByRole('button', { name: 'Calculate map Moran’s I', exact: true }).click();
  await page.getByLabel('Moran analysis').getByText('Global Moran’s I', { exact: true }).waitFor();
  assert.match(await page.getByLabel('Moran analysis').innerText(), /99 permutations/);
  await page.getByLabel('Global year').selectOption('2026');
  assert.match(await page.getByLabel('Moran analysis').innerText(), /No derived Moran result/);
  await page.getByLabel('Global year').selectOption('2025');
  await page.route('https://overpass-api.de/api/interpreter*', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        osm3s: { timestamp_osm_base: '2026-10-01T00:00:00Z' },
        elements: [
          {
            type: 'node',
            id: 101,
            lat: -3.5,
            lon: 139.5,
            tags: { amenity: 'clinic', name: 'Public fixture clinic' },
          },
          {
            type: 'node',
            id: 102,
            lat: -3.4,
            lon: 139.6,
            tags: { amenity: 'hospital', military: 'hospital', name: 'Excluded military fixture' },
          },
          {
            type: 'node',
            id: 103,
            lat: -3.3,
            lon: 139.7,
            tags: { amenity: 'hospital', access: 'private', name: 'Excluded restricted fixture' },
          },
        ],
      }),
    }),
  );
  await page
    .getByRole('button', { name: 'Load public healthcare facilities', exact: true })
    .click();
  await page.getByText(/1 public facility records retained/).waitFor();
  await page.locator('.hotspot-map-frame .public-facility-marker').first().waitFor();
  assert.equal(await page.locator('.hotspot-map-frame .public-facility-marker').count(), 2);
  await page.locator('.hotspot-map-frame .public-facility-marker').first().click({ force: true });
  assert.match(await page.locator('.leaflet-popup-content').innerText(), /Public fixture clinic/);
  assert.equal(await page.getByText('Excluded military fixture').count(), 0);
  await page.getByLabel('Show public healthcare facilities').uncheck();
  assert.equal(await page.locator('.hotspot-map-frame .public-facility-marker').count(), 0);
  await page.getByLabel('Show public healthcare facilities').check();
  await page.getByLabel('Spatial analysis mode').selectOption('cases');
  const [dataDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export map data / GeoJSON', exact: true }).click(),
  ]);
  const data = JSON.parse(await fs.readFile(await dataDownload.path(), 'utf8'));
  assert.equal(data.source.checksum, 'map-sha');
  assert.equal(data.facilities.facilities.length, 1);
  assert.equal(data.facilities.facilities[0].id, 'node/101');
  assert.equal(data.yearB, 2024);
  assert.ok(
    data.geojson.features.every((f) => f.properties.district && f.geometry.type === 'Polygon'),
  );
  const [svgDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export map SVG · Year A', exact: true }).click(),
  ]);
  const svg = await fs.readFile(await svgDownload.path(), 'utf8');
  assert.match(svg, /<svg/);
  assert.match(svg, /map-sha/);
  assert.match(svg, /Basemap tiles omitted/);
  assert.match(svg, /Public fixture clinic/);
  assert.doesNotMatch(svg, /Excluded military fixture/);
  assert.match(svg, /stroke-dasharray/);
  const [secondSvg] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export map SVG · Year B', exact: true }).click(),
  ]);
  assert.match(await fs.readFile(await secondSvg.path(), 'utf8'), /2024/);
  await page.getByRole('button', { name: 'Fullscreen map', exact: true }).click();
  await page.waitForFunction(() => document.fullscreenElement !== null);
  await page.locator('.hotspot-workspace.is-fullscreen').waitFor();
  assert.equal(await page.locator('.hotspot-workspace.is-fullscreen').count(), 1);
  await page.getByRole('button', { name: 'Exit fullscreen map', exact: true }).click();
  await page.waitForFunction(() => document.fullscreenElement === null);
  await page.getByLabel('Compare map years').uncheck();
  await page.getByLabel('Global district').selectOption('All districts');
  await page.getByRole('button', { name: 'Reset map', exact: true }).click();
  for (let step = 0; step < 5; step++) {
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
    await page.waitForTimeout(300);
  }
  const visible = +(await page.locator('.hotspot-stats strong').first().innerText());
  assert.ok(visible < 3);
  await page.getByRole('button', { name: 'Reset map', exact: true }).click();
  await page.getByLabel('Global year').selectOption('2024');
  await page.getByRole('button', { name: 'Play map animation', exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector('[aria-label="Global year"]')?.value === '2025',
  );
  await page.getByRole('button', { name: 'Pause map animation', exact: true }).click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForFunction(
    () => document.querySelector('[aria-label="Play map animation"]')?.disabled,
  );
  assert.equal(
    await page.getByRole('button', { name: 'Play map animation', exact: true }).isDisabled(),
    true,
  );
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.route('https://overpass-api.de/api/interpreter*', (route) =>
    route.fulfill({ status: 503, body: 'Unavailable' }),
  );
  await page
    .getByRole('button', { name: 'Refresh public healthcare facilities', exact: true })
    .click();
  await page.getByRole('alert').filter({ hasText: '503' }).waitFor();
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: '/tmp/hotspot-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel('Compare map years').check();
  await page.evaluate(() => scrollTo(0, 0));
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
    false,
  );
  await page.screenshot({ path: '/tmp/hotspot-mobile.png', fullPage: true });
  await page.goto(base + '/risk-map?year=2030&district=B');
  await page.getByText(/No active-source observations for selected year 2030/).waitFor();
  assert.match(await page.getByLabel('Map statistics 2030').innerText(), /0 known values/);
  assert.match(await page.getByLabel('Spatial Context').innerText(), /A, C/);
  assert.match(await page.getByLabel('Spatial Context').innerText(), /Data not available/);
  assert.deepEqual(errors, []);
  console.log(
    'Hotspot browser checks passed: six modes, model-scoped layers, slider/playback, comparison/shared scale, visible statistics, neighbors/context, Moran invalidation, public facility filtering/service errors, SVG/data exports, fullscreen, reduced motion, mobile layout, sparse years.',
  );
} finally {
  await browser.close();
}
