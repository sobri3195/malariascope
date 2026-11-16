import { chromium, expect } from '@playwright/test';
import { normalizeSismal } from '../src/indonesia/sismal.ts';
const base = process.env.APP_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
  args: ['--no-sandbox'],
});
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(
    base + '/dashboard?dataset=skdr-indonesia&year=2026&snapshot=2026-m44&region=11.03',
  );
  await expect(
    page.getByRole('heading', { name: 'SKDR Kemenkes — Indonesia 2026', exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel('Context province')).toHaveValue('11');
  await expect(page.getByLabel('Context regency')).toHaveValue('11.03');
  await expect(
    page.getByText('Data Aceh Timur 2026 belum tersedia', { exact: true }),
  ).toBeVisible();
  await expect(page.locator('.metric strong')).toHaveText('Belum tersedia');
  await expect(page.getByLabel('Konteks provinsi')).toContainText(
    'Provinsi Aceh · 391 kasus sampai M43 2026',
  );
  await expect(page.locator('.workspace-label')).toContainText('Surveilans Indonesia');
  await page.getByRole('button', { name: 'Lihat data 2025', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'SISMAL Kemenkes — 2025', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.metric strong')).toHaveText('4');
  expect(new URL(page.url()).searchParams.get('source')).toBe('sismal');
  await expect(page.getByLabel('Context year')).toHaveValue('2025');
  await expect(page.getByLabel('Context surveillance source')).toHaveValue('sismal');
  await expect(page.getByRole('table', { name: 'Tabel SISMAL' })).toContainText('1105');
  await expect(page.getByRole('table', { name: 'Tabel SISMAL' })).toContainText('11.03');
  await page.reload();
  await expect(page.locator('.metric strong')).toHaveText('4');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export overview', exact: true }).first().click(),
  ]);
  const stream = await download.createReadStream();
  let text = '';
  for await (const chunk of stream) text += chunk;
  const data = JSON.parse(text);
  expect(data.selection.source).toBe('sismal');
  expect(data.records[0].sourceId).toBe('1105');
  expect(data.records[0].regionCode).toBe('11.03');
  expect(data.records[0].reportingYear).toBe(2025);
  expect(data.records[0].value).toBe(4);
  expect(data.records[0].validationStatus).toContain('belum dapat diperiksa');
  expect(data.reconciliation).toBeUndefined();
  await page.getByRole('link', { name: 'Buka lima panel surveilans' }).click();
  await expect(
    page.getByRole('heading', { name: 'SISMAL Kemenkes — 2025', exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: '← Command Dashboard' }).click();
  await page.getByRole('button', { name: 'Inspector', exact: true }).click();
  await expect(page.getByRole('region', { name: 'SISMAL Inspector' })).toContainText(
    'ID sumber 1105 → kode Kemendagri 11.03',
  );
  await page.getByRole('button', { name: 'Close inspector' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
  await page.route('**/data/indonesia/sismal/2025.json', (r) =>
    r.fulfill({ status: 503, body: 'failed' }),
  );
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Data SISMAL gagal dimuat' })).toBeVisible();
  await page.unroute('**/data/indonesia/sismal/2025.json');
  await page.getByRole('button', { name: 'Coba lagi SISMAL' }).click();
  await expect(page.locator('.metric strong')).toHaveText('4');
  // Synthetic normalized portal fixture exercises labels without claiming a real fetch succeeded.
  const fixture = normalizeSismal(
    [
      {
        source_id: '1105',
        district: 'ACEH TIMUR',
        province: 'ACEH',
        positive_cases: 4,
        reporting_year: 2025,
        validation_status: 'belum tervalidasi',
      },
    ],
    2025,
    '2026-11-16T00:00:00Z',
    'https://malaria.kemkes.go.id/api/sismal/chartMap/2025/?province=ACEH',
  );
  await page.route('**/data/indonesia/sismal/2025.json', (r) => r.fulfill({ json: fixture }));
  await page.reload();
  await expect(page.getByRole('table', { name: 'Tabel SISMAL' })).toContainText(
    'belum tervalidasi',
  );
  expect(errors).toEqual([]);
  console.log(
    'PASS Aceh Timur: 2026 missing and separately labelled province context; 2025 source/year/ID/code/status; URL reload; exact export; shared panels/Inspector; mobile; fetch failure and retry. Portal-response path uses synthetic fixture; live sources remain blocked.',
  );
} finally {
  await browser.close();
}
