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
const matrix = () => page.getByRole('table', { name: 'District readiness matrix' });
const explanation = () => page.getByLabel('Readiness assessment explanation', { exact: true });
const state = () => page.evaluate(() => JSON.parse(localStorage.getItem('malariascope-v1')));
try {
  await page.goto(base + '/force-health');
  await page.getByRole('heading', { name: 'Force Health Readiness Matrix', exact: true }).waitFor();
  assert.match(await page.locator('main').innerText(), /No district evidence is connected/);
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('malariascope-v1'));
    s.datasets = [
      {
        id: 'readiness',
        name: 'Isolated readiness fixture',
        source: 'Automated fixture',
        checksum: 'readiness-sha',
        classification: 'USER IMPORT',
        created: new Date().toISOString(),
        rows: [2024, 2025].flatMap((year) =>
          ['A', 'B'].map((district, i) => ({
            district,
            district_code: String(i + 1),
            year,
            cases: district === 'A' ? (year === 2024 ? 20000 : 30000) : 100,
            population: 100000,
            prediction: 1000000,
            model: 'Random Forest',
          })),
        ),
      },
    ];
    s.active = 'readiness';
    s.rules = [];
    s.selection = { year: 2025, district: 'All districts', model: 'Random Forest' };
    s.checklist = { 'Staffing capacity reviewed': 'AVAILABLE' };
    s.districtChecklists = {};
    delete s.readinessMetadata;
    delete s.readinessDistricts;
    localStorage.setItem('malariascope-v1', JSON.stringify(s));
  });
  await page.goto(base + '/force-health?year=2025&model=Random+Forest&district=All+districts');
  await matrix().waitFor();
  const before = await state();
  assert.equal(await matrix().locator('tbody tr').count(), 2);
  assert.equal(await matrix().locator('thead th').count(), 9);
  assert.match(await page.locator('main').innerText(), /legacy regional checklist/);
  await page.getByRole('button', { name: 'A · Diagnostics · ATTENTION', exact: true }).click();
  assert.match(await explanation().innerText(), /30000 cases > 20000/);
  assert.match(await explanation().innerText(), /200 → 300/);
  assert.match(await explanation().innerText(), /Diagnostic evidence review/);
  await page.getByText('Exact triggering data', { exact: true }).click();
  assert.match(
    await page.getByRole('table', { name: 'Readiness triggering data' }).innerText(),
    /30,000 cases/,
  );
  for (const group of ['Known', 'Unknown', 'Not Connected', 'Derived', 'User-entered'])
    assert.equal(await page.getByLabel(group + ' readiness evidence', { exact: true }).count(), 1);
  assert.match(
    await page.getByLabel('Not Connected readiness evidence', { exact: true }).innerText(),
    /No district-year resource\/assessment feed/,
  );
  await page
    .getByLabel('Diagnostic capability documented', { exact: true })
    .selectOption('AVAILABLE');
  await page.getByLabel('Testing availability reviewed', { exact: true }).selectOption('AVAILABLE');
  await page
    .getByLabel('Stock-status dataset connected', { exact: true })
    .selectOption('AVAILABLE');
  assert.equal(
    await page.getByRole('button', { name: 'A · Diagnostics · READY', exact: true }).count(),
    1,
  );
  assert.match(await explanation().innerText(), /not independently verified/);
  await page
    .getByLabel('Evidence note: Diagnostic capability documented', { exact: true })
    .fill('Isolated local documentation review');
  assert.match(
    await page.getByLabel('User-entered readiness evidence', { exact: true }).innerText(),
    /Isolated local documentation review/,
  );
  assert.equal(
    (await state()).readinessMetadata['a:2025']['Diagnostic capability documented'].status,
    'AVAILABLE',
  );
  await page.reload();
  await matrix().waitFor();
  assert.equal(
    await page.getByLabel('Diagnostic capability documented', { exact: true }).inputValue(),
    'AVAILABLE',
  );
  assert.equal(
    await page
      .getByLabel('Evidence note: Diagnostic capability documented', { exact: true })
      .inputValue(),
    'Isolated local documentation review',
  );
  await page.getByLabel('Readiness year', { exact: true }).selectOption('2024');
  assert.equal(
    await page.getByLabel('Diagnostic capability documented', { exact: true }).inputValue(),
    'NOT REVIEWED',
  );
  await page.getByLabel('Readiness year', { exact: true }).selectOption('2025');
  await page
    .getByRole('button', { name: 'B · Diagnostics · INSUFFICIENT DATA', exact: true })
    .click();
  assert.equal(
    await page.getByLabel('Diagnostic capability documented', { exact: true }).inputValue(),
    'NOT REVIEWED',
  );
  assert.doesNotMatch(await explanation().innerText(), /High retrospective/);
  await page
    .getByLabel('Diagnostic capability documented', { exact: true })
    .selectOption('LIMITED');
  assert.equal(
    await page.getByRole('button', { name: 'B · Diagnostics · ATTENTION', exact: true }).count(),
    1,
  );
  // All NOT APPLICABLE does not certify READY; legacy regional entries do not transfer.
  await page
    .getByRole('button', { name: 'B · Staffing preparedness · INSUFFICIENT DATA', exact: true })
    .click();
  await page
    .getByLabel('Staffing capacity reviewed', { exact: true })
    .selectOption('NOT APPLICABLE');
  assert.equal(
    await page
      .getByRole('button', { name: 'B · Staffing preparedness · INSUFFICIENT DATA', exact: true })
      .count(),
    1,
  );
  await page.getByLabel('Staffing capacity reviewed', { exact: true }).selectOption('AVAILABLE');
  assert.equal(
    await page
      .getByRole('button', { name: 'B · Staffing preparedness · READY', exact: true })
      .count(),
    1,
  );
  await page.goto(base + '/district-intelligence?district=B&year=2025');
  await page.getByRole('tab', { name: 'Readiness', exact: true }).click();
  assert.equal(
    await page
      .getByLabel('District readiness: Staffing capacity reviewed', { exact: true })
      .inputValue(),
    'AVAILABLE',
  );
  await page
    .getByLabel('District readiness: Staffing capacity reviewed', { exact: true })
    .selectOption('LIMITED');
  await page.goto(base + '/force-health?district=B&year=2025');
  await matrix().waitFor();
  assert.equal(
    await page
      .getByRole('button', { name: 'B · Staffing preparedness · ATTENTION', exact: true })
      .count(),
    1,
  );
  await page.getByLabel('New readiness district', { exact: true }).fill('Unconnected District');
  await page.getByRole('button', { name: 'Add local district', exact: true }).click();
  assert.equal(await matrix().locator('tbody tr').count(), 3);
  assert.equal(
    await page.getByLabel('Readiness district', { exact: true }).inputValue(),
    'Unconnected District',
  );
  await page.getByLabel('Readiness domain', { exact: true }).selectOption('data');
  assert.match(await explanation().innerText(), /Required observed evidence is unavailable/);
  assert.match(
    await page.getByLabel('Known readiness evidence', { exact: true }).innerText(),
    /No evidence entries/,
  );
  await page.getByLabel('Search readiness districts', { exact: true }).fill('Unconnected');
  assert.equal(await matrix().locator('tbody tr').count(), 1);
  await page.getByLabel('Search readiness districts', { exact: true }).fill('');
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export readiness evidence', exact: true }).click();
  const file = await pending;
  const report = JSON.parse(await fs.readFile(await file.path(), 'utf8'));
  assert.equal(report.matrix.districts.length, 3);
  assert.equal(report.matrix.districts[0].cells.length, 8);
  assert.equal(report.checklists['a:2025']['Diagnostic capability documented'], 'AVAILABLE');
  assert.equal(
    report.metadata['a:2025']['Diagnostic capability documented'].note,
    'Isolated local documentation review',
  );
  assert.deepEqual((await state()).datasets, before.datasets);
  assert.deepEqual((await state()).thresholds, before.thresholds);
  assert.deepEqual((await state()).checklist, before.checklist);
  const generated = report.matrix.districts
    .flatMap((d) => d.cells.map((c) => c.reason + ' ' + c.suggestedReviewCategory))
    .join(' ');
  assert.doesNotMatch(generated, /send personnel|deploy resources|move troops/i);
  await page.getByLabel('Readiness district', { exact: true }).selectOption('A');
  await page.getByLabel('Readiness domain', { exact: true }).selectOption('diagnostics');
  await page.screenshot({ path: '/tmp/readiness-matrix-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: '/tmp/readiness-matrix-mobile.png', fullPage: true });
  const keyboard = page.getByRole('button', { name: 'A · Diagnostics · READY', exact: true });
  await keyboard.focus();
  await page.keyboard.press('Enter');
  assert.match(await explanation().innerText(), /All 3 applicable/);
  await page.reload();
  await matrix().waitFor();
  assert.equal(await matrix().locator('tbody tr').count(), 3);
  assert.deepEqual(errors, []);
  console.log(
    'Readiness matrix: eight domains, deterministic explanations, five evidence classes, local notes/statuses, district/year isolation, shared District 360 checklists, legacy separation, manual districts, exports, unchanged source data, keyboard cells and mobile layout passed.',
  );
} finally {
  await browser.close();
}
