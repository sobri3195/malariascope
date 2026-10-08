import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
  args: ['--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }),
  errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const base = process.env.APP_URL || 'http://127.0.0.1:5173';
const state = () => page.evaluate(() => JSON.parse(localStorage.getItem('malariascope-v1')));
const input = (name) => page.getByLabel(name, { exact: true });
// Explicit disconnected/user-import coverage; populated research defaults are tested in research-desktop-iot.mjs.
await page.addInitScript(() => {
  if (!localStorage.getItem('malariascope-v1'))
    localStorage.setItem('malariascope-v1', JSON.stringify({researchMode:'USER IMPORT',datasets:[],active:'',geometry:null}));
});
try {
  await page.goto(base + '/scenario');
  await page.getByRole('heading', { name: 'What-If Analytical Simulator' }).waitFor();
  assert.match(await page.locator('main').innerText(), /No baseline available/);
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('malariascope-v1'));
    s.datasets = [
      {
        id: 'scenario',
        name: 'Scenario fixture',
        classification: 'USER IMPORT',
        source: 'Fixture',
        checksum: 'sha',
        created: '2025-01-01',
        rows: [2021, 2022, 2023, 2024, 2025].flatMap((year, i) =>
          ['A', 'B'].map((district) => ({
            district,
            year,
            cases: year === 2025 ? 200 : 100,
            population: 1000,
            rainfall: 10 + i,
            temperature: 20 + i,
          })),
        ),
      },
    ];
    s.active = 'scenario';
    s.analyticalScenarios = [];
    localStorage.setItem('malariascope-v1', JSON.stringify(s));
  });
  await page.goto(base + '/scenario?year=2025&district=A');
  await input('Malaria baseline burden').waitFor();
  const before = await state();
  assert.equal(await input('Annual percentage change (%)').inputValue(), '100');
  await input('Annual percentage change (%)').fill('20');
  assert.match(
    await page.getByLabel('Projected analytical risk score', { exact: true }).innerText(),
    /240/,
  );
  await input('Rainfall anomaly (SD)').fill('8');
  assert.match(
    await page.getByLabel('Projected analytical risk score', { exact: true }).innerText(),
    /240/,
  );
  await input('Scenario model').selectOption('Random Forest');
  assert.match(
    await page.getByLabel('Selected model output', { exact: true }).innerText(),
    /Unavailable/,
  );
  await input('Scenario model').selectOption('Persistence');
  await input('Scenario name').fill('First');
  await page.getByRole('button', { name: 'Save Scenario', exact: true }).click();
  await page.getByRole('button', { name: 'Duplicate First', exact: true }).click();
  assert.equal((await state()).analyticalScenarios.length, 2);
  await input('Compare First').check();
  await input('Compare First copy').check();
  await page.getByRole('button', { name: 'Compare Scenarios', exact: true }).click();
  assert.equal(
    await page.getByRole('table', { name: 'Scenario comparison' }).locator('tbody tr').count(),
    2,
  );
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export Scenario JSON' }).click(),
  ]);
  assert.equal(download.suggestedFilename(), 'exploratory-scenario.json');
  const fs = await import('node:fs/promises');
  const exported = JSON.parse(await fs.readFile(await download.path(), 'utf8'));
  assert.equal(exported.result.score, 240);
  assert.equal(exported.label, 'Scenario Output — Not Observed Data');
  await page.getByRole('button', { name: 'Reset to Baseline' }).click();
  assert.equal(await input('Annual percentage change (%)').inputValue(), '100');
  await input('Population').fill('0');
  assert.equal(
    await page.getByRole('button', { name: 'Save Scenario', exact: true }).isDisabled(),
    true,
  );
  assert.match(await page.getByRole('alert').innerText(), /positive/);
  await page.getByRole('button', { name: 'Reset to Baseline' }).click();
  await input('Scenario district').selectOption('B');
  assert.equal(await input('Malaria baseline burden').inputValue(), '200');
  assert.equal((await state()).analyticalScenarios[0].baseline.district, 'A');
  await page.goto(base + '/scenario?year=2024&district=B');
  await input('Malaria baseline burden').waitFor();
  assert.equal(await input('Malaria baseline burden').inputValue(), '100');
  assert.equal((await state()).analyticalScenarios[0].baseline.year, 2025);
  await page.reload();
  await input('Malaria baseline burden').waitFor();
  assert.equal((await state()).analyticalScenarios.length, 2);
  await page.getByRole('button', { name: 'Delete First copy', exact: true }).click();
  assert.equal((await state()).analyticalScenarios.length, 1);
  assert.deepEqual((await state()).datasets, before.datasets);
  assert.deepEqual((await state()).thresholds, before.thresholds);
  for (const panel of await page.locator('.exploratory-panel').all())
    assert.match(await panel.innerText(), /Scenario Output — Not Observed Data/);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    true,
  );
  assert.deepEqual(errors, []);
  console.log('Scenario simulator workflow passed');
} finally {
  await browser.close();
}
