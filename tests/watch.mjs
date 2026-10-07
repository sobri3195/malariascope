import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
  args: ['--no-sandbox'],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }),
  page = await context.newPage(),
  errors = [],
  assets = [];
const base = process.env.APP_URL || 'http://127.0.0.1:4173';
page.on('pageerror', (e) => errors.push(e.message));
page.on('request', (r) => {
  if (r.url().includes('/assets/')) assets.push(r.url());
});
const display = () => page.getByRole('region', { name: 'MALARIASCOPE watch display' });
const screen = async (name) => {
  await page.getByLabel('Watch screen', { exact: true }).selectOption(name);
  await page.locator('.w-screen-caption').getByText(name, { exact: true }).waitFor();
};
const state = () => page.evaluate(() => JSON.parse(localStorage.getItem('malariascope-v1')));
const fits = async () =>
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    true,
  );
try {
  await page.goto(base + '/smartwatch');
  await page.getByRole('heading', { name: 'MALARIASCOPE Watch', exact: true }).waitFor();
  assert.match(await display().innerText(), /No Data/);
  assert.equal(await page.locator('.sidebar,.mobile-app').count(), 0);
  assert.ok(
    !assets.some((url) => /DesktopApp-|MobileApp-|charts-|gis-.*\.js/.test(url)),
    'watch must load separately from other shells and charts',
  );
  const study = JSON.parse(await fs.readFile('public/data/research-summary.json', 'utf8'));
  await page.getByLabel('Watch district', { exact: true }).selectOption(study.incidence.district);
  assert.match(await display().innerText(), /VERY HIGH/);
  assert.match(
    await display().innerText(),
    new RegExp(
      study.incidence.value
        .toLocaleString('en-GB', { maximumFractionDigits: 1 })
        .replace('.', '\\.'),
    ),
  );
  await screen('Data');
  assert.match(await display().innerText(), /Not independently verified/);
  await screen('Surveillance');
  assert.match(await display().innerText(), /—/);
  await screen('Alerts');
  assert.match(await display().innerText(), /—/);
  await screen('Sync');
  assert.match(await display().innerText(), /Malaria data\nSynced/);
  assert.match(await display().innerText(), /Climate data\nNot Connected/);
  await screen('Risk');
  await page.screenshot({ path: '/tmp/malariascope-watch-desktop.png', animations: 'disabled' });
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('malariascope-v1'));
    s.datasets = [
      {
        id: 'watch-test',
        name: 'Isolated watch acceptance fixture',
        source: 'Synthetic test only',
        classification: 'USER IMPORT',
        checksum: 'watch-fixture',
        created: new Date().toISOString(),
        rows: [2022, 2023, 2024, 2025].flatMap((year) =>
          ['A', 'B'].map((district, i) => ({
            district,
            district_code: String(i + 1),
            year,
            cases: district === 'A' ? (year === 2025 ? 400 : 200) : 50,
            population: 1000,
            prediction: district === 'A' ? 450 : 70,
            model: 'Random Forest',
            rainfall: 100 + (year - 2022) * 10,
            temperature: 24 + (year - 2022),
            soldier_identity: 'SENSITIVE-SOLDIER',
            troop_location: 'SENSITIVE-POSITION',
            clinical_data: 'SENSITIVE-CLINICAL',
          })),
        ),
      },
    ];
    s.active = 'watch-test';
    s.rules = [
      {
        id: 'watch-signal',
        metric: 'incidence',
        operator: '>',
        value: 300,
        severity: 'HIGH',
        enabled: true,
        persistence: 1,
        description: 'SENSITIVE-DESCRIPTION',
      },
    ];
    s.alertStates = {};
    s.selection = { district: 'A', year: 2025, model: 'Random Forest' };
    localStorage.setItem('malariascope-v1', JSON.stringify(s));
  });
  await page.goto(base + '/smartwatch?year=2025&district=A&model=Random+Forest');
  await display().getByText('HIGH', { exact: true }).waitFor();
  assert.match(await display().innerText(), /400 \/ 1k/);
  const before = await state();
  await screen('Surveillance');
  assert.match(await display().innerText(), /400/);
  assert.match(await display().innerText(), /100%/);
  await screen('Climate');
  assert.match(await display().innerText(), /2 SD/);
  await screen('Forecast');
  assert.match(await display().innerText(), /450/);
  assert.match(await display().innerText(), /No validated confidence interval/);
  await page.getByLabel('Watch model', { exact: true }).selectOption('Persistence');
  assert.match(await display().innerText(), /Not Connected/);
  await page.getByLabel('Watch model', { exact: true }).selectOption('Random Forest');
  await screen('Alerts');
  assert.match(await display().innerText(), /New\n1/);
  assert.match(await display().innerText(), /incidence/i);
  await page.getByRole('button', { name: 'Preview latest alert', exact: true }).click();
  await page.getByRole('dialog', { name: 'Watch analytical notification' }).waitFor();
  assert.match(await page.getByRole('dialog').innerText(), /HIGH SURVEILLANCE SIGNAL/);
  await page.getByRole('button', { name: 'DISMISS', exact: true }).click();
  assert.deepEqual((await state()).alertStates, before.alertStates);
  await page.getByRole('button', { name: 'Preview latest alert', exact: true }).click();
  await page.getByRole('button', { name: 'VIEW', exact: true }).click();
  assert.equal(await page.getByRole('dialog').count(), 0);
  assert.equal(await page.getByLabel('Watch screen', { exact: true }).inputValue(), 'Alerts');
  await screen('Readiness');
  assert.match(await display().innerText(), /DX\nAttention/);
  for (const label of ['SURV', 'DX', 'PREV', 'REF', 'EVAC', 'DATA'])
    assert.match(await display().innerText(), new RegExp(label));
  await screen('District');
  assert.match(await display().innerText(), /Cases \/ incidence per 1k\n400 \/ 400/);
  await page.getByLabel('Watch district', { exact: true }).selectOption('B');
  await screen('Risk');
  assert.match(await display().innerText(), /LOW/);
  await page.getByLabel('Watch year', { exact: true }).selectOption('2024');
  await page.getByLabel('Watch district', { exact: true }).selectOption('A');
  assert.match(await display().innerText(), /MODERATE/);
  await page.getByLabel('Watch year', { exact: true }).selectOption('2025');
  await page.getByLabel('Watch risk mode', { exact: true }).selectOption('MODEL-ASSISTED RISK');
  assert.match(await display().innerText(), /HIGH/);
  await page.getByLabel('Watch risk mode', { exact: true }).selectOption('SPATIAL RISK');
  assert.match(await display().innerText(), /No Data/);
  await page.getByLabel('Watch risk mode', { exact: true }).selectOption('OBSERVED RISK');
  await page.getByRole('button', { name: 'Next watch screen', exact: true }).click();
  assert.equal(await page.getByLabel('Watch screen', { exact: true }).inputValue(), 'Surveillance');
  await page.getByRole('button', { name: 'Previous watch screen', exact: true }).click();
  await display().focus();
  await page.keyboard.press('ArrowLeft');
  assert.equal(await page.getByLabel('Watch screen', { exact: true }).inputValue(), 'District');
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.getByLabel('Watch screen', { exact: true }).inputValue(), 'Risk');
  for (const name of [
    'Risk',
    'Surveillance',
    'Climate',
    'Forecast',
    'Alerts',
    'Readiness',
    'Sync',
    'Data',
    'District',
  ]) {
    await screen(name);
    assert.doesNotMatch(await page.locator('body').innerText(), /SENSITIVE/);
  }
  for (const size of [
    { width: 320, height: 568 },
    { width: 375, height: 812 },
    { width: 812, height: 375 },
    { width: 768, height: 1024 },
  ]) {
    await page.setViewportSize(size);
    await screen('Risk');
    await fits();
    const box = await display().boundingBox();
    assert.ok(box.width <= size.width);
    assert.ok(Math.abs(box.width - box.height) < 2, 'display must remain circular');
    const controls = await page
      .locator('.w-controls button,.w-navigation button,.w-controls select')
      .evaluateAll((nodes) =>
        nodes.filter((n) => n.getClientRects().length).map((n) => n.getBoundingClientRect().height),
      );
    assert.ok(controls.every((h) => h >= 44));
  }
  await page.setViewportSize({ width: 375, height: 812 });
  await display().scrollIntoViewIfNeeded();
  const box = await display().boundingBox();
  await page.mouse.move(box.x + box.width * 0.72, box.y + box.height * 0.45);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.24, box.y + box.height * 0.45);
  await page.mouse.up();
  assert.equal(await page.getByLabel('Watch screen', { exact: true }).inputValue(), 'Surveillance');
  await screen('Risk');
  await page.screenshot({ path: '/tmp/malariascope-watch-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Start autoplay', exact: true }).click();
  await page
    .locator('.w-screen-caption')
    .getByText('Surveillance', { exact: true })
    .waitFor({ timeout: 10000 });
  await page.getByRole('button', { name: 'Stop autoplay', exact: true }).click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.getByRole('button', { name: 'Start autoplay', exact: true })).toBeDisabled();
  assert.equal(
    await page.locator('.w-face-content').evaluate((n) => getComputedStyle(n).animationName),
    'none',
  );
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await screen('Data');
  await page.reload();
  await page.getByLabel('Watch screen', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('Watch screen', { exact: true }).inputValue(), 'Data');
  assert.equal(await page.getByLabel('Watch district', { exact: true }).inputValue(), 'A');
  assert.equal(await page.getByLabel('Watch year', { exact: true }).inputValue(), '2025');
  assert.match(await display().innerText(), /Not independently verified/);
  await page.getByRole('link', { name: 'Open full district intelligence', exact: true }).click();
  await page.getByRole('heading', { name: 'District Intelligence 360°', exact: true }).waitFor();
  assert.equal(await page.getByLabel('Context district', { exact: true }).inputValue(), 'A');
  assert.equal(await page.getByLabel('Context year', { exact: true }).inputValue(), '2025');
  assert.deepEqual(errors, []);
  console.log(
    'Smartwatch acceptance passed: direct refresh, isolated lazy shell, all nine screens, district/year/model/risk synchronization, source-derived risk, alerts/notification dismissal, readiness, missing data, keyboard/swipe/autoplay/reduced motion, phone/tablet/landscape layouts and aggregate-only display.',
  );
} finally {
  await browser.close();
}
