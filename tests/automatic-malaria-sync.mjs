import { chromium, expect } from '@playwright/test';
import { readFile, mkdtemp, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { syncMalaria } from '../scripts/malaria/pipeline.mjs';
import { readDocument } from '../scripts/malaria/extract.mjs';
import { masters } from '../src/indonesia/engine.ts';
import { catalogFile } from './helpers/publications.mjs';
const base = process.env.APP_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
  args: ['--no-sandbox'],
});
const fixtureRoot = await mkdtemp(join(tmpdir(), 'malaria-browser-publication-'));
try {
  await cp(new URL('../public/data/indonesia/', import.meta.url), fixtureRoot, { recursive: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const catalog = JSON.parse(await readFile(catalogFile, 'utf8'));
  const original = catalog.sources['skdr:2026'].versions[0];
  // Actual publisher output with synthetic downloads/text; no fixture enters public assets.
  const pages = [
    { page: 7, text: 'Malaria Konfirmasi\nData sampai M44 2026\nIndonesia 400.000' },
    {
      page: 12,
      text:
        'Malaria Konfirmasi\nData sampai M44 2026\n' +
        masters['2025'].regions
          .filter((r) => /^\d{2}$/.test(r.code))
          .map((r) => r.name + ' 0')
          .join('\n'),
    },
  ];
  const synced = await syncMalaria({
    root: fixtureRoot,
    year: 2026,
    now: '2026-11-17T01:00:00Z',
    download: async (url) => ({
      status: 200,
      headers: {},
      url,
      body: Buffer.from(
        url.endsWith('/publikasi')
          ? '<article><a href="/test-m45.pdf">Buletin M45 2026</a><time datetime="2026-11-17"></time></article>'
          : url.endsWith('.pdf')
            ? 'synthetic public aggregate PDF input'
            : url.endsWith('/case')
              ? '<script>const url="/api/sismal/chartMap/2026/";</script>'
              : '[]',
      ),
    }),
    read: async (mode, bytes, url) => (mode === 'pdf' ? pages : readDocument(mode, bytes, url)),
  });
  expect(synced.catalog.sources['skdr:2026'].status).toBe('updated');
  const version = synced.catalog.sources['skdr:2026'].versions.find(
    (v) => v.id === synced.catalog.sources['skdr:2026'].active,
  );
  const body = await readFile(
    join(fixtureRoot, version.path.replace('/data/indonesia/', '')),
    'utf8',
  );
  const reads = [];
  page.on('request', (request) => {
    if (request.url().includes('/versions/')) reads.push(new URL(request.url()).pathname);
  });
  await page.route('**/data/indonesia/manifest.json', (r) => r.fulfill({ json: catalog }));
  await page.route('**' + version.path, (r) =>
    r.fulfill({ contentType: 'application/json', body }),
  );
  await page.goto(base + '/surveilans-indonesia');
  await page.getByRole('link', { name: 'Buka publikasi SKDR/SISMAL terbaru' }).click();
  await page.getByRole('link', { name: '← Command Dashboard' }).click();
  await expect(page.locator('.metric strong')).toHaveText('388.495');
  expect(reads).toContain(original.path);
  await page.getByRole('button', { name: 'Snapshots', exact: true }).click();
  await page.getByLabel('Snapshot name').fill('Version before update');
  await page.getByRole('button', { name: 'Save snapshot', exact: true }).click();
  await page.getByRole('button', { name: 'Close inspector' }).click();
  Object.assign(catalog, synced.catalog);
  await page.getByRole('button', { name: 'Periksa ulang manifest' }).click();
  await expect(page.locator('.metric strong')).toHaveText('400.000');
  expect(reads).toContain(version.path);
  await expect(page.getByLabel('Status sinkronisasi sumber')).toContainText(version.id);
  await expect(page.getByLabel('Status sinkronisasi sumber')).toContainText('M44 2026');
  // Shared five-panel context uses the same manifest and immutable version URL.
  await page.getByRole('link', { name: 'Buka lima panel surveilans' }).click();
  await expect(page.locator('.metric strong')).toHaveText('400.000');
  await page.getByRole('link', { name: '← Command Dashboard' }).click();
  await page.getByRole('button', { name: 'Snapshots', exact: true }).click();
  await page
    .getByRole('button', { name: 'Load snapshot Version before update', exact: true })
    .click();
  await page.getByRole('button', { name: 'Close inspector' }).click();
  await expect(page.locator('.metric strong')).toHaveText('388.495');
  expect(new URL(page.url()).searchParams.get('snapshot')).toBe(original.id);
  await page.reload();
  await expect(page.locator('.metric strong')).toHaveText('388.495');
  // New checks can fail without discarding the pinned, validated artifact.
  catalog.sources['skdr:2026'].status = 'failed';
  catalog.sources['skdr:2026'].message = 'Fixture upstream timeout';
  await page.getByRole('button', { name: 'Periksa ulang manifest' }).click();
  await expect(page.getByLabel('Status sinkronisasi sumber')).toContainText(
    'Snapshot terakhir dipertahankan',
  );
  await expect(page.locator('.metric strong')).toHaveText('388.495');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export overview', exact: true }).first().click(),
  ]);
  let text = '';
  for await (const chunk of await download.createReadStream()) text += chunk;
  const exported = JSON.parse(text);
  expect(exported.source.versionId).toBe(original.id);
  expect(exported.source.checkStatus).toBe('failed');
  expect(exported.source.dataSha256).toBe(original.dataSha256);
  // Corrupted bytes cannot pass just because the filename looks valid.
  await page.route('**' + original.path, (r) =>
    r.fulfill({ contentType: 'application/json', body: '{}' }),
  );
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Data SKDR gagal dimuat' })).toBeVisible();
  await expect(page.getByRole('alert').last()).toContainText('Checksum');
  await page.unroute('**' + original.path);
  await page.getByRole('button', { name: 'Coba lagi SKDR' }).click();
  await expect(page.locator('.metric strong')).toHaveText('388.495');
  await page.route('**/data/indonesia/manifest.json', (r) =>
    r.fulfill({ status: 503, body: 'offline' }),
  );
  await page.getByRole('button', { name: 'Periksa ulang manifest' }).click();
  await expect(page.getByLabel('Status sinkronisasi sumber')).toContainText(
    'Manifest gagal diperiksa',
  );
  await expect(page.locator('.metric strong')).toHaveText('388.495');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
  expect(errors).toEqual([]);
  console.log(
    JSON.stringify(
      {
        result: 'PASS',
        evidence:
          'fixture manifest changes real Dashboard request URL; immutable old view/reload/export survives latest update and source failure; checksum rejection; shared workspace; mobile',
        versionPaths: reads,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
  await rm(fixtureRoot, { recursive: true, force: true });
}
