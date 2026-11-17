import { createServer } from 'node:net';
import { chromium, expect } from '@playwright/test';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const base = process.env.APP_URL || 'http://127.0.0.1:4173';
const python = process.env.PYTHON || 'python';
const root = await mkdtemp(join(tmpdir(), 'personnel-browser-'));
const env = {
  ...process.env,
  MALARIASCOPE_DB: join(root, 'test.sqlite'),
  MALARIASCOPE_PERSONNEL_DEMO: '1',
  MALARIASCOPE_ROSTER_FILE: '',
  MALARIASCOPE_SECURE_COOKIE: '0',
};
execFileSync(
  python,
  [
    '-c',
    `from services.app import create_user,connection
import json
create_user('browser-officer','synthetic-password-123','ANALYST')
with connection() as db:
 db.execute('CREATE TABLE personnel_grants(actor TEXT,unit_id TEXT,role TEXT,fields TEXT,PRIMARY KEY(actor,unit_id))')
 db.execute('INSERT INTO personnel_grants VALUES(?,?,?,?)',('browser-officer','demo-aceh','UNIT_OFFICER',json.dumps(['name','maskedId','placementStatus'])))
`,
  ],
  { env },
);
const socket = createServer();
await new Promise((resolve) => socket.listen(0, '127.0.0.1', resolve));
const port = socket.address().port;
await new Promise((resolve) => socket.close(resolve));
const serviceUrl = `http://127.0.0.1:${port}`;
const server = spawn(
  python,
  ['-m', 'uvicorn', 'services.app:app', '--host', '127.0.0.1', '--port', String(port)],
  { env, stdio: 'ignore' },
);
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
  args: ['--no-sandbox'],
});
try {
  await expect
    .poll(async () => {
      try {
        return (await fetch(serviceUrl + '/api/health')).status;
      } catch {
        return 0;
      }
    })
    .toBe(200);
  for (const width of [1440, 390]) {
    execFileSync(
      python,
      [
        '-c',
        `from services.app import connection
import json
with connection() as db: db.execute('UPDATE personnel_grants SET fields=?',(json.dumps(['name','maskedId','placementStatus']),))`,
      ],
      { env },
    );
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await context.route('**/api/**', async (route) => {
      const url = new URL(route.request().url());
      const response = await route.fetch({
        url: serviceUrl + url.pathname + url.search,
      });
      await route.fulfill({ response });
    });
    await page.goto(base + '/internal-personnel');
    await expect(page.getByText('Sesi berakhir.', { exact: false })).toBeVisible();
    await expect(page.getByRole('option', { name: 'Personel', exact: true })).toHaveCount(0);
    const login = await context.request.post(serviceUrl + '/api/login', {
      data: { username: 'browser-officer', password: 'synthetic-password-123' },
    });
    expect(login.ok()).toBeTruthy();
    await page.reload();
    await expect(page.getByLabel('Layer GIS')).toBeVisible();
    await page.getByLabel('Cari wilayah GIS').fill('11');
    await page.getByRole('button', { name: '11 · Aceh', exact: true }).click();
    await expect(page.getByLabel('Detail wilayah GIS')).toContainText('Aceh');
    await page.getByRole('button', { name: 'Tutup detail wilayah', exact: true }).click();
    await page.getByRole('button', { name: '11.03 · Kabupaten Aceh Timur', exact: true }).click();
    await page.getByRole('button', { name: 'Tab Personel', exact: true }).click();
    await expect(page.getByLabel('Cek Personel')).toContainText('DEMO SINTETIS');
    await expect(page.getByLabel('Cek Personel')).toContainText('Total dalam cakupan Anda: 4');
    await expect(page.getByLabel('Unit personel').locator('option')).toHaveCount(2);
    await page.getByLabel('Unit personel').selectOption('demo-aceh');
    await page.getByRole('button', { name: 'Personel Sintetis 1', exact: true }).click();
    await expect(page.getByLabel('Detail personel')).toContainText('DEMO-***1');
    await expect(page.getByLabel('Detail personel')).not.toContainText('administrativeNote');
    await page.getByLabel('Cari personel').fill('Sintetis 2');
    await expect(page.getByLabel('Cek Personel')).toContainText('1 hasil');
    await page.getByRole('button', { name: 'Personel Sintetis 2', exact: true }).click();
    await expect(page.getByLabel('Detail personel')).toContainText('DEMO-***2');
    expect(
      (
        await context.request.get(
          serviceUrl + '/api/personnel/regions/31.01/units/demo-jakarta/people/demo-7',
        )
      ).status(),
    ).toBe(404);
    const cached = await page.evaluate(async () => {
      const keys = await caches.keys();
      let found = [];
      for (const key of keys) {
        for (const req of await (await caches.open(key)).keys())
          if (req.url.includes('/api/personnel')) found.push(req.url);
      }
      return found;
    });
    expect(cached).toEqual([]);
    expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(
      'Personel Sintetis',
    );
    const epidemiology = await context.newPage();
    await epidemiology.goto(
      base + '/dashboard?dataset=skdr-indonesia&snapshot=2026-m44&year=2026&region=ID',
    );
    const [download] = await Promise.all([
      epidemiology.waitForEvent('download'),
      epidemiology.getByRole('button', { name: 'Export overview', exact: true }).first().click(),
    ]);
    const exported = await readFile(await download.path(), 'utf8');
    expect(exported).not.toContain('Personel Sintetis');
    expect(exported).not.toContain('maskedId');
    await epidemiology.getByLabel('Cari wilayah GIS').fill('11');
    const provinceButton = epidemiology.getByRole('button', { name: '11 · Aceh', exact: true });
    await provinceButton.focus();
    await provinceButton.press('Enter');
    await expect(epidemiology.getByLabel('Context province')).toHaveValue('11');
    const districtButton = epidemiology.getByRole('button', {
      name: '11.03 · Kabupaten Aceh Timur',
      exact: true,
    });
    await districtButton.focus();
    await districtButton.press('Enter');
    const profile = epidemiology.getByLabel('Detail wilayah GIS');
    await expect(profile).toContainText('Kode: 11.03');
    await expect(profile).toContainText('Kasus: Belum tersedia');
    await expect(epidemiology.getByLabel('Angka induk tingkat provinsi')).toContainText(
      '391 kasus',
    );
    await epidemiology
      .getByLabel('GIS wilayah')
      .getByRole('button', { name: 'Aceh', exact: true })
      .click();
    await expect(profile).toContainText('Kode: 11 ·');
    await epidemiology.goBack();
    await expect(profile).toContainText('Kode: 11.03');
    await epidemiology.goForward();
    await expect(profile).toContainText('Kode: 11 ·');
    await epidemiology.goBack();
    await expect(profile).toContainText('Kode: 11.03');
    await epidemiology.reload();
    await expect(epidemiology.getByLabel('Context regency')).toHaveValue('11.03');
    await expect(epidemiology.getByLabel('Detail wilayah GIS')).toContainText('Kode: 11.03');
    const selection = new URL(epidemiology.url()).search;
    await epidemiology.goto(base + '/risk-map' + selection);
    await expect(epidemiology.getByLabel('Detail wilayah GIS')).toContainText('Kode: 11.03');
    await epidemiology.getByRole('link', { name: 'Cek Personel internal', exact: true }).click();
    await expect(epidemiology.getByLabel('GIS wilayah')).toContainText('SKDR M43 2026');
    await expect(epidemiology.getByLabel('GIS wilayah')).toContainText('2026-m44');
    await epidemiology.getByLabel('Layer GIS').selectOption('personnel');
    expect(new URL(epidemiology.url()).searchParams.get('gisLayer')).toBe('personnel');
    await epidemiology.reload();
    await expect(epidemiology.getByLabel('Layer GIS')).toHaveValue('personnel');
    await expect(epidemiology.getByLabel('Cek Personel')).toContainText('DEMO SINTETIS');

    await epidemiology.close();

    // A new forbidden region must clear the previous region's profiles.
    await page.getByRole('button', { name: 'Tutup detail wilayah', exact: true }).click();
    await page.getByLabel('Cari wilayah GIS').fill('31');
    await page
      .getByRole('button', { name: '31 · Daerah Khusus Ibukota Jakarta', exact: true })
      .click();
    await expect(page.getByLabel('Cek Personel')).toContainText('Wilayah atau unit tidak tersedia');
    await page.getByRole('button', { name: 'Tutup detail wilayah', exact: true }).click();
    await page.getByRole('button', { name: 'Muat peta wilayah', exact: true }).click();
    await expect(
      page.getByText('Pencarian dan tabel tetap tersedia;', { exact: false }),
    ).toBeVisible();
    let releaseOld, oldStarted;
    const oldGate = new Promise((resolve) => {
      releaseOld = resolve;
    });
    const started = new Promise((resolve) => {
      oldStarted = resolve;
    });
    const oldPattern = '**/api/personnel/regions/11.03';
    await page.route(oldPattern, async (route) => {
      const response = await route.fetch({ url: serviceUrl + '/api/personnel/regions/11.03' });
      oldStarted();
      await oldGate;
      await route.fulfill({ response }).catch(() => {});
    });
    await page.goto(base + '/internal-personnel?region=11.03');
    await page.getByLabel('Layer GIS').selectOption('personnel');
    await started;
    await page.getByRole('button', { name: 'Tutup detail wilayah', exact: true }).click();
    await page.getByLabel('Cari wilayah GIS').fill('31');
    await page
      .getByRole('button', { name: '31 · Daerah Khusus Ibukota Jakarta', exact: true })
      .click();
    await expect(page.getByLabel('Cek Personel')).toContainText('Wilayah atau unit tidak tersedia');
    releaseOld();
    await expect(page.getByLabel('Unit personel')).toHaveCount(0);
    await expect(page.getByLabel('Detail wilayah GIS')).not.toContainText('Personel Sintetis');
    await page.unroute(oldPattern);
    // Isolated synthetic polygon tests selection and hatching, not real district geography.
    await page.route('**/data/verified/papua-study-adm2.geojson', (route) =>
      route.fulfill({
        json: {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              properties: { name: 'Kabupaten Aceh Timur', district_code: '11.03' },
              geometry: {
                type: 'Polygon',
                coordinates: [
                  [
                    [97, 4],
                    [98, 4],
                    [98, 5],
                    [97, 5],
                    [97, 4],
                  ],
                ],
              },
            },
          ],
        },
      }),
    );
    await page.goto(base + '/internal-personnel');
    const polygon = page.locator('.leaflet-interactive').first();
    await expect(polygon).toBeVisible();
    await expect(polygon).toHaveAttribute('fill', /url\(#.*nodata\)/);
    await polygon.click({ force: true });
    await expect(page.getByLabel('Detail wilayah GIS')).toContainText('Kabupaten Aceh Timur');
    await expect(page.getByRole('table', { name: 'Tabel wilayah GIS' })).toContainText('11.03');

    await page.getByLabel('Layer GIS').selectOption('personnel');
    await page.getByLabel('Unit personel').selectOption('demo-aceh');
    await page.getByRole('button', { name: 'Personel Sintetis 1', exact: true }).click();
    await expect(page.getByLabel('Detail personel')).toContainText('DEMO-***1');
    execFileSync(
      python,
      [
        '-c',
        `from services.app import connection
import json
with connection() as db: db.execute('UPDATE personnel_grants SET fields=?',(json.dumps(['name','maskedId','placementStatus','role']),))`,
      ],
      { env },
    );
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.getByLabel('Detail personel')).toHaveCount(0);
    await expect(page.getByLabel('Unit personel')).toHaveValue('');
    await page.getByLabel('Unit personel').selectOption('demo-aceh');
    await page.getByRole('button', { name: 'Personel Sintetis 1', exact: true }).click();
    await expect(page.getByLabel('Detail personel')).toContainText('DEMO-***1');
    execFileSync(
      python,
      [
        '-c',
        "from services.app import connection\nwith connection() as db: db.execute('UPDATE sessions SET expires=0')",
      ],
      { env },
    );
    await page.getByLabel('Cari personel').fill('expired session');
    await expect(page.getByLabel('Cek Personel')).toContainText('Sesi berakhir');
    await expect(page.getByLabel('Detail personel')).toHaveCount(0);
    expect(errors).toEqual([]);
    await context.close();
  }
  console.log(
    'PASS authenticated personnel GIS desktop/mobile: public denial, region/unit scope, masked details, search, hidden fields, unauthorized ID denial, no API cache, missing geometry.',
  );
} finally {
  await browser.close();
  server.kill('SIGTERM');
  if (server.exitCode === null) await new Promise((resolve) => server.once('exit', resolve));
  await rm(root, { recursive: true, force: true });
}
