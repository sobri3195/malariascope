import { chromium, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import Papa from 'papaparse';
import AxeBuilder from '@axe-core/playwright';
const base = process.env.APP_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
  headless: true,
  args: ['--no-sandbox'],
});
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // Core navigation and analysis must remain usable with external services blocked.
  await page.route('**/*', (route) =>
    route.request().url().startsWith(base) || route.request().url().startsWith('blob:')
      ? route.continue()
      : route.abort(),
  );
  await page.goto(base + '/asean-map');
  await expect(page.getByRole('heading', { name: 'ASEAN Map Explorer' })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Select Timor-Leste', exact: true }),
  ).toBeAttached();
  for (const name of [
    'Brunei Darussalam',
    'Cambodia',
    'Indonesia',
    'Lao PDR',
    'Malaysia',
    'Myanmar',
    'Philippines',
    'Singapore',
    'Thailand',
    'Timor-Leste',
    'Viet Nam',
  ])
    await expect(page.getByRole('button', { name: `Select ${name}`, exact: true })).toBeAttached();
  await expect(
    page.getByRole('button', { name: 'Select Papua New Guinea', exact: true }),
  ).toHaveCount(0);
  const countryPath = page.getByRole('button', { name: 'Select Cambodia', exact: true });
  await countryPath.focus();
  await page.keyboard.press('Enter');
  await expect(
    page
      .getByRole('region', { name: 'Region detail panel' })
      .or(page.getByRole('complementary', { name: 'Region detail panel' }))
      .getByRole('heading', { name: 'Cambodia', exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId('region-value')).toContainText('Unavailable');
  await page.getByLabel('Geographic search', { exact: true }).fill('Indonesia');
  await page.getByRole('button', { name: 'Go', exact: true }).click();
  await page.getByRole('button', { name: 'Explore available Papua ADM2 data' }).click();
  await expect(page.getByLabel('Study district')).toContainText('Biak Numfor');
  await expect(
    page.getByRole('button', { name: 'Inspect district Biak Numfor', exact: true }),
  ).toBeAttached();
  await page.getByLabel('Study district').selectOption('Biak Numfor');
  await expect(page.getByTestId('region-value')).toContainText('4,306');
  await page.getByLabel('Reporting year', { exact: true }).selectOption('2020');
  await expect(page.getByTestId('region-value')).toContainText('641');
  await page.getByRole('button', { name: 'Next year', exact: true }).click();
  await expect(page.getByTestId('region-value')).toContainText('660');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.getByLabel('Reporting year', { exact: true })).not.toHaveValue('2021', {
    timeout: 5000,
  });
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByLabel('Reporting year', { exact: true }).selectOption('2025');
  await page.getByLabel('Regional indicator').selectOption('prediction');
  await expect(page.getByTestId('region-value')).toContainText('4,257.8');
  await expect(page.getByRole('region', { name: 'Regional map legend' })).toContainText(
    'Model prediction',
  );
  const districtPath = page.getByRole('button', {
    name: 'Inspect district Biak Numfor',
    exact: true,
  });
  await expect(districtPath).toHaveAttribute('stroke-dasharray', '4 3');
  await page.getByLabel('Thematic opacity', { exact: true }).fill('0.4');
  await expect(districtPath).toHaveAttribute('fill-opacity', '0.4');
  await page.getByLabel('Show thematic layer', { exact: true }).uncheck();
  await expect(districtPath).not.toBeAttached();
  await page.getByLabel('Show thematic layer', { exact: true }).check();
  await page.getByLabel('Top layer').selectOption('boundaries');
  await expect(page.locator('.asean-leaflet .leaflet-overlay-pane path').last()).toHaveAttribute(
    'fill',
    'none',
  );
  await page.getByLabel('Show boundary layer', { exact: true }).uncheck();
  await expect(page.locator('.asean-leaflet path[fill="none"]')).toHaveCount(0);
  await page.getByLabel('Show boundary layer', { exact: true }).check();
  await expect(page.locator('.asean-leaflet path[fill="none"]')).toHaveCount(9);
  await page.getByLabel('Regional indicator').selectOption('cases');
  await page.getByRole('button', { name: 'Save map view', exact: true }).click();
  await page.getByLabel('Reporting year', { exact: true }).selectOption('2020');
  await page.getByRole('button', { name: 'Restore saved view', exact: true }).click();
  await expect(page.getByLabel('Reporting year', { exact: true })).toHaveValue('2025');
  const csvDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV', exact: true }).click();
  const csv = await readFile(await (await csvDownload).path(), 'utf8');
  const parsed = Papa.parse(csv, { header: true }).data;
  if (
    parsed.length !== 1 ||
    parsed[0].district !== 'Biak Numfor' ||
    parsed[0].value !== '4306' ||
    parsed[0].year !== '2025'
  )
    throw Error('Filtered CSV values do not match the visible selection');
  const vectorDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export GeoJSON', exact: true }).click();
  const vector = JSON.parse(await readFile(await (await vectorDownload).path(), 'utf8'));
  if (
    vector.features.length !== 1 ||
    vector.features[0].properties.value !== 4306 ||
    !vector.features[0].properties.boundary_source.includes('CC BY')
  )
    throw Error('Filtered GeoJSON value or provenance mismatch');
  const pngDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export map PNG', exact: true }).click();
  const imageDownload = await pngDownload;
  await imageDownload.saveAs('/tmp/malariascope-asean-map-export.png');
  const png = await readFile(await imageDownload.path());
  if (png.subarray(1, 4).toString() !== 'PNG' || png.length < 3000)
    throw Error('Map PNG is invalid or empty');
  await page.getByLabel('Regional indicator').selectOption('deaths');
  await expect(page.getByTestId('region-value')).toContainText('Unavailable');
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeDisabled();
  await page.reload();
  await expect(page.getByLabel('Regional indicator')).toHaveValue('deaths');
  await expect(page.getByTestId('region-value')).toContainText('Unavailable');
  await page.getByRole('button', { name: 'Reset map & filters', exact: true }).click();
  const configDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export configuration', exact: true }).click();
  const config = JSON.parse(await readFile(await (await configDownload).path(), 'utf8'));
  if (config.filters.area !== 'asean' || config.filters.camera[2] > 4)
    throw Error('Reset did not restore the ASEAN extent');
  await page.getByLabel('Thailand', { exact: true }).check();
  await page.getByLabel('Viet Nam', { exact: true }).check();
  await expect(
    page.getByRole('region', { name: 'Regional comparison' }).locator('tbody tr'),
  ).toHaveCount(2);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: 'Zoom in regional map' })).toBeVisible();
  await page.getByRole('button', { name: 'Zoom in regional map' }).click();
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1))
    throw Error('Mobile page overflows');
  await page.screenshot({ path: '/tmp/malariascope-asean-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: '/tmp/malariascope-asean-desktop.png', fullPage: true });
  const accessibility = await new AxeBuilder({ page }).include('.asean-workspace').analyze();
  if (accessibility.violations.length)
    throw Error(
      'ASEAN accessibility violations: ' + accessibility.violations.map((v) => v.id).join(', '),
    );
  await page.goto(base + '/risk-map');
  await expect(
    page.getByRole('heading', { name: 'Geospatial Hotspot Intelligence', exact: true }),
  ).toBeVisible();
  if (errors.length) throw Error(errors.join('\n'));
  // Explicit boundary failure and retry; do not allow an empty map to count as success.
  const offline = await browser.newPage();
  await offline.route('**/asean-countries.geojson', (route) =>
    route.fulfill({ status: 503, body: 'Unavailable' }),
  );
  await offline.goto(base + '/asean-map');
  await expect(
    offline.getByRole('alert').filter({ hasText: 'ASEAN boundary files' }),
  ).toBeVisible();
  await offline.unroute('**/asean-countries.geojson');
  await offline.getByRole('button', { name: 'Retry regional boundaries' }).click();
  await expect(
    offline.getByRole('button', { name: 'Select Singapore', exact: true }),
  ).toBeAttached();
  await offline.close();
  console.log(
    'PASS ASEAN: 11 members, country keyboard selection, Papua drill-down, annual playback, model distinction, layer controls, URL restore, comparison, filtered CSV/GeoJSON/PNG, mobile, boundary retry and existing GIS route.',
  );
} finally {
  await browser.close();
}
