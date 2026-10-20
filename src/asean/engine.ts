import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import type { Row } from '../analytics.ts';

export const countries = [
  { code: 'BRN', name: 'Brunei Darussalam', center: [4.5, 114.7] },
  { code: 'KHM', name: 'Cambodia', center: [12.6, 104.9] },
  { code: 'IDN', name: 'Indonesia', center: [-2.5, 118] },
  { code: 'LAO', name: 'Lao PDR', center: [18.5, 103.8] },
  { code: 'MYS', name: 'Malaysia', center: [4.2, 109.5] },
  { code: 'MMR', name: 'Myanmar', center: [21.9, 96] },
  { code: 'PHL', name: 'Philippines', center: [12.8, 122] },
  { code: 'SGP', name: 'Singapore', center: [1.35, 103.82] },
  { code: 'THA', name: 'Thailand', center: [15.9, 101] },
  { code: 'TLS', name: 'Timor-Leste', center: [-8.8, 125.7] },
  { code: 'VNM', name: 'Viet Nam', center: [16, 107.5] },
] as const;
export type CountryCode = (typeof countries)[number]['code'];
export type Geometry = FeatureCollection<Polygon | MultiPolygon>;
export const presets = {
  asean: {
    label: 'ASEAN',
    bounds: [
      [-11.5, 92],
      [29, 142],
    ],
  },
  indonesia: {
    label: 'Indonesia',
    bounds: [
      [-11.5, 95],
      [6.5, 142],
    ],
  },
  papua: {
    label: 'Papua study',
    bounds: [
      [-5, 134],
      [-0.2, 141.2],
    ],
  },
  mekong: {
    label: 'Greater Mekong',
    bounds: [
      [8, 92],
      [29, 110],
    ],
  },
} as const;
export type Area = keyof typeof presets;
export const indicators = [
  {
    id: 'cases',
    title: 'Reported malaria cases',
    unit: 'cases',
    group: 'Malaria epidemiology',
    kind: 'Observed',
    field: 'cases',
  },
  {
    id: 'incidence',
    title: 'Incidence',
    unit: 'per 1,000 at risk',
    group: 'Malaria epidemiology',
    kind: 'Derived',
    field: 'incidence',
  },
  {
    id: 'deaths',
    title: 'Malaria deaths',
    unit: 'deaths',
    group: 'Malaria epidemiology',
    kind: 'Observed',
    field: null,
  },
  {
    id: 'positivity',
    title: 'Test positivity',
    unit: '%',
    group: 'Malaria epidemiology',
    kind: 'Observed',
    field: null,
  },
  {
    id: 'rainfall',
    title: 'Annual rainfall',
    unit: 'mm/year',
    group: 'Climate',
    kind: 'Observed',
    field: 'rainfall',
  },
  {
    id: 'temperature',
    title: 'Mean temperature',
    unit: '°C',
    group: 'Climate',
    kind: 'Observed',
    field: 'temperature',
  },
  {
    id: 'humidity',
    title: 'Relative humidity',
    unit: '%',
    group: 'Climate',
    kind: 'Observed',
    field: 'humidity',
  },
  {
    id: 'population',
    title: 'Population at risk',
    unit: 'people',
    group: 'Environment',
    kind: 'Observed',
    field: 'population',
  },
  {
    id: 'ndvi',
    title: 'Vegetation index (NDVI)',
    unit: 'index',
    group: 'Environment',
    kind: 'Observed',
    field: null,
  },
  {
    id: 'facilities',
    title: 'Health facilities',
    unit: 'facilities',
    group: 'Health infrastructure',
    kind: 'Observed',
    field: null,
  },
  {
    id: 'prediction',
    title: 'Retrospective model output',
    unit: 'predicted cases',
    group: 'Model intelligence',
    kind: 'Model prediction',
    field: 'prediction',
  },
  {
    id: 'uncertainty',
    title: 'Prediction intervals',
    unit: 'cases',
    group: 'Model intelligence',
    kind: 'Model prediction',
    field: null,
  },
] as const;
export type Indicator = (typeof indicators)[number]['id'];
export const indicatorInfo = (id: Indicator) => indicators.find((i) => i.id === id)!;
export type Filters = {
  area: Area;
  countries: CountryCode[];
  district: string;
  indicator: Indicator;
  year: number;
  compareYear: number;
  model: string;
  visible: boolean;
  boundaries: boolean;
  opacity: number;
  order: 'thematic' | 'boundaries';
  camera: [number, number, number] | null;
};
export const models = [
  'Persistence',
  'Ridge Regression — no climate',
  'Ridge Regression',
  'Random Forest',
  'Gradient Boosting',
];
const boundedYear = (value: string | null, fallback: number) =>
  value && /^\d{4}$/.test(value) && +value >= 1900 && +value <= 2100 ? +value : fallback;
