import test from 'node:test';
import assert from 'node:assert/strict';
import {
  captureBaseline,
  simulate,
  sensitivity,
  category,
  scenarioExport,
  validSavedScenario,
  SCENARIO_LABEL,
  type Inputs,
  type Baseline,
} from './scenario-engine.ts';
const inputs: Inputs = {
  burden: 100,
  population: 1000,
  annualChange: 20,
  rainfall: 0,
  temperature: 0,
  model: 'Persistence',
  thresholds: [100, 300, 500],
};
const baseline: Baseline = {
  district: 'A',
  year: 2025,
  captured: '2026-01-01',
  inputs: { ...inputs, annualChange: 0 },
  references: [],
  issues: [],
  verification: 'UNVERIFIED',
};
test('one-period arithmetic and distinct persistence output', () => {
  const r = simulate(inputs);
  assert.equal(r.cases, 120);
  assert.equal(r.score, 120);
  assert.equal(r.modelOutput, 100);
  assert.equal(r.category, 'MODERATE');
});
test('climate assumptions cannot invent climate effects', () => {
  assert.equal(simulate({ ...inputs, rainfall: 8, temperature: -7 }).score, 120);
  assert.equal(sensitivity(baseline, inputs).find((e) => e.field === 'rainfall')?.effect, null);
});
test('unconnected trained models remain unavailable', () => {
  for (const model of ['Ridge Regression', 'Random Forest', 'Gradient Boosting'])
    assert.equal(simulate({ ...inputs, model }).modelOutput, null);
});
test('threshold boundaries and experimental category only', () => {
  assert.equal(category(100, [100, 300, 500]), 'MODERATE');
  assert.equal(category(300, [100, 300, 500]), 'HIGH');
  assert.equal(category(500, [100, 300, 500]), 'VERY HIGH');
  assert.equal(simulate({ ...inputs, thresholds: [50, 100, 150] }).score, 120);
});
test('missing and invalid inputs block output rather than silently clamp', () => {
  for (const patch of [
    { population: 0 },
    { burden: -1 },
    { annualChange: -101 },
    { burden: null },
    { annualChange: null },
    { thresholds: [300, 100, 500] },
    { model: 'Invented' },
    { rainfall: Infinity },
  ]) {
    const r = simulate({ ...inputs, ...patch });
    assert.equal(r.score, null);
    assert.ok(r.errors.length);
  }
});
test('zero burden and minus 100 percent are valid', () => {
  assert.equal(simulate({ ...inputs, burden: 0 }).score, 0);
  assert.equal(simulate({ ...inputs, annualChange: -100 }).score, 0);
});
test('overflow never produces an infinite projection', () => {
  assert.equal(simulate({ ...inputs, burden: Number.MAX_VALUE, annualChange: 100 }).score, null);
});
test('one-factor sensitivity reversion and ranking', () => {
  const e = sensitivity(baseline, { ...inputs, burden: 200, population: 2000 });
  assert.equal(e.find((v) => v.field === 'burden')?.effect, 60);
  assert.equal(e.find((v) => v.field === 'population')?.effect, -120);
  assert.equal(e[0].field, 'population');
});
test('source status preserved and historical features exclude future periods', () => {
  const ds = [
    {
      id: 'd',
      name: 'Source',
      source: 'fixture',
      checksum: 'sha',
      created: '2025-01-01',
      classification: 'USER IMPORT' as const,
      rows: [2021, 2022, 2023, 2024, 2025, 2026].map((year, i) => ({
        district: 'A',
        year,
        cases: 100 * (i + 1),
        population: 1000,
        rainfall: 10 + i,
        temperature: 20 + i,
      })),
    },
  ];
  const b = captureBaseline(ds, 'd', 'A', 2025, [100, 300, 500]);
  assert.equal(b.inputs.annualChange, 25);
  assert.ok(b.inputs.rainfall! > 0);
  assert.ok(b.references.every((r) => r.year <= 2025));
  assert.match(b.verification, /incomplete/);
  assert.equal(captureBaseline(ds, 'd', 'A', 2021, [100, 300, 500]).inputs.rainfall, null);
});
test('export snapshots keep explicit scenario status and leave sources untouched', () => {
  const s = {
    id: '1',
    name: 'S',
    created: '2026-01-01',
    label: SCENARIO_LABEL,
    baseline: structuredClone(baseline),
    inputs: structuredClone(inputs),
  };
  const before = JSON.stringify(s);
  const out = scenarioExport(s);
  assert.equal(out.result.label, SCENARIO_LABEL);
  assert.equal(out.changeFromObservedBaseline, 20);
  assert.equal(JSON.stringify(s), before);
  assert.ok(validSavedScenario(s));
  assert.equal(validSavedScenario({ ...s, baseline: null }), false);
  assert.equal(validSavedScenario({ ...s, inputs: {} }), false);
});
