import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const base = process.env.APP_URL || 'http://127.0.0.1:5173';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
  headless: true,
  args: ['--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1080 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
try {
  // Install isolated evidence before the Provider mounts: async research hydration must not race fixture writes.
  await page.addInitScript(() => {
    if (localStorage.getItem('malariascope-v1')) return;
    const state = { researchMode: 'USER IMPORT' };
    state.datasets = [
      {
        id: 'warning-fixture',
        name: 'Surveillance test fixture',
        source: 'Isolated automated evidence',
        classification: 'USER IMPORT',
        checksum: 'fixture-sha',
        created: '2026-01-01T00:00:00Z',
        rows: [2020, 2021, 2022, 2023, 2024, 2025, 2026].map((year, i) => ({
          district: 'Test District',
          year,
          cases: [100, 400, 500, 600, 50, 400, 500][i],
          population: 1000,
          rainfall: [100, 110, 120, 150, 115, 160, 165][i],
          temperature: 20 + i,
          humidity: 70,
          prediction: 800,
          model: 'Random Forest',
        })),
      },
    ];
    state.active = 'warning-fixture';
    state.rules = [];
    state.alertLog = [];
    state.alertCreated = {};
    state.alertStates = {};
    state.selection = { year: 2026, district: 'All districts', model: 'Random Forest' };
    localStorage.setItem('malariascope-v1', JSON.stringify(state));
  });
  await page.goto(base + '/early-warning?model=Random%20Forest&year=2026');
  await page.getByRole('heading', { name: 'Early Warning Center', exact: true }).waitFor();
  assert.equal(await page.getByLabel('Rule template').locator('option').count(), 6);
  await page.getByLabel('Rule template').selectOption('Persistent High Risk');
  await page.getByRole('button', { name: 'Add template', exact: true }).click();
  let card = page.getByRole('article', { name: 'Rule Persistent High Risk', exact: true });
  await card.waitFor();
  assert.match(await card.innerText(), /1 triggered districts · 1 current signals/);
  assert.equal(await card.getByLabel('Rule persistence').inputValue(), '3');
  assert.equal(await card.getByLabel('Suppress repeated alerts').isChecked(), true);
  await page.goto(base + '/alerts');
  await page.getByRole('heading', { name: 'Alert Center', exact: true }).waitFor();
  assert.equal(await page.locator('.alert-row').count(), 1);
  assert.match(await page.locator('.alert-row').innerText(), /Test District · 2023/);
  assert.match(await page.locator('.alert-row').innerText(), /3 consecutive/);
  await page.getByText('Triggering data and source evidence', { exact: true }).click();
  assert.match(await page.locator('.warning-evidence').innerText(), /fixture-sha/);
  assert.match(await page.locator('.warning-evidence').innerText(), /"year": 2021/);
  const first = await page.evaluate(
    () => JSON.parse(localStorage.getItem('malariascope-v1')).alertLog[0],
  );
  assert.deepEqual(
    first.triggeringData.map((p) => p.year),
    [2021, 2022, 2023],
  );
  assert.ok(first.timestamp);
  await page.getByLabel('Status for Test District').selectOption('ACKNOWLEDGED');
  await page.reload();
  await page.locator('.alert-row').first().waitFor();
  assert.equal(await page.locator('.alert-row').count(), 1);
  assert.equal(await page.getByLabel('Status for Test District').inputValue(), 'ACKNOWLEDGED');
  const replay = await page.evaluate(
    () => JSON.parse(localStorage.getItem('malariascope-v1')).alertLog[0],
  );
  assert.equal(replay.timestamp, first.timestamp);
  await page.goto(base + '/early-warning');
  card = page.getByRole('article', { name: 'Rule Persistent High Risk', exact: true });
  await card.getByLabel('Rule persistence').selectOption('2');
  await card.getByLabel('Rule priority').selectOption('URGENT');
  await card.getByLabel('Rule description').fill('Review two annual high-risk observations.');
  await card.getByRole('button', { name: 'Save rule', exact: true }).click();
  assert.match(await card.innerText(), /1 triggered districts · 2 current signals/);
  let stored = await page.evaluate(() => JSON.parse(localStorage.getItem('malariascope-v1')));
  assert.equal(stored.alertLog.length, 3);
  assert.equal(stored.alertLog[0].ruleSnapshot.persistence, 3);
  assert.equal(stored.rules[0].persistence, 2);
  assert.equal(stored.rules[0].priority, 'URGENT');
  await card.getByLabel('Rule active').uncheck();
  await card.getByRole('button', { name: 'Save rule', exact: true }).click();
  assert.match(await card.innerText(), /INACTIVE/);
  assert.match(await card.innerText(), /0 current signals/);
  await page.goto(base + '/alerts');
  await page.locator('.alert-row').first().waitFor();
  assert.equal(await page.locator('.alert-row').count(), 3);
  assert.match(await page.locator('.alert-row').first().innerText(), /Retained historical alert/);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export alerts', exact: true }).click(),
  ]);
  const exported = JSON.parse(await fs.readFile(await download.path(), 'utf8'));
  assert.equal(exported.length, 3);
  assert.ok(
    exported.every(
      (a) =>
        a.exactRule && a.timestamp && a.sourceDataset.checksum === 'fixture-sha' && a.explanation,
    ),
  );
  await page.goto(base + '/early-warning');
  await page.getByRole('button', { name: 'Add rule', exact: true }).click();
  let custom = page.getByRole('article', { name: 'Rule Custom rule', exact: true });
  await custom.waitFor();
  assert.equal(
    await custom.getByLabel('Rule metric', { exact: true }).locator('option').count(),
    16,
  );
  assert.equal(
    await custom.getByLabel('Rule operator', { exact: true }).locator('option').count(),
    9,
  );
  await custom.getByLabel('Rule name', { exact: true }).fill('Range OR anomaly');
  await custom.getByLabel('Rule metric', { exact: true }).selectOption('incidence');
  await custom.getByLabel('Rule operator', { exact: true }).selectOption('between');
  await custom.getByLabel('Rule threshold', { exact: true }).fill('300');
  await custom.getByLabel('Rule upper bound').fill('700');
  await custom.getByLabel('Additional condition').selectOption('OR');
  await custom.getByLabel('Secondary metric').selectOption('temperature_anomaly');
  await custom.getByLabel('Secondary operator').selectOption('outside range');
  await custom.getByLabel('Secondary threshold').fill('-2');
  await custom.getByLabel('Secondary upper bound').fill('2');
  await custom.getByLabel('Rule active').check();
  await custom.getByRole('button', { name: 'Save rule', exact: true }).click();
  custom = page.getByRole('article', { name: 'Rule Range OR anomaly', exact: true });
  await custom.waitFor();
  assert.match(await custom.innerText(), /OR Temperature anomaly/);
  stored = await page.evaluate(() => JSON.parse(localStorage.getItem('malariascope-v1')));
  assert.equal(stored.rules[1].upper, 700);
  assert.equal(stored.rules[1].secondary.upper, 2);
  await custom.getByLabel('Rule operator', { exact: true }).selectOption('decreased by');
  await custom.getByLabel('Rule threshold', { exact: true }).fill('10');
  await custom.getByRole('button', { name: 'Discard edits', exact: true }).click();
  assert.equal(await custom.getByLabel('Rule operator', { exact: true }).inputValue(), 'between');
  await page.reload();
  assert.equal(
    await page
      .getByRole('article', { name: 'Rule Range OR anomaly', exact: true })
      .getByLabel('Additional condition')
      .inputValue(),
    'OR',
  );
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: '/tmp/early-warning-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => scrollTo(0, 0));
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
    false,
  );
  await page.screenshot({ path: '/tmp/early-warning-mobile.png', fullPage: true });
  await page.goto(base + '/alerts');
  await page.getByText('Triggering data and source evidence', { exact: true }).first().click();
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
    false,
  );
  assert.deepEqual(errors, []);
  console.log(
    'Advanced warning browser checks passed: templates, builder, persistence, episode suppression, immutable alerts, statuses, reloads, priorities, source evidence, export, desktop/mobile layout.',
  );
} finally {
  await browser.close();
}
