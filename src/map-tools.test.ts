import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { navigationFeatures, readFilters, valueFor, type Geometry } from './asean/engine.ts';
import { measure, validPoint } from './asean/measurement.ts';

const geometry = JSON.parse(
  readFileSync(
    new URL('../public/data/geography/asean-countries.geojson', import.meta.url),
    'utf8',
  ),
) as Geometry;
const study = JSON.parse(
  readFileSync(
    new URL('../public/data/verified/papua-study-adm2.geojson', import.meta.url),
    'utf8',
  ),
) as Geometry;
const defaults = readFilters(new URLSearchParams());
test('default administrative context carries no epidemiological values', () => {
  assert.equal(defaults.indicator, 'boundaries');
  assert.equal(
    valueFor({ district: 'Test-only district', year: 2025, cases: 0 }, 'boundaries'),
    null,
  );
});
test('camera selections use actual eleven-country, country, study and district geometries', () => {
  assert.equal(navigationFeatures(defaults, geometry, study).length, 11);
  const indonesia = navigationFeatures({ ...defaults, area: 'indonesia' }, geometry, study);
  assert.equal(indonesia.length, 1);
  assert.equal(indonesia[0].properties?.['ISO3166-1-Alpha-3'], 'IDN');
  assert.equal(navigationFeatures({ ...defaults, area: 'papua' }, geometry, study).length, 9);
  const district = navigationFeatures(
    { ...defaults, area: 'papua', district: 'Biak Numfor' },
    geometry,
    study,
  );
  assert.equal(district.length, 1);
  assert.equal(district[0].properties?.district || district[0].properties?.name, 'Biak Numfor');
  assert.equal(
    navigationFeatures({ ...defaults, countries: ['THA', 'VNM'] }, geometry, study).length,
    2,
  );
  assert.equal(navigationFeatures({ ...defaults, area: 'mekong' }, geometry, study).length, 5);
});
test('distance follows great-circle segments rather than pixels or degrees', () => {
  const result = measure('distance', [
    [0, 0],
    [1, 0],
    [1, 1],
  ]);
  assert.ok(Math.abs(result.value - 222.39016) < 0.001);
  assert.equal(result.unit, 'km');
  assert.equal(
    measure('distance', [
      [10, 10],
      [10, 10],
    ]).value,
    0,
  );
});
test('study area uses real polygon area and reports actual district intersections', () => {
  // Isolated geometry fixture; never loaded into application evidence.
  const fixture: Geometry = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { name: 'Test-only district' },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [0, 0],
              [1, 0],
              [1, 1],
              [0, 1],
              [0, 0],
            ],
          ],
        },
      },
    ],
  };
  const result = measure(
    'area',
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ],
    fixture,
  );
  assert.ok(result.value > 12360 && result.value < 12365);
  assert.deepEqual(result.districts, ['Test-only district']);
  assert.equal(result.geometry?.geometry.coordinates[0].length, 5);
  assert.deepEqual(
    measure(
      'area',
      [
        [10, 10],
        [11, 10],
        [11, 11],
      ],
      fixture,
    ).districts,
    [],
  );
});
test('invalid and self-intersecting study areas never produce a misleading measurement', () => {
  assert.equal(validPoint([0, 86]), false);
  assert.equal(validPoint([Infinity, 0]), false);
  assert.throws(() => measure('distance', [[0, 0]]), /at least two/);
  assert.throws(
    () =>
      measure('area', [
        [0, 0],
        [1, 1],
      ]),
    /three distinct/,
  );
  assert.throws(
    () =>
      measure('area', [
        [0, 0],
        [1, 1],
        [0, 1],
        [1, 0],
      ]),
    /non-intersecting/,
  );
  assert.throws(
    () =>
      measure('area', [
        [0, 0],
        [1, 0],
        [2, 0],
      ]),
    /at least one/,
  );
  assert.throws(
    () =>
      measure('area', [
        [179, 0],
        [-179, 0],
        [-179, 1],
      ]),
    /antimeridian/,
  );
  assert.throws(
    () =>
      measure(
        'distance',
        Array.from({ length: 257 }, () => [0, 0]),
      ),
    /256/,
  );
});
