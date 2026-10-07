import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  inspectScientificIntegrity,
  integrityFields,
  integrityPolicy,
  type IntegrityDataset,
} from './scientific-integrity.ts';
const options = { year: 2025, model: 'Random Forest', now: '2026-01-01T00:00:00Z' };
const fixture: IntegrityDataset = {
  id: 'integrity-fixture',
  name: 'Isolated integrity fixture',
  source: 'Automated fixture',
  checksum: 'fixture-sha',
  created: '2025-12-01T00:00:00Z',
  classification: 'USER IMPORT',
  rows: [2024, 2025].flatMap((year) =>
    ['A', 'B', 'C'].map((district, i) => ({
      district,
      district_code: String(i + 1),
      year,
      cases: [100, 200, 300][i],
      population: 1000,
      rainfall: 1200,
      temperature: 25,
      humidity: 70,
      prediction: [110, 210, 310][i],
      model: 'Random Forest',
      incidence: [100, 200, 300][i],
    })),
  ),
};
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
const inspect = (dataset: IntegrityDataset = fixture, geo: unknown = geometry, opts = options) =>
  inspectScientificIntegrity([dataset], geo, opts)[0];
const copy = () =>
  structuredClone(fixture) as IntegrityDataset & { rows: Record<string, unknown>[] };
