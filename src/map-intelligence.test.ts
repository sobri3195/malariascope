import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mapValue,
  mapColor,
  mapStatistics,
  commonBreaks,
  comparisonRows,
  geometryBounds,
  type MapFeature,
} from './map-intelligence.ts';
import { adjacencyGraph, hotspotContext } from './hotspot-spatial.ts';
import { publicFacilities, facilityRegion, facilityQuery } from './public-healthcare.ts';
import { type Row } from './analytics.ts';
const features: MapFeature[] = ['A', 'B', 'C'].map((district, i) => ({
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
}));
const rows: Row[] = [100, 400, 600].map((cases, i) => ({
  district: ['A', 'B', 'C'][i],
  district_code: String(i + 1),
  year: 2025,
  cases,
  population: 1000,
  rainfall: 1000,
  temperature: 25,
  humidity: 80,
  prediction: cases + 20,
  model: 'Random Forest',
}));
const thresholds = [100, 300, 500];
test('map layers distinguish observed, predicted, signed residual and completeness with model scope', () => {
  assert.equal(mapValue(rows[1], 'cases', rows, 'Random Forest', thresholds), 400);
  assert.equal(mapValue(rows[1], 'incidence', rows, 'Random Forest', thresholds), 400);
  assert.equal(mapValue(rows[1], 'prediction_risk', rows, 'Random Forest', thresholds), 2);
  assert.equal(mapValue(rows[1], 'prediction', rows, 'Persistence', thresholds), null);
  assert.equal(
    mapValue({ ...rows[1], prediction: 350 }, 'signed_residual', rows, 'Random Forest', thresholds),
    -50,
  );
  assert.equal(
    mapValue({ ...rows[1], prediction: 350 }, 'residual', rows, 'Random Forest', thresholds),
    50,
  );
  assert.equal(mapValue(rows[1], 'completeness', rows, 'Random Forest', thresholds), 100);
  assert.ok(
    Math.abs(mapValue(rows[1], 'completeness', rows, 'Persistence', thresholds)! - (100 * 5) / 6) <
      1e-10,
  );
  assert.equal(
    mapValue(
      { ...rows[1], population: undefined },
      'prediction_risk',
      rows,
      'Random Forest',
      thresholds,
    ),
    null,
  );
  assert.equal(mapValue(null, 'completeness', rows, 'Random Forest', thresholds), null);
});
test('statistics use visible district geometry, available values, and explicit observed incidence risk counts', () => {
  const extra = { district: 'Not mapped', year: 2025, cases: 999999, population: 1000 };
  const stats = mapStatistics(
    features,
    [...rows, extra],
    2025,
    'cases',
    'Random Forest',
    thresholds,
    null,
  );
  assert.equal(stats.visibleDistricts, 3);
  assert.equal(stats.knownValues, 3);
  assert.equal(stats.highest?.value, 600);
  assert.equal(stats.lowest?.value, 100);
  assert.equal(stats.median, 400);
  assert.equal(stats.mean, 1100 / 3);
  assert.equal(stats.highRisk, 1);
  assert.equal(stats.veryHighRisk, 1);
  const clipped = mapStatistics(features, rows, 2025, 'cases', 'Random Forest', thresholds, {
    west: 138.1,
    east: 138.9,
    south: -3.9,
    north: -3.1,
  });
  assert.equal(clipped.visibleDistricts, 1);
  assert.equal(clipped.mean, 100);
  assert.equal(
    mapStatistics(features, rows, 2025, 'cases', 'Random Forest', thresholds, null, {}, false)
      .visibleDistricts,
    0,
  );
  assert.equal(
    mapStatistics(features, rows, 2025, 'risk', 'Random Forest', thresholds, null).mean,
    null,
  );
  assert.equal(
    mapStatistics(features, rows, 2024, 'cases', 'Random Forest', thresholds, null).knownValues,
    0,
  );
});
test('year comparison never invents absent years and pools classification across both cohorts', () => {
  const previous = rows.map((r) => ({ ...r, year: 2024, cases: r.cases / 2 }));
  const comparison = comparisonRows(
    features,
    [...previous, ...rows],
    2024,
    2025,
    'cases',
    'Random Forest',
    thresholds,
  );
  assert.equal(comparison[0].delta, 50);
  assert.equal(comparison[2].delta, 300);
  assert.deepEqual(
    commonBreaks(
      comparison.flatMap((r) => [r.valueA, r.valueB]),
      'interval',
    ),
    [187.5, 325, 462.5],
  );
  assert.equal(
    comparisonRows(features, rows, 2024, 2025, 'cases', 'Random Forest', thresholds)[0].valueA,
    null,
  );
  assert.equal(mapColor(null, 'cases', [100, 300, 500]), '#cbd4d4');
});
test('queen contiguity highlights actual neighbors and complete-neighborhood context preserves gaps', () => {
  const graph = adjacencyGraph(features);
  assert.deepEqual(graph, { '1': ['2'], '2': ['1', '3'], '3': ['2'] });
  const context = hotspotContext(features, graph, rows, 2025, 'B', thresholds);
  assert.deepEqual(context.neighborIds, ['1', '3']);
  assert.equal(context.neighborBurden, 350);
  assert.equal(context.neighborIncidence, 350);
  assert.equal(context.burdenRatio, 400 / 350);
  assert.equal(context.spatialRisk, 'HIGH');
  assert.equal(context.quadrant, 'HIGH–LOW');
  const missing = hotspotContext(
    features,
    graph,
    rows.filter((r) => r.district !== 'C'),
    2025,
    'B',
    thresholds,
  );
  assert.equal(missing.neighbors.length, 2);
  assert.equal(missing.neighbors[1].cases, null);
  assert.equal(missing.neighborBurden, null);
  assert.equal(missing.quadrant, null);
});
test('district-code selection survives name aliases and missing selected-year observations', () => {
  const renamed = [{ ...rows[1], district: 'B alias' }];
  const graph = adjacencyGraph(features);
  assert.equal(
    hotspotContext(features, graph, renamed, 2024, 'B alias', thresholds).targetIdentity,
    '2',
  );
  assert.deepEqual(
    hotspotContext(features, graph, renamed, 2024, 'B alias', thresholds).neighborIds,
    ['1', '3'],
  );
  assert.deepEqual(geometryBounds(features), { west: 138, east: 141, south: -4, north: -3 });
});
test('public healthcare parsing retains public source points and excludes restricted or military records', () => {
  const node = {
    type: 'node',
    id: 1,
    lat: -3,
    lon: 140,
    tags: { amenity: 'hospital', name: 'Public hospital' },
  };
  const variants = [
    node,
    { ...node, id: 2, tags: { amenity: 'clinic', military: 'hospital' } },
    { ...node, id: 3, tags: { amenity: 'hospital', name: 'TNI military hospital' } },
    { ...node, id: 4, tags: { amenity: 'hospital', access: 'private' } },
    { ...node, id: 5, tags: { amenity: 'hospital', building: 'military' } },
    { ...node, id: 6, lat: 50 },
    { ...node, id: 7, tags: { amenity: 'barracks' } },
    { ...node, id: 8, tags: { amenity: 'clinic', name: 'Ordinary public clinic' } },
    { ...node, id: 9, lat: undefined, center: { lat: -4, lon: 139 } },
  ];
  const facilities = publicFacilities({ elements: variants }, facilityRegion);
  assert.deepEqual(
    facilities.map((f) => f.id),
    ['node/1', 'node/8', 'node/9'],
  );
  assert.equal(facilities[0].url, 'https://www.openstreetmap.org/node/1');
  assert.equal((facilities[0] as any).tags, undefined);
  assert.match(facilityQuery(facilityRegion), /hospital\|clinic\|doctors/);
  assert.match(facilityQuery(facilityRegion), /"military"/);
});
test('ambiguous polygon-to-row joins never duplicate district burden or override mismatched codes', () => {
  const ambiguous = [
    { ...features[0], properties: { district: 'A', district_code: '1' } },
    { ...features[1], properties: { district: 'A', district_code: '2' } },
  ];
  const uncoded = [{ district: 'A', year: 2025, cases: 100, population: 1000 }];
  assert.equal(
    mapStatistics(ambiguous, uncoded, 2025, 'cases', 'Random Forest', thresholds, null).knownValues,
    0,
  );
  assert.equal(
    comparisonRows(ambiguous, uncoded, 2025, 2025, 'cases', 'Random Forest', thresholds)[0].valueA,
    null,
  );
  assert.equal(
    mapStatistics(
      [{ ...features[0], properties: { district: 'A', district_code: '9' } }],
      rows,
      2025,
      'cases',
      'Random Forest',
      thresholds,
      null,
    ).knownValues,
    0,
  );
});
test('viewport intersection excludes a hole even when the polygon extent overlaps the view', () => {
  const donut: MapFeature = {
    type: 'Feature',
    properties: { district: 'A' },
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [138, -4],
          [141, -4],
          [141, -1],
          [138, -1],
          [138, -4],
        ],
        [
          [139, -3],
          [139, -2],
          [140, -2],
          [140, -3],
          [139, -3],
        ],
      ],
    },
  };
  const stats = mapStatistics([donut], rows, 2025, 'cases', 'Random Forest', thresholds, {
    west: 139.1,
    east: 139.9,
    south: -2.9,
    north: -2.1,
  });
  assert.equal(stats.visibleDistricts, 0);
});
import { validateGeometry } from './geometry.ts';
test('administrative imports reject operational or military polygons before display', () => {
  assert.throws(
    () =>
      validateGeometry({
        type: 'FeatureCollection',
        features: [{ ...features[0], properties: { district: 'Military garrison' } }],
      }),
    /excluded/,
  );
  assert.throws(
    () =>
      validateGeometry({
        type: 'FeatureCollection',
        features: [{ ...features[0], properties: { district: 'A', deployment: 'sensitive' } }],
      }),
    /excluded/,
  );
  assert.equal(validateGeometry({ type: 'FeatureCollection', features }).features.length, 3);
});
