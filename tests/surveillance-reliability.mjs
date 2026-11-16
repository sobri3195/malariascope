import { chromium, expect } from '@playwright/test';
import { columns, csv } from '../src/indonesia/engine.ts';
const base = process.env.APP_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
  args: ['--no-sandbox'],
});
function fixture(kind, changes = {}) {
  const r = Object.fromEntries(columns(kind).map((k) => [k, '']));
  Object.assign(r, {
    region_version: '2025',
    region_code: '31',
    period_start: '2025-01-01',
    period_end: '2025-12-31',
    source_id: `TEST-${kind}`,
    source_type: {
      situasi: 'profil',
      asal: 'pe-agregat',
      layanan: 'penilaian-fasyankes',
      respons: 'rekap-respons',
    }[kind],
    publication_version: 'v1',
    published_at: '2026-01-01',
    reviewed_at: '2026-01-02',
    source_url: 'https://contoh.go.id/FIXTURE-ONLY',
    locator: 'Fixture only',
    definition: 'Kasus uji',
    coverage: 'Unit pengujian saja',
    geo_basis: 'pelaporan',
    status: 'reported',
  });
  if (kind === 'asal')
    Object.assign(r, {
      confirmed: '10',
      imported: '3',
      introduced: '1',
      indigenous: '2',
      other: '1',
      unclassified: '3',
    });
  if (kind === 'layanan')
    Object.assign(r, {
      assessed_at: '2025-06-01',
      rdt_ready: '0',
      rdt_assessed: '0',
      microscopy_ready: '2',
      microscopy_assessed: '3',
      referral_ready: '3',
      referral_assessed: '3',
    });
  if (kind === 'respons')
    Object.assign(r, {
      stage: 'notifikasi',
      trigger_at: '2025-06-01T00:00:00Z',
      required_count: '10',
      completed_count: '7',
      timely_count: '6',
      deadline_hours: '24',
      as_of: '2025-06-03T00:00:00Z',
      sop_url: 'https://contoh.go.id/SOP-FIXTURE',
      sop_version: 'v1',
      sop_effective_from: '2025-01-01',
      sop_effective_to: '2025-12-31',
    });
  if (kind === 'situasi') r.confirmed = '100';
  return { ...r, ...changes };
}
async function upload(page, kind, rows) {
  await page.getByLabel('CSV agregat', { exact: true }).setInputFiles({
    name: 'test-only.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv(columns(kind), rows)),
  });
}
async function confirm(page) {
  await page
    .getByRole('button', { name: 'Konfirmasi rekap tanpa identitas dan simpan', exact: true })
    .click();
}
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + '/surveilans-indonesia?region=31&periode=2025&panel=asal');
  const [template] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Unduh templat CSV' }).click(),
  ]);
  expect(template.suggestedFilename()).toBe('templat-asal.csv');
  await upload(page, 'asal', [fixture('asal', { unclassified: '0' })]);
  await expect(page.getByRole('status').last()).toContainText('Jumlah kategori');
  await expect(
    page.getByRole('button', { name: 'Konfirmasi rekap tanpa identitas dan simpan' }),
  ).toHaveCount(0);
  await upload(page, 'asal', [fixture('asal')]);
  await expect(page.getByRole('region', { name: 'Pratinjau impor' })).toContainText('TEST-asal');
  await expect(page.getByRole('region', { name: 'Pratinjau impor' })).toContainText(
    'https://contoh.go.id/FIXTURE-ONLY',
  );
  await page.getByRole('button', { name: 'Batal', exact: true }).click();
  expect(
    await page.evaluate(() => localStorage.getItem('malariascope-indonesia-aggregate-v1')),
  ).toBeNull();
  await upload(page, 'asal', [fixture('asal')]);
  await confirm(page);
  await expect(page.getByRole('table', { name: 'Asal penularan' })).toContainText(
    'Belum diklasifikasi',
  );
  await upload(page, 'asal', [fixture('asal')]);
  await confirm(page);
  await expect(page.getByRole('status').last()).toContainText('Duplikat');
  await page.getByRole('button', { name: 'Batal', exact: true }).click();
  await page.getByRole('button', { name: 'Kesiapan layanan', exact: true }).click();
  await upload(page, 'layanan', [fixture('layanan')]);
  await confirm(page);
  await expect(page.getByRole('table', { name: 'Indikator kesiapan layanan' })).toContainText(
    'Belum dinilai (penyebut nol)',
  );
  await expect(page.getByRole('table', { name: 'Indikator kesiapan layanan' })).toContainText(
    '2/3',
  );
  await page.getByRole('button', { name: 'Respons kasus', exact: true }).click();
  await upload(page, 'respons', [
    fixture('respons'),
    fixture('respons', {
      trigger_at: '2025-06-03T00:00:00Z',
      required_count: '5',
      completed_count: '0',
      timely_count: '0',
    }),
  ]);
  await confirm(page);
  await expect(page.getByRole('region', { name: 'Ringkasan ketepatan waktu' })).toContainText(
    '6/10 tepat waktu',
  );
  await page.getByRole('button', { name: 'Situasi malaria', exact: true }).click();
  await upload(page, 'situasi', [
    fixture('situasi'),
    fixture('situasi', { publication_version: 'v2', confirmed: '105' }),
  ]);
  await confirm(page);
  await page.getByRole('button', { name: 'Rekonsiliasi dan ekspor', exact: true }).click();
  await expect(
    page.getByRole('table', { name: 'Perbandingan angka sumber' }).first(),
  ).toContainText('105');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Ekspor Situasi malaria', exact: true }).click(),
  ]);
  const stream = await download.createReadStream();
  let text = '';
  for await (const c of stream) text += c;
  expect(text).toContain('source_url');
  expect(text).toContain('105');
  // Cross-tab update detection must not overwrite the other tab's aggregate data.
  const other = await context.newPage();
  await other.goto(base + '/surveilans-indonesia?region=31&periode=2025&panel=asal');
  await upload(other, 'asal', [fixture('asal', { publication_version: 'v2' })]);
  await confirm(other);
  await expect(page.getByRole('alert', { name: 'Pemulihan penyimpanan' })).toContainText(
    'tab lain',
  );
  await page.getByRole('button', { name: 'Muat ulang data tersimpan' }).click();
  await page.getByRole('button', { name: 'Asal penularan', exact: true }).click();
  await expect(page.getByRole('table', { name: 'Asal penularan' })).toHaveCount(2);
  await page.getByRole('button', { name: 'Hapus rekap TEST-asal v2', exact: true }).click();
  await page.getByRole('button', { name: 'Batal hapus', exact: true }).click();
  await expect(page.getByRole('table', { name: 'Asal penularan' })).toHaveCount(2);
  await page.getByRole('button', { name: 'Hapus rekap TEST-asal v2', exact: true }).click();
  await page.getByRole('button', { name: 'Konfirmasi hapus rekap', exact: true }).click();
  await expect(page.getByRole('table', { name: 'Asal penularan' })).toHaveCount(1);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
  await context.close();
  const broken = await browser.newContext();
  const raw = '{"asal":null,"retained":"test-only original"}';
  await broken.addInitScript((raw) => {
    if (localStorage.getItem('malariascope-indonesia-aggregate-v1') === null)
      localStorage.setItem('malariascope-indonesia-aggregate-v1', raw);
  }, raw);
  const b = await broken.newPage();
  b.on('pageerror', (e) => errors.push(e.message));
  await b.goto(base + '/surveilans-indonesia?panel=asal');
  await expect(b.getByRole('alert', { name: 'Pemulihan penyimpanan' })).toBeVisible();
  await expect(b.getByLabel('CSV agregat', { exact: true })).toBeDisabled();
  expect(await b.evaluate(() => localStorage.getItem('malariascope-indonesia-aggregate-v1'))).toBe(
    raw,
  );
  await b.getByRole('button', { name: 'Mulai ulang dengan cadangan', exact: true }).click();
  await b
    .getByRole('button', { name: 'Konfirmasi cadangkan dan mulai ulang', exact: true })
    .click();
  await expect(b.getByRole('alert', { name: 'Pemulihan penyimpanan' })).toHaveCount(0);
  expect(
    await b.evaluate(
      (raw) =>
        Object.keys(localStorage).some(
          (k) =>
            k.startsWith('malariascope-indonesia-aggregate-v1.recovery.') &&
            localStorage.getItem(k) === raw,
        ),
      raw,
    ),
  ).toBeTruthy();
  await broken.close();
  // Alias and Back/Forward preserve source and region.
  const nav = await browser.newPage();
  await nav.goto(
    base + '/dashboard?dataset=skdr-indonesia&year=2026&snapshot=2026-m44&region=11.03',
  );
  await nav.getByRole('link', { name: 'Buka lima panel surveilans' }).click();
  await nav.getByRole('link', { name: 'Pintasan DKI Jakarta' }).click();
  await expect(nav.getByLabel('Context province')).toHaveValue('31');
  expect(new URL(nav.url()).searchParams.get('dataset')).toBe('skdr-indonesia');
  await nav.getByLabel('Context province').selectOption('75');
  await nav.goBack();
  await expect(nav.getByLabel('Context province')).toHaveValue('31');
  await nav.goForward();
  await expect(nav.getByLabel('Context province')).toHaveValue('75');
  await nav.close();
  const edge = await browser.newPage();
  edge.on('pageerror', (e) => errors.push(e.message));
  await edge.goto(base + '/dashboard?dataset=skdr-indonesia&year=2026&snapshot=2026-m44&region=31');
  await edge
    .getByRole('heading', { name: 'SKDR Kemenkes — Indonesia 2026', exact: true })
    .waitFor();
  await edge.keyboard.press('Control+k');
  await edge.getByLabel('Command search', { exact: true }).fill('Gorontalo');
  await edge.locator('#command-region-75').click();
  await expect(edge.getByLabel('Context province')).toHaveValue('75');
  expect(new URL(edge.url()).searchParams.get('dataset')).toBe('skdr-indonesia');
  // A late response for 2025 must never replace the newer 2026 selection.
  const payload = await (await edge.request.get(base + '/data/indonesia/sismal/2025.json')).json();
  let release;
  const held = new Promise((resolve) => {
    release = resolve;
  });
  let started;
  const requested = new Promise((resolve) => {
    started = resolve;
  });
  await edge.route('**/data/indonesia/versions/sismal/sismal-2025-*.json', async (route) => {
    started();
    await held;
    await route.fulfill({ json: payload }).catch(() => {});
  });
  await edge.getByLabel('Context year').selectOption('2025');
  await requested;
  await edge.getByLabel('Context year').selectOption('2026');
  await expect(
    edge.getByRole('heading', { name: 'SISMAL Kemenkes — 2026', exact: true }),
  ).toBeVisible();
  release();
  await expect(edge.getByLabel('Context year')).toHaveValue('2026');
  await expect(edge.locator('.metric strong')).toHaveText('Belum tersedia');
  await edge.unroute('**/data/indonesia/versions/sismal/sismal-2025-*.json');
  const wrong = await (await edge.request.get(base + '/data/indonesia/skdr/2026-m44.json')).json();
  await edge.route('**/data/indonesia/skdr/2026-m45.json', (route) =>
    route.fulfill({ json: wrong }),
  );
  await edge.goto(base + '/dashboard?dataset=skdr-indonesia&year=2026&snapshot=2026-m45&region=ID');
  await expect(edge.getByRole('heading', { name: 'Data SKDR gagal dimuat' })).toBeVisible();
  await expect(edge.getByRole('alert').last()).toContainText('tidak tersedia dalam manifest');
  await expect(
    edge.getByRole('button', { name: 'Export overview', exact: true }).first(),
  ).toBeDisabled();
  await edge.close();
  expect(errors).toEqual([]);
  console.log(
    'PASS maintenance: three CSV panels, rejected totals, full preview/cancel, duplicates, zero denominator, due cohorts, source comparison/export, cross-tab preservation, remove/cancel, corrupt recovery/archive, mobile and source-preserving Jakarta/Back/Forward.',
  );
} finally {
  await browser.close();
}
