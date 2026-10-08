import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { makeAnalyticalRows, loadAnalyticalDemo, analyticalDemoId } from './analytical-demo.ts';
import { aggregateEvidence, includeSuppliedIncidence } from './district-intelligence.ts';
import { loadedForecastEvidence } from './forecasting.ts';
const registry = JSON.parse(await readFile('public/data/verified/district-registry.json', 'utf8'));
const generated = makeAnalyticalRows(registry);
test('connected fixture provides exactly 54 synthetic annual records and 225 illustrative outputs', async () => {
  const raw = await readFile('public/data/demo/analytical-workspace.json', 'utf8'),
    metadata = JSON.parse(
      await readFile('public/data/demo/analytical-workspace-metadata.json', 'utf8'),
    );
  assert.equal(raw, JSON.stringify(generated, null, 2) + '\n');
  assert.equal(createHash('sha256').update(raw).digest('hex'), metadata.sha256);
  assert.equal(generated.observations.length, 54);
  assert.equal(new Set(generated.observations.map((r) => `${r.district}:${r.year}`)).size, 54);
  assert.equal(
    generated.outputs.reduce((s, o) => s + o.rows.length, 0),
    225,
  );
});
test('synthetic and research sources cannot join, and demo models have nine pairs in 2025', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: any) =>
    new Response(await readFile('public' + url, 'utf8'))) as typeof fetch;
  try {
    const demo = await loadAnalyticalDemo();
    const real = {
      ...demo[0],
      id: 'real',
      classification: 'VERIFIED' as const,
      rows: [{ district: demo[0].rows[0].district, year: 2020, cases: 777, population: 1 }],
    };
    const aggregate = aggregateEvidence([...demo, real], analyticalDemoId, 'Persistence');
    assert.ok(
      aggregate.records.every((r) =>
        r.references.every((ref) => ref.classification === 'SYNTHETIC'),
      ),
    );
    assert.equal(aggregateEvidence([...demo, real], 'real', 'Persistence').records.length, 1);
    assert.equal(aggregateEvidence(demo, analyticalDemoId, 'Persistence', true).records.length, 0);
    const e = loadedForecastEvidence(demo, analyticalDemoId);
    assert.equal(e.pairs.filter((p) => p.year === 2025).length, 45);
    const summary = {
      incidence: {
        district: demo[0].rows[0].district,
        year: 2020,
        value: 999,
        unit: 'per 1,000 population',
      },
    };
    assert.strictEqual(
      includeSuppliedIncidence(aggregate.records, summary, 'Persistence'),
      aggregate.records,
    );
  } finally {
    globalThis.fetch = original;
  }
});
