import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildWatchSummary,
  watchEvidence,
  watchNumber,
  watchTimestamp,
} from './watch/watch-selectors.ts';
import { evaluate } from './analytics.ts';
import { readinessChecklistKey, buildReadinessMatrix } from './readiness-engine.ts';
import { calculateRisk, riskConfiguration } from './risk-engine.ts';
import { includeSuppliedIncidence } from './district-intelligence.ts';
import type { State } from './store.tsx';
const fixture = (): State => ({
  datasets: [
    {
      id: 'watch',
      name: 'Isolated watch fixture',
      source: 'Synthetic tests only',
      checksum: 'fixture',
      classification: 'USER IMPORT',
      created: '2026-10-08T00:00:00Z',
      rows: [2022, 2023, 2024, 2025].flatMap((year) =>
        ['A', 'B'].map((district, i) => ({
          district,
          district_code: String(i + 1),
          year,
          cases: district === 'A' ? (year === 2025 ? 400 : 200) : 50,
          population: 1000,
          prediction: 450,
          rainfall: year - 2000,
          temperature: year - 2001,
          model: 'Random Forest',
        })),
      ),
    },
  ],
  active: 'watch',
  rules: [
    {
      id: 'burden',
      enabled: true,
      severity: 'HIGH',
      metric: 'incidence',
      operator: '>',
      value: 300,
    },
  ],
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
const summary = (state = fixture(), district = 'A', year = 2025, model = 'Random Forest') =>
  buildWatchSummary({
    state,
    district,
    year,
    model,
    alerts: evaluate(
      state.datasets.find((d) => d.id === state.active)?.rows ?? [],
      state.rules,
      state.active,
    ),
    loadedAt: '2026-10-08T01:00:00Z',
  });
test('watch adapters reuse exact risk/readiness engines and adjacent-year surveillance', () => {
  const s = fixture(),
    w = summary(s);
  const record = watchEvidence(s, 'Random Forest').records.find(
    (r) => r.district === 'A' && r.year === 2025,
  )!;
  assert.equal(
    w.risk.category,
    calculateRisk(record, 'OBSERVED RISK', riskConfiguration(null)).category,
  );
  assert.equal(w.risk.incidence, 400);
  assert.equal(w.risk.cases, 400);
  assert.equal(w.risk.change, 100);
  assert.equal(w.risk.trend, 'Increasing');
  assert.equal(w.forecast.prediction, 450);
  assert.ok(w.climate.rainfall !== null);
  assert.equal(w.sync.malaria, 'Synced');
  assert.equal(w.provenance.status, 'Not independently verified');
  const matrix = buildReadinessMatrix({
    datasets: s.datasets,
    active: s.active,
    year: 2025,
    model: 'Random Forest',
    checklists: {},
    thresholds: s.thresholds,
  });
  const diag = matrix.districts
    .find((d) => d.district === 'A')!
    .cells.find((c) => c.domain === 'diagnostics')!;
  assert.equal(
    w.readiness.find((r) => r.domain === 'diagnostics')?.status,
    diag.state === 'ATTENTION' ? 'Attention' : 'No Data',
  );
});
test('watch alert counts respect district, year and existing review status', () => {
  const s = fixture(),
    first = summary(s);
  assert.equal(first.alerts.newCount, 1);
  assert.equal(first.alerts.activeCount, 1);
  assert.equal(first.alerts.highestSeverity, 'HIGH');
  const id = first.alerts.items[0].id;
  s.alertStates[id] = { status: 'ACKNOWLEDGED', note: 'Private user note' };
  const next = summary(s);
  assert.equal(next.alerts.newCount, 0);
  assert.equal(next.alerts.activeCount, 0);
  assert.equal(next.alerts.latest, null);
  assert.equal(summary(s, 'B').alerts.newCount, 0);
  assert.equal(summary(s, 'A', 2024).alerts.newCount, 0);
  assert.equal(first.alerts.items[0].timestamp, null);
});
test('unknown periods, missing predictors, gaps and ambiguous identities remain unavailable', () => {
  const s = fixture(),
    future = summary(s, 'A', 2026);
  assert.equal(future.risk.cases, null);
  assert.equal(future.risk.category, 'INSUFFICIENT DATA');
  assert.equal(future.sync.lastUpdate, null);
  assert.equal(future.alerts.newCount, null);
  assert.equal(summary(s, 'A', 2025, 'Persistence').forecast.prediction, null);
  s.datasets[0].rows = s.datasets[0].rows.filter((r) => r.year !== 2024);
  assert.equal(summary(s).risk.change, null);
  assert.equal(summary(s).risk.trend, 'No Data');
  s.datasets[0].rows.push({ district: 'A', district_code: 'other', year: 2025, cases: 10 });
  assert.equal(summary(s).risk.score, null);
  assert.equal(summary(s).identityIssues, true);
});
test('supplied incidence is dated and unverified, never expanded into district counts or alerts', () => {
  const s = fixture();
  s.datasets = [];
  s.active = '';
  const study = {
    incidence: {
      district: 'Supplied District',
      year: 2025,
      value: 684.74,
      unit: 'per 1,000 population',
    },
  };
  const w = buildWatchSummary({
    state: s,
    year: 2025,
    district: 'Supplied District',
    model: 'Persistence',
    study,
    alerts: [],
    loadedAt: '2026-10-08T01:00:00Z',
  });
  const record = includeSuppliedIncidence([], study, 'Persistence')[0];
  assert.equal(w.risk.score, calculateRisk(record, 'OBSERVED RISK', riskConfiguration(null)).score);
  assert.equal(w.risk.cases, null);
  assert.equal(w.alerts.newCount, null);
  assert.equal(w.provenance.status, 'Not independently verified');
  assert.equal(w.forecast.prediction, null);
  assert.equal(
    buildWatchSummary({
      state: s,
      year: 2024,
      district: 'Supplied District',
      model: 'Persistence',
      study,
      alerts: [],
      loadedAt: null,
    }).risk.score,
    null,
  );
  assert.equal(
    watchEvidence(fixture(), 'Random Forest', study).records.some(
      (r) => r.district === 'Supplied District',
    ),
    false,
  );
});
test('compact watch projection never serializes individual fields, geometry, notes or descriptions', () => {
  const s = fixture();
  Object.assign(s.datasets[0].rows[0], {
    soldier_identity: 'SENSITIVE-ID',
    troop_location: 'SENSITIVE-LOCATION',
    operational_route: 'SENSITIVE-ROUTE',
    clinical_record: 'SENSITIVE-PATIENT',
  });
  s.rules[0].description = 'SENSITIVE-DESCRIPTION';
  s.readinessMetadata = {
    [readinessChecklistKey('A', 2025)]: {
      'Diagnostic capability documented': {
        status: 'AVAILABLE',
        note: 'SENSITIVE-NOTE',
        updatedAt: '2026-10-08',
      },
    },
  };
  const text = JSON.stringify(summary(s));
  assert.doesNotMatch(text, /SENSITIVE/);
  assert.doesNotMatch(text, /geometry|coordinates|sourceRows|checksum/);
});
test('risk modes, experimental configuration, source labels and timestamps stay explicit', () => {
  const s = fixture();
  s.riskMode = 'MODEL-ASSISTED RISK';
  assert.equal(summary(s).risk.score, 450);
  s.riskMode = 'SPATIAL RISK';
  assert.equal(summary(s).risk.score, null);
  s.riskMode = 'COMPOSITE RESEARCH RISK';
  s.riskScenario = { active: true, weights: { observed: 1, predicted: 0, neighbor: 0 } };
  assert.equal(summary(s).risk.score, 400);
  assert.equal(summary(s).risk.experimental, true);
  s.datasets[0].classification = 'VERIFIED';
  assert.equal(summary(s).provenance.status, 'Source-labeled VERIFIED');
  assert.equal(watchNumber(null), '—');
  assert.equal(watchNumber(NaN), '—');
  assert.equal(watchTimestamp('invalid'), '—');
  assert.match(watchTimestamp('2026-10-08T01:00:00Z'), /08:00:00 ICT/);
});

test('invalid negative counts and model outputs cannot become watch values or ready sync', () => {
  const s = fixture();
  s.datasets[0].rows = [
    {
      district: 'A',
      year: 2025,
      cases: -10,
      population: 1000,
      prediction: -50,
      model: 'Random Forest',
    },
  ];
  const w = summary(s);
  assert.equal(w.risk.cases, null);
  assert.equal(w.risk.incidence, null);
  assert.equal(w.risk.change, null);
  assert.equal(w.forecast.prediction, null);
  assert.equal(w.sync.malaria, 'Not Connected');
  assert.equal(w.sync.risk, 'Not Connected');
  assert.equal(w.sync.lastUpdate, null);
});
test('readiness projection preserves the existing six domain states and selector input immutability', () => {
  const s = fixture();
  s.districtChecklists = {
    [readinessChecklistKey('A', 2025)]: {
      'Diagnostic capability documented': 'AVAILABLE',
      'Testing availability reviewed': 'AVAILABLE',
    },
  };
  const before = JSON.stringify(s),
    w = summary(s),
    matrix = buildReadinessMatrix({
      datasets: s.datasets,
      active: s.active,
      year: 2025,
      model: 'Random Forest',
      checklists: s.districtChecklists,
      thresholds: s.thresholds,
    });
  const cells = matrix.districts.find((d) => d.district === 'A')!.cells;
  for (const projected of w.readiness) {
    const cell = cells.find((c) => c.domain === projected.domain)!;
    assert.equal(
      projected.status,
      cell.state === 'READY'
        ? 'Ready'
        : cell.state === 'REVIEW'
          ? 'Review'
          : cell.state === 'ATTENTION'
            ? 'Attention'
            : 'No Data',
    );
  }
  assert.equal(JSON.stringify(s), before);
});
test('spatial risk provenance includes neighboring inputs and geometry status', () => {
  const s = fixture();
  s.datasets[0].rows = s.datasets[0].rows.filter((r) => r.district === 'A');
  s.datasets[0].classification = 'VERIFIED';
  s.datasets.push({
    ...s.datasets[0],
    id: 'neighbor',
    classification: 'USER IMPORT',
    rows: [{ district: 'B', district_code: '2', year: 2025, cases: 50, population: 1000 }],
  });
  s.geometry = {
    type: 'FeatureCollection',
    features: ['A', 'B'].map((district, i) => ({
      type: 'Feature',
      properties: { district, district_code: String(i + 1) },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [137 + i, -4],
            [138 + i, -4],
            [138 + i, -3],
            [137 + i, -3],
            [137 + i, -4],
          ],
        ],
      },
    })),
  };
  s.riskMode = 'SPATIAL RISK';
  const w = summary(s);
  assert.equal(w.risk.score, 50);
  assert.equal(w.provenance.status, 'Not independently verified');
  assert.equal(w.provenance.sourceCount, 2);
});
