import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateEvidence,
  buildDistrict360,
  readinessStatus,
  type EvidenceDataset,
} from './district-intelligence.ts';
const dataset = (
  id: string,
  rows: EvidenceDataset['rows'],
  classification?: EvidenceDataset['classification'],
): EvidenceDataset => ({
  id,
  name: id,
  rows,
  classification,
  source: 'Isolated test fixture, not scientific evidence',
  created: '2026-10-07',
  checksum: id,
});
const base = dataset('base', [
  { district: 'A', year: 2021, cases: 100, population: 1000, rainfall: 100, temperature: 20 },
  { district: 'A', year: 2022, cases: 200, population: 1000, rainfall: 200, temperature: 21 },
  { district: 'A', year: 2023, cases: 300, population: 1000, rainfall: 300, temperature: 22 },
  {
    district: 'A',
    year: 2024,
    cases: 500,
    population: 1000,
    rainfall: 400,
    temperature: 25,
    prediction: 550,
    model: 'Random Forest',
  },
  { district: 'A', year: 2025, cases: 9999, population: 1000, rainfall: 9999, temperature: 99 },
  ...['B', 'C', 'D', 'E'].map((district, i) => ({
    district,
    year: 2024,
    cases: (i + 1) * 100,
    population: 1000,
  })),
]);
function data(datasets = [base], year = 2024) {
  const joined = aggregateEvidence(datasets, 'base', 'Random Forest');
  return buildDistrict360(joined.records, 'A', year, [100, 300, 500], [], {});
}
test('360 aggregates cross-dataset fields without double counting observed burden', () => {
  const primary = dataset('primary', [{ district: 'A', year: 2024, cases: 100 }]),
    climate = dataset('climate', [
      {
        district: 'a.',
        year: 2024,
        cases: 100,
        population: 1000,
        rainfall: 200,
        temperature: 24,
        prediction: 90,
        model: 'Random Forest',
      },
    ]);
  const joined = aggregateEvidence([primary, climate], 'primary', 'Random Forest');
  assert.equal(joined.records.length, 1);
  assert.equal(joined.records[0].values.cases, 100);
  assert.equal(joined.records[0].values.rainfall, 200);
  assert.equal(joined.records[0].values.prediction, 90);
  assert.ok(joined.records[0].references.every((r) => r.classification === 'USER IMPORT'));
  assert.equal(
    aggregateEvidence([primary, climate], 'primary', 'Persistence').records[0].values.prediction,
    null,
  );
});
test('conflicting inputs are exposed and only explicit active-source precedence resolves them', () => {
  const x = dataset('x', [{ district: 'A', year: 2024, cases: 100, rainfall: 10 }]),
    y = dataset('y', [{ district: 'A', year: 2024, cases: 200, rainfall: 20 }]);
  const unresolved = aggregateEvidence([x, y], '', 'Persistence').records[0];
  assert.equal(unresolved.values.cases, null);
  assert.equal(unresolved.values.rainfall, null);
  assert.equal(unresolved.issues.length, 2);
  const selected = aggregateEvidence([x, y], 'x', 'Persistence').records[0];
  assert.equal(selected.values.cases, 100);
  assert.equal(
    selected.references.filter((r) => r.field === 'cases' && r.selected)[0].datasetId,
    'x',
  );
});
test('verified-only scope never promotes user imports to verified evidence', () => {
  const imported = dataset('import', [{ district: 'A', year: 2024, cases: 100 }]),
    verified = dataset('verified', [{ district: 'A', year: 2024, cases: 200 }], 'VERIFIED');
  const joined = aggregateEvidence([imported, verified], 'import', 'Persistence', true);
  assert.equal(joined.datasets.length, 1);
  assert.equal(joined.records[0].values.cases, 200);
  assert.ok(joined.records[0].references.every((r) => r.classification === 'VERIFIED'));
});
test('incidence, ranking, midrank percentile, errors, anomalies and trend use selected-year data', () => {
  const d = data();
  assert.equal(d.incidence, 500);
  assert.equal(d.rank, 1);
  assert.equal(d.burdenRank, 1);
  assert.equal(d.percentile, 90);
  assert.equal(d.papuaMedian.incidence, 300);
  assert.equal(d.riskLevel, 'VERY HIGH');
  assert.equal(d.residual, 50);
  assert.equal(d.absoluteError, 50);
  assert.equal(d.sequence, 3);
  assert.equal(d.historicalBurden, 1100);
  assert.equal(d.rolling, 1000 / 3);
  assert.equal(d.rainfallAnomaly.value, 2);
  assert.equal(d.temperatureAnomaly.value, 4);
  assert.equal(d.latestClimateYear, 2025);
  assert.equal(d.latestSurveillanceYear, 2025);
  assert.equal(d.completeness, (5 / 6) * 100);
  assert.ok(Math.abs(d.yoy! - 200 / 3) < 1e-9);
});
test('explanation rules are deterministic and do not elevate a low category from relative rank', () => {
  const d = data();
  assert.deepEqual(d.reasons, data().reasons);
  assert.ok(d.reasons.some((r) => r.kind === 'percentile'));
  assert.ok(d.reasons.some((r) => r.kind === 'trend'));
  const low = buildDistrict360(
    aggregateEvidence([base], 'base', 'Random Forest').records,
    'E',
    2024,
    [500, 700, 900],
    [],
    {},
  );
  assert.equal(low.riskLevel, 'LOW');
  assert.ok(low.explanation.includes('does not meet'));
});
test('missing periods block adjacent change and rolling averages without making up observations', () => {
  const gap = dataset('base', [
    { district: 'A', year: 2021, cases: 0, population: 1000 },
    { district: 'A', year: 2023, cases: 100 },
  ]);
  const d = data([gap], 2023);
  assert.equal(d.yoy, null);
  assert.equal(d.rolling, null);
  assert.equal(d.incidence, null);
  assert.equal(d.riskLevel, 'INSUFFICIENT DATA');
  assert.equal(d.rainfallAnomaly.value, null);
  assert.deepEqual(d.gaps, [2022]);
  assert.equal(d.temporalCompleteness, (2 / 3) * 100);
  assert.equal(d.history.length, 2);
});
test('district codes merge documented aliases but ambiguous codes require manual confirmation', () => {
  const a = dataset('base', [{ district: 'A', district_code: '01', year: 2023, cases: 100 }]),
    b = dataset('other', [{ district: 'Old A', district_code: '01', year: 2024, cases: 200 }]);
  const joined = aggregateEvidence([a, b], 'base', 'Persistence');
  assert.ok(joined.records.every((r) => r.district === 'A'));
  assert.equal(
    buildDistrict360(joined.records, 'Old A', 2024, [100, 300, 500], [], {}).history.length,
    2,
  );
  const ambiguous = aggregateEvidence(
    [a, dataset('other', [{ district: 'A', district_code: '02', year: 2024, cases: 200 }])],
    'base',
    'Persistence',
  );
  assert.equal(ambiguous.records.length, 0);
  assert.ok(ambiguous.identityIssues.length);
});
test('district alerts respect resolved status and include full merged annual history', () => {
  const rules = [
    {
      id: 'increase',
      metric: 'change' as const,
      operator: '>' as const,
      value: 50,
      enabled: true,
      severity: 'WATCH',
    },
  ];
  const joined = aggregateEvidence([base], 'base', 'Random Forest');
  const d = buildDistrict360(joined.records, 'A', 2024, [100, 300, 500], rules, {});
  assert.equal(d.signals.length, 1);
  assert.equal(
    buildDistrict360(joined.records, 'A', 2024, [100, 300, 500], rules, {
      [d.signals[0].id]: { status: 'RESOLVED', note: '' },
    }).signals.length,
    0,
  );
});
test('readiness stays district-specific and is never inferred ready from high incidence', () => {
  assert.equal(
    readinessStatus('Staffing preparedness', ['Staffing capacity reviewed'], {}, 'VERY HIGH'),
    'INSUFFICIENT DATA',
  );
  assert.equal(
    readinessStatus('Diagnostic-resource review', ['Testing availability reviewed'], {}, 'HIGH'),
    'ATTENTION',
  );
  assert.equal(
    readinessStatus(
      'Staffing preparedness',
      ['Staffing capacity reviewed'],
      { 'Staffing capacity reviewed': 'AVAILABLE' },
      'HIGH',
    ),
    'READY',
  );
});

