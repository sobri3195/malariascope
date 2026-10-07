import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateRisk,
  riskConfiguration,
  defaultResearchModel,
  validRiskWeights,
  readRiskScenario,
  canEditRiskScenario,
  riskEvidence,
  recordIdentity,
} from './risk-engine.ts';
import { spatialRiskInputs } from './risk-spatial.ts';
import type { EvidenceDataset, Record360 } from './district-intelligence.ts';
const datasets: EvidenceDataset[] = [
  {
    id: 'obs',
    name: 'Isolated risk observations',
    source: 'Automated fixture',
    created: '2026-01-01',
    classification: 'VERIFIED',
    checksum: 'observation-sha',
    rows: [50, 300, 600].map((cases, i) => ({
      district: ['A', 'B', 'C'][i],
      district_code: String(i + 1),
      year: 2025,
      cases,
      population: 1000,
    })),
  },
  {
    id: 'model',
    name: 'Isolated model outputs',
    source: 'Automated fixture',
    created: '2026-01-01',
    classification: 'USER IMPORT',
    checksum: 'prediction-sha',
    rows: [150, 500, 800].map((prediction, i) => ({
      district: ['A', 'B', 'C'][i],
      district_code: String(i + 1),
      year: 2025,
      cases: [50, 300, 600][i],
      population: 1000,
      prediction,
      model: 'Random Forest',
    })),
  },
];
const evidence = riskEvidence(datasets, 'obs', 'Random Forest', 2025),
  base = riskConfiguration(null);
