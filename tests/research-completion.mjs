import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
  args: ['--no-sandbox'],
});
const context = await browser.newContext({ acceptDownloads: true });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const base = process.env.APP_URL || 'http://127.0.0.1:4173';
await context.addInitScript(() => {
  if (!localStorage.getItem('completion-fixture')) {
    localStorage.setItem('completion-fixture', '1');
    localStorage.setItem(
      'malariascope-v1',
      JSON.stringify({
        researchMode: 'USER IMPORT',
        active: 'fixture',
        datasets: [
          {
            id: 'fixture',
            name: 'Test only',
            source: 'Fixture',
            checksum: 'fixture',
            created: '2026-10-01',
            rows: [{ district: 'Fixture', year: 2025, cases: 200, population: 1000 }],
          },
        ],
        rules: [
          {
            id: 'rule',
            metric: 'cases',
            operator: '>',
            value: 100,
            enabled: true,
            severity: 'HIGH',
            name: 'Fixture rule',
          },
        ],
      }),
    );
  }
});
try {
  await page.goto(base + '/early-warning');
  const rule = page.getByRole('article', { name: 'Rule Fixture rule', exact: true });
  await rule.getByLabel('Rule threshold', { exact: true }).fill('777');
  await page.goto(base + '/dashboard');
  await page.getByRole('heading', { name: 'Command Dashboard', exact: true }).waitFor();
  await page.goto(base + '/early-warning');
  await expect(rule.getByLabel('Rule threshold', { exact: true })).toHaveValue('777');
  await page.reload();
  await expect(rule.getByLabel('Rule threshold', { exact: true })).toHaveValue('777');
  await page.goto(base + '/research-operations');
  await page
    .getByRole('heading', { name: 'Research Operations & Integration', exact: true })
    .waitFor();
  for (const width of [320, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  }
  const axe = await new AxeBuilder({ page })
    .include('.research-operations')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  assert.deepEqual(
    axe.violations.map((v) => ({ id: v.id, impact: v.impact })),
    [],
  );
  await page.getByRole('button', { name: 'Models', exact: true }).click();
  const artifact = {
    schema: 'malariascope-portable-model-v1',
    model: 'Ridge Regression',
    version: 'fixture',
    datasetHash: 'a'.repeat(64),
    classification: 'SYNTHETIC',
    features: [{ name: 'x', unit: 'cases' }],
    trainingEnd: 2024,
    validationPeriod: '2025',
    mean: [10],
    scale: [2],
    coefficients: [3],
    intercept: 5,
  };
  await page.getByLabel('Import trained artifact', { exact: true }).setInputFiles({
    name: 'fixture.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(artifact)),
  });
  await page.getByLabel('x (cases)', { exact: true }).fill('12');
  await page.getByRole('button', { name: 'Calculate exploratory model output' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Scenario Output' })).toContainText(
    '8.00 cases',
  );
  await page.getByRole('button', { name: 'Periodic surveillance', exact: true }).click();
  await page.getByLabel('Import period observations').setInputFiles({
    name: 'periods.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify(
        ['2025-01', '2025-02', '2025-03'].map((period) => ({
          district: 'Fixture',
          period,
          source: 'Test only',
          metrics: { cases: 30000 },
        })),
      ),
    ),
  });
  await page.getByLabel('Periodic persistence', { exact: true }).selectOption('2');
  await page.getByRole('button', { name: 'Evaluate loaded periods' }).click();
  await expect(page.getByText('3 records · 1 signals', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Workspace', exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export complete backup' }).click();
  const download = await downloadPromise;
  assert.match(download.suggestedFilename(), /complete-backup/);
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const c of stream) chunks.push(c);
  const backup = JSON.parse(Buffer.concat(chunks).toString());
  assert.equal(backup.schema, 'malariascope-workspace-backup-v2');
  assert.ok(backup.drafts['malariascope-rule-draft:rule']);
  assert.ok(backup.companions['malariascope-model-artifacts']);
  await page.getByLabel('Inspect workspace backup').setInputFiles({
    name: 'backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  await expect(page.getByRole('heading', { name: 'Restore preview', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Restore complete backup' })).toBeDisabled();
  await page.getByRole('button', { name: 'Cancel restore' }).click();
  await page.evaluate(() => localStorage.setItem('malariascope-iot-data', '{invalid original'));
  await page.goto(base + '/iot');
  await expect(
    page.getByText('Saved IoT data could not be read safely.', { exact: false }),
  ).toBeVisible();
  assert.equal(
    await page.evaluate(() => localStorage.getItem('malariascope-iot-data')),
    '{invalid original',
  );
  assert.deepEqual(errors, []);
  console.log(
    'Research completion passed: persistent drafts, portable inference, periodic suppression, complete backup preview, responsive layout and WCAG audit of new operations workspace.',
  );
} finally {
  await browser.close();
}
