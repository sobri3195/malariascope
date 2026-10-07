import { normalize, type Row } from './analytics.ts';
import { resolveDistrict } from './district-registry.ts';
export const sourceSchemas = {
  population: ['district', 'year', 'population'],
  'climate-observations': ['district', 'year'],
  'model-predictions': [
    'district',
    'year',
    'model',
    'prediction',
    'trainingPeriod',
    'validationPeriod',
    'outputClassification',
  ],
  'district-risk': ['district', 'year', 'risk', 'score', 'method', 'outputClassification'],
} as const;
export type ScientificKind = keyof typeof sourceSchemas;
export type ScientificRecord = {
  district: string;
  district_code?: string;
  year: number;
  population?: number;
  rainfall?: number;
  temperature?: number;
  humidity?: number;
  model?: string;
  prediction?: number;
  trainingPeriod?: string;
  validationPeriod?: string;
  outputClassification?: string;
  risk?: string;
  score?: number;
  method?: string;
};
export type ScientificSource = {
  id: string;
  kind: ScientificKind;
  name: string;
  source: string;
  checksum: string;
  created: string;
  records: ScientificRecord[];
  classification: 'USER IMPORT';
};
export function validateScientific(kind: ScientificKind, input: Record<string, unknown>[]) {
  if (!input.length) throw Error('Dataset not connected — zero observations.');
  const seen = new Set<string>();
  return input.map((r, index) => {
    const fail = (message: string): never => {
      throw Error(`Row ${index + 1}: ${message}`);
    };
    for (const field of sourceSchemas[kind])
      if (r[field] === undefined || r[field] === null || String(r[field]).trim() === '')
        fail(`Missing ${field}`);
    if (typeof r.district !== 'string' || !normalize(r.district) || r.district.length > 100)
      fail('Invalid district');
    const year = Number(r.year);
    if (!Number.isInteger(year) || year < 1900 || year > 2100) fail('Invalid year');
    const row: ScientificRecord = { district: String(r.district).trim(), year };
    if (r.district_code) row.district_code = String(r.district_code).trim();
    const fields =
      kind === 'population'
        ? ['population']
        : kind === 'climate-observations'
          ? ['rainfall', 'temperature', 'humidity']
          : kind === 'model-predictions'
            ? ['prediction']
            : ['score'];
    if (
      kind === 'climate-observations' &&
      !fields.some((f) => r[f] !== undefined && r[f] !== null && String(r[f]).trim() !== '')
    )
      fail('At least one climate variable is required');
    for (const field of fields) {
      if (r[field] === undefined || r[field] === null || String(r[field]).trim() === '') continue;
      const value = Number(r[field]);
      if (
        !['string', 'number'].includes(typeof r[field]) ||
        !Number.isFinite(value) ||
        (field === 'population' && value <= 0) ||
        (field !== 'temperature' && value < 0) ||
        (field === 'humidity' && value > 100)
      )
        fail(`Invalid ${field}`);
      (row as any)[field] = value;
    }
    for (const field of [
      'model',
      'trainingPeriod',
      'validationPeriod',
      'outputClassification',
      'risk',
      'method',
    ])
      if (r[field] !== undefined) (row as any)[field] = String(r[field]).trim();
    if (
      kind === 'model-predictions' &&
      !['Persistence', 'Ridge Regression', 'Random Forest', 'Gradient Boosting'].includes(
        row.model!,
      )
    )
      fail('Unsupported model');
    if (kind === 'district-risk' && !['LOW', 'MODERATE', 'HIGH', 'VERY HIGH'].includes(row.risk!))
      fail('Invalid risk category');
    const key = `${row.district_code || normalize(row.district)}|${year}|${row.model || ''}`;
    if (seen.has(key)) fail('Duplicate district-year-model observation');
    seen.add(key);
    return row;
  });
}
// Supplements never create observed cases. Duplicate/conflicting source values are withheld.
// This projection is used only by GIS; original records and output classifications stay separate.
export function gisRows(observed: Row[], sources: ScientificSource[], model: string) {
  const result = observed.map((r) => ({ ...r }));
  const relevant = sources.filter((s) => s.kind !== 'district-risk');
  const candidates = relevant.flatMap((s) =>
    s.records.filter((r) => !r.model || r.model === model),
  );
  const cohorts = new Map<number, Row[]>();
  for (const row of result) {
    const cohort = cohorts.get(row.year) || [];
    cohort.push(row);
    cohorts.set(row.year, cohort);
  }
  for (const row of candidates) {
    const cohort = cohorts.get(row.year) || [];
    const matches = resolveDistrict(
      { canonicalName: row.district, code: row.district_code, aliases: [] },
      cohort,
    );
    if (matches.status.startsWith('Manual')) continue;
    if (!matches.row) {
      const projected = {
        district: row.district,
        district_code: row.district_code,
        year: row.year,
        cases: NaN,
      };
      result.push(projected);
      cohort.push(projected);
      cohorts.set(row.year, cohort);
    }
  }
  // Resolve each supplemental record once, rather than repeating a full join per field/row.
  const joined = new Map<Row, ScientificRecord[]>();
  for (const candidate of candidates) {
    const match = resolveDistrict(
      { canonicalName: candidate.district, code: candidate.district_code, aliases: [] },
      cohorts.get(candidate.year) || [],
    ).row;
    if (!match) continue;
    const inputs = joined.get(match) || [];
    inputs.push(candidate);
    joined.set(match, inputs);
  }
  for (const row of result) {
    const matches = joined.get(row) || [];
    for (const field of [
      'population',
      'rainfall',
      'temperature',
      'humidity',
      'prediction',
    ] as const) {
      const values = matches.map((r) => r[field]).filter((v): v is number => Number.isFinite(v));
      if (field === 'prediction' && row.model && row.model !== model) delete row.prediction;
      if (!Number.isFinite(row[field]) && new Set(values).size === 1) {
        row[field] = values[0];
        if (field === 'prediction') row.model = model;
      }
    }
  }
  return result;
}
