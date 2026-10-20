import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadResearchPackage } from './research-data/research.ts';
import {
  climateAssociations,
  cohortExport,
  diagnostics,
  finite,
  rankBenchmarks,
  referenceDifferences,
  scopeRows,
  scopeSummary,
  spearman,
} from './research-evidence/engine.ts';
import { referenceStatus, scopes } from './research-evidence/contract.ts';
const p = await loadResearchPackage(
  (async (url: any) =>
    new Response(await readFile(new URL('../public' + url, import.meta.url)))) as typeof fetch,
);
const near = (actual: number | null, expected: number, tolerance = 1e-7) =>
  assert.ok(
    actual !== null && Math.abs(actual - expected) < tolerance,
    `${actual} differs from ${expected}`,
  );

test('balanced panel, independent snapshot and unconnected geographic contexts stay distinct', () => {
  assert.equal(scopeSummary(p, 'panel', 2025, 'All districts').cases, 288131);
  assert.equal(scopeSummary(p, 'snapshot', 2025, 'All districts').cases, 288879);
  assert.equal(scopeRows(p, 'panel').length, 48);
  assert.equal(scopeRows(p, 'snapshot').length, 9);
  assert.equal(scopeSummary(p, 'panel', 2025, 'All districts').expected, 8);
  assert.equal(scopeSummary(p, 'snapshot', 2025, 'All districts').expected, 9);
  assert.equal(scopeSummary(p, 'snapshot', 2024, 'All districts').cases, null);
  assert.equal(scopeSummary(p, 'panel', 2025, 'Supiori').cases, null);
  for (const scope of scopes.filter((s) => !s.available))
    assert.equal(scopeSummary(p, scope.id, 2025, 'All districts').cases, null);
});
test('coverage is derived from actual outcomes; missing outcomes are never zero or a perfect score', () => {
  assert.equal(scopeSummary(p, 'panel', 2025, 'All districts').coverage, 100);
  assert.equal(scopeSummary(p, 'snapshot', 2024, 'All districts').coverage, 0);
  const zero = structuredClone(p);
  zero.balanced[0].cases = 0;
  assert.equal(scopeRows(zero, 'panel')[0].cases, 0);
  assert.equal(finite(null), null);
  assert.equal(finite(''), null);
  assert.equal(finite(Infinity), null);
  const duplicated = structuredClone(p);
  duplicated.balanced.push({ ...duplicated.balanced[0] });
  assert.equal(scopeRows(duplicated, 'panel').length, 47);
});
test('same-year observed API denominator is not replaced with preceding-year intensity population', () => {
  const row = scopeSummary(p, 'panel', 2025, 'Biak Numfor').selected[0];
  assert.equal(row.population, 142790);
  assert.equal(row.observedApi, 30.16);
  const result = diagnostics(p, 'panel', 2025, 'Biak Numfor', 'Random Forest').rows[0];
  assert.equal(result.priorPopulation, 152123);
  assert.equal(result.projectedIntensity, 27.99);
  const earlier = scopeSummary(p, 'panel', 2024, 'Biak Numfor').selected[0];
  assert.equal(earlier.population, null);
  assert.equal(earlier.observedApi, null);
});
test('conflicting episode counts cannot silently join snapshot API or denominator into the panel', () => {
  const changed = structuredClone(p);
  changed.spatial.find((r) => r.district === 'Biak Numfor').cases += 1;
  const row = scopeSummary(changed, 'panel', 2025, 'Biak Numfor').selected[0];
  assert.equal(row.cases, 4306);
  assert.equal(row.population, null);
  assert.equal(row.observedApi, null);
  assert.equal(row.denominatorConflict, true);
  assert.equal(scopeSummary(changed, 'snapshot', 2025, 'Biak Numfor').selected[0].cases, 4307);
});
test('metric-selectable reference rankings preserve primary MAE and missing original metrics', () => {
  assert.equal(rankBenchmarks(p, 'brief', 'test', 'mae')[0].model, 'Persistence');
  assert.equal(rankBenchmarks(p, 'brief', 'test', 'rmse')[0].model, 'Ridge Regression');
  assert.equal(rankBenchmarks(p, 'brief', 'test', 'r2')[0].model, 'Ridge Regression');
  assert.equal(
    rankBenchmarks(p, 'brief', 'validation', 'mae').filter((r) => r.model !== 'Persistence')[0]
      .model,
    'Random Forest',
  );
  assert.ok(rankBenchmarks(p, 'brief', 'validation', 'r2').every((r) => r.rank === null));
  const original = rankBenchmarks(p, 'artifact', 'test', 'rmse').find(
    (r) => r.model === 'Persistence',
  );
  assert.equal(original?.rmse, null);
  assert.equal(original?.rank, null);
  assert.match(referenceStatus, /PRIMARY DOCUMENTS NOT REVIEWED/);
});
test('Jayapura City and aggregate RF errors are calculated from rounded pairs with explicit sample', () => {
  const result = diagnostics(p, 'panel', 2025, 'All districts', 'Random Forest');
  assert.equal(result.matched, 8);
  assert.equal(result.observed, 288131);
  near(result.predicted, 194738.9);
  near(result.shortfall, 93392.1);
  const city = result.rows.find((r) => r.district === 'Kota Jayapura')!;
  assert.equal(city.cases, 69944);
  assert.equal(city.predicted, 29003.7);
  near(city.signed, -40940.3);
  near(city.absolute, 40940.3);
  near(city.errorShare, 40.33, 0.01);
  assert.equal(diagnostics(p, 'panel', 2024, 'All districts', 'Random Forest').matched, 0);
});
test('Supiori missing prediction is excluded from paired totals and retained as missing', () => {
  const result = diagnostics(p, 'snapshot', 2025, 'All districts', 'Random Forest');
  assert.equal(result.rows.length, 9);
  assert.equal(result.missing, 1);
  assert.equal(result.matched, 8);
  assert.equal(result.observed, 288131);
  const supiori = result.rows.find((r) => r.district === 'Supiori')!;
  assert.equal(supiori.cases, 748);
  assert.equal(supiori.predicted, null);
  assert.equal(supiori.signed, null);
  assert.equal(supiori.projectedIntensity, null);
});
test('Spearman handles average-rank ties, missing values, small n and constant variables', () => {
  near(
    spearman([
      [1, 10],
      [1, 20],
      [2, 30],
    ]).rho,
    Math.sqrt(3) / 2,
  );
  assert.equal(
    spearman([
      [1, 3],
      [2, 2],
      [3, 1],
    ]).rho,
    -1,
  );
  assert.equal(
    spearman([
      [1, 3],
      [1, 2],
      [1, 1],
    ]).rho,
    null,
  );
  assert.equal(
    spearman([
      [1, 2],
      [2, 3],
      [NaN, 4],
    ]).n,
    2,
  );
  assert.equal(
    spearman([
      [1, 2],
      [2, 3],
    ]).rho,
    null,
  );
  assert.ok(climateAssociations(p, 'All districts', null).every((r) => r.n === 48));
  assert.ok(climateAssociations(p, 'All districts', 2025).every((r) => r.n === 8));
  assert.ok(climateAssociations(p, 'Biak Numfor', 2025).every((r) => r.n === 1 && r.rho === null));
});
test('source discrepancy is not resolved by overwriting the original metric', () => {
  const difference = referenceDifferences(p).find(
    (r) => r.model === 'Random Forest' && r.split === 'validation',
  );
  assert.equal(difference?.original, 11060);
  assert.equal(difference?.reference, 11059.8);
  assert.equal(
    p.performance.find((r) => r.model === 'Random Forest' && r.year === 2024)?.mae,
    11060,
  );
});
test('cohort exports retain filters, indicator definitions, source versions and unavailable data', () => {
  const exported = cohortExport(p, 'snapshot', 2025, 'Kota Jayapura');
  assert.equal(exported.observations.length, 1);
  assert.equal(exported.observations[0].cases, 69944);
  assert.equal(exported.scope?.id, 'snapshot');
  assert.ok(
    exported.indicatorDefinitions.some(
      (d) => d.field === 'observedApi' && /at-risk/.test(d.denominator),
    ),
  );
  assert.ok(exported.sourceFiles.every((f: any) => f.sha256));
  assert.equal(exported.originalRetrievalDate, null);
  assert.equal(cohortExport(p, 'papua-context', 2025, 'All districts').observations.length, 0);
});
