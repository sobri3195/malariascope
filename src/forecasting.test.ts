import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  forecastModels,
  loadedForecastEvidence,
  forecastMetrics,
  evaluateForecasts,
  rankEvaluations,
  studyEvaluations,
  scientificInterpretation,
  modelFailureAnalysis,
  residualHistogram,
  districtErrorRanking,
  type ForecastPair,
} from './forecasting.ts';
import type { EvidenceDataset } from './district-intelligence.ts';
const datasets: EvidenceDataset[] = forecastModels.map((model, i) => ({
  id: String(i),
  name: model,
  source: 'Isolated automated fixture',
  checksum: 'fixture-' + i,
  created: '2026-01-01',
  classification: 'USER IMPORT',
  rows: [100, 200, 300].map((cases, j) => ({
    district: ['A', 'B', 'C'][j],
    district_code: String(j + 1),
    year: 2025,
    cases,
    prediction:
      cases +
      [
        [5, 5, 5],
        [8, 8, 8],
        [0, 0, 12],
        [10, 10, 10],
        [9, 9, 9],
      ][i][j],
    model,
  })),
}));
const evidence = loadedForecastEvidence(datasets, '0');
test('forecast joins compare five model datasets without duplicating cases and retain exact provenance', () => {
  assert.equal(evidence.pairs.length, 15);
  assert.equal(evidence.observations.length, 3);
  const pair = evidence.pairs.find((p) => p.model === 'Random Forest' && p.district === 'C')!;
  assert.equal(pair.observed, 300);
  assert.equal(pair.predicted, 312);
  assert.equal(pair.residual, 12);
  assert.equal(pair.absoluteError, 12);
  assert.equal(pair.references[0].datasetId, '0');
  assert.equal(pair.references[1].datasetId, '2');
});
test('leaderboard changes with primary metric and never hard-codes a preferred model', () => {
  const mae = evaluateForecasts(evidence.pairs, [...forecastModels], 2025, 2025, 'mae');
  assert.equal(mae.evaluations[0].model, 'Random Forest');
  assert.equal(mae.comparable, true);
  const rmse = evaluateForecasts(evidence.pairs, [...forecastModels], 2025, 2025, 'rmse');
  assert.equal(rmse.evaluations[0].model, 'Persistence');
  assert.match(
    scientificInterpretation(rmse.evaluations, 'rmse', true),
    /Persistence outperformed Random Forest/,
  );
  assert.equal(
    evaluateForecasts(evidence.pairs, [...forecastModels], 2025, 2025, 'r2').evaluations[0].model,
    'Persistence',
  );
});
test('MAE, RMSE, R², median absolute error and signed bias use actual paired errors', () => {
  const selected = evidence.pairs.filter((p) => p.model === 'Random Forest');
  const metrics = forecastMetrics(selected);
  assert.equal(metrics.mae, 4);
  assert.equal(metrics.rmse, Math.sqrt(48));
  assert.equal(metrics.medianAbsoluteError, 0);
  assert.equal(metrics.bias, 4);
  assert.equal(metrics.r2, 1 - 144 / 20000);
  const cancel: ForecastPair[] = selected.slice(0, 2).map((p, i) => ({
    ...p,
    predicted: p.observed + (i ? -10 : 10),
    residual: i ? -10 : 10,
    absoluteError: 10,
  }));
  assert.equal(forecastMetrics(cancel).bias, 0);
  assert.equal(forecastMetrics(cancel).medianAbsoluteError, 10);
  assert.equal(forecastMetrics(cancel.map((p) => ({ ...p, observed: 100 }))).r2, null);
});
test('missing models and mismatched cohorts remain visible without unsupported superiority claims', () => {
  const partial = evidence.pairs.filter(
    (p) => !(p.model === 'Random Forest' && p.district === 'C'),
  );
  const common = evaluateForecasts(partial, [...forecastModels], 2025, 2025, 'mae');
  assert.equal(common.commonPairs, 2);
  assert.ok(common.evaluations.every((e) => e.metrics.n === 2));
  const available = evaluateForecasts(partial, [...forecastModels], 2025, 2025, 'mae', false);
  assert.equal(available.comparable, false);
  assert.match(scientificInterpretation(available.evaluations, 'mae', false), /descriptive/);
  const none = evaluateForecasts(evidence.pairs, [...forecastModels], 2030, 2030, 'mae');
  assert.ok(none.evaluations.every((e) => e.rank === null));
  assert.match(scientificInterpretation(none.evaluations, 'mae', false), /cannot be established/);
});
test('ties share a rank and absent metric values cannot win', () => {
  const original = evaluateForecasts(
    evidence.pairs,
    [...forecastModels],
    2025,
    2025,
    'mae',
  ).evaluations;
  const tied = rankEvaluations(
    original.map((e) => ({
      ...e,
      metrics: {
        ...e.metrics,
        mae: e.model === 'Persistence' || e.model === 'Random Forest' ? 4 : null,
      },
    })),
    'mae',
  );
  assert.equal(tied[0].rank, 1);
  assert.equal(tied[1].rank, 1);
  assert.equal(tied[2].rank, null);
  assert.match(scientificInterpretation(tied, 'mae', true), /tied/);
});
test('source case conflicts and ambiguous predictions are withheld rather than silently paired', () => {
  const altered = datasets.map((d) => ({
    ...d,
    rows: d.rows.map((r) => ({ ...r, cases: d.id === '2' ? r.cases + 1 : r.cases })),
  }));
  const result = loadedForecastEvidence(altered, '0');
  assert.equal(result.pairs.filter((p) => p.model === 'Random Forest').length, 0);
  assert.ok(result.issues.some((i) => i.includes('pair withheld')));
  const duplicate = {
    ...datasets[2],
    id: 'alternate',
    rows: datasets[2].rows.map((r) => ({ ...r, prediction: r.prediction! + 30 })),
  };
  assert.equal(
    loadedForecastEvidence([...datasets, duplicate], '0').pairs.filter(
      (p) => p.model === 'Random Forest',
    ).length,
    0,
  );
});
test('supplied aggregates remain separate from paired data, with year/metric-specific interpretation', () => {
  const study = [
    { model: 'Persistence', year: 2025, mae: 10426 },
    { model: 'Random Forest', year: 2025, mae: 12690, rmse: 18502, r2: 0.36 },
    { model: 'Random Forest', year: 2024, mae: 11060 },
  ];
  const mae = studyEvaluations(study, 2025, [...forecastModels], 'mae');
  assert.equal(
    scientificInterpretation(mae, 'mae', false),
    'Persistence outperformed Random Forest on the primary 2025 MAE metric.',
  );
  assert.match(
    scientificInterpretation(
      studyEvaluations(study, 2025, [...forecastModels], 'rmse'),
      'rmse',
      false,
    ),
    /Only Random Forest/,
  );
  assert.match(
    scientificInterpretation(
      studyEvaluations(study, 2024, [...forecastModels], 'mae'),
      'mae',
      false,
    ),
    /No cross-model superiority/,
  );
  assert.equal(mae[0].metrics.medianAbsoluteError, null);
  assert.equal(mae[0].metrics.n, null);
  assert.match(modelFailureAnalysis(mae[0])[0], /unavailable/);
});
test('failure analysis identifies measured district errors, direction and concentration without causal invention', () => {
  const e = evaluateForecasts(evidence.pairs, ['Random Forest'], 2025, 2025, 'mae').evaluations[0];
  assert.equal(districtErrorRanking(e.pairs)[0].district, 'C');
  assert.match(modelFailureAnalysis(e)[0], /C, MAE 12.00/);
  assert.match(modelFailureAnalysis(e)[2], /overprediction/);
  assert.match(modelFailureAnalysis(e)[3], /100.0%/);
  const bins = residualHistogram(e.pairs);
  assert.equal(
    bins.reduce((sum, b) => sum + b.count, 0),
    3,
  );
  assert.equal(bins.at(-1)!.count, 1);
  assert.equal(residualHistogram(e.pairs.map((p) => ({ ...p, residual: 0 })))[0].count, 3);
});