const geometry = {
  type: 'FeatureCollection',
  features: ['A', 'B', 'C'].map((district, i) => ({
    type: 'Feature',
    properties: { district, district_code: String(i + 1) },
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [138 + i, -4],
          [139 + i, -4],
          [139 + i, -3],
          [138 + i, -3],
          [138 + i, -4],
        ],
      ],
    },
  })),
};
const spatial = spatialRiskInputs(geometry, evidence.records);
const calculate = (
  record: Record360,
  mode: 'OBSERVED RISK' | 'SPATIAL RISK' | 'MODEL-ASSISTED RISK' | 'COMPOSITE RESEARCH RISK',
  configuration = base,
) => calculateRisk(record, mode, configuration, spatial[recordIdentity(record)]);
test('four risk modes use distinct explicit formulas and exact additive contributions', () => {
  const a = evidence.records[0],
    b = evidence.records[1];
  assert.equal(calculate(a, 'OBSERVED RISK').score, 50);
  assert.equal(calculate(a, 'OBSERVED RISK').category, 'LOW');
  assert.equal(calculate(a, 'MODEL-ASSISTED RISK').score, 150);
  assert.equal(calculate(a, 'MODEL-ASSISTED RISK').category, 'MODERATE');
  assert.equal(calculate(a, 'SPATIAL RISK').score, 300);
  assert.equal(calculate(a, 'SPATIAL RISK').category, 'HIGH');
  assert.equal(calculate(b, 'SPATIAL RISK').score, 325);
  const composite = calculate(a, 'COMPOSITE RESEARCH RISK');
  assert.equal(composite.score, 100);
  assert.equal(composite.category, 'MODERATE');
  assert.deepEqual(
    composite.components.map((c) => c.normalizedWeight),
    [0.5, 0.5, 0],
  );
  assert.deepEqual(
    composite.components.map((c) => c.contribution),
    [25, 75, 0],
  );
  assert.equal(
    composite.components.reduce((sum, c) => sum + c.contribution!, 0),
    composite.score,
  );
});
test('risk categories respect exact thresholds including zero and very high boundary', () => {
  for (const [cases, category] of [
    [0, 'LOW'],
    [99.999, 'LOW'],
    [100, 'MODERATE'],
    [299.999, 'MODERATE'],
    [300, 'HIGH'],
    [499.999, 'HIGH'],
    [500, 'VERY HIGH'],
  ] as const) {
    const record = { ...evidence.records[0], values: { ...evidence.records[0].values, cases } };
    assert.equal(calculate(record, 'OBSERVED RISK').category, category);
  }
});
test('scenario edits and reset configurations cannot mutate frozen defaults or source inputs', () => {
  const before = JSON.stringify({ datasets, defaultResearchModel });
  const scenario = { active: true, weights: { observed: 1, predicted: 3, neighbor: 0 } };
  const experimental = riskConfiguration(scenario);
  assert.equal(calculate(evidence.records[0], 'COMPOSITE RESEARCH RISK', experimental).score, 125);
  assert.equal(calculate(evidence.records[0], 'OBSERVED RISK', experimental).score, 50);
  experimental.weights.observed = 99;
  experimental.thresholds[0] = 999;
  assert.deepEqual(defaultResearchModel.weights, { observed: 1, predicted: 1, neighbor: 0 });
  assert.deepEqual(defaultResearchModel.thresholds, [100, 300, 500]);
  assert.equal(JSON.stringify({ datasets, defaultResearchModel }), before);
  const restored = riskConfiguration({ ...scenario, active: false });
  assert.equal(restored.experimental, false);
  assert.equal(calculate(evidence.records[0], 'COMPOSITE RESEARCH RISK', restored).score, 100);
  assert.equal(Object.isFrozen(defaultResearchModel.weights), true);
  assert.equal(Object.isFrozen(defaultResearchModel.thresholds), true);
});
test('invalid or unauthorized scenarios cannot become editable configurations', () => {
  for (const weights of [
    { observed: 0, predicted: 0, neighbor: 0 },
    { observed: -1, predicted: 1, neighbor: 0 },
    { observed: Infinity, predicted: 1, neighbor: 0 },
    { observed: 101, predicted: 1, neighbor: 0 },
    { observed: '1', predicted: 1, neighbor: 0 },
    {},
  ])
    assert.equal(validRiskWeights(weights), false);
  assert.equal(readRiskScenario({ active: true, weights: {} }), null);
  assert.equal(readRiskScenario({ active: 'true', weights: defaultResearchModel.weights }), null);
  for (const profile of ['VIEWER', 'DEMO MODE', 'ADMIN', ''])
    assert.equal(canEditRiskScenario(profile), false);
  for (const profile of ['RESEARCHER', 'ANALYST']) assert.equal(canEditRiskScenario(profile), true);
  const read = readRiskScenario({
    active: true,
    weights: { observed: 1, predicted: 1, neighbor: 0 },
  })!;
  read.weights.observed = 9;
  assert.equal(defaultResearchModel.weights.observed, 1);
});
test('missing positive-weight inputs never silently reweight or classify absent observations', () => {
  const missing = {
    ...evidence.records[0],
    values: { ...evidence.records[0].values, prediction: null },
  };
  assert.equal(calculate(missing, 'COMPOSITE RESEARCH RISK').category, 'INSUFFICIENT DATA');
  assert.equal(calculate(missing, 'OBSERVED RISK').score, 50);
  assert.equal(calculateRisk(evidence.records[0], 'SPATIAL RISK', base).score, null);
  const zeroNeighbor = riskConfiguration({
    active: true,
    weights: { observed: 1, predicted: 0, neighbor: 0 },
  });
  assert.equal(calculateRisk(missing, 'COMPOSITE RESEARCH RISK', zeroNeighbor).score, 50);
  const missingYear = riskEvidence(datasets, 'obs', 'Random Forest', 2024);
  assert.equal(missingYear.records.length, 3);
  assert.ok(
    missingYear.records.every(
      (record) => calculateRisk(record, 'OBSERVED RISK', base).category === 'INSUFFICIENT DATA',
    ),
  );
  const otherModel = riskEvidence(datasets, 'obs', 'Persistence', 2025);
  assert.ok(
    otherModel.records.every(
      (record) => calculateRisk(record, 'MODEL-ASSISTED RISK', base).score === null,
    ),
  );
});
test('complete queen neighbors are required and ambiguous geometry never duplicates district evidence', () => {
  assert.deepEqual(
    spatial[recordIdentity(evidence.records[1])].neighbors.map((n) => n.district),
    ['A', 'C'],
  );
  const gap = evidence.records.map((record) =>
    record.district === 'C'
      ? { ...record, values: { ...record.values, population: null } }
      : record,
  );
  assert.equal(spatialRiskInputs(geometry, gap)[recordIdentity(evidence.records[1])].value, null);
  const mismatch = structuredClone(geometry);
  mismatch.features[0].properties.district_code = '99';
  assert.equal(
    spatialRiskInputs(mismatch, evidence.records)[recordIdentity(evidence.records[0])].value,
    null,
  );
  const duplicate = structuredClone(geometry);
  duplicate.features.push(structuredClone(duplicate.features[0]));
  assert.ok(
    Object.values(spatialRiskInputs(duplicate, evidence.records)).every(
      (input) => input.value === null,
    ),
  );
  const alias = structuredClone(geometry);
  alias.features[0].properties.district = 'Alias A';
  assert.equal(
    spatialRiskInputs(alias, evidence.records)[recordIdentity(evidence.records[0])].value,
    300,
  );
});
test('formula and input verification are distinct and all contributing references retain source year and checksum', () => {
  const observed = calculate(evidence.records[0], 'OBSERVED RISK'),
    composite = calculate(evidence.records[0], 'COMPOSITE RESEARCH RISK'),
    neighbor = calculate(evidence.records[0], 'SPATIAL RISK');
  assert.match(observed.dataVerification, /All contributing tabular inputs labeled VERIFIED/);
  assert.match(observed.configuration.verification, /No independent formula verification/);
  assert.match(composite.dataVerification, /not all labeled VERIFIED/);
  assert.deepEqual(
    new Set(composite.references.map((ref) => ref.checksum)),
    new Set(['observation-sha', 'prediction-sha']),
  );
  assert.ok(neighbor.references.every((ref) => ref.district === 'B' && ref.year === 2025));
  assert.equal(neighbor.usesGeometry, true);
});
test('conflicting sources with no active resolution withhold required risk variables', () => {
  const conflict = {
    ...datasets[1],
    id: 'conflict',
    rows: datasets[1].rows.map((row) => ({ ...row, prediction: row.prediction! + 20 })),
  };
  const records = riskEvidence([...datasets, conflict], 'obs', 'Random Forest', 2025).records;
  assert.equal(calculate(records[0], 'MODEL-ASSISTED RISK').score, null);
  assert.match(records[0].issues.join(' '), /conflicting sources/);
  assert.equal(calculate(records[0], 'OBSERVED RISK').score, 50);
});
test('supplied incidence can support observed classification without inventing missing counts', () => {
  const record = {
    ...evidence.records[0],
    values: { ...evidence.records[0].values, cases: null, population: null, incidence: 350 },
  };
  const result = calculate(record, 'OBSERVED RISK');
  assert.equal(result.score, 350);
  assert.equal(result.category, 'HIGH');
  assert.match(result.formula, /source-supplied incidence/);
  const invalid = { ...record, values: { ...record.values, cases: 1, population: 0 } };
  assert.equal(calculate(invalid, 'OBSERVED RISK').score, null);
});
