import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadResearchPackage } from './research-data/research.ts';
import { methodologyEvidence, evidenceCsv } from './methodology-evidence.ts';
const p = await loadResearchPackage(
  (async (url: any) =>
    new Response(await readFile(new URL('../public' + url, import.meta.url)))) as typeof fetch,
);
test('methodology derives complete annual series and keeps spatial cohort separate', () => {
  const e = methodologyEvidence(p);
  assert.deepEqual(
    e.annual.map((r) => r.cases),
    [104544, 116675, 180950, 151127, 204727, 288131],
  );
  assert.equal(e.balancedTotal, 1046154);
  assert.equal(e.spatialEpisodes, 288879);
  assert.equal(e.annual[0].changePercent, null);
  assert.ok(Math.abs(e.annual[1].changePercent! - ((116675 - 104544) / 104544) * 100) < 1e-10);
  assert.equal(e.coverage.candidatePanel.availableBundledOutcomes, 49);
  assert.equal(e.coverage.candidatePanel.observedOutcomesReported, 53);
  assert.ok(!p.balanced.some((r) => r.district === 'Supiori'));
});
test('benchmark orders actual supplied MAE and preserves unavailable metrics', () => {
  const e = methodologyEvidence(p);
  assert.equal(e.benchmark[0].model, 'Persistence');
  assert.equal(e.benchmark[0].rmse, null);
  assert.ok(Math.abs(e.climateMaeDifference! - 110.832295199684) < 1e-8);
  assert.equal(e.spatial.pValue, 0.1301);
  assert.equal(e.uncertainty.pairedInterval[0], -2793.2);
  const changed = {
    ...p,
    performance: p.performance.map((r) => (r.model === 'Gradient Boosting' ? { ...r, mae: 1 } : r)),
  };
  assert.equal(methodologyEvidence(changed).benchmark[0].model, 'Gradient Boosting');
});
test('CSV contains all evidence sections, preserves nulls and escapes spreadsheet formulas', () => {
  const csv = evidenceCsv({ ...methodologyEvidence(p), adversarial: '=HYPERLINK("external")' });
  for (const section of [
    'coverage',
    'status',
    'benchmark',
    'spatial',
    'limitations',
    'sourceIssues',
    'provenance',
  ])
    assert.ok(csv.includes('"' + section + '"'));
  assert.match(csv, /Not supplied/);
  assert.match(csv, /"'=HYPERLINK\(""external""\)"/);
  assert.ok(!csv.includes('[object Object]'));
});

test('coverage obeys actual year/district and does not impute missing cases or hide duplicates', async () => {
  const { loadedCoverage } = await import('./methodology-evidence.ts');
  const c = loadedCoverage(p.balanced, 2025, 'Kota Jayapura');
  assert.equal(c.selected.length, 1);
  assert.equal(c.cases, 69944);
  assert.equal(c.completeness, 100);
  const empty = loadedCoverage(p.balanced, 2024, 'Supiori');
  assert.equal(empty.cases, null);
  assert.equal(empty.completeness, null);
  const partial = loadedCoverage(
    [
      { district: 'A', year: 2025, cases: 4 },
      { district: 'A', year: 2025 },
      { district: 'B', year: 2024, cases: 5 },
    ],
    2025,
    'All districts',
  );
  assert.equal(partial.completeness, 50);
  assert.equal(partial.duplicates, 1);
  assert.equal(partial.cases, 4);
});
test('100,000 synthetic records remain explicit, reproducible and outside verified manifest', async () => {
  const { createHash } = await import('node:crypto');
  const csv = await readFile(
    new URL('../public/data/demo/synthetic-100000.csv', import.meta.url),
    'utf8',
  );
  const metadata = JSON.parse(
    await readFile(new URL('../public/data/demo/metadata.json', import.meta.url), 'utf8'),
  );
  assert.equal(csv.trim().split('\n').length, 100001);
  assert.equal(csv.match(/SYNTHETIC_NOT_OBSERVED/g)?.length, 100000);
  assert.equal(metadata.records, 100000);
  assert.equal(createHash('sha256').update(csv).digest('hex'), metadata.sha256);
  assert.equal(p.balanced.length, 48);
  assert.ok(!p.manifest.files.some((f: any) => f.name.includes('synthetic')));
});