import { includeSuppliedIncidence } from './district-intelligence.ts';
test('supplied incidence evidence is available without inventing underlying counts or promoting verification', () => {
  const summary = {
    source: 'Isolated test evidence',
    incidence: { district: 'A', year: 2024, value: 600, unit: 'per 1,000 population' },
  };
  const records = includeSuppliedIncidence([], summary, 'Persistence');
  const d = buildDistrict360(records, 'A', 2024, [100, 300, 500], [], {});
  assert.equal(d.incidence, 600);
  assert.equal(d.current?.values.cases, null);
  assert.equal(d.current?.values.population, null);
  assert.equal(d.riskLevel, 'VERY HIGH');
  assert.equal(d.historicalBurden, null);
  assert.equal(d.completeness, 0);
  assert.ok(d.reasons[0].finding.includes('Supplied'));
  assert.equal(includeSuppliedIncidence([], summary, 'Persistence', true).length, 0);
});

test('supplied ratio alerts can trigger independently while missing cases never trigger burden rules', () => {
  const records = includeSuppliedIncidence(
    [],
    {
      source: 'Isolated test fact',
      incidence: { district: 'A', year: 2024, value: 600, unit: 'per 1,000 population' },
    },
    'Persistence',
  );
  const rule = {
    id: 'incidence',
    metric: 'incidence' as const,
    operator: '>' as const,
    value: 500,
    enabled: true,
    severity: 'HIGH',
  };
  const d = buildDistrict360(
    records,
    'A',
    2024,
    [100, 300, 500],
    [rule, { ...rule, id: 'burden', metric: 'cases', value: 1 }],
    {},
  );
  assert.equal(d.signals.length, 1);
  assert.equal(d.signals[0].metric, 'incidence');
  assert.equal(d.current?.values.cases, null);
});
