import test from 'node:test';
import assert from 'node:assert/strict';
import { monitorProspective, type ProspectiveRecord } from './prospective-engine.ts';
import { moran } from './moran.ts';
import { evaluate, type Rule } from './analytics.ts';
import { evaluatePeriodic, periodIndex } from './periodic-surveillance.ts';
import { predictPortable, validatePortableModel, type PortableModel } from './portable-model.ts';
import { bootstrapMAE } from './forecast-uncertainty.ts';
import { captureBackup, restoreBackup, validateBackup } from './workspace-backup.ts';
import { usableWorkspace } from './workspace-storage.ts';
import { validateResources, resourceFreshness } from './resource-evidence.ts';
import { coverageGaps } from './evidence-completion.ts';
class MemoryStorage implements Storage {
  data = new Map<string, string>();
  failKey: string | null = null;
  get length() {
    return this.data.size;
  }
  key(i: number) {
    return [...this.data.keys()][i] ?? null;
  }
  clear() {
    this.data.clear();
  }
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
  setItem(k: string, v: string) {
    if (k === this.failKey) throw Error('Quota');
    this.data.set(k, v);
  }
}
test('monitoring never pools model/version/period/dataset cohorts', () => {
  const base = {
    locked: true,
    outcome: 100,
    persistence_prediction: 100,
    model_version: '1',
    target_period: '2028',
    dataset_version: '1',
    dataset_hash: 'a'.repeat(64),
  };
  const m = monitorProspective([
    { ...base, model: 'RF', prediction: 110 },
    { ...base, model: 'Ridge', prediction: 200 },
  ] as ProspectiveRecord[]);
  assert.equal(m.model, null);
  assert.deepEqual(
    m.groups.map((g) => g.model?.mae),
    [10, 100],
  );
  const versions = monitorProspective([
    { ...base, model: 'RF', prediction: 110 },
    { ...base, model: 'RF', model_version: '2', prediction: 200 },
  ] as ProspectiveRecord[]);
  assert.equal(versions.groups.length, 2);
});
test('complete backup roundtrip includes companion data and drafts; rejects injected keys', () => {
  const store = new MemoryStorage();
  store.setItem('malariascope-prospective', '[]');
  store.setItem('malariascope-rule-draft:x', '{"draft":{"id":"x"}}');
  store.setItem('unrelated', 'keep');
  const b = captureBackup({ datasets: [], rules: [], snapshots: [], audit: [], active: '' }, store);
  store.clear();
  store.setItem('unrelated', 'keep');
  restoreBackup(b, store);
  assert.equal(store.getItem('malariascope-prospective'), '[]');
  assert.ok(store.getItem('malariascope-rule-draft:x'));
  assert.equal(store.getItem('unrelated'), 'keep');
  assert.throws(() => validateBackup({ ...b, companions: { unrelated: 'steal' } }), /unsupported/);
});
test('backup restoration rolls back a failed multi-store write', () => {
  const store = new MemoryStorage();
  store.setItem('malariascope-v1', '{"active":"original"}');
  const b = captureBackup({ datasets: [], active: 'replacement' }, store);
  b.companions['malariascope-iot-alerts'] = '{}';
  store.failKey = 'malariascope-iot-alerts';
  assert.throws(() => restoreBackup(b, store), /original workspace restored/);
  assert.equal(store.getItem('malariascope-v1'), '{"active":"original"}');
});
test('nested rule groups have correct precedence, missing values and persistence', () => {
  const rule: Rule = {
    id: 'nested',
    metric: 'cases',
    operator: '>',
    value: 0,
    enabled: true,
    severity: 'HIGH',
    expression: {
      join: 'OR',
      children: [
        {
          join: 'AND',
          children: [
            { metric: 'cases', operator: '>', value: 100 },
            { metric: 'incidence', operator: '>', value: 300 },
          ],
        },
        { metric: 'cases', operator: '>', value: 500 },
      ],
    },
  };
  assert.equal(evaluate([{ district: 'A', year: 2025, cases: 200 }], [rule]).length, 0);
  assert.equal(evaluate([{ district: 'A', year: 2025, cases: 600 }], [rule]).length, 1);
  assert.equal(
    evaluate([{ district: 'A', year: 2025, cases: 200, population: 500 }], [rule]).length,
    1,
  );
});
test('monthly and weekly gaps reset persistence and suppression; duplicate periods fail', () => {
  const rows = ['2025-01', '2025-02', '2025-03', '2025-05', '2025-06'].map((period) => ({
    district: 'A',
    period,
    source: 'fixture',
    metrics: { cases: 200 },
  }));
  const c = { metric: 'cases' as const, operator: '>' as const, value: 100 };
  assert.deepEqual(
    evaluatePeriodic(rows, c, 'monthly', 2, true).map((a) => a.period),
    ['2025-02', '2025-06'],
  );
  assert.throws(() => evaluatePeriodic([...rows, rows[0]], c, 'monthly', 1, true), /Duplicate/);
  assert.throws(() => periodIndex('2025-13', 'monthly'));
  assert.throws(() => periodIndex('2025-01-07', 'weekly'), /Monday/);
});
const artifact: PortableModel = {
  schema: 'malariascope-portable-model-v1',
  model: 'Ridge Regression',
  version: 'fixture',
  datasetHash: 'a'.repeat(64),
  classification: 'SYNTHETIC',
  features: [{ name: 'x', unit: 'cases' }],
  trainingEnd: 2024,
  validationPeriod: '2025',
  mean: [10],
  scale: [2],
  coefficients: [3],
  intercept: 5,
};
test('portable inference applies declared scaling and rejects missing or cyclic parameters', () => {
  assert.equal(predictPortable(artifact, { x: 12 }).prediction, 8);
  assert.throws(() => predictPortable(artifact, {}), /Missing/);
  assert.throws(
    () =>
      validatePortableModel({
        ...artifact,
        coefficients: undefined,
        trees: [{ feature: [0], threshold: [1], left: [0], right: [0], value: [0] }],
        aggregation: 'mean',
        initial: 0,
        learningRate: 1,
      }),
    /cyclic/,
  );
});
test('local permutation significance is deterministic and FDR adjusted; isolates stay missing', () => {
  const input = {
    names: ['A', 'B', 'C', 'D'],
    values: [10, 20, 80, 90],
    neighbors: [[1], [0], [3], []],
  };
  const r = moran(input, 99, 2025);
  assert.deepEqual(r, moran(input, 99, 2025));
  assert.equal(r.local[3].localP, null);
  for (const row of r.local.filter((x) => x.localP !== null)) {
    assert.ok(row.adjustedP! >= row.localP!);
    assert.ok(row.adjustedP! <= 1);
  }
  assert.throws(() => moran({ ...input, neighbors: [[8], [], [], []] }, 99), /Invalid/);
});
test('deep storage guard rejects malformed nested consumers and future schema versions', () => {
  assert.equal(usableWorkspace({ snapshots: [{ name: {} }] }), false);
  assert.equal(usableWorkspace({ audit: [{ time: 'x', event: 'x', details: {} }] }), false);
  assert.equal(usableWorkspace({ __workspaceVersion: 99 }), false);
});
test('resource evidence expires transparently; missing denominator stays a gap', () => {
  const r = validateResources([
    {
      district: 'A',
      year: 2025,
      domain: 'diagnostics',
      status: 'READY',
      source: 'public fixture',
      license: 'fixture',
      reviewedAt: '2025-01-01',
      expiresAt: '2025-02-01',
    },
  ])[0];
  assert.match(resourceFreshness(r, Date.parse('2025-03-01')), /EXPIRED/);
  assert.ok(
    coverageGaps(
      [{ district: 'A', year: 2025, cases: 100 }],
      ['A'],
      2025,
      2025,
    )[0].missing.includes('population'),
  );
});
test('MAE uncertainty resamples district histories reproducibly and requires three districts', () => {
  const pairs = ['A', 'B', 'C'].map((district, i) => ({ district, absoluteError: i + 1 })) as any;
  assert.deepEqual(bootstrapMAE(pairs, 99), bootstrapMAE(pairs, 99));
  assert.equal(bootstrapMAE(pairs.slice(0, 2), 99), null);
});

