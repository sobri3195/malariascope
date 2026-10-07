import { normalize } from './analytics.ts';
import { validateGeometry } from './geometry.ts';
import { adjacencyGraph } from './hotspot-spatial.ts';
import { featureIdentity, type MapFeature } from './map-intelligence.ts';
export const severities = ['INFO', 'WARNING', 'ERROR', 'BLOCKING'] as const;
export type IntegritySeverity = (typeof severities)[number];
export type IntegrityDataset = {
  id: string;
  name: string;
  source: string;
  checksum: string;
  created: string;
  classification?: string;
  rows: unknown;
  sourceRows?: unknown;
};
export const integrityFields = [
  'district',
  'year',
  'cases',
  'population',
  'rainfall',
  'temperature',
  'humidity',
  'prediction',
  'model',
] as const;
export const integrityPolicy = Object.freeze({
  version: 1,
  minYear: 1900,
  maxYear: 2100,
  incidenceTolerance: 0.1,
  abruptChangePercent: 100,
  staleDays: 365,
  surveillanceLagYears: 2,
});
export type IntegrityIssue = {
  id: string;
  datasetId: string;
  dataset: string;
  row: number | null;
  field: string;
  code: string;
  issue: string;
  severity: IntegritySeverity;
  action: string;
};
export type ScoreComponent = {
  name: string;
  weight: number;
  numerator: number;
  denominator: number;
  percent: number | null;
  contribution: number;
  definition: string;
};
export type Eligibility = {
  analysis: string;
  eligible: boolean;
  reasons: string[];
  usable: number;
  total: number;
};
const missing = (value: unknown) =>
  value === undefined || value === null || (typeof value === 'string' && !value.trim());
const number = (value: unknown) =>
  !missing(value) &&
  (typeof value === 'number' || typeof value === 'string') &&
  Number.isFinite(Number(value))
    ? Number(value)
    : null;
const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null);
const name = (value: unknown) => (text(value) ? normalize(text(value)!) : null);
const object = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
const stable = (value: unknown): string =>
  Array.isArray(value)
    ? '[' + value.map(stable).join(',') + ']'
    : object(value)
      ? '{' +
        Object.keys(value as object)
          .sort()
          .map((key) => JSON.stringify(key) + ':' + stable((value as Record<string, unknown>)[key]))
          .join(',') +
        '}'
      : String(JSON.stringify(value));