export function readFilters(p: URLSearchParams): Filters {
  const opacity = p.get('aOpacity');
  const camera = p.get('aCamera')?.split(',').map(Number);
  return {
    area: Object.hasOwn(presets, p.get('aArea') || '') ? (p.get('aArea') as Area) : 'asean',
    countries: countries
      .filter((c) => p.get('aCountries')?.split(',').includes(c.code))
      .map((c) => c.code),
    district: (p.get('aDistrict') || '').slice(0, 120),
    indicator: indicators.some((i) => i.id === p.get('aIndicator'))
      ? (p.get('aIndicator') as Indicator)
      : 'cases',
    year: boundedYear(p.get('aYear'), 2025),
    compareYear: boundedYear(p.get('aCompare'), 2024),
    model: models.includes(p.get('aModel') || '') ? p.get('aModel')! : 'Random Forest',
    visible: p.get('aVisible') !== '0',
    boundaries: p.get('aBoundaries') !== '0',
    opacity:
      opacity !== null && opacity.trim() !== '' && Number.isFinite(+opacity)
        ? Math.min(1, Math.max(0, +opacity))
        : 0.8,
    order: p.get('aOrder') === 'boundaries' ? 'boundaries' : 'thematic',
    camera:
      camera?.length === 3 &&
      camera.every(Number.isFinite) &&
      Math.abs(camera[0]) <= 85 &&
      Math.abs(camera[1]) <= 180 &&
      camera[2] >= 2 &&
      camera[2] <= 16
        ? (camera as [number, number, number])
        : null,
  };
}
export function writeFilters(f: Filters, original = new URLSearchParams()) {
  const p = new URLSearchParams(original);
  const values = {
    aArea: f.area,
    aCountries: f.countries.join(','),
    aDistrict: f.district,
    aIndicator: f.indicator,
    aYear: f.year,
    aCompare: f.compareYear,
    aModel: f.model,
    aVisible: f.visible ? '1' : '0',
    aBoundaries: f.boundaries ? '1' : '0',
    aOpacity: f.opacity,
    aOrder: f.order,
    aCamera: f.camera?.join(',') || '',
  };
  Object.entries(values).forEach(([k, v]) => p.set(k, String(v)));
  return p;
}
export function valueFor(row: Row | undefined, indicator: Indicator): number | null {
  if (!row) return null;
  let value: unknown;
  if (indicator === 'incidence') {
    value =
      Number.isFinite(row.population) && row.population! > 0 && Number.isFinite(row.cases)
        ? (row.cases / row.population!) * 1000
        : row.incidence;
  } else {
    const field = indicatorInfo(indicator).field;
    value = field ? row[field] : null;
  }
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
export function scopedRows(rows: Row[], f: Filters, year = f.year) {
  if (f.area !== 'papua' || (f.countries.length && !f.countries.includes('IDN'))) return [];
  return rows.filter((r) => r.year === year && (!f.district || r.district === f.district));
}
export function availableYears(rows: Row[], f: Filters) {
  if (f.area !== 'papua' || (f.countries.length && !f.countries.includes('IDN'))) return [];
  return [
    ...new Set(
      rows
        .filter(
          (r) => (!f.district || r.district === f.district) && valueFor(r, f.indicator) !== null,
        )
        .map((r) => r.year),
    ),
  ].sort((a, b) => a - b);
}
export const formatValue = (value: number | null) =>
  value === null ? 'Unavailable' : value.toLocaleString('en-GB', { maximumFractionDigits: 2 });
export const colors = ['#d3eeef', '#8dcdd0', '#48a9b5', '#247891', '#164d70'];
export const missingColor = '#c8cdd3';
export function breaksFor(values: number[]) {
  if (!values.length) return [];
  const min = Math.min(...values),
    max = Math.max(...values);
  return min === max
    ? [min]
    : Array.from({ length: 4 }, (_, i) => min + ((max - min) * (i + 1)) / 5);
}
export function colorFor(value: number | null, breaks: number[]) {
  return value === null
    ? missingColor
    : colors[Math.min(breaks.filter((b) => value > b).length, 4)];
}
export function exportRecords(rows: Row[], f: Filters, version: string) {
  if (f.area !== 'papua')
    return countries
      .filter((c) => !f.countries.length || f.countries.includes(c.code))
      .map((c) => ({
        country: c.name,
        country_code: c.code,
        geographic_scope: 'Country; national observations not connected',
        district: '',
        year: f.year,
        indicator: f.indicator,
        value: null as number | null,
        unit: indicatorInfo(f.indicator).unit,
        classification: 'UNAVAILABLE',
        model: '',
        version,
        source: 'No national epidemiology source connected',
        license: 'No observations to redistribute',
        limitation: 'Papua study records are not national estimates',
      }));
  return scopedRows(rows, f).map((r) => ({
    country: 'Indonesia',
    country_code: 'IDN',
    geographic_scope: 'Papua study ADM2 only',
    district: r.district,
    year: r.year,
    indicator: f.indicator,
    value: valueFor(r, f.indicator),
    unit: indicatorInfo(f.indicator).unit,
    classification:
      valueFor(r, f.indicator) === null ? 'UNAVAILABLE' : indicatorInfo(f.indicator).kind,
    model: f.indicator === 'prediction' ? f.model : '',
    version,
    source: 'Supplied research extraction; underlying reports not independently audited',
    license: 'Research source redistribution license not specified by supplier',
    limitation: 'Retrospective research; no operational validation; no national aggregation',
  }));
}
const csvCell = (value: unknown) =>
  '"' +
  String(value ?? '')
    .replace(/^[=+\-@]/, "'$&")
    .replaceAll('"', '""') +
  '"';
export function recordsCSV(records: ReturnType<typeof exportRecords>) {
  const columns = [
    'country',
    'country_code',
    'geographic_scope',
    'district',
    'year',
    'indicator',
    'value',
    'unit',
    'classification',
    'model',
    'version',
    'source',
    'license',
    'limitation',
  ] as const;
  return [
    columns.join(','),
    ...records.map((r) => columns.map((key) => csvCell(r[key])).join(',')),
  ].join('\n');
}
export function filteredGeometry(
  geometry: Geometry,
  rows: Row[],
  f: Filters,
  version: string,
): Geometry {
  const records = exportRecords(rows, f, version);
  return {
    type: 'FeatureCollection',
    features: geometry.features
      .filter((feature) =>
        f.area === 'papua'
          ? (!f.countries.length || f.countries.includes('IDN')) &&
            (!f.district ||
              feature.properties?.name === f.district ||
              feature.properties?.district === f.district)
          : !f.countries.length || f.countries.includes(feature.properties?.['ISO3166-1-Alpha-3']),
      )
      .map((feature) => {
        const record = records.find((r) =>
          f.area === 'papua'
            ? r.district === (feature.properties?.district || feature.properties?.name)
            : r.country_code === feature.properties?.['ISO3166-1-Alpha-3'],
        );
        return {
          ...feature,
          properties: {
            ...feature.properties,
            year: f.year,
            indicator: f.indicator,
            unit: indicatorInfo(f.indicator).unit,
            version,
            geographic_scope: f.area === 'papua' ? 'Papua study ADM2 only' : 'Country context only',
            source: 'No observation connected for selected geography and reporting period',
            ...record,
            value: record?.value ?? null,
            classification: record?.classification ?? 'UNAVAILABLE',
            boundary_source:
              f.area === 'papua'
                ? 'geoBoundaries IDN ADM2; BPS/WFP/OCHA; CC BY 3.0 IGO; vintage 2020; release 9469f09'
                : 'Natural Earth via datasets/geo-countries; public domain; ca3b7150caa5d3cc3fb108a87fc6e3d57bd97d99',
          },
        };
      }),
  };
}
