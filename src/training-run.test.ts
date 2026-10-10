import test from 'node:test';
import assert from 'node:assert/strict';
import { forecastMetrics, type ForecastPair } from './forecasting.ts';
import {
  validateTrainingRun,
  rankTrainingRun,
  trainingPairs,
  type TrainingRun,
} from './training-run.ts';
import { validatePortableModel, predictPortable, type PortableModel } from './portable-model.ts';
import { captureBackup, validateBackup } from './workspace-backup.ts';
export function fixtureRun(): TrainingRun {
  const predictions = ['Persistence', 'Random Forest'].flatMap((model, m) =>
    ['A', 'B', 'C'].map((district, i) => {
      const cases = (i + 1) * 100,
        residual = m ? [0, 0, 12][i] : 5;
      return {
        model,
        district,
        year: 2025,
        cases,
        prediction: cases + residual,
        residual,
        absoluteError: Math.abs(residual),
        lower: null,
        upper: null,
        classification: 'SYNTHETIC',
      };
    }),
  );
  const leaderboard = ['Persistence', 'Random Forest'].map((model) => {
    const metrics = forecastMetrics(
      predictions
        .filter((p) => p.model === model)
        .map((p) => ({
          ...p,
          observed: p.cases,
          predicted: p.prediction,
          key: p.district,
          references: [],
        })) as ForecastPair[],
    );
    return {
      model,
      metrics,
      validationPeriod: '2025',
      pairedComparisons:
        model === 'Random Forest'
          ? [
              {
                reference: 'Persistence',
                n: 3,
                maeDifference: -1,
                lower: -5,
                upper: 7,
                method: 'Fixture paired bootstrap',
                interpretation: 'Descriptive only',
                crossesZero: true,
              },
            ]
          : [],
    };
  });
  return {
    schema: 'malariascope-training-run-v2',
    cohortMode: 'CLIMATE COMPLETE CASE',
    datasetHash: 'a'.repeat(64),
    trainingHash: 'b'.repeat(64),
    source: 'Synthetic test fixture',
    license: 'Test only',
    classification: 'SYNTHETIC',
    seed: 19,
    protocol: 'Pre-holdout selection',
    trainingStart: 2020,
    trainingEnd: 2024,
    trainingRows: 15,
    testYear: 2025,
    environment: { python: 'test', numpy: 'test', scikitLearn: 'test' },
    codeHashes: { 'train.py': 'c'.repeat(64) },
    selection: {
      Persistence: { status: 'FIXED BASELINE', parameters: {}, folds: [] },
      'Random Forest': { status: 'FIXED PARAMETERS', parameters: { max_depth: 5 }, folds: [] },
    },
    excluded: [],
    ignoredFuture: [],
    limitations: ['Not observed data'],
    leaderboard,
    predictions,
    rollingOrigin: [],
  } as TrainingRun;
}
test('training report metrics are recomputed, metric direction and global filters control ranks', () => {
  const r = fixtureRun();
  validateTrainingRun(r);
  assert.equal(rankTrainingRun(r, 'mae')[0].model, 'Random Forest');
  assert.equal(rankTrainingRun(r, 'rmse')[0].model, 'Persistence');
  assert.equal(rankTrainingRun(r, 'r2')[0].model, 'Persistence');
  assert.deepEqual(rankTrainingRun(r, 'r2', 2025, 'A'), []);
  assert.equal(trainingPairs(r, 2025, 'A').length, 2);
  assert.deepEqual(rankTrainingRun(r, 'mae', 2024), []);
  const fake = structuredClone(r);
  fake.leaderboard[0].metrics.mae = 0;
  assert.throws(() => validateTrainingRun(fake), /disagree/);
});
test('training report rejects future backtests, inconsistent cohorts and comparison claims', () => {
  const r = fixtureRun();
  r.rollingOrigin = [
    {
      model: 'Random Forest',
      trainingEnd: 2024,
      testYear: 2025,
      metrics: r.leaderboard[1].metrics,
    },
  ];
  assert.throws(() => validateTrainingRun(r), /Backtesting/);
  const cohort = fixtureRun();
  cohort.predictions[3].district = 'Other';
  assert.throws(() => validateTrainingRun(cohort), /identical/);
  const comparison = fixtureRun();
  comparison.leaderboard[1].pairedComparisons[0].maeDifference = -10;
  assert.throws(() => validateTrainingRun(comparison), /difference/);
  const selection = fixtureRun();
  selection.selection['Random Forest'].folds = [2025];
  assert.throws(() => validateTrainingRun(selection), /selection/);
});
const model: PortableModel = {
  schema: 'malariascope-portable-model-v1',
  model: 'Ridge Regression',
  version: 'legacy-fixture',
  datasetHash: 'a'.repeat(64),
  classification: 'SYNTHETIC',
  features: [{ name: 'cases_lag1', unit: 'cases' }],
  trainingEnd: 2024,
  validationPeriod: '2025',
  mean: [10],
  scale: [2],
  coefficients: [3],
  intercept: 5,
};
test('artifact inference exposes unsupported applicability and rejects corrupt metadata or physical inputs', () => {
  assert.match(predictPortable(model, { cases_lag1: 12 }).warnings[0], /unavailable/);
  assert.throws(() => predictPortable(model, { cases_lag1: -1 }), /physical domain/);
  assert.throws(() => validatePortableModel({ ...model, validationPeriod: {} }), /provenance/);
  assert.throws(() => validatePortableModel({ ...model, provenance: {} }), /provenance/);
  const provenance = {
    modelIdentity: 'fit-' + 'd'.repeat(64),
    trainingHash: 'b'.repeat(64),
    trainingStart: 2020,
    trainingRows: 15,
    seed: 19,
    source: 'Fixture',
    license: 'Test only',
    parameters: { alpha: 1 },
    environment: { python: 'test', numpy: 'test', scikitLearn: 'test' },
    codeHashes: { 'train.py': 'c'.repeat(64) },
    selection: { status: 'FIXED', parameters: { alpha: 1 }, folds: [], candidates: [] },
    inputRanges: [{ minimum: 5, maximum: 15 }],
  };
  const fitted = { ...model, version: provenance.modelIdentity, provenance };
  assert.deepEqual(predictPortable(fitted, { cases_lag1: 12 }).warnings, []);
  assert.match(predictPortable(fitted, { cases_lag1: 100 }).warnings[0], /extrapolation/);
});
test('complete backup validates captured model evidence before replacing any storage', () => {
  const entries = new Map([['malariascope-training-runs', JSON.stringify([fixtureRun()])]]);
  const storage = {
    getItem: (k: string) => entries.get(k) ?? null,
    length: entries.size,
    key: (i: number) => [...entries.keys()][i] ?? null,
  } as Storage;
  const b = captureBackup({ datasets: [], active: '' }, storage);
  validateBackup(b);
  const broken = fixtureRun();
  broken.trainingEnd = 2026;
  b.companions['malariascope-training-runs'] = JSON.stringify([broken]);
  assert.throws(() => validateBackup(b), /temporal/);
});

test('unreadable ML libraries retain original values and cannot silently become empty evidence', async () => {
  const { readMLLibrary } = await import('./ml-library-storage.ts');
  const original = '[{"schema":"malformed"}]';
  const storage = { getItem: () => original };
  const state = readMLLibrary('models', validateTrainingRun, storage);
  assert.equal(state.original, original);
  assert.match(state.issue, /preserved/);
  assert.deepEqual(state.items, []);
  const unavailable = readMLLibrary('models', validateTrainingRun, {
    getItem: () => {
      throw Error('SecurityError');
    },
  });
  assert.match(unavailable.issue, /unavailable/);
});
