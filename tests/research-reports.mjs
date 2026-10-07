import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
  args: ['--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }),
  errors = [];
const base = process.env.APP_URL || 'http://127.0.0.1:5173';
page.on('pageerror', (e) => errors.push(e.message));
const doc = () => page.getByRole('article', { name: 'Generated research report' });
const input = (name) => page.getByLabel(name, { exact: true });
const state = () => page.evaluate(() => JSON.parse(localStorage.getItem('malariascope-v1')));
const download = async (name) => {
  const [d] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name, exact: true }).click(),
  ]);
  return { name: d.suggestedFilename(), text: await fs.readFile(await d.path(), 'utf8') };
};
try {
  await page.goto(base + '/reports');
  await page.getByRole('heading', { name: 'Professional Research Report Builder' }).waitFor();
  assert.equal(await input('Report type').locator('option').count(), 9);
  assert.equal(await input('Include Provenance').isDisabled(), true);
  assert.equal(await input('Include Limitations').isDisabled(), true);
  await page.getByRole('button', { name: 'Generate report', exact: true }).click();
  assert.match(await doc().innerText(), /No district dataset connected/);
  assert.match(await doc().innerText(), /288,131/);
  const supplied = JSON.parse((await download('Export analytical metadata as JSON')).text);
  assert.ok(supplied.metadata.suppliedDataVersions.length > 0);
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('malariascope-v1'));
    const models = ['Persistence', 'Ridge Regression', 'Random Forest', 'Gradient Boosting'];
    const rows = [2021, 2022, 2023, 2024, 2025].flatMap((year, i) =>
      ['A', 'B', 'C'].map((district, j) => ({
        district,
        district_code: String(j + 1),
        year,
        cases: 100 * (j + 1) + 10 * i,
        population: 1000,
        rainfall: 20 + i,
        temperature: 25 + i,
        region: j === 0 ? 'WEST' : 'EAST',
      })),
    );
    s.datasets = models.map((model, i) => ({
      id: String(i),
      name: model + ' fixture',
      source: 'Browser fixture',
      checksum: 'sha-' + i,
      classification: 'USER IMPORT',
      created: '2026-01-01',
      rows: rows.map((r) => ({ ...r, model, prediction: r.cases + i * 5 })),
    }));
    s.active = '0';
    s.rules = [
      { id: 'burden', metric: 'cases', operator: '>', value: 100, enabled: true, severity: 'HIGH' },
    ];
    s.filters = { risk: 'ALL', region: 'ALL', mode: 'observed' };
    s.geometry = {
      type: 'FeatureCollection',
      features: ['A', 'B', 'C'].map((district, i) => ({
        type: 'Feature',
        properties: { district, district_code: String(i + 1) },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [i, 0],
              [i + 1, 0],
              [i + 1, 1],
              [i, 1],
              [i, 0],
            ],
          ],
        },
      })),
    };
    s.geometrySource = {
      name: 'Fixture polygons',
      checksum: 'geo-sha',
      classification: 'USER IMPORT',
      created: '2026-01-01',
    };
    localStorage.setItem('malariascope-v1', JSON.stringify(s));
  });
  await page.goto(base + '/reports?year=2025&district=All+districts&model=Persistence');
  await input('Report type').waitFor();
  const before = await state();
  const types = await input('Report type').locator('option').allTextContents();
  for (const type of types) {
    await input('Report type').selectOption(type);
    await page.getByRole('button', { name: 'Generate report', exact: true }).click();
    await doc().waitFor();
    assert.equal(await doc().getByRole('heading', { level: 1 }).innerText(), type);
    assert.match(await doc().innerText(), /RESEARCH PROTOTYPE/);
    assert.match(await doc().innerText(), /Provenance/);
    assert.match(await doc().innerText(), /Limitations/);
  }
  await input('Report type').selectOption('District Intelligence Report');
  await input('Report Title').fill('Papua selected evidence review');
  await input('Reporting period start').fill('2024');
  await input('Report district').selectOption('A');
  await input('Include GIS map').check();
  await input('Include Model performance').check();
  await input('Include Data quality').check();
  await input('Include Alerts').check();
  await page.getByRole('button', { name: 'Generate report', exact: true }).click();
  assert.match(await doc().innerText(), /Papua selected evidence review/);
  assert.equal(
    await doc()
      .getByRole('table', { name: 'District profile', exact: true })
      .locator('tbody tr')
      .count(),
    2,
  );
  assert.equal(
    await doc()
      .getByRole('table', { name: 'Readiness matrix', exact: true })
      .locator('tbody tr')
      .count(),
    8,
  );
  assert.equal(
    await doc()
      .getByRole('img', { name: 'Administrative observed burden map 2025' })
      .locator('path')
      .count(),
    3,
  );
  assert.equal(
    await doc()
      .getByRole('table', { name: 'Dataset health', exact: true })
      .locator('tbody tr')
      .count(),
    4,
  );
  assert.match(
    await doc().getByRole('table', { name: 'Model performance', exact: true }).innerText(),
    /Persistence/,
  );
  const result = await download('Export analytical metadata as JSON'),
    report = JSON.parse(result.text);
  assert.equal(result.name, 'analytical-report.json');
  assert.equal(report.metadata.selectedFilters.district, 'A');
  assert.equal(report.metadata.period.start, 2024);
  assert.equal(report.metadata.displayTimezone, 'Asia/Bangkok');
  assert.equal(report.map.features.filter((f) => f.cases !== null).length, 1);
  const csv = await download('Export selected data as CSV');
  assert.equal(csv.name, 'report-selected-data.csv');
  assert.match(csv.text, /Research-prototype disclaimer/);
  assert.match(csv.text, /Climate evidence/);
  assert.match(csv.text, /sha-0/);
  await input('Report Title').fill('Changed draft only');
  await input('Include Climate analysis').uncheck();
  assert.match(await page.getByRole('status').last().innerText(), /previous generated snapshot/);
  assert.equal((await download('Export analytical metadata as JSON')).text, result.text);
  await page.evaluate(() => {
    window.print = () => {
      window.__printCalls = (window.__printCalls || 0) + 1;
    };
  });
  await page.getByRole('button', { name: 'Print', exact: true }).click();
  await page.getByRole('button', { name: 'Save as PDF via browser', exact: true }).click();
  assert.equal(await page.evaluate(() => window.__printCalls), 2);
  await page.emulateMedia({ media: 'print' });
  assert.equal(
    await page.getByRole('region', { name: 'Report builder controls' }).isVisible(),
    false,
  );
  assert.equal(await doc().isVisible(), true);
  const pdfPath = '/tmp/malariascope-research-report.pdf';
  await page.pdf({ path: pdfPath, printBackground: true, preferCSSPageSize: true });
  const pdfText = execFileSync('pdftotext', [pdfPath, '-'], { encoding: 'utf8' });
  assert.match(pdfText, /Papua selected evidence review/);
  assert.match(pdfText, /RESEARCH PROTOTYPE/);
  assert.match(pdfText, /Data provenance/);
  assert.match(pdfText, /Limitations/);
  assert.ok(!pdfText.includes('Changed draft only'));
  assert.ok(!pdfText.includes('Generate report'));
  assert.ok(!pdfText.includes('Skip to content'));
  assert.ok(!pdfText.includes('2,025'));
  assert.equal(await page.title(), 'Papua selected evidence review | MALARIASCOPE');
  await page.emulateMedia({ media: 'screen' });
  await page.getByRole('button', { name: 'Generate report', exact: true }).click();
  assert.equal(
    await doc().getByRole('table', { name: 'Climate evidence', exact: true }).count(),
    0,
  );
  assert.ok(!(await download('Export selected data as CSV')).text.includes('Climate evidence'));
  await input('Reporting period start').fill('2026');
  assert.equal(
    await page.getByRole('button', { name: 'Generate report', exact: true }).isDisabled(),
    true,
  );
  assert.match(await page.getByRole('alert').innerText(), /ordered annual years/);
  await input('Reporting period start').fill('2024');
  await input('Report risk filter').selectOption('HIGH');
  await page.getByRole('button', { name: 'Generate report', exact: true }).click();
  assert.match(
    await doc().getByRole('table', { name: 'District profile', exact: true }).innerText(),
    /No evidence available/,
  );
  assert.deepEqual((await state()).datasets, before.datasets);
  assert.deepEqual((await state()).thresholds, before.thresholds);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    true,
  );
  await page.keyboard.press('Tab');
  assert.ok(await page.evaluate(() => document.activeElement !== document.body));
  assert.deepEqual(errors, []);
  console.log(
    'Research reports: nine types, sections, mandatory integrity, filters, snapshots, source joins, map, metrics, quality/readiness, CSV/JSON, print/PDF, validation and mobile layout passed.',
  );
} finally {
  await browser.close();
}
