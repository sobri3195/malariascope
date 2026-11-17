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
    // Geometry is synthetic and confined to this test. Do not invent public boundaries.
    await page.route('**/data/verified/papua-study-adm2.geojson', (route) =>
      route.fulfill({
        json: {
          type: 'FeatureCollection',
          features: [
            ['11', 97],
            ['31', 106],
          ].map(([code, x]) => ({
            type: 'Feature',
            properties: { district_code: code, name: `Fixture ${code}` },
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [x, 0],
                  [x + 1, 0],
                  [x + 1, 1],
                  [x, 1],
                  [x, 0],
                ],
              ],
            },
          })),
        },
      }),
    );
    const start = base + '/risk-map?dataset=skdr-indonesia&snapshot=2026-m44&year=2026&region=11';
    await page.goto(start);
    const panel = page.getByLabel('Bandingkan Dua Wilayah', { exact: true });
    const result = page.getByLabel('Hasil perbandingan');
    await panel.getByRole('button', { name: 'Tetapkan sebagai A', exact: true }).click();
    await page.getByLabel('Provinsi Profil 360', { exact: true }).selectOption('31');
    await panel.getByRole('button', { name: 'Tetapkan sebagai B', exact: true }).click();
    await expect(result).toContainText('Selisih B − A: -24 kasus');
    await expect(page.getByLabel('Wilayah A', { exact: true })).toContainText('391 kasus');
    await expect(page.getByLabel('Wilayah B', { exact: true })).toContainText('367 kasus');
    for (const slot of ['A', 'B'])
      await expect(
        page.locator('.comparison-map-label').filter({ hasText: slot + ' ·' }),
      ).toBeVisible();
    const shared = page.url();
    await page.reload();
    await expect(result).toContainText('-24 kasus');
    await panel.getByRole('button', { name: 'Tukar A/B', exact: true }).click();
    await expect(result).toContainText('Selisih B − A: 24 kasus');
    await page.getByLabel('Kabupaten/Kota Profil 360', { exact: true }).selectOption('31.01');
    await panel.getByRole('button', { name: 'Tetapkan sebagai B', exact: true }).click();
    await expect(result).toContainText('Jenjang wilayah berbeda');
    await expect(result).toContainText('Angka salah satu wilayah belum tersedia');
    await expect(page.getByLabel('Wilayah A', { exact: true })).toContainText('367 kasus');
    await expect(page.getByLabel('Wilayah B', { exact: true })).toContainText('Belum tersedia');
    await expect(panel).toContainText('Geometri B');
    await panel.getByRole('button', { name: 'Hapus A', exact: true }).click();
    expect(new URL(page.url()).searchParams.has('compareA')).toBe(false);
    expect(new URL(page.url()).searchParams.has('compareB')).toBe(true);
    await panel.getByRole('button', { name: 'Kembali ke wilayah tunggal', exact: true }).click();
    expect(new URL(page.url()).searchParams.has('compareB')).toBe(false);
    await expect(page.getByLabel('Detail wilayah GIS')).toContainText('Kode: 31.01');
    // A public link in a new context retains its own source references, not current numbers.
    const mixed = new URL(shared);
    const b = JSON.parse(mixed.searchParams.get('compareB'));
    mixed.searchParams.set(
      'compareB',
      JSON.stringify({
        ...b,
        source: 'sismal',
        snapshot: 'sismal-2025',
        version: 'sismal-2025',
        year: 2025,
        region: '11.03',
      }),
    );
    await page.goto(mixed.href);
    await expect(result).toContainText('Periode berbeda');
    await expect(result).toContainText('Definisi sumber');
    await expect(page.getByLabel('Wilayah B', { exact: true })).toContainText('4 kasus');
    // Explicit zero from a route-only source fixture, with normal source validators retained.
    await page.route('**/data/indonesia/skdr/2026-m44.json', async (route) => {
      const response = await route.fetch();
      const data = await response.json();
      data.rows.find((r) => r.regionCode === '11').value = 0;
      await route.fulfill({ json: data });
    });
    await page.goto(shared);
    await expect(result).toContainText('Selisih B − A: 367 kasus');
    await expect(result).toContainText('Persentase tidak dapat dihitung');
    await expect(page.getByLabel('Wilayah A', { exact: true })).toContainText('0 kasus');
    expect(errors).toEqual([]);
    await page.close();
  }
  console.log(
    'PASS comparison desktop/mobile: same snapshot, A/B labels, provinces vs districts, missing, zero, swap, remove, single view, source differences and URL reload.',
  );
} finally {
  await browser.close();
}
