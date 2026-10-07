import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveDistrict } from './district-registry.ts';
import { validateGeometry, resolveFeatureRow } from './geometry.ts';
import { validateScientific, gisRows, type ScientificSource } from './scientific-sources.ts';
import { mapValue, mapColor, layerAvailability } from './map-intelligence.ts';
import { validateFacilitySnapshot } from './public-healthcare.ts';
import type { Row } from './analytics.ts';
const feature = {
  type: 'Feature' as const,
  properties: { district: 'Alpha', district_code: '1' },
  geometry: {
    type: 'Polygon' as const,
    coordinates: [
      [
        [138, -4],
        [139, -4],
        [139, -3],
        [138, -3],
        [138, -4],
      ],
    ],
  },
};
const row: Row = {
  district: 'Alpha',
  district_code: '1',
  year: 2025,
  cases: 100,
  population: 1000,
};
const source = (
  kind: ScientificSource['kind'],
  records: ScientificSource['records'],
): ScientificSource => ({
  id: kind,
  kind,
  name: kind,
  source: 'Isolated test fixture',
  checksum: 'test',
  created: '2026-01-01',
  classification: 'USER IMPORT',
  records,
});
test('code-first resolver supports aliases and never resolves ambiguity or conflicting codes', () => {
  assert.equal(
    resolveDistrict({ canonicalName: 'Different spelling', code: '1', aliases: [] }, [row]).row,
    row,
  );
  assert.equal(
    resolveFeatureRow({ ...feature, properties: { district: 'Other', aliases: ['alpha'] } }, [row]),
    row,
  );
  assert.equal(
    resolveDistrict({ canonicalName: 'Alpha', aliases: [] }, [row, { ...row, district_code: '2' }])
      .status,
    'Manual geographic match required.',
  );
  assert.equal(
    resolveDistrict({ canonicalName: 'Alpha', code: '2', aliases: [] }, [row]).row,
    null,
  );
});
test('country outlines and invalid polygons cannot masquerade as analytical districts', () => {
  const country = { ...feature, properties: { name: 'Indonesia', 'ISO3166-1-Alpha-3': 'IDN' } };
  assert.throws(
    () => validateGeometry({ type: 'FeatureCollection', features: [country] }),
    /Country context/,
  );
  assert.equal(
    validateGeometry({ type: 'FeatureCollection', features: [country] }, true).features.length,
    1,
  );
  assert.throws(
    () =>
      validateGeometry({
        type: 'FeatureCollection',
        features: [
          {
            ...feature,
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [181, 0],
                  [0, 0],
                  [1, 1],
                  [181, 0],
                ],
              ],
            },
          },
        ],
      }),
    /Invalid geographic coordinates/,
  );
});
test('no data differs from LOW; negative persisted values cannot become risk', () => {
  assert.notEqual(mapColor(null, 'risk', []), mapColor(0, 'risk', []));
  assert.equal(mapValue({ ...row, cases: NaN }, 'risk', [], 'Persistence', [100, 300, 500]), null);
  assert.equal(mapValue({ ...row, cases: -1 }, 'risk', [], 'Persistence', [100, 300, 500]), null);
  assert.equal(
    mapValue(
      { ...row, model: 'Persistence', prediction: -5 },
      'prediction_risk',
      [],
      'Persistence',
      [100, 300, 500],
    ),
    null,
  );
});
test('availability requires joined geometry and the selected year/model; anomaly needs history', () => {
  assert.equal(
    layerAvailability([], [row], 2025, 'cases', 'Persistence', [100, 300, 500]).available,
    false,
  );
  assert.equal(
    layerAvailability([feature], [row], 2024, 'cases', 'Persistence', [100, 300, 500]).available,
    false,
  );
  assert.equal(
    layerAvailability([feature], [row], 2025, 'prediction', 'Persistence', [100, 300, 500])
      .available,
    false,
  );
  assert.equal(
    layerAvailability([feature], [row], 2025, 'rainfall_anomaly', 'Persistence', [100, 300, 500])
      .available,
    false,
  );
  assert.equal(
    layerAvailability([feature], [row], 2025, 'cases', 'Persistence', [100, 300, 500]).available,
    true,
  );
});
test('separate schemas reject empty, duplicate, incomplete and invalid scientific records', () => {
  assert.throws(() => validateScientific('population', []), /zero observations/);
  assert.throws(
    () => validateScientific('population', [{ district: 'Alpha', year: 2025, population: 0 }]),
    /Invalid population/,
  );
  assert.throws(
    () => validateScientific('climate-observations', [{ district: 'Alpha', year: 2025 }]),
    /climate variable/,
  );
  assert.throws(
    () =>
      validateScientific('model-predictions', [
        { district: 'Alpha', year: 2025, model: 'Random Forest', prediction: 10 },
      ]),
    /trainingPeriod/,
  );
  assert.throws(
    () =>
      validateScientific('population', [
        { district: 'Alpha', year: 2025, population: 1000 },
        { district: 'Alpha', year: 2025, population: 1000 },
      ]),
    /Duplicate/,
  );
});
test('GIS supplements join without inventing observed cases, isolate model outputs, and withhold conflicts', () => {
  const predictions = source('model-predictions', [
    {
      district: 'Alpha',
      district_code: '1',
      year: 2025,
      model: 'Random Forest',
      prediction: 120,
      trainingPeriod: '2020–2024',
      validationPeriod: '2025',
      outputClassification: 'UNVERIFIED',
    },
  ]);
  const projected = gisRows([], [predictions], 'Random Forest');
  assert.equal(projected.length, 1);
  assert.ok(Number.isNaN(projected[0].cases));
  assert.equal(mapValue(projected[0], 'cases', projected, 'Random Forest', [100, 300, 500]), null);
  assert.equal(
    mapValue(projected[0], 'prediction', projected, 'Random Forest', [100, 300, 500]),
    120,
  );
  assert.deepEqual(gisRows([], [predictions], 'Persistence'), []);
  const conflicting = [
    source('population', [{ district: 'Alpha', year: 2025, population: 1000 }]),
    source('population', [{ district: 'Alpha', year: 2025, population: 2000 }]),
  ];
  assert.equal(
    gisRows([{ ...row, population: undefined }], conflicting, 'Persistence')[0].population,
    undefined,
  );
  assert.equal(row.prediction, undefined);
});
test('static facilities need real source metadata and retain only safe public OSM records', () => {
  assert.throws(() => validateFacilitySnapshot({ facilities: [] }), /not connected/);
  const snapshot = validateFacilitySnapshot({
    source: 'OSM',
    license: 'ODbL',
    retrieved: '2026-01-01',
    facilities: [
      {
        id: 'node/1',
        name: 'Public clinic',
        type: 'clinic',
        lat: -4,
        lon: 138,
        url: 'https://www.openstreetmap.org/node/1',
      },
      {
        id: 'node/2',
        name: 'Military hospital',
        type: 'hospital',
        lat: -4,
        lon: 138,
        url: 'https://www.openstreetmap.org/node/2',
      },
    ],
  });
  assert.equal(snapshot.facilities.length, 1);
  assert.equal(snapshot.facilities[0].id, 'node/1');
});
import { fieldReadiness } from './data-readiness.ts';
test('readiness treats zero observations as disconnected and invalid counts as invalid', () => {
  assert.equal(fieldReadiness([], ['cases']), 'NOT CONNECTED');
  assert.equal(fieldReadiness([{ cases: 0 }], ['cases']), 'CONNECTED');
  assert.equal(fieldReadiness([{ cases: -1 }], ['cases']), 'INVALID');
  assert.equal(fieldReadiness([{ cases: 10 }, { cases: null }], ['cases']), 'PARTIAL');
});
test('anonymous supplements cannot populate multiple conflicting district identities', () => {
  const supplemental = source('population', [{ district: 'Alpha', year: 2025, population: 900 }]);
  const rows = gisRows(
    [
      { ...row, population: undefined },
      { ...row, district_code: '2', population: undefined },
    ],
    [supplemental],
    'Persistence',
  );
  assert.ok(rows.every((r) => r.population === undefined));
});
test('a partially connected climate domain is PARTIAL rather than disconnected', () => {
  assert.equal(
    fieldReadiness([{ rainfall: 1200 }], ['rainfall', 'temperature', 'humidity']),
    'PARTIAL',
  );
});
import fs from 'node:fs';
test('supplied research findings are preserved and never expanded into raw observations', () => {
  const summary = JSON.parse(
    fs.readFileSync(new URL('../public/data/research-summary.json', import.meta.url), 'utf8'),
  );
  assert.equal(summary.totalCases, 1046154);
  assert.equal(summary.panelDistricts, 8);
  assert.equal(summary.districtYears, 48);
  assert.deepEqual(summary.annual, [
    { year: 2020, cases: 104544 },
    { year: 2025, cases: 288131 },
  ]);
  assert.equal(summary.incidence.value, 684.74);
  const performance = JSON.parse(
    fs.readFileSync(new URL('../public/data/model-performance.json', import.meta.url), 'utf8'),
  );
  assert.equal(performance.find((r: any) => r.model === 'Persistence').mae, 10426);
  assert.equal(performance.find((r: any) => r.model === 'Ridge Regression').mae, null);
  assert.equal(
    fs
      .readFileSync(new URL('../public/data/district-malaria.csv', import.meta.url), 'utf8')
      .trim()
      .split('\n').length,
    1,
  );
});
test('district registry maps geometry codes to canonical codes and blocks alias collisions', () => {
  const registry = [
    { canonicalName: 'Alpha', code: '1', geometryCode: 'geo-1', aliases: ['Old Alpha'] },
  ];
  assert.equal(
    resolveDistrict({ canonicalName: 'Unrecognized', code: 'geo-1', aliases: [] }, [row], registry)
      .row,
    row,
  );
  assert.equal(
    resolveDistrict({ canonicalName: 'Old Alpha', aliases: [] }, [row], registry).row,
    row,
  );
  assert.equal(
    resolveDistrict(
      { canonicalName: 'Old Alpha', aliases: [] },
      [row],
      [...registry, { canonicalName: 'Other', code: '2', aliases: ['Old Alpha'] }],
    ).status,
    'Manual geographic match required.',
  );
});
test('operational identities cannot be hidden in imported geometry aliases', () => {
  assert.throws(
    () =>
      validateGeometry({
        type: 'FeatureCollection',
        features: [
          {
            ...feature,
            properties: { ...feature.properties, aliases: ['Military deployment area'] },
          },
        ],
      }),
    /military geometries are excluded/,
  );
});
