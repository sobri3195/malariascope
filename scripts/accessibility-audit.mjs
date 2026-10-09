import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { writeFile } from 'node:fs/promises';
const base = process.env.APP_URL || 'http://127.0.0.1:4173';
const routes = [
  'dashboard',
  'risk-map',
  'surveillance',
  'district-intelligence',
  'climate',
  'forecasting',
  'model-benchmarking',
  'spatial-analysis',
  'early-warning',
  'risk-intelligence',
  'force-health',
  'scenario',
  'data-center',
  'data-quality',
  'reports',
  'alerts',
  'audit',
  'settings',
  'methodology',
  'provenance',
  'about',
  'prospective-registry',
  'model-monitoring',
  'research-operations',
];
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
  args: ['--no-sandbox'],
});
const context = await browser.newContext();
const page = await context.newPage();
await page.route('**/*', (route) =>
  new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.abort(),
);
const report = [];
try {
  for (const route of routes) {
    await page.goto(base + '/' + route);
    await page
      .locator('main h1')
      .filter({ hasNotText: /Loading/ })
      .first()
      .waitFor();
    await page.locator('footer').filter({ hasText: 'Application functioning' }).first().waitFor();
    const a = await new AxeBuilder({ page })
      .include('main')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    report.push({
      route,
      violations: a.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
      })),
    });
    console.log(`${route}: ${a.violations.length} violation types`);
    await writeFile('/tmp/malariascope-accessibility-audit.json', JSON.stringify(report, null, 2));
  }
  await writeFile('/tmp/malariascope-accessibility-audit.json', JSON.stringify(report, null, 2));
  if (report.some((r) => r.violations.length)) process.exitCode = 1;
} finally {
  await browser.close();
}
