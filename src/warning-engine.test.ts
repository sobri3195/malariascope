import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluate,
  metric,
  compareValue,
  conditionValue,
  validCondition,
  type Row,
  type Rule,
} from './analytics.ts';
import { ruleTemplates } from './warning-templates.ts';
const base: Rule = {
  id: 'test',
  metric: 'cases',
  operator: '>',
  value: 100,
  enabled: true,
  severity: 'HIGH',
};
const rows: Row[] = [2020, 2021, 2022, 2023, 2024, 2025, 2026].map((year, i) => ({
  district: 'A',
  year,
  cases: [100, 200, 300, 400, 50, 200, 300][i],
  population: 1000,
  rainfall: 100 + i * 10,
  temperature: 20 + i,
  humidity: 70,
  prediction: 500,
  model: 'Random Forest',
}));
test('all numeric operators handle boundaries and unavailable values explicitly', () => {
  for (const [operator, value, upper, v, result] of [
    ['>', 10, undefined, 10, false],
    ['>=', 10, undefined, 10, true],
    ['<', 10, undefined, 10, false],
    ['<=', 10, undefined, 10, true],
    ['=', 10, undefined, 10, true],
    ['between', 10, 20, 10, true],
    ['between', 10, 20, 20, true],
    ['between', 10, 20, 21, false],
    ['outside range', 10, 20, 20, false],
    ['outside range', 10, 20, 9, true],
    ['increased by', 20, undefined, 20, true],
    ['decreased by', 20, undefined, -20, true],
    ['decreased by', 0, undefined, 0, false],
  ] as const)
    assert.equal(compareValue(v, { metric: 'cases', operator, value, upper }), result);
  assert.equal(compareValue(null, base), false);
  assert.equal(compareValue(NaN, base), false);
  assert.equal(validCondition({ ...base, operator: 'between', upper: 50 }), false);
});
test('percentage operators use adjacent positive metric baselines and distinguish direction', () => {
  assert.equal(conditionValue(rows[1], rows, { ...base, operator: 'increased by' }), 100);
  assert.equal(conditionValue(rows[4], rows, { ...base, operator: 'decreased by' }), -87.5);
  assert.equal(conditionValue(rows[1], [rows[1]], { ...base, operator: 'increased by' }), null);
  assert.equal(
    conditionValue({ ...rows[1], cases: 10 }, [{ ...rows[0], cases: 0 }], {
      ...base,
      operator: 'increased by',
    }),
    null,
  );
});
test('persistence counts the whole expression in contiguous periods and suppression rearms after clear', () => {
  assert.deepEqual(
    evaluate(rows, [{ ...base, persistence: 2, suppress: true }])
      .map((a) => a.year)
      .sort(),
    [2022, 2026],
  );
  assert.deepEqual(
    evaluate(rows, [{ ...base, persistence: 2, suppress: false }])
      .map((a) => a.year)
      .sort(),
    [2022, 2023, 2026],
  );
  assert.deepEqual(
    evaluate(rows, [{ ...base, persistence: 3, suppress: true }]).map((a) => a.year),
    [2023],
  );
  assert.deepEqual(
    evaluate(
      rows.filter((r) => r.year !== 2022),
      [{ ...base, persistence: 2, suppress: true }],
    ).map((a) => a.year),
    [2026],
  );
  const compound = {
    ...base,
    persistence: 2 as const,
    secondary: { metric: 'change' as const, operator: '>' as const, value: 40 },
    join: 'AND' as const,
  };
  assert.deepEqual(
    evaluate(rows, [compound])
      .map((a) => a.year)
      .sort(),
    [2022, 2026],
  );
});
test('OR handles an unknown branch without inventing its value; disabled or invalid rules do not trigger', () => {
  const partial = [{ district: 'A', year: 2025, cases: 200 }];
  const rule = {
    ...base,
    secondary: { metric: 'incidence' as const, operator: '>' as const, value: 300 },
    join: 'OR' as const,
  };
  const alert = evaluate(partial, [rule])[0];
  assert.equal(alert.triggeringData[0].conditions[1].value, null);
  assert.equal(alert.triggeringData[0].conditions[1].matched, false);
  assert.equal(evaluate(partial, [{ ...rule, join: 'AND' }]).length, 0);
  assert.equal(evaluate(partial, [{ ...rule, enabled: false }]).length, 0);
  assert.equal(evaluate(partial, [{ ...base, operator: 'outside range' }]).length, 0);
});
test('rolling, climate, model, risk and quality metrics preserve definitions and model scope', () => {
  assert.equal(metric(rows[2], rows, 'rolling_average'), 200);
  assert.equal(
    metric(
      rows[2],
      rows.filter((r) => r.year !== 2021),
      'rolling_average',
    ),
    null,
  );
  assert.equal(metric(rows[3], rows, 'temperature_anomaly'), 2);
  assert.equal(metric(rows[3], rows, 'rainfall_anomaly'), 2);
  assert.equal(metric(rows[1], rows, 'temperature_anomaly'), null);
  assert.equal(metric(rows[3], rows, 'model_residual'), 100);
  assert.equal(metric(rows[3], rows, 'residual'), 100);
  assert.equal(metric(rows[3], rows, 'prediction_increase'), 150);
  assert.equal(metric(rows[3], rows, 'predicted_cases', { model: 'Persistence' }), null);
  assert.ok(
    Math.abs(
      metric(rows[3], rows, 'data_completeness', { model: 'Persistence' })! - (100 * 5) / 6,
    ) < 1e-10,
  );
  assert.equal(metric(rows[3], rows, 'risk_level', { thresholds: [100, 300, 500] }), 2);
  assert.equal(metric({ ...rows[3], population: undefined }, rows, 'risk_level'), null);
});
test('dataset age requires valid metadata and never fabricates historical age snapshots', () => {
  const context = { datasetCreated: '2026-01-01T00:00:00Z', now: '2026-01-11T00:00:00Z' };
  assert.equal(metric(rows.at(-1)!, rows, 'dataset_age', context), 10);
  assert.equal(metric(rows[0], rows, 'dataset_age', context), null);
  assert.equal(metric(rows.at(-1)!, rows, 'dataset_age'), null);
  assert.equal(metric(rows.at(-1)!, rows, 'dataset_age', { ...context, now: '2025-01-01' }), null);
  assert.equal(
    evaluate(
      rows,
      [{ ...base, metric: 'dataset_age', value: 5, persistence: 2 }],
      'source',
      context,
    ).length,
    0,
  );
});
test('alert evidence contains exact configuration, all persistence inputs and immutable source context', () => {
  const rule = {
    ...base,
    persistence: 2 as const,
    suppress: true,
    priority: 'URGENT' as const,
    description: 'Observed burden',
  };
  const context = {
    datasetName: 'Authorized import',
    datasetCreated: '2026-01-01',
    source: 'Test registry',
    checksum: 'abc',
    classification: 'USER IMPORT',
    model: 'Random Forest',
  };
  const alert = evaluate(rows, [rule], 'dataset-id', context).find((a) => a.year === 2022)!;
  assert.match(alert.exactRule, /2 consecutive/);
  assert.equal(alert.sourceDataset.checksum, 'abc');
  assert.deepEqual(
    alert.triggeringData.map((p) => p.year),
    [2021, 2022],
  );
  assert.equal(alert.observations.at(-1)!.year, 2022);
  rule.value = 900;
  rows[1].cases = 999;
  assert.equal(alert.ruleSnapshot.value, 100);
  assert.equal(alert.observations.find((r) => r.year === 2021)!.cases, 200);
  rows[1].cases = 200;
});
test('rule revisions and model scopes have distinct identities; replay of the same evidence is deterministic', () => {
  const prediction = { ...base, metric: 'predicted_cases' as const };
  const a = evaluate(rows, [prediction], 'dataset', { model: 'Random Forest' });
  assert.deepEqual(a, evaluate(rows, [prediction], 'dataset', { model: 'Random Forest' }));
  assert.notEqual(
    a[0].id,
    evaluate(rows, [{ ...prediction, revision: 2 }], 'dataset', { model: 'Random Forest' })[0].id,
  );
  assert.equal(evaluate(rows, [prediction], 'dataset', { model: 'Persistence' }).length, 0);
});
test('all six rule templates are valid and persistent high risk requires three periods', () => {
  assert.equal(ruleTemplates.length, 6);
  for (const t of ruleTemplates) {
    assert.ok(validCondition(t.rule));
    if (t.rule.secondary) assert.ok(validCondition(t.rule.secondary));
  }
  const template = ruleTemplates.find((t) => t.name === 'Persistent High Risk')!;
  assert.deepEqual(
    evaluate(rows, [{ ...template.rule, id: 'risk' }]).map((a) => a.year),
    [],
  );
  const high = [2023, 2024, 2025, 2026].map((year) => ({
    district: 'A',
    year,
    cases: 400,
    population: 1000,
  }));
  assert.deepEqual(
    evaluate(high, [{ ...template.rule, id: 'risk' }]).map((a) => a.year),
    [2025],
  );
});