function component(
  name: string,
  weight: number,
  numerator: number,
  denominator: number,
  definition: string,
): ScoreComponent {
  const percent = denominator > 0 ? (100 * numerator) / denominator : null;
  return {
    name,
    weight,
    numerator,
    denominator,
    percent,
    contribution: (weight * (percent ?? 0)) / 100,
    definition,
  };
}
export function inspectIntegrityGeometry(geometry: unknown) {
  if (!geometry)
    return {
      features: [] as MapFeature[],
      valid: false,
      error: 'Administrative GIS geometry is not connected',
      neighbors: {} as Record<string, string[]>,
    };
  try {
    validateGeometry(geometry);
    const features = (geometry as { features: MapFeature[] }).features;
    return { features, valid: true, error: null, neighbors: adjacencyGraph(features) };
  } catch (error) {
    return {
      features: [] as MapFeature[],
      valid: false,
      error: error instanceof Error ? error.message : 'Invalid administrative geometry',
      neighbors: {} as Record<string, string[]>,
    };
  }
}
export type IntegrityGeometry = ReturnType<typeof inspectIntegrityGeometry>;
export function inspectDataset(
  dataset: IntegrityDataset,
  geometry: IntegrityGeometry,
  options: { year: number; model: string; now: string },
) {
  const issues: IntegrityIssue[] = [];
  function add(
    row: number | null,
    field: string,
    code: string,
    severity: IntegritySeverity,
    issue: string,
    action: string,
  ) {
    issues.push({
      id: `${dataset.id}:${row ?? 'dataset'}:${code}:${issues.length}`,
      datasetId: dataset.id,
      dataset: dataset.name,
      row,
      field,
      code,
      severity,
      issue,
      action,
    });
  }
  const loadedRows = Array.isArray(dataset.rows) ? dataset.rows : [];
  const raw = Array.isArray(dataset.sourceRows) ? dataset.sourceRows : loadedRows;
  if (!Array.isArray(dataset.rows))
    add(
      null,
      'rows',
      'schema-rows',
      'BLOCKING',
      'Dataset rows must be an array.',
      'Restore the observation array from the original source and re-import.',
    );
  if (dataset.sourceRows !== undefined && !Array.isArray(dataset.sourceRows))
    add(
      null,
      'sourceRows',
      'schema-original',
      'BLOCKING',
      'Preserved original rows have an invalid schema.',
      'Restore the original source snapshot; do not replace it with cleaned rows.',
    );
  if (Array.isArray(dataset.sourceRows) && raw.length !== loadedRows.length)
    add(
      null,
      'sourceRows',
      'original-count',
      'BLOCKING',
      `Original row count ${raw.length} differs from loaded row count ${loadedRows.length}.`,
      'Reconcile all original records with loaded observations before analysis.',
    );
  if (!raw.length)
    add(
      null,
      'rows',
      'empty',
      'BLOCKING',
      'No observation rows are loaded.',
      'Import a source dataset with district, year, and observed cases.',
    );
  const known = new Set([
    ...integrityFields,
    'district_code',
    'region',
    'incidence',
    'latitude',
    'longitude',
    'lat',
    'lon',
    'lng',
  ]);
  const exact = new Map<string, number[]>(),
    keys = new Map<string, number[]>(),
    identities = new Map<string, { name: string; code: string | null; rows: number[] }>(),
    nameCodes = new Map<string, Set<string>>();
  const rows = raw.map((value, i) => {
    const row = i + 1,
      r = object(value);
    if (!r) {
      add(
        row,
        'row',
        'schema-object',
        'BLOCKING',
        'Observation is not a row object.',
        'Restore the original structured observation.',
      );
      return {
        row,
        r: {},
        district: null,
        code: null,
        identity: null,
        year: null,
        cases: null,
        population: null,
        prediction: null,
        model: null,
        incidence: null,
      };
    }
    const district = text(r.district),
      districtName = name(r.district),
      code = missing(r.district_code)
        ? null
        : typeof r.district_code === 'string' || typeof r.district_code === 'number'
          ? String(r.district_code).trim()
          : null;
    const year = number(r.year),
      cases = number(r.cases),
      population = number(r.population),
      prediction = number(r.prediction),
      incidence = number(r.incidence),
      model = text(r.model);
    const identity = code ? `code:${code}` : districtName ? `name:${districtName}` : null;
    for (const field of integrityFields) {
      if (missing(r[field]))
        add(
          row,
          field,
          'missing-' + field,
          ['district', 'year', 'cases'].includes(field)
            ? 'BLOCKING'
            : field === 'model' && !missing(r.prediction)
              ? 'ERROR'
              : field === 'model'
                ? 'INFO'
                : 'WARNING',
          `Missing ${field}.`,
          ['district', 'year', 'cases'].includes(field)
            ? 'Recover the required value from the source; do not impute or drop the row.'
            : `Retrieve ${field} if available, otherwise preserve its unavailable status.`,
        );
    }
    if (!missing(r.district) && (!district || !districtName || district.length > 100))
      add(
        row,
        'district',
        'schema-district',
        'BLOCKING',
        'District must be nonempty text up to 100 characters.',
        'Confirm the official district identity and re-import.',
      );
    if (
      !missing(r.year) &&
      (year === null ||
        !Number.isInteger(year) ||
        year < integrityPolicy.minYear ||
        year > integrityPolicy.maxYear)
    )
      add(
        row,
        'year',
        'unsupported-year',
        'BLOCKING',
        `Unsupported year; expected integer ${integrityPolicy.minYear}–${integrityPolicy.maxYear}.`,
        'Check the surveillance year and supported schema; do not coerce an unknown period.',
      );
    if (year !== null && year > new Date(options.now).getUTCFullYear() && year <= 2100)
      add(
        row,
        'year',
        'future-year',
        'WARNING',
        `Observation year ${year} is in the future relative to the inspection date.`,
        'Confirm whether this is a prediction; keep observed and forecast periods separate.',
      );
    if (!missing(r.cases) && (cases === null || !Number.isSafeInteger(cases)))
      add(
        row,
        'cases',
        'schema-cases',
        'BLOCKING',
        'Observed cases must be a finite safe integer.',
        'Confirm the count and units in the original source.',
      );
    for (const field of [
      'cases',
      'population',
      'rainfall',
      'temperature',
      'humidity',
      'prediction',
      'incidence',
    ] as const) {
      const n = number(r[field]);
      if (missing(r[field])) continue;
      if (n === null)
        add(
          row,
          field,
          'schema-' + field,
          field === 'cases' ? 'BLOCKING' : 'ERROR',
          `${field} must be a finite number; booleans and objects are unsupported.`,
          'Correct the source field type or mark an unknown value unavailable.',
        );
      else if (field !== 'temperature' && n < 0)
        add(
          row,
          field,
          'negative-' + field,
          field === 'cases' ? 'BLOCKING' : 'ERROR',
          `Impossible negative ${field}: ${n}.`,
          'Check sign, units, and source transcription; do not silently clamp to zero.',
        );
      if (field === 'population' && n !== null && n <= 0)
        add(
          row,
          field,
          'invalid-population',
          'ERROR',
          `Invalid population denominator: ${n}; population must be positive.`,
          'Recover a valid population estimate with its source and reference year.',
        );
      if (field === 'humidity' && n !== null && n > 100)
        add(
          row,
          field,
          'invalid-humidity',
          'ERROR',
          'Humidity exceeds 100%.',
          'Check percentage units and the original measurement.',
        );
    }
    if (
      !missing(r.model) &&
      (!model ||
        !['Persistence', 'Ridge Regression', 'Random Forest', 'Gradient Boosting'].includes(model))
    )
      add(
        row,
        'model',
        'schema-model',
        'ERROR',
        'Unsupported model label.',
        'Use the exact documented model label; preserve output provenance.',
      );
    if (!missing(r.district_code) && !code)
      add(
        row,
        'district_code',
        'schema-code',
        'BLOCKING',
        'District code must be text or a numeric identifier.',
        'Recover the documented administrative code.',
      );
    const unknown = Object.keys(r).filter((key) => !known.has(key));
    if (unknown.length)
      add(
        row,
        unknown.join(', '),
        'schema-extra',
        'WARNING',
        `Unrecognized columns: ${unknown.join(', ')}. They remain in this source snapshot.`,
        'Review the schema and document a mapping; do not erase the original columns.',
      );
    if (
      incidence !== null &&
      cases !== null &&
      population !== null &&
      cases >= 0 &&
      population > 0 &&
      Math.abs(incidence - (cases / population) * 1000) > integrityPolicy.incidenceTolerance
    )
      add(
        row,
        'incidence',
        'incidence-mismatch',
        'ERROR',
        `Supplied incidence ${incidence} differs from cases / population × 1,000 = ${(cases / population) * 1000} by more than ${integrityPolicy.incidenceTolerance}.`,
        'Reconcile count, denominator, year, and units with the original source.',
      );
    const latValues = ['latitude', 'lat'].filter((key) => !missing(r[key])),
      lonValues = ['longitude', 'lon', 'lng'].filter((key) => !missing(r[key]));
    if (latValues.length || lonValues.length) {
      if (!latValues.length || !lonValues.length)
        add(
          row,
          'coordinates',
          'coordinates-pair',
          'ERROR',
          'A latitude/longitude pair is incomplete.',
          'Provide both documented coordinates or mark the location unavailable.',
        );
      for (const key of [...latValues, ...lonValues]) {
        const n = number(r[key]),
          limit = latValues.includes(key) ? 90 : 180;
        if (n === null || Math.abs(n) > limit)
          add(
            row,
            key,
            'coordinates-range',
            'ERROR',
            `Invalid ${key}; expected a finite coordinate within ±${limit} degrees.`,
            'Check coordinate reference system, axis order, and valid longitude/latitude.',
          );
      }
      if (
        new Set(latValues.map((key) => number(r[key]))).size > 1 ||
        new Set(lonValues.map((key) => number(r[key]))).size > 1
      )
        add(
          row,
          'coordinates',
          'coordinates-conflict',
          'ERROR',
          'Coordinate aliases disagree.',
          'Resolve conflicting coordinate fields against the source.',
        );
    }
    const signature = stable(r);
    exact.set(signature, [...(exact.get(signature) || []), row]);
    if (identity) {
      const entry = identities.get(identity) || { name: district || code!, code, rows: [] };
      entry.rows.push(row);
      identities.set(identity, entry);
    }
    if (districtName && code) {
      const codes = nameCodes.get(districtName) || new Set<string>();
      codes.add(code);
      nameCodes.set(districtName, codes);
    }
    if (identity && year !== null && Number.isInteger(year) && year >= 1900 && year <= 2100) {
      const key = identity + ':' + year;
      keys.set(key, [...(keys.get(key) || []), row]);
    }
    return {
      row,
      r,
      district,
      code,
      identity,
      year,
      cases,
      population,
      prediction,
      model,
      incidence,
    };
  });
  if (Array.isArray(dataset.sourceRows)) {
    const numericFields = new Set([
      'year',
      'cases',
      'population',
      'rainfall',
      'temperature',
      'humidity',
      'prediction',
      'incidence',
    ]);
    for (const inspected of rows) {
      const loaded = object(loadedRows[inspected.row - 1]);
      if (!loaded) continue;
      for (const field of [...integrityFields, 'district_code', 'region', 'incidence']) {
        const originalValue = inspected.r[field],
          loadedValue = loaded[field];
        const canonical = (value: unknown) =>
          missing(value)
            ? null
            : numericFields.has(field)
              ? number(value)
              : field === 'district_code'
                ? String(value).trim()
                : text(value);
        if (canonical(originalValue) !== canonical(loadedValue))
          add(
            inspected.row,
            field,
            'source-snapshot-mismatch',
            ['district', 'year', 'cases'].includes(field) ? 'BLOCKING' : 'ERROR',
            `Loaded ${field} differs from the preserved original source after documented numeric normalization.`,
            'Reconcile the source snapshot and loaded observation; do not overwrite the original evidence.',
          );
      }
    }
  }
  // A name tied to a single documented code shares the same temporal/duplicate identity.
  for (const r of rows)
    if (!r.code && r.district) {
      const codes = nameCodes.get(normalize(r.district));
      if (codes?.size === 1) {
        const prior = r.identity;
        r.identity = 'code:' + Array.from(codes)[0];
        if (prior && prior !== r.identity) identities.delete(prior);
        const entry = identities.get(r.identity)!;
        if (!entry.rows.includes(r.row)) entry.rows.push(r.row);
      }
    }
  keys.clear();
  for (const r of rows)
    if (
      r.identity &&
      r.year !== null &&
      Number.isInteger(r.year) &&
      r.year >= 1900 &&
      r.year <= 2100
    ) {
      const key = r.identity + ':' + r.year;
      keys.set(key, [...(keys.get(key) || []), r.row]);
    }
  for (const group of exact.values())
    if (group.length > 1)
      for (const row of group)
        add(
          row,
          'row',
          'duplicate-exact',
          'BLOCKING',
          `Exact duplicate row; source rows ${group.join(', ')}.`,
          'Reconcile duplicate records with the source. Do not silently delete them from this audit.',
        );
  let duplicateExcess = 0;
  for (const group of keys.values())
    if (group.length > 1) {
      duplicateExcess += group.length - 1;
      for (const row of group)
        add(
          row,
          'district, year',
          'duplicate-district-year',
          'BLOCKING',
          `Duplicate district-year observation; source rows ${group.join(', ')}.`,
          'Resolve one observed record per district-year. Keep distinct model outputs in separate datasets.',
        );
    }
  for (const [district, codes] of nameCodes)
    if (codes.size > 1)
      for (const r of rows.filter((r) => r.district && normalize(r.district) === district))
        add(
          r.row,
          'district_code',
          'identity-code-conflict',
          'BLOCKING',
          `Geographic name maps to multiple district codes: ${[...codes].join(', ')}.`,
          'Confirm authoritative district identities before joining datasets or GIS.',
        );
  const validYears = rows
    .filter((r) => r.year !== null && Number.isInteger(r.year) && r.year >= 1900 && r.year <= 2100)
    .map((r) => r.year!);
  const start = validYears.length
      ? validYears.reduce((lowest, value) => Math.min(lowest, value), Infinity)
      : null,
    end = validYears.length
      ? validYears.reduce((highest, value) => Math.max(highest, value), -Infinity)
      : null;
  let expectedPeriods = 0,
    presentPeriods = 0;
  if (start !== null && end !== null)
    for (const [identity, entry] of identities) {
      expectedPeriods += end - start + 1;
      for (let year = start; year <= end; year++) {
        if (keys.has(identity + ':' + year)) presentPeriods++;
        else
          add(
            null,
            'year',
            'temporal-gap',
            'WARNING',
            `${entry.name}: missing ${year} within the loaded ${start}–${end} panel.`,
            'Retrieve the missing surveillance period or disclose the gap; do not interpolate it.',
          );
      }
      const series = rows
        .filter(
          (r) =>
            r.identity === identity &&
            r.year !== null &&
            r.cases !== null &&
            r.cases >= 0 &&
            Number.isSafeInteger(r.cases) &&
            keys.get(identity + ':' + r.year)?.length === 1,
        )
        .sort((a, b) => a.year! - b.year!);
      for (let i = 1; i < series.length; i++) {
        const previous = series[i - 1],
          current = series[i];
        if (current.year !== previous.year! + 1) continue;
        const change =
          previous.cases! > 0 ? ((current.cases! - previous.cases!) / previous.cases!) * 100 : null;
        if (
          (change !== null && Math.abs(change) >= 100) ||
          (previous.cases === 0 && current.cases! > 0)
        )
          add(
            current.row,
            'cases',
            'abrupt-change',
            'WARNING',
            `${entry.name}: abrupt adjacent change ${previous.cases} → ${current.cases} (${previous.year}–${current.year})${change === null ? '; percentage undefined from zero baseline' : `; ${change.toFixed(2)}%`}.`,
            'Verify reporting completeness, definitions, and source counts. An unusual change may be real; do not remove it automatically.',
          );
      }
    }
  const now = Date.parse(options.now),
    created = Date.parse(dataset.created),
    ageDays = Number.isFinite(now) && Number.isFinite(created) ? (now - created) / 86400000 : null;
  if (ageDays === null)
    add(
      null,
      'created',
      'metadata-date',
      'WARNING',
      'Registry ingestion timestamp is unavailable or invalid.',
      'Document a valid ingestion timestamp; it does not substitute for a publication date.',
    );
  else if (ageDays < 0)
    add(
      null,
      'created',
      'metadata-future',
      'WARNING',
      'Registry ingestion timestamp is in the future.',
      'Check the ingestion timestamp and timezone.',
    );
  else if (ageDays > 365)
    add(
      null,
      'created',
      'stale-ingestion',
      'WARNING',
      `Registry ingestion is ${Math.floor(ageDays)} days old (threshold >365).`,
      'Review whether a newer source exists. Ingestion age is not surveillance or publication age.',
    );
  if (end !== null && options.year - end > 2)
    add(
      null,
      'year',
      'stale-surveillance',
      'WARNING',
      `Latest surveillance year ${end} trails selected analysis year ${options.year} by ${options.year - end} years (threshold >2).`,
      'Obtain newer surveillance or explicitly limit the analysis period.',
    );
  const matches = new Map<string, MapFeature | null>();
  if (!geometry.valid)
    add(
      null,
      'geometry',
      geometry.error === 'Administrative GIS geometry is not connected'
        ? 'missing-geometry'
        : 'invalid-geometry',
      geometry.features.length || geometry.error !== 'Administrative GIS geometry is not connected'
        ? 'ERROR'
        : 'WARNING',
      geometry.error!,
      'Connect valid administrative Polygon/MultiPolygon GeoJSON; do not substitute country outlines.',
    );
  for (const [identity, entry] of identities) {
    const related = rows.filter((r) => r.identity === identity),
      names = new Set(related.filter((r) => r.district).map((r) => normalize(r.district!)));
    const candidates = geometry.valid
      ? geometry.features.filter((f) => {
          const code = f.properties.district_code || f.properties.code;
          return entry.code && code
            ? String(code) === entry.code
            : names.has(normalize(String(f.properties.district || f.properties.name || '')));
        })
      : [];
    const feature = candidates.length === 1 ? candidates[0] : null;
    matches.set(identity, feature);
    if (geometry.valid && !feature)
      for (const r of related)
        add(
          r.row,
          entry.code ? 'district_code' : 'district',
          entry.code ? 'unmatched-code' : 'geographic-name-mismatch',
          'ERROR',
          candidates.length > 1
            ? 'Geographic identity matches multiple administrative features.'
            : entry.code
              ? `District code ${entry.code} has no unique matching administrative geometry.`
              : 'Geographic name has no matching administrative geometry.',
          'Confirm the authoritative district code/name and boundary version; do not use an invented fuzzy match.',
        );
    if (feature) {
      const geoName = normalize(
        String(feature.properties.district || feature.properties.name || ''),
      );
      for (const r of related.filter((r) => r.district && normalize(r.district) !== geoName))
        add(
          r.row,
          'district',
          'geographic-name-mismatch',
          'WARNING',
          'District code matches, but the geographic name differs from the administrative feature.',
          'Document an authoritative alias or correct the name; code-based match is retained.',
        );
      if (entry.code && !feature.properties.district_code && !feature.properties.code)
        add(
          null,
          'district_code',
          'unverified-code',
          'INFO',
          `${entry.name}: GIS matched by name; geometry contains no code to verify ${entry.code}.`,
          'Use documented district codes in administrative geometry when available.',
        );
    }
  }
  const ambiguousFeatures = new Set(
    [...matches.values()].filter(
      (feature) => feature && [...matches.values()].filter((f) => f === feature).length > 1,
    ),
  );
  for (const [identity, feature] of matches)
    if (feature && ambiguousFeatures.has(feature)) {
      matches.set(identity, null);
      for (const r of rows.filter((r) => r.identity === identity))
        add(
          r.row,
          'district',
          'ambiguous-gis',
          'BLOCKING',
          'Multiple district identities resolve to the same administrative feature.',
          'Resolve the one-to-one administrative correspondence before spatial analysis.',
        );
    }
  if (!geometry.valid)
    add(
      null,
      'district',
      'geography-unavailable',
      'INFO',
      'Geographic-name/code checks and reference district coverage cannot be verified without valid GIS geometry.',
      'Supply a documented administrative reference, then rerun inspection.',
    );
  const fieldCounts = integrityFields.map((field) => ({
    field,
    present: rows.filter((r) => !missing(r.r[field])).length,
    total: rows.length,
  }));
  const invalidRows = new Set(
    issues
      .filter(
        (issue) =>
          issue.row !== null && (issue.severity === 'ERROR' || issue.severity === 'BLOCKING'),
      )
      .map((issue) => issue.row),
  );
  const globalBlocking = issues.some(
    (issue) => issue.severity === 'BLOCKING' && issue.row === null,
  );
  const matchedCount = [...matches.values()].filter(Boolean).length;
  const scoreComponents = [
    component(
      'Field completeness',
      30,
      fieldCounts.reduce((sum, f) => sum + f.present, 0),
      rows.length * integrityFields.length,
      'Present cells / all rows × fixed 9 fields. Missing fields remain in the denominator; validity is checked separately.',
    ),
    component(
      'Record validity',
      20,
      globalBlocking ? 0 : rows.length - invalidRows.size,
      rows.length,
      'Rows without ERROR or BLOCKING row issues / all original rows. Dataset-level BLOCKING issues invalidate all rows.',
    ),
    component(
      'Observation uniqueness',
      10,
      rows.length - duplicateExcess,
      rows.length,
      '(All rows − excess duplicate district-year rows) / all rows. Exact duplicates remain visible and invalidate their rows.',
    ),
    component(
      'Temporal completeness',
      20,
      presentPeriods,
      expectedPeriods,
      'Present distinct district-years / (loaded district identities × inclusive loaded earliest–latest year range). Presence is not value validity.',
    ),
    component(
      'GIS match rate',
      10,
      matchedCount,
      geometry.valid ? identities.size : 0,
      'Uniquely matched dataset district identities / all dataset identities, using valid loaded administrative geometry.',
    ),
    component(
      'District coverage',
      10,
      matchedCount,
      geometry.valid ? geometry.features.length : 0,
      'Matched reference features / all features in the loaded GIS reference. This does not establish complete Papua coverage.',
    ),
  ];
  const score = rows.length ? scoreComponents.reduce((sum, c) => sum + c.contribution, 0) : null;
  const blocking = issues.some((issue) => issue.severity === 'BLOCKING');
  const current = rows.filter((r) => r.year === options.year),
    validCases = (r: (typeof rows)[number]) =>
      !!r.identity &&
      r.district !== null &&
      r.year !== null &&
      r.year >= 1900 &&
      r.year <= 2100 &&
      Number.isInteger(r.year) &&
      r.cases !== null &&
      r.cases >= 0 &&
      Number.isSafeInteger(r.cases);
  const elig = (
    analysis: string,
    total: number,
    usable: number,
    requirements: string[],
    detail: string,
    success: string,
  ): Eligibility => ({
    analysis,
    total,
    usable,
    eligible: !blocking && requirements.length === 0 && usable > 0,
    reasons: [
      ...(blocking
        ? [
            'Dataset contains BLOCKING structural, duplicate, or identity issues; resolve them before analysis.',
          ]
        : []),
      ...requirements,
      ...(!blocking && requirements.length === 0 && usable > 0 ? [success] : []),
      detail,
    ],
  });
  const forecast = current.filter(
      (r) =>
        validCases(r) && r.prediction !== null && r.prediction >= 0 && r.model === options.model,
    ),
    forecastReasons: string[] = [];
  if (!current.length) forecastReasons.push(`No observations for validation year ${options.year}.`);
  if (forecast.length !== current.length || !forecast.length)
    forecastReasons.push(
      `Every selected-year row needs valid observed cases and an explicit ${options.model} prediction; ${forecast.length}/${current.length} qualify.`,
    );
  const spatialRows = current.filter((r) => validCases(r) && r.identity && matches.get(r.identity));
  const spatialReasons: string[] = [];
  if (!geometry.valid) spatialReasons.push(geometry.error!);
  if (spatialRows.length !== current.length)
    spatialReasons.push(
      'Every selected-year observation needs valid cases and a unique GIS match.',
    );
  if (spatialRows.length < 3)
    spatialReasons.push(
      'At least three matched selected-year districts are required for spatial association analysis.',
    );
  if (new Set(spatialRows.map((r) => r.cases)).size < 2)
    spatialReasons.push(
      'Observed burden must vary; constant outcomes do not support Moran statistics.',
    );
  const spatialIds = new Set(spatialRows.map((r) => featureIdentity(matches.get(r.identity!)!)));
  if (![...spatialIds].some((id) => (geometry.neighbors[id] || []).some((n) => spatialIds.has(n))))
    spatialReasons.push('The matched cohort requires at least one queen-contiguous district pair.');
  const trendReasons: string[] = [];
  if (start === null || end === null || end - start < 1)
    trendReasons.push('Trend analysis requires at least two observed annual periods.');
  if (presentPeriods !== expectedPeriods)
    trendReasons.push('The loaded district-year panel has missing annual periods.');
  if (rows.some((r) => !validCases(r)))
    trendReasons.push(
      'Every trend record requires valid district, supported year, and observed cases.',
    );
  const riskRows = current.filter(
      (r) => validCases(r) && r.population !== null && r.population > 0,
    ),
    riskReasons: string[] = [];
  if (!current.length) riskReasons.push(`No observations for risk year ${options.year}.`);
  if (riskRows.length !== current.length || !riskRows.length)
    riskReasons.push(
      `Observed count-based risk requires positive population and valid cases for every selected-year row; ${riskRows.length}/${current.length} qualify.`,
    );
  if (
    current.some((r) =>
      issues.some((issue) => issue.row === r.row && issue.code === 'incidence-mismatch'),
    )
  )
    riskReasons.push(
      'Resolve selected-year supplied-incidence inconsistencies before count-based risk analysis.',
    );
  const eligibility = [
    elig(
      'Forecasting',
      current.length,
      forecast.length,
      forecastReasons,
      'Eligibility covers inspection of loaded model outputs, not model training, independence of a test set, or scientific validation.',
      `All ${current.length} selected-year observations have valid cases and explicit ${options.model} predictions; structural checks pass.`,
    ),
    elig(
      'Spatial Analysis',
      current.length,
      spatialRows.length,
      spatialReasons,
      'Eligibility covers the matched selected-year burden cohort; formal significance still requires the stated spatial method.',
      `All ${spatialRows.length} selected-year observations uniquely match valid administrative geometry, have valid varying burden, and include a queen-contiguous pair.`,
    ),
    elig(
      'Trend Analysis',
      rows.length,
      rows.filter(validCases).length,
      trendReasons,
      'Eligibility uses observed cases across the full loaded panel, not an imputed history.',
      `The ${start}–${end} panel contains ${presentPeriods}/${expectedPeriods} expected district-years and valid cases across every loaded district.`,
    ),
    elig(
      'Risk Calculation',
      current.length,
      riskRows.length,
      riskReasons,
      'Eligibility covers observed cases/population risk. Spatial and model-assisted risk have additional input requirements.',
      `All ${riskRows.length} selected-year observations have valid cases and positive population; no supplied-incidence inconsistencies remain.`,
    ),
  ];
  const status = blocking
    ? 'BLOCKED'
    : issues.some((i) => i.severity === 'ERROR')
      ? 'INVALID'
      : issues.some((i) => i.severity === 'WARNING')
        ? 'REVIEW REQUIRED'
        : 'CHECKS PASSED';
  return {
    dataset: {
      id: dataset.id,
      name: dataset.name,
      source: dataset.source,
      checksum: dataset.checksum,
      classification: dataset.classification || 'USER IMPORT',
      created: dataset.created,
    },
    sourceBasis: Array.isArray(dataset.sourceRows)
      ? 'Preserved original source rows'
      : 'Loaded rows; original pre-normalization source not preserved',
    loadedRowCount: loadedRows.length,
    rowCount: rows.length,
    issues,
    score,
    scoreComponents,
    fieldCounts,
    period: { start, end, present: presentPeriods, expected: expectedPeriods },
    districtCount: identities.size,
    gisMatched: matchedCount,
    gisTotal: geometry.valid ? geometry.features.length : 0,
    ageDays,
    latestSurveillanceYear: end,
    years: [...new Set(validYears)].sort((a, b) => a - b),
    status,
    eligibility,
    policy: integrityPolicy,
    inspectedAt: options.now,
    analysisYear: options.year,
    selectedModel: options.model,
    scoreFormula:
      'Σ(component percent / 100 × fixed weight). Weights: 30 + 20 + 10 + 20 + 10 + 10 = 100. Unavailable components contribute 0; weights are never redistributed. Empty datasets have no score.',
  };
}
export type IntegrityReport = ReturnType<typeof inspectDataset>;
export function inspectScientificIntegrity(
  datasets: IntegrityDataset[],
  geometry: unknown,
  options: { year: number; model: string; now: string },
) {
  const inspectedGeometry = inspectIntegrityGeometry(geometry);
  return datasets.map((dataset) => inspectDataset(dataset, inspectedGeometry, options));
}
