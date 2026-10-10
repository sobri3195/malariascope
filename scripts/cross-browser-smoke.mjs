import { chromium, firefox, webkit, expect } from '@playwright/test';
const base = process.env.APP_URL || 'http://127.0.0.1:4173';
for (const [name, type] of Object.entries({ chromium, firefox, webkit })) {
  const browser = await type.launch();
  try {
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
    if (errors.length) throw Error(errors.join('\n'));
    console.log(`PASS ${name}: operations navigation, model and backup controls`);
  } finally {
    await browser.close();
  }
}
