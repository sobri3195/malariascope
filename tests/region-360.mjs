import { chromium, expect } from '@playwright/test';
const base = process.env.APP_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
  args: ['--no-sandbox'],
});
try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    let releaseGeometry, startedGeometry;
    const gate = new Promise((resolve) => {
      releaseGeometry = resolve;
    });
    const started = new Promise((resolve) => {
      startedGeometry = resolve;
    });
    // Route-only synthetic polygons; labels deliberately differ from the master.
    const features = [
      ['11.03', 'Aceh Timur fixture', 97, 4],
      ['31.01', 'Seribu fixture', 106, -6],
    ].map(([code, name, x, y]) => ({
      type: 'Feature',
      properties: { district_code: code, name },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [x, y],
            [x + 1, y],
            [x + 1, y + 1],
            [x, y + 1],
            [x, y],
          ],
        ],
      },
    }));
    await page.route('**/data/verified/papua-study-adm2.geojson', async (route) => {
      startedGeometry();
      await gate;
      await route.fulfill({ json: { type: 'FeatureCollection', features } }).catch(() => {});
    });
    await page.goto(
      base +
        '/risk-map?dataset=skdr-indonesia&snapshot=2026-m44&year=2026&region=11.03&gisLayer=cases',
    );
    const profile = page.getByLabel('Detail wilayah GIS');
    await expect(profile).toContainText('Kode: 11.03');
    await expect(profile).toContainText('Kasus: Belum tersedia');
    await expect(page.getByLabel('Angka induk tingkat provinsi')).toContainText('391 kasus');
    await started;
    await page.getByRole('button', { name: 'Tutup detail wilayah', exact: true }).click();
    await page.getByLabel('Provinsi Profil 360').selectOption('31');
    await page.getByRole('button', { name: 'Tutup detail wilayah', exact: true }).click();
    await page.getByLabel('Kabupaten/Kota Profil 360').selectOption('31.01');
    await expect(profile).toContainText('Kode: 31.01');
    await expect(page.getByLabel('Angka induk tingkat provinsi')).toContainText('367 kasus');
    releaseGeometry();
    const chosen = page.locator('.leaflet-interactive[data-region-identity="31.01"]');
    await expect(chosen).toHaveAttribute('aria-pressed', 'true');
    await expect
      .poll(async () => {
        const a = await chosen.boundingBox(),
          b = await page.getByLabel('Peta wilayah administratif', { exact: true }).boundingBox();
        return a && b
          ? Math.abs(a.x + a.width / 2 - b.x - b.width / 2) +
              Math.abs(a.y + a.height / 2 - b.y - b.height / 2)
          : 999;
      })
      .toBeLessThan(45);
    await page.getByRole('button', { name: 'Tutup detail wilayah', exact: true }).click();
    await page.getByRole('button', { name: 'Reset tampilan wilayah', exact: true }).click();
    await page.getByRole('button', { name: 'Tutup detail wilayah', exact: true }).click();
    const other = page.locator('.leaflet-interactive[data-region-identity="11.03"]');
    await other.focus();
    await other.press('Enter');
    await expect(profile).toContainText('Kode: 11.03');
    await expect(other).toHaveAttribute('aria-pressed', 'true');
    expect(new URL(page.url()).searchParams.get('region')).toBe('11.03');
    await page.getByRole('button', { name: 'Tutup detail wilayah', exact: true }).click();
    await other.focus();
    await other.press('Space');
    await expect(profile).toContainText('Kode: 11.03');
    await page.getByRole('button', { name: 'Tutup detail wilayah', exact: true }).click();
    await page.getByLabel('Cari wilayah GIS').fill('31.01');
    const result = page
      .getByRole('table', { name: 'Tabel wilayah GIS' })
      .getByRole('button', { name: /^31\.01 ·/ });
    await result.focus();
    await result.press('Enter');
    await expect(profile).toContainText('Kode: 31.01');
    await page.reload();
    await expect(profile).toContainText('Kode: 31.01');
    await expect(
      page.locator('.leaflet-interactive[data-region-identity="31.01"]'),
    ).toHaveAttribute('aria-pressed', 'true');
    await page.goBack();
    await expect(profile).toContainText('Kode: 11.03');
    await page.goForward();
    await expect(profile).toContainText('Kode: 31.01');
    // Same source/edition survives the Surveillance link.
    await page.getByRole('button', { name: 'Tutup detail wilayah', exact: true }).click();
    await page.getByRole('link', { name: 'Buka lima panel surveilans', exact: true }).click();
    await expect(page.getByLabel('Context regency')).toHaveValue('31.01');
    expect(new URL(page.url()).searchParams.get('snapshot')).toBe('2026-m44');
    // Annual SISMAL uses district coverage and its own reporting period.
    await page.goto(
      base +
        '/risk-map?dataset=skdr-indonesia&source=sismal&year=2025&snapshot=sismal-2025&region=11.03',
    );
    await expect(profile).toContainText('Kasus: 4');
    await expect(profile).toContainText('SISMAL 2025');
    await expect(profile).toContainText('kabupaten/kota berangka');
    await expect(profile).not.toContainText('/38 provinsi');
    await expect(page.getByLabel('Angka induk tingkat provinsi')).toHaveCount(0);
    await page.getByRole('button', { name: 'Tutup detail wilayah', exact: true }).click();
    await page.getByRole('button', { name: 'Reset tampilan wilayah', exact: true }).click();
    await page.getByRole('button', { name: 'Tutup detail wilayah', exact: true }).click();
    await page.locator('.leaflet-interactive[data-region-identity="11.03"]').click({ force: true });
    await expect(profile).toContainText('Kasus: 4');
    await expect(profile).toContainText('Kode: 11.03');

    await page.getByRole('button', { name: 'Tutup detail wilayah', exact: true }).click();
    await page
      .getByRole('table', { name: 'Tabel SISMAL', exact: true })
      .getByRole('button', { name: '11.03', exact: true })
      .click();
    await expect(profile).toContainText('Kode: 11.03');
    await expect(page.getByRole('option', { name: 'Personel', exact: true })).toHaveCount(0);
    expect(errors).toEqual([]);
    await page.close();
  }
  console.log(
    'PASS public region 360: delayed geometry/latest selection, alias-safe polygon identity, initial focus, keyboard, reload/Back/Forward, shared surveillance context, annual SISMAL cases/coverage, missing district versus parent, desktop/mobile. Synthetic geometry is test-only.',
  );
} finally {
  await browser.close();
}
