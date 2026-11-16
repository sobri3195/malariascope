import { chromium, firefox, webkit, expect } from '@playwright/test';
const base = process.env.APP_URL || 'http://127.0.0.1:4173';
const results = [];
for (const [name, type] of Object.entries({ chromium, firefox, webkit })) {
  let browser;
  try {
    browser = await type.launch(
      name === 'chromium'
        ? {
            executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
            args: ['--no-sandbox'],
          }
        : {},
    );
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(base + '/research-operations');
    await expect(
      page.getByRole('heading', { name: 'Research Operations & Integration', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Models', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Reproducible model laboratory', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Workspace', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Workspace backup & recovery', exact: true }),
    ).toBeVisible();
    await page.goto(
      base + '/dashboard?dataset=skdr-indonesia&year=2026&snapshot=2026-m44&region=11.03',
    );
    await expect(
      page.getByText('Data Aceh Timur 2026 belum tersedia', { exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Lihat data 2025', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'SISMAL Kemenkes — 2025', exact: true }),
    ).toBeVisible();
    await expect(page.locator('.metric strong')).toHaveText('4');
    if (errors.length) throw Error(errors.join('\n'));
    results.push({ browser: name, status: 'passed' });
    console.log(`PASS ${name}: operations, SKDR/SISMAL source selection and mobile`);
  } catch (e) {
    results.push({ browser: name, status: 'failed', error: String(e) });
    console.error(`FAIL ${name}: ${String(e).split('\n').slice(0, 3).join(' ')}`);
  } finally {
    await browser?.close();
  }
}
console.log(JSON.stringify(results, null, 2));
if (results.some((r) => r.status !== 'passed')) process.exitCode = 1;
