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
const label = (name) => page.getByLabel(name, { exact: true });
const open = async () => {
  await page.keyboard.press('Control+k');
  await page.getByRole('dialog', { name: 'Command palette' }).waitFor();
};
const closeInspector = async () =>
  page.getByRole('button', { name: 'Close inspector', exact: true }).click();
try {
  await page.goto(base + '/dashboard');
  await label('Context year').waitFor();
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('malariascope-v1'));
    s.datasets = [
      {
        id: 'ux',
        name: 'UX fixture',
        source: 'Fixture',
        classification: 'USER IMPORT',
        checksum: 'ux-sha',
        created: '2026-01-01',
        rows: [2024, 2025].flatMap((year) =>
          ['A', 'B'].map((district, i) => ({
            district,
            year,
            cases: year === 2025 ? 200 + i * 400 : 100,
            population: 1000,
            prediction: year === 2025 ? 800 : 100,
            model: 'Random Forest',
          })),
        ),
      },
    ];
    s.active = 'ux';
    s.rules = [];
    s.snapshots = [];
    s.filters = { risk: 'ALL', region: 'ALL', mode: 'observed' };
    delete s.riskMode;
    localStorage.setItem('malariascope-v1', JSON.stringify(s));
  });
  await page.goto(base + '/dashboard?year=2025&district=A&model=Random+Forest&dataset=ux');
  await label('Context year').waitFor();
  await page.goto(
    base + '/dashboard?year=2024&district=B&model=Random+Forest&riskMode=SPATIAL+RISK&dataset=',
  );
  await label('Context dataset').waitFor();
  assert.equal(await label('Context dataset').inputValue(), '');
  assert.equal(await label('Context risk configuration').inputValue(), 'SPATIAL RISK');
  await page.goto(
    base + '/dashboard?year=2025&district=A&model=Random+Forest&riskMode=OBSERVED+RISK&dataset=ux',
  );
  await label('Context dataset').waitFor();
  const before = await state();
  await label('Context year').selectOption('2024');
  await page.getByLabel('Global year', { exact: true }).waitFor();
  assert.equal(await label('Global year').inputValue(), '2024');
  assert.equal(new URL(page.url()).searchParams.get('year'), '2024');
  await label('Context year').selectOption('2025');
  await label('Context risk configuration').selectOption('MODEL-ASSISTED RISK');
  await page.goto(base + '/risk-intelligence');
  await label('Risk mode').waitFor();
  assert.equal(await label('Risk mode').inputValue(), 'MODEL-ASSISTED RISK');
  await label('Risk mode').selectOption('OBSERVED RISK');
  assert.equal(await label('Context risk configuration').inputValue(), 'OBSERVED RISK');
  await page.getByRole('button', { name: 'Inspector', exact: true }).click();
  await label('Inspector panel').selectOption('Calculation Details');
  assert.match(
    await page.getByRole('dialog', { name: 'Universal side inspector' }).innerText(),
    /200/,
  );
  const path = page.url();
  await label('Inspector panel').selectOption('Risk Explanation');
  assert.equal(page.url(), path);
  await label('Inspector panel').selectOption('Data Quality');
  assert.match(await page.getByRole('dialog').innerText(), /Whole-registry audit/);
  await page.getByRole('button', { name: 'Record validation review' }).click();
  await closeInspector();
  assert.match(await label('Workspace notifications').innerText(), /Validation completed/);
  await open();
  assert.equal(await label('Command search').evaluate((e) => e === document.activeElement), true);
  const commands = await page
    .getByRole('dialog', { name: 'Command palette' })
    .getByRole('option')
    .allTextContents();
  for (const c of [
    'Go to District',
    'Open Risk Map',
    'Open Alert Center',
    'Search Dataset',
    'Compare Models',
    'Generate Report',
    'Open Settings',
    'Open Presentation Mode',
  ])
    assert.ok(commands.some((t) => t.includes(c)));
  await label('Command search').fill('Compare Models');
  await page.keyboard.press('Enter');
  await page.waitForURL(/model-benchmarking/);
  await open();
  await label('Command search').fill('UX fixture');
  await page.getByRole('dialog', { name: 'Command palette' }).getByRole('option').click();
  await page.waitForURL(/data-center/);
  assert.equal(await label('Context dataset').inputValue(), 'ux');
  await open();
  await label('Command search').fill('Go to District');
  await page.keyboard.press('Enter');
  await page.waitForURL(/district-intelligence/);
  await page.keyboard.press('g');
  await page.keyboard.press('m');
  await page.waitForURL(/risk-map/);
  await label('Context risk configuration').selectOption('MODEL-ASSISTED RISK');
  await page.getByLabel('Map layer', { exact: true }).selectOption('prediction');
  await page.getByRole('button', { name: 'Snapshots', exact: true }).click();
  await label('Snapshot name').fill('Saved map');
  await page.getByRole('button', { name: 'Save snapshot', exact: true }).click();
  const snapshot = (await state()).snapshots[0];
  assert.equal(snapshot.view, '/risk-map');
  assert.equal(snapshot.riskMode, 'MODEL-ASSISTED RISK');
  assert.equal(snapshot.datasetVersion, 'ux-sha');
  assert.equal(snapshot.layer, 'prediction');
  await page.getByRole('button', { name: 'Duplicate snapshot', exact: true }).click();
  assert.equal((await state()).snapshots.length, 2);
  await label('Rename snapshot').first().fill('Renamed map');
  await label('Snapshot name').focus();
  await closeInspector();
  await page.keyboard.press('g');
  await page.keyboard.press('r');
  await page.waitForURL(/reports/);
  await label('Context year').selectOption('2024');
  await label('Context district').selectOption('B');
  await label('Context risk configuration').selectOption('OBSERVED RISK');
  await page.getByRole('button', { name: 'Snapshots', exact: true }).click();
  await page.getByRole('button', { name: 'Load snapshot Renamed map', exact: true }).click();
  await page.waitForURL(/risk-map/);
  assert.equal(await label('Context year').inputValue(), '2025');
  assert.equal(await label('Context district').inputValue(), 'A');
  assert.equal(await label('Context risk configuration').inputValue(), 'MODEL-ASSISTED RISK');
  await closeInspector();
  assert.equal(await label('Map layer').inputValue(), 'prediction');
  await page.reload();
  await label('Context risk configuration').waitFor();
  assert.equal(await label('Context risk configuration').inputValue(), 'MODEL-ASSISTED RISK');
  await page.getByRole('button', { name: 'Snapshots', exact: true }).click();
  await page.getByRole('button', { name: 'Delete snapshot', exact: true }).last().click();
  assert.equal((await state()).snapshots.length, 1);
  await closeInspector();
  await page.keyboard.press('g');
  await page.keyboard.press('r');
  await page.waitForURL(/reports/);
  await label('Report Title').fill('');
  await label('Report Title').press('g');
  await label('Report Title').press('m');
  assert.match(page.url(), /reports/);
  assert.equal(await label('Report Title').inputValue(), 'gm');
  await page.getByRole('button', { name: 'Recent Activity', exact: true }).click();
  assert.match(await page.getByRole('dialog').innerText(), /Snapshot saved/);
  await closeInspector();
  await page.setViewportSize({ width: 768, height: 1024 });
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    true,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    true,
  );
  const mobile = page.getByRole('navigation', { name: 'Mobile navigation' });
  assert.equal(await mobile.isVisible(), true);
  assert.match(
    await mobile.innerText(),
    /Dashboard[\s\S]*Map[\s\S]*Alerts[\s\S]*District[\s\S]*More/,
  );
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.keyboard.press('Meta+k');
  await page.getByRole('dialog', { name: 'Command palette' }).waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('dialog').count(), 0);
  await page.goto(base + '/presentation?year=2025&district=A&model=Random+Forest&dataset=ux');
  await page.getByRole('heading', { name: 'Papua Malaria Risk Map', exact: true }).waitFor();
  await label('Context year').focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(
    await page.getByRole('heading', { name: 'Papua Malaria Risk Map', exact: true }).count(),
    1,
  );
  assert.deepEqual((await state()).datasets, before.datasets);
  const failurePage = await browser.newPage();
  let fail = true;
  await failurePage.route('**/data/research-summary.json', (r) =>
    fail ? r.fulfill({ status: 503, body: 'Unavailable' }) : r.continue(),
  );
  await failurePage.goto(base + '/dashboard');
  await failurePage.getByRole('alert', { name: 'Research evidence load error' }).waitFor();
  fail = false;
  await failurePage.getByRole('button', { name: 'Retry loading' }).click();
  await failurePage.getByRole('heading', { name: 'Command Dashboard', exact: true }).waitFor();
  await failurePage.close();
  const slowPage = await browser.newPage();
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  await slowPage.route('**/data/research-summary.json', async (r) => {
    await gate;
    await r.continue();
  });
  await slowPage.goto(base + '/dashboard');
  await slowPage.getByRole('status', { name: 'Loading supplied research evidence' }).waitFor();
  await slowPage.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(
    await slowPage
      .locator('.ux-skeleton div')
      .first()
      .evaluate((e) => getComputedStyle(e).animationName),
    'none',
  );
  release();
  await slowPage.getByRole('heading', { name: 'Command Dashboard', exact: true }).waitFor();
  await slowPage.close();
  assert.deepEqual(errors, []);
  console.log(
    'Command center: shared context/URL, risk mode, inspector, palette/keyboard safety, notifications/activity, full snapshot lifecycle, persistence, tablet/mobile navigation and reduced motion passed.',
  );
} finally {
  await browser.close();
}
