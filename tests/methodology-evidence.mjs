import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
  args: ['--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const base = process.env.APP_URL || 'http://127.0.0.1:4173',
  errors = [];
page.on('pageerror', (e) => errors.push(e.message));
try {
  await page.goto(base + '/methodology');
  const root = page.locator('.methodology');
  await root.getByRole('heading', { name: 'Study at a Glance', exact: true }).waitFor();
  assert.equal(await root.locator('pre:visible').count(), 0, 'raw metadata hidden by default');
  const text = await root.innerText();
  for (const phrase of [
    '104,544',
    '116,675',
    '180,950',
    '151,127',
    '204,727',
    '288,131',
    '1,046,154',
    '288,879',
    '69,944',
    '684.74',
    '0.1301',
    '53 / 54',
    '49',
    'Missing 2024 outcome ≠ zero cases',
    '2025 climate observations were not used',
    'Persistence had the lowest',
    '110.83',
    'Not operationally validated',
  ])
    assert.ok(text.includes(phrase), phrase);
  assert.ok(
    !(await page.locator('footer').allInnerTexts()).join(' ').includes('Application ready'),
  );
  assert.ok(
    !(await root
      .locator('.method-header')
      .innerText()
      .then((t) => t.includes('USER IMPORT'))),
  );
  const status = root.locator('.method-status-table');
  assert.match(await status.innerText(), /IoT[\s\S]*NOT CONNECTED/);
  assert.match(await status.innerText(), /Prospective data[\s\S]*NOT YET AVAILABLE/);
  const tabs = root.getByRole('tab');
  assert.equal(await tabs.count(), 8);
  await root.getByRole('tab', { name: 'Overview', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(
    await root
      .getByRole('tab', { name: 'Surveillance', exact: true })
      .getAttribute('aria-selected'),
    'true',
  );
  assert.match(await root.getByRole('tabpanel').innerText(), /NOT SUPPLIED/);
  assert.match(await root.getByRole('tabpanel').innerText(), /MISSING/);
  await page.keyboard.press('End');
  assert.equal(
    await root.getByRole('tab', { name: 'Limitations', exact: true }).getAttribute('aria-selected'),
    'true',
  );
  for (const name of [
    'Overview',
    'Surveillance',
    'Climate',
    'Forecasting',
    'Spatial',
    'Data Quality',
    'Provenance',
    'Limitations',
  ]) {
    await root.getByRole('tab', { name, exact: true }).click();
    assert.ok((await root.getByRole('tabpanel').innerText()).length > 150);
    assert.equal(await root.locator('pre:visible').count(), 0);
  }
  await root.getByRole('tab', { name: 'Forecasting', exact: true }).click();
  assert.match(
    await root.getByRole('tabpanel').locator('tbody tr').first().innerText(),
    /Persistence.*10,425.5/s,
  );
  assert.match(await root.getByRole('tabpanel').innerText(), /Not supplied/);
  assert.match(await root.getByRole('tabpanel').innerText(), /interval crosses zero/);
  await root.getByRole('button', { name: 'MAE definition', exact: true }).first().focus();
  assert.ok((await root.locator('[role=tooltip]:visible').count()) > 0, 'keyboard tooltip');
  for (const format of ['JSON', 'CSV']) {
    const pending = page.waitForEvent('download');
    await root.getByRole('button', { name: `Export evidence ${format}`, exact: true }).click();
    const file = await pending,
      raw = await fs.readFile(await file.path(), 'utf8');
    if (format === 'JSON') {
      const payload = JSON.parse(raw);
      assert.equal(payload.balancedTotal, 1046154);
      assert.equal(payload.annual.length, 6);
      assert.equal(payload.benchmark[0].model, 'Persistence');
      assert.equal(payload.spatial.pValue, 0.1301);
      assert.equal(payload.sourceIssues.length, 4);
      assert.equal(payload.provenance.length, 15);
      assert.equal(payload.status.iot, 'NOT CONNECTED');
    } else
      for (const section of [
        'sourceIssues',
        'limitations',
        'coverage',
        'statusMatrix',
        'benchmark',
        'provenance',
      ])
        assert.ok(raw.includes('"' + section + '"'));
  }
  await root.getByRole('tab', { name: 'Overview', exact: true }).click();
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: '/tmp/methodology-desktop.png' });
  for (const width of [1920, 768, 375]) {
    await page.setViewportSize({ width, height: 900 });
    assert.ok(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      `no overflow at ${width}`,
    );
    for (const name of ['Provenance', 'Surveillance', 'Spatial']) {
      await root.getByRole('tab', { name, exact: true }).click();
      assert.ok(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        `no overflow in ${name} at ${width}`,
      );
    }
  }
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: '/tmp/methodology-mobile.png' });
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.emulateMedia({ media: 'print' });
  assert.equal(await root.locator('.method-developer').isVisible(), false);
  assert.equal(await root.locator('.method-print-only').isVisible(), true);
  await page.pdf({
    path: '/tmp/methodology-evidence.pdf',
    format: 'A4',
    printBackground: true,
  });
  await page.emulateMedia({ media: 'screen' });
  await root.locator('.method-developer summary').click();
  assert.equal(await root.locator('pre:visible').count(), 1);
  await root.locator('.method-developer summary').click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('malariascope-v1')));
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('malariascope-v1'));
    const user = {
      ...state.datasets.find((d) => d.id === 'study-balanced'),
      id: 'user-methodology-test',
      name: 'Actual user surveillance upload',
      classification: 'USER_IMPORT',
    };
    state.datasets = [user];
    state.active = user.id;
    state.researchMode = 'USER IMPORT';
    localStorage.setItem('malariascope-v1', JSON.stringify(state));
  });
  await page.goto(base + '/methodology');
  await root.getByRole('heading', { name: 'Study at a Glance', exact: true }).waitFor();
  assert.match(
    await root.locator('.method-header').innerText(),
    /USER IMPORT.*Actual user surveillance upload/s,
  );
  assert.match(await root.locator('.method-header').innerText(), /VERIFIED RESEARCH EXTRACTION/);
  await root.getByRole('button', { name: 'Use bundled study evidence', exact: true }).click();
  await page.waitForFunction(
    () => JSON.parse(localStorage.getItem('malariascope-v1')).active === 'study-balanced',
  );
  assert.ok(!(await root.locator('.method-header').innerText()).includes('USER IMPORT'));
  const links = await root
    .locator('.method-demo a')
    .evaluateAll((a) => a.map((n) => n.getAttribute('href')));
  assert.deepEqual(links, [
    '/surveillance',
    '/risk-map',
    '/forecasting',
    '/forecasting/failure-analysis',
    '/risk-intelligence',
    '/force-health',
  ]);
  await page.evaluate((v) => localStorage.setItem('malariascope-v1', JSON.stringify(v)), saved);
  assert.deepEqual(errors, []);
  const broken = await browser.newPage();
  await broken.route('**/data/verified/uncertainty.json', (route) =>
    route.fulfill({ status: 200, body: '{}' }),
  );
  await broken.goto(base + '/methodology');
  await broken.locator('.methodology [role=alert]').waitFor();
  assert.equal(
    await broken
      .locator('.methodology')
      .getByRole('heading', { name: 'Study at a Glance', exact: true })
      .count(),
    0,
    'checksum failure cannot present results',
  );
  await broken.close();
  console.log(
    'Methodology evidence acceptance passed: science, tabs, keyboard tooltips, exports, print, provenance, user source isolation, responsive layouts, fail-closed loading.',
  );
} finally {
  await browser.close();
}
