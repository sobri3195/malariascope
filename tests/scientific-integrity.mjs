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
page.on('pageerror', (e) => errors.push(e.message));
const registry = () => page.getByRole('table', { name: 'Dataset health registry' });
const tab = (name) => page.getByRole('tab', { name, exact: true });
const downloadReport = async () => {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export integrity report', exact: true }).click();
  const file = await pending;
  return JSON.parse(await fs.readFile(await file.path(), 'utf8'));
};
try {
  await page.goto(base + '/data-quality');
  await page.getByRole('heading', { name: 'Scientific Integrity Center', exact: true }).waitFor();
  assert.match(
    await page.locator('main').innerText(),
    /No dataset quality score or eligibility can be established/,
  );
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('malariascope-v1'));
    const rows = [2024, 2025].flatMap((year) =>
      ['A', 'B', 'C'].map((district, i) => ({
        district,
        district_code: String(i + 1),
        year,
        cases: [100, 200, 300][i],
        population: 1000,
        rainfall: 1200,
        temperature: 25,
        humidity: 70,
        prediction: [110, 210, 310][i],
        model: 'Random Forest',
        incidence: [100, 200, 300][i],
      })),
    );
    const good = {
      id: 'good',
      name: 'Isolated complete fixture',
      source: 'Automated fixture',
      checksum: 'good-sha',
      created: new Date().toISOString(),
      classification: 'USER IMPORT',
      rows,
    };
    const bad = structuredClone(good);
    bad.id = 'bad';
    bad.name = 'Isolated flawed fixture';
    bad.checksum = 'bad-sha';
    bad.created = '2020-01-01T00:00:00Z';
    bad.rows = bad.rows.filter((r) => !(r.district === 'B' && r.year === 2024));
    delete bad.rows[0].rainfall;
    bad.rows[0].population = 0;
    bad.rows[0].cases = -1;
    bad.rows[0].latitude = 95;
    bad.rows[0].longitude = 138;
    bad.rows[0].unknown_column = 'retained';
    bad.rows[1].year = 2200;
    bad.rows[3].incidence = 999;
    bad.rows.push({ ...bad.rows[2] });
    state.datasets = [good, bad];
    state.active = 'good';
    state.rules = [];
    state.selection = { year: 2025, district: 'All districts', model: 'Random Forest' };
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
      name: 'Isolated GIS fixture',
      classification: 'USER IMPORT',
      checksum: 'gis-sha',
      created: new Date().toISOString(),
    };
    localStorage.setItem('malariascope-v1', JSON.stringify(state));
  });
  await page.goto(base + '/data-quality?year=2025&model=Random+Forest');
  await registry().waitFor();
  assert.equal(await registry().locator('tbody tr').count(), 2);
  assert.match(await registry().locator('tbody tr').first().innerText(), /100/);
  assert.match(await registry().locator('tbody tr').last().innerText(), /BLOCKED/);
  const before = await page.evaluate(
    () => JSON.parse(localStorage.getItem('malariascope-v1')).datasets,
  );
  await tab('Analysis Eligibility').click();
  for (const analysis of ['Forecasting', 'Spatial Analysis', 'Trend Analysis', 'Risk Calculation'])
    assert.equal(
      await page.getByRole('heading', { name: analysis + ' Eligible: YES', exact: true }).count(),
      1,
    );
  await page.getByLabel('Global model', { exact: true }).selectOption('Persistence');
  assert.equal(
    await page.getByRole('heading', { name: 'Forecasting Eligible: NO', exact: true }).count(),
    1,
  );
  await page.getByLabel('Global model', { exact: true }).selectOption('Random Forest');
  await tab('Score Inspector').click();
  const scores = page.getByRole('table', { name: 'Quality score components' });
  assert.equal(await scores.locator('tbody tr').count(), 6);
  assert.deepEqual(await scores.locator('tbody tr').first().locator('td').allTextContents(), [
    'Field completeness',
    '54',
    '54',
    '100%',
    '30%',
    '30',
    'Present cells / all rows × fixed 9 fields. Missing fields remain in the denominator; validity is checked separately.',
  ]);
  assert.match(await page.getByLabel('Quality score calculation').innerText(), /= 100 \/ 100/);
  await page.getByLabel('Integrity dataset', { exact: true }).selectOption('bad');
  const badScore = await page.getByLabel('Quality score calculation').innerText();
  await tab('Issue Register').click();
  const issues = page.getByRole('table', { name: 'Scientific integrity issues' });
  assert.match(await issues.innerText(), /Impossible negative cases/);
  assert.match(await issues.innerText(), /Invalid population/);
  assert.match(await issues.innerText(), /Invalid latitude/);
  assert.match(await issues.innerText(), /Unrecognized columns/);
  assert.match(await issues.innerText(), /Duplicate district-year/);
  assert.match(await issues.innerText(), /Unsupported year/);
  assert.match(await issues.innerText(), /Registry ingestion/);
  await page.getByLabel('Integrity issue severity', { exact: true }).selectOption('BLOCKING');
  assert.ok((await issues.locator('tbody tr').count()) > 0);
  assert.ok(
    (await issues.locator('tbody tr').allTextContents()).every((t) => t.includes('BLOCKING')),
  );
  await page.getByLabel('Search integrity issues', { exact: true }).fill('no matching text');
  assert.equal(await issues.locator('tbody tr').count(), 0);
  await tab('Score Inspector').click();
  assert.equal(await page.getByLabel('Quality score calculation').innerText(), badScore);
  await tab('Analysis Eligibility').click();
  assert.equal(await page.getByRole('heading', { name: /Eligible: NO$/ }).count(), 4);
  const report = await downloadReport();
  assert.equal(report.reports.length, 2);
  assert.equal(report.reports[0].score, 100);
  assert.ok(report.reports[1].issues.some((i) => i.field === 'latitude' && i.row === 1));
  assert.equal(report.reports[1].rowCount, 6);
  assert.deepEqual(
    await page.evaluate(() => JSON.parse(localStorage.getItem('malariascope-v1')).datasets),
    before,
  );
  await page.screenshot({ path: '/tmp/scientific-integrity-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await tab('Score Inspector').click();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: '/tmp/scientific-integrity-mobile.png', fullPage: true });
  await tab('Score Inspector').focus();
  await page.keyboard.press('Home');
  assert.equal(await tab('Dataset Health').getAttribute('aria-selected'), 'true');
  // New imports retain source-only coordinates and unknown fields for inspection.
  await page.goto(base + '/data-center');
  await page
    .getByLabel('Import dataset', { exact: true })
    .setInputFiles({
      name: 'integrity-source-fixture.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(
        'district,year,cases,population,latitude,longitude,source_note\nA,2025,10,1000,95,138,preserved original column\n',
      ),
    });
  await page.getByRole('button', { name: 'Load validated data', exact: true }).click();
  await page
    .getByText('Dataset loaded. Existing datasets were preserved.', { exact: true })
    .waitFor();
  await page.goto(base + '/data-quality');
  await registry().waitFor();
  await tab('Issue Register').click();
  await page.getByLabel('Integrity issue severity', { exact: true }).selectOption('ALL');
  assert.match(
    await page.getByRole('table', { name: 'Scientific integrity issues' }).innerText(),
    /Invalid latitude/,
  );
  const imported = await downloadReport();
  const last = imported.reports.at(-1);
  assert.match(last.sourceBasis, /Preserved original/);
  assert.ok(last.issues.some((i) => i.code === 'schema-extra'));
  assert.equal(last.rowCount, 1);
  // No GIS receives zero credit and explicit NO spatial eligibility, with no weight redistribution.
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('malariascope-v1'));
    s.geometry = null;
    s.active = 'good';
    localStorage.setItem('malariascope-v1', JSON.stringify(s));
  });
  await page.goto(base + '/data-quality?year=2025&model=Random+Forest');
  await registry().waitFor();
  const absent = await downloadReport();
  assert.equal(absent.reports[0].score, 80);
  assert.equal(absent.reports[0].scoreComponents[4].percent, null);
  await tab('Analysis Eligibility').click();
  assert.equal(
    await page.getByRole('heading', { name: 'Spatial Analysis Eligible: NO', exact: true }).count(),
    1,
  );
  assert.equal(
    await page.getByRole('heading', { name: 'Trend Analysis Eligible: YES', exact: true }).count(),
    1,
  );
  assert.deepEqual(errors, []);
  console.log(
    'Scientific Integrity Center: automatic all-dataset inspection, detailed issues, score denominators, filter invariance, four eligibility reasons, model synchronization, raw import preservation, GIS absence, exports, keyboard tabs and mobile layout passed.',
  );
} finally {
  await browser.close();
}
