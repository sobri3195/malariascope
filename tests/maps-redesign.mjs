import { chromium, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
const base = process.env.APP_URL || 'http://127.0.0.1:4173';
const countries = JSON.parse(
  await readFile(
    new URL('../public/data/geography/asean-countries.geojson', import.meta.url),
    'utf8',
  ),
);
const study = JSON.parse(
  await readFile(
    new URL('../public/data/verified/papua-study-adm2.geojson', import.meta.url),
    'utf8',
  ),
);
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
  args: ['--no-sandbox'],
});
try {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage(),
    errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/*', (route) =>
    new URL(route.request().url()).origin === new URL(base).origin ||
    route.request().url().startsWith('blob:')
      ? route.continue()
      : route.abort(),
  );
  const frame = page.locator('.asean-map-frame');
  async function config() {
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export configuration', exact: true }).click();
    return JSON.parse(await readFile(await (await pending).path(), 'utf8'));
  }
  const project = ([lon, lat], zoom) => {
    const s = Math.sin((lat * Math.PI) / 180),
      size = 256 * 2 ** zoom;
    return [((lon + 180) / 360) * size, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * size];
  };
  async function fitted(features) {
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    const { filters } = await config(),
      bounds = await frame.boundingBox();
    const [lat, lon, zoom] = filters.camera,
      center = project([lon, lat], zoom);
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    const verify = (coordinates) => {
      if (typeof coordinates[0] === 'number') {
        const p = project(coordinates, zoom),
          x = p[0] - center[0] + bounds.width / 2,
          y = p[1] - center[1] + bounds.height / 2;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
        if (x < -2 || x > bounds.width + 2 || y < -2 || y > bounds.height + 2)
          throw Error('Selected geographic geometry is outside the map viewport');
      } else coordinates.forEach(verify);
    };
    features.forEach((feature) => verify(feature.geometry.coordinates));
    if (Math.max((maxX - minX) / bounds.width, (maxY - minY) / bounds.height) < 0.45)
      throw Error('Selected geography is unnecessarily small in the map viewport');
  }
  await page.goto(base + '/asean-map');
  await expect(
    page.getByRole('button', { name: 'Select Timor-Leste', exact: true }),
  ).toBeAttached();
  if ((await frame.boundingBox()).height < 700) throw Error('Desktop map is below 70vh');
  await fitted(countries.features);
  await expect(page.getByRole('button', { name: 'Layers', exact: true })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  const legend = page.getByRole('region', { name: 'Regional map legend' });
  await expect(legend).toContainText('Administrative context');
  await expect(legend).not.toContainText('Equal-width');
  await page.getByRole('button', { name: 'Select Indonesia', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('navigation', { name: 'Map geographic breadcrumb' })).toContainText(
    'Indonesia',
  );
  await fitted(countries.features.filter((f) => f.properties['ISO3166-1-Alpha-3'] === 'IDN'));
  await page.getByRole('button', { name: 'Explore available Papua ADM2 data' }).click();
  await fitted(study.features);
  await page.getByRole('button', { name: 'Layers', exact: true }).click();
  await expect(page.getByLabel('Regional indicator')).toHaveValue('boundaries');
  await page.getByLabel('Study district').selectOption('Biak Numfor');
  await page.getByLabel('Regional indicator').selectOption('rainfall');
  await page.getByRole('button', { name: 'Close map panel' }).click();
  await expect(legend).toContainText('Annual rainfall');
  await fitted(
    study.features.filter((f) => (f.properties.district || f.properties.name) === 'Biak Numfor'),
  );
  await page.getByRole('button', { name: 'Layers', exact: true }).click();
  await page.getByRole('button', { name: 'Dataset information', exact: true }).click();
  await expect(page.locator('#asean-map-provenance')).toHaveAttribute('open', '');
  await expect(page.locator('#asean-map-provenance')).toContainText('EPSG:4326');
  await expect(page.locator('#asean-map-provenance')).toContainText('CC BY 3.0 IGO');
  await page.getByRole('button', { name: 'Tools', exact: true }).click();
  await page.getByRole('button', { name: 'Measure distance', exact: true }).click();
  // Real map click adds a vertex while feature selection is suppressed.
  await page.locator('.asean-leaflet').click({ position: { x: 80, y: 240 } });
  await expect(page.getByRole('region', { name: 'Map tools', exact: true })).toContainText(
    '1 vertices',
  );
  await page.getByRole('button', { name: 'Finish measurement' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'at least two' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear measurement', exact: true }).click();
  await page.getByRole('button', { name: 'Measure distance', exact: true }).click();
  async function point(lon, lat) {
    await page.getByLabel('Measurement longitude', { exact: true }).fill(String(lon));
    await page.getByLabel('Measurement latitude', { exact: true }).fill(String(lat));
    await page.getByRole('button', { name: 'Add coordinate', exact: true }).click();
  }
  await point(135.5, -1);
  await point(136.5, -1);
  await page.getByRole('button', { name: 'Finish measurement' }).click();
  await expect(page.locator('.asean-measure-result')).toContainText('111.18 km');
  await page.getByRole('button', { name: 'Draw study area', exact: true }).click();
  await point(135.5, -1.5);
  await point(136.5, -1.5);
  await point(136.5, -0.5);
  await point(135.5, -0.5);
  await page.getByRole('button', { name: 'Finish measurement' }).click();
  await expect(page.locator('.asean-measure-result')).toContainText('Biak Numfor');
  const areaDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export drawn study area' }).click();
  const area = JSON.parse(await readFile(await (await areaDownload).path(), 'utf8'));
  if (
    area.geometry.type !== 'Polygon' ||
    area.properties.area_km2 < 12350 ||
    area.properties.area_km2 > 12365 ||
    area.properties.classification !== 'USER-DRAWN STUDY AREA'
  )
    throw Error('Drawn geometry export lacks accurate measurement/provenance');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Tools', exact: true })).toBeFocused();
  await page
    .getByRole('navigation', { name: 'Map geographic breadcrumb' })
    .getByRole('button', { name: 'ASEAN', exact: true })
    .click();
  await fitted(countries.features);
  await page.getByRole('button', { name: 'Fullscreen', exact: true }).click();
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
  await fitted(countries.features);
  await page.getByRole('button', { name: 'Fullscreen', exact: true }).click();
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false);
  await page.setViewportSize({ width: 390, height: 844 });
  await fitted(countries.features);
  await page.getByRole('button', { name: 'Layers', exact: true }).click();
  const panel = await page.locator('#asean-map-panel').boundingBox(),
    mapBounds = await frame.boundingBox();
  if (
    Math.abs(panel.x - mapBounds.x) > 3 ||
    Math.abs(panel.y + panel.height - mapBounds.y - mapBounds.height) > 3
  )
    throw Error('Mobile layer panel is not a map bottom sheet');
  const nav = await page.locator('.asean-map-buttons').boundingBox();
  if (nav.y + nav.height > panel.y) throw Error('Mobile layer sheet overlaps map navigation');
  await page.getByLabel('Analysis area').selectOption('papua');
  await page.getByLabel('Study district').selectOption('Biak Numfor');
  await page.getByLabel('Regional indicator').selectOption('cases');
  await page.getByRole('button', { name: 'Close map panel' }).click();
  await expect(page.getByTestId('region-value')).toContainText('4,306');
  await fitted(
    study.features.filter((f) => (f.properties.district || f.properties.name) === 'Biak Numfor'),
  );
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1))
    throw Error('Mobile workspace overflows');
  await frame.scrollIntoViewIfNeeded();
  await page.screenshot({ path: '/tmp/malariascope-redesign-mobile.png', fullPage: false });
  await page.setViewportSize({ width: 1600, height: 1000 });
  await frame.scrollIntoViewIfNeeded();
  await page.screenshot({ path: '/tmp/malariascope-redesign-desktop.png', fullPage: false });
  const accessibility = await new AxeBuilder({ page }).include('.asean-workspace').analyze();
  if (accessibility.violations.length)
    throw Error(
      'Map accessibility violations: ' + accessibility.violations.map((v) => v.id).join(', '),
    );
  if (errors.length) throw Error(errors.join('\n'));
  console.log(
    'PASS maps redesign: 70vh map, actual-geometry camera fitting, breadcrumbs, resize/fullscreen, administrative/thematic legends, provenance, real map drawing, geodesic distance/area, geometry export, mobile sheet/navigation and accessibility.',
  );
} finally {
  await browser.close();
}
