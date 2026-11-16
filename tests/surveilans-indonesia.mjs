import { chromium, expect } from '@playwright/test';
import { columns, csv } from '../src/indonesia/engine.ts';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
  headless: true,
  args: ['--no-sandbox'],
});
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const base = process.env.APP_URL || 'http://127.0.0.1:4173';
  await page.goto(base + '/jakarta?periode=2025&panel=asal');
  await expect(
    page.getByRole('heading', { name: 'Surveilans Malaria Indonesia', exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel('Provinsi', { exact: true })).toHaveValue('31');
  expect(new URL(page.url()).searchParams.get('panel')).toBe('asal');
  for (const code of ['31', '91', '33']) {
    await page.getByLabel('Provinsi', { exact: true }).selectOption(code);
    await expect(page.getByText('Belum tersedia —', { exact: false })).toBeVisible();
  }
  await page.getByLabel('Kabupaten/kota', { exact: true }).selectOption('33.01');
  await expect(page.getByText('Belum tersedia —', { exact: false })).toBeVisible();
  await page.getByLabel('Cari nama atau kode wilayah').fill('Kepulauan Seribu');
  await page.getByLabel('Hasil pencarian').selectOption('31.01');
  await expect(page.getByLabel('Provinsi', { exact: true })).toHaveValue('31');
  await page.getByLabel('Kabupaten/kota', { exact: true }).selectOption('');
  await page.getByRole('button', { name: 'Situasi malaria', exact: true }).click();
  // Explicit test-only aggregate; never a bundled official observation.
  const row = Object.fromEntries(columns('situasi').map((k) => [k, '']));
  Object.assign(row, {
    region_version: '2025',
    region_code: '31',
    period_start: '2025-01-01',
    period_end: '2025-12-31',
    source_id: 'FIXTURE-UI-NOT-OFFICIAL',
    source_type: 'profil',
    publication_version: 'uji',
    published_at: '2026-01-01',
    reviewed_at: '2026-01-02',
    source_url: 'https://contoh.go.id/fixture-uji',
    locator: 'Fixture uji saja',
    definition: 'Kasus uji',
    coverage: 'Unit uji',
    geo_basis: 'pelaporan',
    status: 'reported',
    confirmed: '0',
  });
  await page
    .getByLabel('CSV agregat', { exact: true })
    .setInputFiles({
      name: 'uji.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(csv(columns('situasi'), [row])),
    });
  await page.getByRole('button', { name: 'Konfirmasi rekap tanpa identitas dan simpan' }).click();
  await expect(page.locator('article')).toContainText('DILAPORKAN');
  await expect(page.locator('article dd').last()).toHaveText('0');
  await page.getByLabel('Sumber dan versi').selectOption('FIXTURE-UI-NOT-OFFICIAL@uji');
  await page.reload();
  await expect(page.locator('article')).toContainText('FIXTURE-UI-NOT-OFFICIAL');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Ekspor CSV sesuai filter aktif' }).click(),
  ]);
  const stream = await download.createReadStream();
  let text = '';
  for await (const chunk of stream) text += chunk;
  expect(text).toContain('FIXTURE-UI-NOT-OFFICIAL');
  await page.getByLabel('Kabupaten/kota', { exact: true }).selectOption('31.01');
  await expect(page.getByText('Belum tersedia —', { exact: false })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
  await page.getByRole('button', { name: 'Respons kasus', exact: true }).click();
  await page
    .getByLabel('CSV agregat', { exact: true })
    .setInputFiles({
      name: 'patient.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('nik,nama\n123,Pasien\n'),
    });
  await expect(page.getByRole('status').last()).toContainText('kolom identitas');
  expect(errors).toEqual([]);
  console.log(
    'PASS Indonesia: Jakarta shortcut, Papua/Jawa Tengah/unavailable district, search, URL reload, aggregate import, zero, export, no parent fallback, privacy headers, mobile layout. Public figures remain unverified; fixtures are test-only.',
  );
} finally {
  await browser.close();
}