const codes = (report: ReturnType<typeof inspect>) => new Set(report.issues.map((i) => i.code));
test('complete evidence scores exactly 100 with explicit numerators and passes four stated prerequisites', () => {
  const report = inspect();
  assert.equal(report.score, 100);
  assert.equal(report.status, 'CHECKS PASSED');
  assert.equal(report.issues.length, 0);
  assert.deepEqual(
    report.scoreComponents.map((c) => c.weight),
    [30, 20, 10, 20, 10, 10],
  );
  assert.equal(report.scoreComponents[0].denominator, 6 * integrityFields.length);
  assert.deepEqual(
    report.eligibility.map((e) => e.eligible),
    [true, true, true, true],
  );
  assert.equal(report.period.present, 6);
  assert.equal(report.period.expected, 6);
  assert.ok(report.eligibility[0].reasons.some((r) => r.includes('not model training')));
});
test('all missing fields retain fixed denominators and lower score without removing source rows', () => {
  const dataset = copy();
  delete dataset.rows[0].rainfall;
  delete dataset.rows[0].prediction;
  const report = inspect(dataset);
  assert.equal(report.rowCount, 6);
  assert.equal(report.scoreComponents[0].numerator, 52);
  assert.equal(report.scoreComponents[0].denominator, 54);
  assert.equal(report.score, 100 - (30 * 2) / 54);
  assert.ok(codes(report).has('missing-rainfall'));
  assert.ok(codes(report).has('missing-prediction'));
});
test('duplicate observations are exposed for all implicated rows and block every analysis', () => {
  const dataset = copy();
  dataset.rows.push({ ...dataset.rows[0] });
  const report = inspect(dataset);
  assert.ok(codes(report).has('duplicate-exact'));
  assert.ok(codes(report).has('duplicate-district-year'));
  assert.equal(report.rowCount, 7);
  assert.equal(report.scoreComponents[2].numerator, 6);
  assert.equal(report.status, 'BLOCKED');
  assert.ok(report.eligibility.every((e) => !e.eligible));
  assert.deepEqual(
    report.issues.filter((i) => i.code === 'duplicate-exact').map((i) => i.row),
    [1, 7],
  );
});
test('case/punctuation and code aliases cannot disguise duplicate district-years', () => {
  const dataset = copy();
  dataset.rows.push({ ...dataset.rows[0], district: ' Kabupaten A ', district_code: undefined });
  const report = inspect(dataset);
  assert.ok(codes(report).has('duplicate-district-year'));
  assert.equal(report.districtCount, 3);
});
test('invalid values, schema mismatch, unsupported years and coordinates retain exact row/field actions', () => {
  const dataset = copy();
  dataset.rows[0] = {
    ...dataset.rows[0],
    cases: -1,
    population: 0,
    rainfall: -2,
    humidity: 101,
    year: 2200,
    latitude: 91,
    longitude: 200,
    unknown_column: 'preserved',
  };
  const report = inspect(dataset);
  for (const code of [
    'negative-cases',
    'invalid-population',
    'negative-rainfall',
    'invalid-humidity',
    'unsupported-year',
    'coordinates-range',
    'schema-extra',
  ])
    assert.ok(codes(report).has(code), code);
  assert.ok(
    report.issues.every(
      (issue) =>
        issue.dataset === dataset.name && issue.action.length > 0 && issue.field.length > 0,
    ),
  );
  assert.ok(report.issues.filter((i) => i.code === 'coordinates-range').every((i) => i.row === 1));
  const types = copy();
  types.rows[0].cases = true;
  types.rows[1].rainfall = { value: 1 };
  assert.ok(codes(inspect(types)).has('schema-cases'));
  assert.ok(codes(inspect(types)).has('schema-rainfall'));
});
test('incidence inconsistency is calculated with tolerance and never rewrites input values', () => {
  const dataset = copy();
  dataset.rows[0].incidence = 999;
  const before = JSON.stringify(dataset);
  const report = inspect(dataset);
  assert.ok(codes(report).has('incidence-mismatch'));
  assert.equal(JSON.stringify(dataset), before);
  dataset.rows[0].incidence = 100.05;
  assert.ok(!codes(inspect(dataset)).has('incidence-mismatch'));
});
test('GIS absence never inflates scores; code/name mismatch and invalid geometry remain explicit', () => {
  const report = inspect(fixture, null);
  assert.equal(report.score, 80);
  assert.equal(report.scoreComponents[4].percent, null);
  assert.equal(report.scoreComponents[5].percent, null);
  assert.equal(report.eligibility[1].eligible, false);
  assert.equal(report.eligibility[2].eligible, true);
  const dataset = copy();
  dataset.rows[0].district_code = '99';
  assert.ok(codes(inspect(dataset)).has('unmatched-code'));
  const alias = copy();
  alias.rows[0].district = 'Alias A';
  assert.ok(codes(inspect(alias)).has('geographic-name-mismatch'));
  assert.equal(inspect(alias).gisMatched, 3);
  const invalid = structuredClone(geometry);
  invalid.features[0].geometry.coordinates[0][0] = [500, -4];
  assert.ok(codes(inspect(fixture, invalid)).has('invalid-geometry'));
});
test('many-to-one GIS matches withhold every ambiguous identity rather than just the first', () => {
  const dataset = copy();
  for (const r of dataset.rows)
    if (r.district === 'A' || r.district === 'B') {
      r.district = 'A';
      r.district_code = r.district_code === '1' ? '1' : 'unmapped-B';
    }
  const geo = structuredClone(geometry);
  delete (geo.features[0].properties as { district_code?: string }).district_code;
  const report = inspect(dataset, geo);
  assert.ok(codes(report).has('ambiguous-gis'));
  assert.equal(report.gisMatched, 1);
  assert.equal(report.eligibility[1].eligible, false);
});
test('temporal gaps use the full district-panel denominator and abrupt changes require adjacent periods', () => {
  const dataset = copy();
  dataset.rows = dataset.rows.filter((r) => !(r.district === 'B' && r.year === 2024));
  dataset.rows.find((r) => r.district === 'A' && r.year === 2025)!.cases = 400;
  const report = inspect(dataset);
  assert.equal(report.period.expected, 6);
  assert.equal(report.period.present, 5);
  assert.ok(codes(report).has('temporal-gap'));
  assert.ok(codes(report).has('abrupt-change'));
  assert.equal(report.eligibility[2].eligible, false);
  const nonAdjacent = copy();
  for (const r of nonAdjacent.rows)
    if (r.year === 2025) {
      r.year = 2026;
      r.cases = 1000;
      delete r.incidence;
    }
  assert.ok(!codes(inspect(nonAdjacent)).has('abrupt-change'));
  const zero = copy();
  zero.rows[0].cases = 0;
  delete zero.rows[0].incidence;
  assert.match(
    inspect(zero).issues.find((i) => i.code === 'abrupt-change')!.issue,
    /percentage undefined/,
  );
});
test('staleness distinguishes registry ingestion from observation year and future observations are review signals', () => {
  const dataset = copy();
  dataset.created = '2020-01-01';
  const report = inspect(dataset, geometry, { ...options, year: 2029 });
  assert.ok(codes(report).has('stale-ingestion'));
  assert.ok(codes(report).has('stale-surveillance'));
  const future = copy();
  future.rows[0].year = 2027;
  assert.ok(codes(inspect(future)).has('future-year'));
  assert.ok(!codes(inspect(future)).has('unsupported-year'));
  dataset.created = 'not-a-date';
  assert.ok(codes(inspect(dataset)).has('metadata-date'));
});
test('original source rows preserve extra columns and valid CSV numeric normalization without dropping evidence', () => {
  const dataset = copy();
  dataset.sourceRows = dataset.rows.map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([key, value]) => [
        key,
        typeof value === 'number' ? String(value) : value,
      ]),
    ),
  );
  (dataset.sourceRows as Record<string, unknown>[])[0].latitude = '95';
  (dataset.sourceRows as Record<string, unknown>[])[0].longitude = '138';
  (dataset.sourceRows as Record<string, unknown>[])[0].source_note = 'original retained';
  const report = inspect(dataset);
  assert.match(report.sourceBasis, /Preserved original/);
  assert.ok(codes(report).has('coordinates-range'));
  assert.ok(codes(report).has('schema-extra'));
  assert.ok(!codes(report).has('source-snapshot-mismatch'));
  dataset.rows[0].cases = 999;
  assert.ok(codes(inspect(dataset)).has('source-snapshot-mismatch'));
  assert.equal(inspect(dataset).status, 'BLOCKED');
});
test('empty and malformed datasets have no invented quality or analysis eligibility', () => {
  for (const rows of [[], null, 'rows']) {
    const report = inspect({ ...fixture, rows });
    assert.equal(report.score, null);
    assert.ok(report.eligibility.every((e) => !e.eligible));
    assert.equal(report.status, 'BLOCKED');
  }
  const report = inspect({ ...fixture, rows: [null, { district: 5, year: 'bad', cases: false }] });
  assert.equal(report.rowCount, 2);
  assert.ok(codes(report).has('schema-object'));
  assert.ok(codes(report).has('schema-district'));
});
test('eligibility separates single-year forecasts, full-panel trends, observed risk and spatial prerequisites', () => {
  const dataset = copy();
  dataset.rows = dataset.rows.filter((r) => r.year === 2025);
  assert.equal(inspect(dataset).eligibility[2].eligible, false);
  assert.equal(inspect(dataset).eligibility[0].eligible, true);
  delete dataset.rows[0].population;
  assert.equal(inspect(dataset).eligibility[3].eligible, false);
  assert.equal(inspect(dataset).eligibility[0].eligible, true);
  assert.equal(
    inspect(fixture, geometry, { ...options, model: 'Persistence' }).eligibility[0].eligible,
    false,
  );
  const constant = copy();
  for (const r of constant.rows) {
    r.cases = 100;
    r.incidence = 100;
  }
  assert.equal(inspect(constant).eligibility[1].eligible, false);
});
test('quality score is reproducible and per-dataset duplicates do not confuse separate model outputs', () => {
  const before = JSON.stringify({ fixture, geometry });
  assert.deepEqual(inspect(), inspect());
  assert.equal(JSON.stringify({ fixture, geometry }), before);
  const reports = inspectScientificIntegrity(
    [fixture, { ...fixture, id: 'second', name: 'Separate source outputs' }],
    geometry,
    options,
  );
  assert.ok(reports.every((report) => report.score === 100));
  assert.equal(integrityPolicy.version, 1);
});
