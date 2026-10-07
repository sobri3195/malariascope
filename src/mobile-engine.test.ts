import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mobileEvidence,
  districtMobileMetrics,
  mobileDistrictRisk,
  sourceStatus,
} from './mobile/mobile-engine.ts';
import type { State } from './store.tsx';
const make = (rows: State['datasets'][number]['rows']): State => ({
  datasets: [
    {
      id: 'test',
      name: 'Mobile isolated fixture',
      source: 'Automated test only',
      checksum: 'test',
      created: '2026-10-08',
      classification: 'USER IMPORT',
      rows,
    },
  ],
  active: 'test',
  rules: [],
  alertStates: {},
  checklist: {},
  thresholds: [100, 300, 500],
  snapshots: [],
  audit: [],
  profile: 'RESEARCHER',
  geometry: null,
  layer: 'cases',
  reduced: true,
});
const rows = [2022, 2023, 2024, 2025].map((year) => ({
  district: 'A',
  year,
  cases: year === 2025 ? 400 : 200,
  population: 1000,
  rainfall: year - 2020,
  temperature: year - 2000,
  prediction: 450,
  model: 'Random Forest',
}));
test('mobile evidence preserves selected period, model, formula and source classification', () => {
  const evidence = mobileEvidence(make(rows), 2025, 'Random Forest');
  const m = districtMobileMetrics(evidence.history, 'a.', 2025);
  assert.equal(m.cases, 400);
  assert.equal(m.change, 100);
  assert.equal(m.incidenceChange, 100);
  assert.equal(m.predicted, 450);
  assert.equal(m.residual, 50);
  assert.equal(m.absoluteError, 50);
  assert.ok(Math.abs(m.completeness! - (100 * 5) / 6) < 1e-10);
  assert.ok(m.rainfall.value !== null);
  assert.equal(mobileDistrictRisk(evidence.risks, 'A')?.category, 'HIGH');
  assert.ok(
    mobileDistrictRisk(evidence.risks, 'A')?.references.every(
      (r) => r.classification === 'USER IMPORT',
    ),
  );
  assert.equal(
    districtMobileMetrics(mobileEvidence(make(rows), 2025, 'Persistence').history, 'A', 2025)
      .predicted,
    null,
  );
  assert.equal(mobileEvidence(make(rows), 2024, 'Random Forest').history.length, 3);
});
test('missing years, zero baseline and disconnected fields never fabricate mobile values', () => {
  const state = make([
      { district: 'A', year: 2023, cases: 0 },
      { district: 'A', year: 2025, cases: 400 },
    ]),
    e = mobileEvidence(state, 2025, 'Persistence'),
    m = districtMobileMetrics(e.history, 'A', 2025);
  assert.equal(m.change, null);
  assert.equal(m.incidence, null);
  assert.equal(m.rainfall.value, null);
  assert.equal(m.predicted, null);
  assert.equal(mobileDistrictRisk(e.risks, 'A')?.score, null);
  const gap = districtMobileMetrics(mobileEvidence(state, 2024, 'Persistence').history, 'A', 2024);
  assert.equal(gap.current, undefined);
  assert.equal(gap.cases, null);
  assert.equal(sourceStatus(e.records, ['rainfall', 'temperature'], false), 'Not Connected');
  assert.equal(sourceStatus(e.records, ['cases'], true), 'Cached');
});
test('mobile district selection rejects ambiguous district-name identities', () => {
  const s = make([
      { district: 'A', district_code: '1', year: 2025, cases: 400, population: 1000 },
      { district: 'A', district_code: '2', year: 2025, cases: 10, population: 1000 },
    ]),
    e = mobileEvidence(s, 2025, 'Persistence'),
    m = districtMobileMetrics(e.history, 'A', 2025);
  assert.ok(e.identityIssues.some((issue) => issue.includes('ambiguous district codes')));
  assert.equal(m.current, undefined);
  assert.equal(mobileDistrictRisk(e.risks, 'A'), undefined);
});
test('mobile aggregation joins sources without duplicating counts and distinguishes partial connections', () => {
  const s = make(rows);
  s.datasets.push({
    ...s.datasets[0],
    id: 'other',
    rows: [{ district: 'A', year: 2025, cases: 400, humidity: 80 }],
  });
  const e = mobileEvidence(s, 2025, 'Random Forest');
  assert.equal(e.records.length, 1);
  assert.equal(e.records[0].values.cases, 400);
  assert.equal(e.records[0].values.humidity, 80);
  assert.equal(sourceStatus(e.records, ['cases'], false), 'Connected');
  const partial = mobileEvidence(
    make([{ district: 'A', year: 2025, cases: 400, rainfall: 100 }]),
    2025,
    'Persistence',
  );
  assert.equal(sourceStatus(partial.records, ['rainfall', 'temperature'], false), 'Partial');
});
