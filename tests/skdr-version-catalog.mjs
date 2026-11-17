import { chromium, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const base = process.env.APP_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
  args: ['--no-sandbox'],
});
// Route-isolated synthetic contracts; these are never shipped as official observations.
const original = JSON.parse(
  await readFile(new URL('../public/data/indonesia/skdr/2026-m44.json', import.meta.url)),
);
const masters = JSON.parse(
  await readFile(new URL('../src/indonesia/regions.json', import.meta.url)),
)['2025'].regions;
function fixture(edition) {
  const s = structuredClone(original);
  Object.assign(s, {
    id: `2026-m${edition}`,
    version: String(edition === 45 ? 'a' : 'b').repeat(64),
    publishedAt: edition === 45 ? '2026-11-16' : '2026-11-10',
    dataAsOf: '2026-11-14T10:00:00+07:00',
    retrievedAt: '2026-11-17T00:00:00Z',
    evidence: 'attachment-extraction',
    sourceUrl: 'https://surveilans.kemkes.go.id/SYNTHETIC-BROWSER-FIXTURE.pdf',
    retrievalNote: 'SYNTHETIC AUTOMATED TEST ONLY',
    pdfVerification: { method: 'test-only', sha256: 'c'.repeat(64), pages: [36, 45] },
  });
  for (const row of s.rows)
    Object.assign(row, {
      originalLabel: masters.find((r) => r.code === row.regionCode).name,
      sourceUrl: s.sourceUrl,
      weekThrough: edition - 1,
      bulletin: `M${edition}`,
      availability: 'reported',
      value: 0,
    });
  const values =
    edition === 45
      ? { ID: 399404, 11: 398, 31: 375, 91: 162947, 12: 241643 }
      : { ID: 388495, 11: 394361 };
  for (const row of s.rows) row.value = values[row.regionCode] || 0;
  return s;
}
try {
  const page = await browser.newPage();
  const m44 = fixture(44),
    m45 = fixture(45);
  await page.route('**/data/indonesia/skdr/catalog.json', (route) =>
    route.fulfill({
      json: {
        schemaVersion: 1,
        latest: m45.id,
        entries: [m44, m45].map((s) => ({
          id: s.id,
          version: s.version,
          complete: true,
          publishedAt: s.publishedAt,
          path: `/data/indonesia/skdr/versions/${s.id}-${s.version}.json`,
        })),
      },
    }),
  );
  await page.route('**/data/indonesia/skdr/versions/*.json', (route) =>
    route.fulfill({ json: route.request().url().includes('m45-') ? m45 : m44 }),
  );
  await page.route('**/data/indonesia/sync-manifest.json', (route) =>
    route.fulfill({ json: { attempts: [{ source: 'skdr', status: 'unchanged' }] } }),
  );
  await page.goto(base + '/dashboard?dataset=skdr-indonesia');
  const metric = page.locator('.metric strong');
  await expect(metric).toHaveText('399.404');
  await expect(page.getByLabel('Context bulletin')).toHaveValue('2026-m45');
  await expect(page.getByText('Cakupan data: 38/38 provinsi', { exact: true })).toBeVisible();
  await expect(page.getByText('Belum ada edisi baru.', { exact: true })).toBeVisible();
  await page.getByLabel('Context bulletin').selectOption('2026-m44');
  await expect(metric).toHaveText('388.495');
  await page.getByLabel('Context bulletin').selectOption('2026-m45');
  await expect(metric).toHaveText('399.404');
  await page.getByLabel('Context province').selectOption('11');
  await expect(metric).toHaveText('398');
  await page.getByLabel('Context regency').selectOption('11.03');
  await expect(metric).toHaveText('Belum tersedia');
  await expect(page.getByLabel('Konteks provinsi')).toContainText('398');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export overview', exact: true }).first().click(),
  ]);
  const payload = JSON.parse(await readFile(await download.path(), 'utf8'));
  expect(payload.selection.snapshot).toBe('2026-m45');
  expect(payload.source.version).toBe(m45.version);
  expect(payload.source.dataAsOf).toBe(m45.dataAsOf);
  expect(payload.records).toEqual([]);
  expect(payload.reconciliation.provinceSum).toBe(405363);
  expect(payload.reconciliation.difference).toBe(5959);
  await page.getByRole('link', { name: 'Buka lima panel surveilans' }).click();
  await expect(page.getByLabel('Context bulletin')).toHaveValue('2026-m45');
  await expect(page.getByLabel('Context regency')).toHaveValue('11.03');
  await page.goto(base + '/dashboard?dataset=skdr-indonesia&snapshot=2026-m44&year=2026&region=ID');
  await page.reload();
  await expect(metric).toHaveText('388.495');
  await expect(page.getByLabel('Context bulletin')).toHaveValue('2026-m44');
  await page.unroute('**/data/indonesia/sync-manifest.json');
  await page.route('**/data/indonesia/sync-manifest.json', (route) =>
    route.fulfill({ json: { attempts: [{ source: 'skdr', status: 'failed' }] } }),
  );
  await page.reload();
  await expect(
    page.getByText('Memakai versi terakhir karena sumber gagal.', { exact: true }),
  ).toBeVisible();
  await expect(metric).toHaveText('388.495');
  await page.goto(base + '/dashboard');
  await expect(page.getByRole('heading', { name: 'Command Dashboard', exact: true })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'SKDR Kemenkes — Indonesia 2026', exact: true }),
  ).toHaveCount(0);
  console.log(
    'PASS synthetic catalog contract: latest, M44/M45, 38 provinces, Aceh/district, cross-route selection, versioned export, source failure retention, explicit M44 reload, research isolation. Not official publication evidence.',
  );
} finally {
  await browser.close();
}
