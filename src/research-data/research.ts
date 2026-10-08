import Papa from 'papaparse';
import type { Dataset } from '../store';
import type { Row } from '../analytics';
export const studyVersion = 'MALARIASCOPE-AMMM2026-v1';
export const studyModels = [
  'Persistence',
  'Ridge Regression — no climate',
  'Ridge Regression',
  'Random Forest',
  'Gradient Boosting',
] as const;
export const forecastCutpoints = [126.86557, 200.00036, 371.14424];
export type ResearchPackage = {
  manifest: any;
  registry: any;
  balanced: any[];
  spatial: any[];
  climate: any[];
  predictions: any[];
  errors: any[];
  intensity: any[];
  performance: any[];
  spatialResult: any;
  coverage: any;
  ledger: any[];
  status: any;
  uncertainty: any;
  geometry: any;
  geometryMetadata: any;
};
const files = {
  manifest: 'manifest.json',
  registry: 'district-registry.json',
  balanced: 'surveillance-balanced-2020-2025.csv',
  spatial: 'surveillance-2025-all-nine.csv',
  climate: 'climate-annual-2020-2025.csv',
  predictions: 'model-predictions-2025.csv',
  errors: 'model-errors-2025.csv',
  intensity: 'forecast-risk-2025.csv',
  performance: 'model-performance.json',
  spatialResult: 'spatial-analysis-2025.json',
  coverage: 'evidence-coverage.json',
  ledger: 'source-quality-ledger.json',
  status: 'system-evidence-status.json',
  uncertainty: 'uncertainty.json',
  geometry: 'papua-study-adm2.geojson',
  geometryMetadata: 'geometry-metadata.json',
};
export async function loadResearchPackage(fetcher: typeof fetch = fetch): Promise<ResearchPackage> {
  const pairs = await Promise.all(
    Object.entries(files).map(async ([key, name]) => {
      const response = await fetcher('/data/verified/' + name);
      if (!response.ok) throw Error(`Research file unavailable: ${name}`);
      const raw = await response.text();
      const hash = Array.from(
        new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw))),
      )
        .map((n) => n.toString(16).padStart(2, '0'))
        .join('');
      const parsed = name.endsWith('.csv')
        ? Papa.parse(raw, { header: true, dynamicTyping: true, skipEmptyLines: 'greedy' })
        : null;
      if (parsed?.errors.length) throw Error(`Research CSV invalid: ${name}`);
      return { key, name, hash, value: parsed ? parsed.data : JSON.parse(raw) };
    }),
  );
  const manifest = pairs.find((p) => p.key === 'manifest')!.value;
  for (const entry of pairs.filter((p) => p.key !== 'manifest'))
    if (manifest.files.find((f: any) => f.name === entry.name)?.sha256 !== entry.hash)
      throw Error(`Research checksum mismatch: ${entry.name}`);
  const result = Object.fromEntries(pairs.map((p) => [p.key, p.value])) as ResearchPackage;
  if (
    result.balanced.length !== 48 ||
    result.spatial.length !== 9 ||
    result.climate.length !== 48 ||
    result.predictions.length !== 8
  )
    throw Error('Research package row counts do not match declared coverage.');
  for (const [year, total] of Object.entries(manifest.integrityTotals))
    if (
      result.balanced
        .filter((r) => r.year === Number(year))
        .reduce((sum, r) => sum + r.cases, 0) !== total
    )
      throw Error('Research annual total mismatch: ' + year);
  for (const field of ['cases', 'at_risk_population'])
    if (result.spatial.reduce((sum, r) => sum + r[field], 0) !== manifest.allNineTotals[field])
      throw Error('All-nine total mismatch: ' + field);
  return result;
}
export const builtin = (id: string) => id.startsWith('study-');
export function getDistrictObservation(
  p: ResearchPackage,
  district: string,
  year: number,
  spatial = false,
) {
  return (
    spatial ? p.spatial : [...p.balanced, ...p.spatial.filter((r) => r.district === 'Supiori')]
  ).find((r) => r.district === district && Number(r.year) === year);
}
export function getDistrictClimate(p: ResearchPackage, district: string, year: number) {
  return p.climate.find((r) => r.district === district && r.year === year);
}
export function getModelPrediction(p: ResearchPackage, district: string, model: string) {
  const r = p.predictions.find((r) => r.district === district);
  const key = (
    {
      Persistence: 'persistence',
      'Ridge Regression — no climate': 'ridge_no_climate',
      'Ridge Regression': 'ridge_climate',
      'Random Forest': 'random_forest',
      'Gradient Boosting': 'gradient_boosting',
    } as Record<string, string>
  )[model];
  return r && key ? Number(r[key]) : null;
}
export function getObservedApi(p: ResearchPackage, district: string, year = 2025) {
  if (year !== 2025) return null;
  return p.spatial.find((r) => r.district === district)?.observed_api ?? null;
}
export function getForecastIntensity(p: ResearchPackage, district: string) {
  return p.intensity.find((r) => r.district === district) ?? null;
}
export function getEvidenceCoverage(p: ResearchPackage) {
  return p.coverage;
}
export function getSourceIssues(p: ResearchPackage, district?: string) {
  return p.ledger.filter(
    (r) =>
      !district ||
      (!r.id.startsWith('SUPIORI') && !r.id.startsWith('BIAK')) ||
      (r.id.startsWith('SUPIORI') && district === 'Supiori') ||
      (r.id.startsWith('BIAK') && district === 'Biak Numfor'),
  );
}
export function getModelMetrics(p: ResearchPackage, model: string, year = 2025) {
  return p.performance.find((r) => r.model === model && r.year === year) ?? null;
}
export function researchRows(p: ResearchPackage, model: string, allNine = false): Row[] {
  const base = allNine
    ? [...p.balanced, ...p.spatial.filter((r) => r.district === 'Supiori')]
    : p.balanced;
  return base.map((r) => {
    const climate = getDistrictClimate(p, r.district, r.year),
      spatial = p.spatial.find((s) => s.district === r.district && s.year === r.year),
      registry = p.registry.districts.find((d: any) => d.canonicalName === r.district);
    return {
      district: r.district,
      year: Number(r.year),
      cases: Number(r.cases),
      district_code: registry?.code,
      ...(spatial
        ? {
            population: Number(spatial.at_risk_population),
            incidence: Number(spatial.observed_api),
          }
        : {}),
      ...(climate
        ? {
            rainfall: climate.rainfall_mm,
            temperature: climate.mean_temperature_c,
            humidity: climate.humidity_pct,
          }
        : {}),
      ...(r.year === 2025 && getModelPrediction(p, r.district, model) !== null
        ? { prediction: getModelPrediction(p, r.district, model)!, model }
        : {}),
    };
  });
}
export function researchDatasets(p: ResearchPackage): Dataset[] {
  const fieldSource = (name: string) => ({
    name,
    source: 'Supplied study extraction; not independently audited · ' + name,
    checksum: p.manifest.files.find((f: any) => f.name === name).sha256,
  });
  const make = (id: string, name: string, rows: Row[], file: string): Dataset => ({
    id,
    name,
    rows,
    fieldSources: {
      cases: fieldSource(
        id === 'study-spatial'
          ? 'surveillance-2025-all-nine.csv'
          : 'surveillance-balanced-2020-2025.csv',
      ),
      population: fieldSource('surveillance-2025-all-nine.csv'),
      incidence: fieldSource('surveillance-2025-all-nine.csv'),
      rainfall: fieldSource('climate-annual-2020-2025.csv'),
      temperature: fieldSource('climate-annual-2020-2025.csv'),
      humidity: fieldSource('climate-annual-2020-2025.csv'),
      prediction: fieldSource('model-predictions-2025.csv'),
    },
    source: 'Supplied study extraction; not independently audited · ' + file,
    checksum: p.manifest.files.find((f: any) => f.name === file).sha256,
    created: '2026-10-07T00:00:00Z',
    classification: 'VERIFIED_RESEARCH_EXTRACTION',
  });
  return [
    make(
      'study-balanced',
      'Verified MALARIASCOPE Study — balanced 8-district panel',
      researchRows(p, '', false),
      'surveillance-balanced-2020-2025.csv',
    ),
    make(
      'study-spatial',
      'Verified MALARIASCOPE Study — all-nine spatial 2025',
      researchRows(p, '', true).filter((r) => r.year === 2025),
      'surveillance-2025-all-nine.csv',
    ),
    ...studyModels.map((m, i) =>
      make(
        'study-model-' + i,
        'Saved 2025 hindcast — ' + m,
        researchRows(p, m).filter((r) => r.year === 2025),
        'model-predictions-2025.csv',
      ),
    ),
  ];
}
