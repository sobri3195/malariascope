import { chromium, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { servePublication } from './helpers/publications.mjs';
const base = process.env.APP_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
  args: ['--no-sandbox'],
});
const partial = JSON.parse(
  await readFile(new URL('../public/data/indonesia/skdr/2026-m44.json', import.meta.url), 'utf8'),
);
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + '/dashboard');
  await expect(page.getByRole('heading', { name: 'Command Dashboard', exact: true })).toBeVisible();
  await expect(page.getByLabel('Context dataset')).toHaveValue('study-balanced');
  const researchYear = await page.getByLabel('Context year').inputValue();
  await page.getByLabel('Context dataset').selectOption('skdr-indonesia');
  await expect(
    page.getByRole('heading', { name: 'SKDR Kemenkes — Indonesia 2026', exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel('Context year')).toHaveValue('2026');
  await expect(page.locator('.metric strong')).toHaveText('388.495');
  expect(await page.getByLabel('Context province').locator('option').count()).toBe(39);
  expect(await page.getByRole('table', { name: 'Tabel SKDR' }).locator('tbody tr').count()).toBe(
    38,
  );
  for (const [code, number] of [
    ['31', '367'],
    ['75', '8.252'],
    ['91', '157.608'],
  ]) {
    await page.getByLabel('Context province').selectOption(code);
    await expect(page.locator('.metric strong')).toHaveText(number);
  }
  await page.getByRole('button', { name: 'Snapshots', exact: true }).click();
  await page.getByLabel('Snapshot name').fill('Papua SKDR view');
  await page.getByRole('button', { name: 'Save snapshot', exact: true }).click();
  await page.getByRole('button', { name: 'Close inspector' }).click();
  await page.getByLabel('Context province').selectOption('31');
  await page.getByRole('button', { name: 'Snapshots', exact: true }).click();
  await page.getByRole('button', { name: 'Load snapshot Papua SKDR view', exact: true }).click();
  await page.getByRole('button', { name: 'Close inspector' }).click();
  await expect(page.getByLabel('Context province')).toHaveValue('91');
  await page.reload();
  await expect(page.locator('.metric strong')).toHaveText('157.608');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export overview', exact: true }).first().click(),
  ]);
  const stream = await download.createReadStream();
  let text = '';
  for await (const chunk of stream) text += chunk;
  const payload = JSON.parse(text);
  expect(payload.selection.region).toBe('91');
  expect(payload.records[0].value).toBe(157608);
  expect(payload.records.length).toBe(1);
  expect(payload.source.id).toBe('2026-m44');
  const [csvDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Ekspor CSV SKDR', exact: true }).first().click(),
  ]);
  const csvStream = await csvDownload.createReadStream();
  let csvText = '';
  for await (const chunk of csvStream) csvText += chunk;
  expect(csvText).toContain('"91"');
  expect(csvText).toContain('"157608"');
  expect(csvText).not.toContain('"8252"');
  expect(csvText).toContain('"province"');
  await page.getByLabel('Context regency').selectOption('91.03');
  await expect(page.getByText('Data Jayapura 2026 belum tersedia', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Buka lima panel surveilans' }).click();
  await expect(page.getByLabel('Context regency')).toHaveValue('91.03');
  await page.getByRole('button', { name: 'Asal penularan', exact: true }).click();
  await expect(page.getByLabel('CSV agregat', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: '← Command Dashboard' }).click();
  await expect(page.getByLabel('Context regency')).toHaveValue('91.03');
  await page.getByLabel('Context dataset').selectOption('study-balanced');
  await expect(page.getByLabel('Context year')).toHaveValue(researchYear);
  await expect(
    page.getByRole('heading', { name: 'SKDR Kemenkes — Indonesia 2026', exact: true }),
  ).toHaveCount(0);
  await page.goto(base + '/dashboard?dataset=skdr-indonesia&year=2026&snapshot=2026-m44');
  await expect(page.locator('.metric strong')).toHaveText('388.495');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
  await page.goto(
    base + '/dashboard?dataset=skdr-indonesia&year=2026&snapshot=2026-m44&region=WRONG',
  );
  await expect(page.getByRole('heading', { name: 'Konteks SKDR tidak sah' })).toBeVisible();
  // Data-failure state must not reuse a stale snapshot.
  await page.route('**/data/indonesia/versions/skdr/*.json', (r) =>
    r.fulfill({ status: 503, body: 'unavailable' }),
  );
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Data SKDR gagal dimuat' })).toBeVisible();
  await page.unroute('**/data/indonesia/versions/skdr/*.json');
  await page.getByRole('button', { name: 'Coba lagi SKDR' }).click();
  await expect(page.getByRole('heading', { name: 'Konteks SKDR tidak sah' })).toBeVisible();
  await page.goto(base + '/dashboard?dataset=skdr-indonesia&year=2026&snapshot=2026-m44');
  await expect(page.locator('.metric strong')).toHaveText('388.495');
  // Complete SYNTHETIC fixture for arithmetic only. Never bundled as official provincial figures.
  const full = structuredClone(partial);
  for (const r of full.rows) {
    if (r.value === null) {
      r.value = 0;
      r.availability = 'reported';
    }
  }
  full.rows.find((r) => r.regionCode === '11').value = 228134;
  await servePublication(page, 'skdr', full);
  await page.reload();
  await page.getByRole('button', { name: 'Inspector', exact: true }).click();
  const inspector = page.getByRole('region', { name: 'SKDR Inspector' });
  await expect(inspector).toContainText('394.361');
  await expect(inspector).toContainText('5.866');
  await expect(inspector).toContainText('Perbedaan sumber belum direkonsiliasi');
  expect(errors).toEqual([]);
  console.log(
    'PASS dashboard SKDR: dataset/year, 38 provinces, supplied examples, district unavailable, URL/reload, snapshot, filtered JSON, source switch, failed load, invalid code, mobile, reconciliation on explicitly synthetic complete fixture.',
  );
} finally {
  await browser.close();
}