test('monitoring separates duplicate district forecasts and reviews matched-period feature shifts', () => {
  const base = {
    locked: true,
    outcome: 100,
    persistence_prediction: 100,
    model: 'RF',
    model_version: '1',
    dataset_version: '1',
    dataset_hash: 'a'.repeat(64),
  };
  const records = [
    ...['A', 'B', 'C'].map((district, i) => ({
      ...base,
      district,
      target_period: '2028',
      prediction: 110,
      features: { rainfall: i + 1 },
    })),
    ...['A', 'B', 'C'].map((district, i) => ({
      ...base,
      district,
      target_period: '2029',
      prediction: 120,
      features: { rainfall: i + 11 },
    })),
  ] as ProspectiveRecord[];
  const m = monitorProspective(records);
  assert.equal(m.drift[0].maeChange, 10);
  assert.equal(m.drift[0].features[0].standardizedMeanShift, 10);
  const duplicated = monitorProspective([...records, records[0]]);
  assert.ok(duplicated.groups[0].duplicateDistricts.includes('A'));
  assert.equal(duplicated.groups[0].model?.n, 2);
});

test('complete backup rejects archived reports lacking renderable evidence structure', () => {
  const storage = new MemoryStorage();
  storage.setItem(
    'malariascope-report-archive',
    JSON.stringify([
      { id: 'x', saved: '2026-10-10', report: { metadata: { title: 'Broken archive' } } },
    ]),
  );
  const backup = captureBackup({ datasets: [], active: '' }, storage);
  assert.throws(() => validateBackup(backup), /Invalid report archive/);
});

test('prospective interval coverage excludes missing bounds and keeps signed residuals', () => {
  const base = {
    locked: true,
    outcome: 100,
    persistence_prediction: 100,
    model: 'RF',
    model_version: '1',
    target_period: '2028',
    dataset_version: '1',
    dataset_hash: 'a'.repeat(64),
  };
  const records = [
    { ...base, district: 'A', prediction: 110, predictionInterval: [90, 120] },
    { ...base, district: 'B', prediction: 80, predictionInterval: [50, 90] },
    { ...base, district: 'C', prediction: 100 },
  ] as ProspectiveRecord[];
  const metrics = monitorProspective(records).groups[0].model!;
  assert.deepEqual(metrics.intervalReview, { n: 2, coverage: 0.5, meanWidth: 35 });
  assert.deepEqual(metrics.residualDistribution, { minimum: -20, median: 0, maximum: 10 });
});
