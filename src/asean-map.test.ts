import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  availableYears,
  colorFor,
  countries,
  exportRecords,
  filteredGeometry,
  missingColor,
  readFilters,
  recordsCSV,
  scopedRows,
  valueFor,
  writeFilters,
  type Geometry,
} from './asean/engine.ts';
import type { Row } from './analytics.ts';

const rows: Row[] = [
  { district: 'A', year: 2020, cases: 0, population: 1000, rainfall: 100 },
  { district: 'A', year: 2022, cases: 20, population: 1000, rainfall: 110 },
  {
    district: 'A',
    year: 2025,
    cases: 30,
    population: 1000,
    prediction: 26,
    model: 'Random Forest',
  },
  { district: 'B', year: 2025, cases: 10 },
];
const papua = { ...readFilters(new URLSearchParams()), area: 'papua' as const };
test('eleven ASEAN members, including Timor-Leste; PNG is never included', () => {
  assert.equal(countries.length, 11);
  assert.equal(new Set(countries.map((c) => c.code)).size, 11);
  assert.ok(countries.some((c) => c.code === 'TLS'));
  assert.ok(!countries.some((c) => String(c.code) === 'PNG'));
});
test('bundled country geometry has exactly the membership and the declared checksum', () => {
  const raw = readFileSync(
    new URL('../public/data/geography/asean-countries.geojson', import.meta.url),
  );
  const metadata = JSON.parse(
    readFileSync(new URL('../public/data/geography/asean-metadata.json', import.meta.url), 'utf8'),
  );
  const geometry: Geometry = JSON.parse(raw.toString());
  assert.equal(createHash('sha256').update(raw).digest('hex'), metadata.sha256);
  assert.ok(raw.length <= 1_100_000, 'Regional country geometry exceeds the 1.1 MB budget');
  assert.deepEqual(
    geometry.features.map((f) => f.properties?.['ISO3166-1-Alpha-3']).sort(),
    countries.map((c) => c.code).sort(),
  );
  assert.equal(metadata.license, 'Public domain');
  assert.equal(metadata.crs, 'EPSG:4326');
});
test('untrusted URL filters reject unknown identities, models, invalid periods and camera', () => {
  const f = readFilters(
    new URLSearchParams(
      'aArea=__proto__&aCountries=PNG,THA,THA,IDN&aIndicator=secret&aYear=2025.5&aOpacity=NaN&aCamera=90,400,99&aModel=Unknown',
    ),
  );
  assert.equal(f.area, 'asean');
  assert.deepEqual(f.countries, ['IDN', 'THA']);
  assert.equal(f.indicator, 'cases');
  assert.equal(f.year, 2025);
  assert.equal(f.opacity, 0.8);
  assert.equal(f.model, 'Random Forest');
  assert.equal(f.camera, null);
});
test('URL roundtrip preserves unrelated workspace context and all map controls', () => {
  const f = {
    ...papua,
    countries: ['IDN' as const],
    district: 'Kota Jayapura',
    year: 2022,
    visible: false,
    order: 'boundaries' as const,
    camera: [-2, 138, 8] as [number, number, number],
  };
  const p = writeFilters(f, new URLSearchParams('year=2024&dataset=user-upload'));
  assert.equal(p.get('dataset'), 'user-upload');
  assert.equal(p.get('year'), '2024');
  assert.deepEqual(readFilters(p), f);
});
test('true zero differs from missing observation or missing indicator', () => {
  assert.equal(valueFor(rows[0], 'cases'), 0);
  assert.equal(valueFor(undefined, 'cases'), null);
  assert.equal(valueFor(rows[3], 'rainfall'), null);
  assert.equal(valueFor(rows[0], 'deaths'), null);
  assert.equal(colorFor(null, [1, 2]), missingColor);
  assert.notEqual(colorFor(0, [1, 2]), missingColor);
});
test('incidence uses a valid denominator; unavailable and infinite inputs stay unavailable', () => {
  assert.equal(valueFor(rows[1], 'incidence'), 20);
  assert.equal(valueFor(rows[3], 'incidence'), null);
  assert.equal(valueFor({ ...rows[1], population: 0, incidence: 12 }, 'incidence'), 12);
  assert.equal(valueFor({ ...rows[1], cases: Infinity }, 'cases'), null);
});
test('national scope never aggregates the Papua study as country or ASEAN totals', () => {
  const f = readFilters(new URLSearchParams());
  assert.deepEqual(scopedRows(rows, f), []);
  const records = exportRecords(rows, f, 'v1');
  assert.equal(records.length, 11);
  assert.ok(records.every((r) => r.value === null && r.classification === 'UNAVAILABLE'));
});
test('country and district filters apply equally to data, available periods and exports', () => {
  const f = { ...papua, countries: ['IDN' as const], district: 'A' };
  assert.equal(scopedRows(rows, f).length, 1);
  assert.deepEqual(availableYears(rows, f), [2020, 2022, 2025]);
  assert.deepEqual(availableYears(rows, { ...f, indicator: 'prediction' }), [2025]);
  assert.deepEqual(availableYears(rows, { ...f, indicator: 'deaths' }), []);
  assert.deepEqual(scopedRows(rows, { ...f, countries: ['THA'] }), []);
  assert.deepEqual(availableYears(rows, { ...f, countries: ['THA'] }), []);
  assert.equal(exportRecords(rows, f, 'v1')[0].value, 30);
});
test('CSV keeps zero, leaves missing values blank and includes source/units/version', () => {
  const records = exportRecords(rows, { ...papua, year: 2020 }, 'study-v1');
  const csv = recordsCSV(records);
  assert.match(csv, /"0"/);
  assert.match(csv, /study-v1/);
  assert.match(csv, /source,license,limitation/);
  const missing = exportRecords(rows, { ...papua, district: 'B', indicator: 'rainfall' }, 'v1');
  assert.equal(missing[0].value, null);
  assert.match(recordsCSV(missing), /"rainfall","","mm\/year","UNAVAILABLE"/);
});
test('CSV escapes injected formulas and quoted names', () => {
  const output = recordsCSV(
    exportRecords([{ ...rows[0], district: '=HYPERLINK("bad")' }], { ...papua, year: 2020 }, 'v1'),
  );
  assert.match(output, /'=HYPERLINK\(""bad""\)/);
});
test('GeoJSON exports the exact filtered geography, selected value and boundary attribution', () => {
  const geometry: Geometry = {
    type: 'FeatureCollection',
    features: ['A', 'B'].map((name) => ({
      type: 'Feature',
      properties: { name },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [138, -3],
            [139, -3],
            [139, -2],
            [138, -3],
          ],
        ],
      },
    })),
  };
  const output = filteredGeometry(
    geometry,
    rows,
    { ...papua, district: 'B', indicator: 'rainfall' },
    'v1',
  );
  assert.equal(output.features.length, 1);
  assert.equal(output.features[0].properties?.name, 'B');
  assert.equal(output.features[0].properties?.value, null);
  assert.match(output.features[0].properties?.boundary_source, /CC BY 3.0 IGO/);
  assert.equal(geometry.features[1].properties?.value, undefined);
  const missingYear = filteredGeometry(geometry, rows, { ...papua, year: 2023 }, 'v1');
  assert.equal(missingYear.features[0].properties?.value, null);
  assert.equal(missingYear.features[0].properties?.year, 2023);
  assert.equal(missingYear.features[0].properties?.unit, 'cases');
  assert.equal(missingYear.features[0].properties?.version, 'v1');
});
