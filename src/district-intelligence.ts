import { normalize, risk, evaluate, type Row, type Rule } from './analytics.ts';
export type Classification =
  | 'VERIFIED_RESEARCH_EXTRACTION'
  | 'VERIFIED'
  | 'PUBLIC SOURCE'
  | 'AUTHORIZED'
  | 'USER IMPORT'
  | 'UNVERIFIED'
  | 'SYNTHETIC';
export type EvidenceDataset = {
  fieldSources?: Partial<Record<Field, { source: string; checksum: string; name: string }>>;
  id: string;
  name: string;
  source: string;
  checksum: string;
  created: string;
  classification?: Classification;
  rows: Row[];
};
export const fields = [
  'cases',
  'population',
  'rainfall',
  'temperature',
  'humidity',
  'prediction',
  'incidence',
] as const;
export type Field = (typeof fields)[number];
export type Reference = {
  datasetId: string;
  dataset: string;
  district: string;
  source: string;
  classification: Classification;
  checksum: string;
  created?: string;
  year: number;
  field: Field;
  value: number;
  selected: boolean;
};
export type Record360 = {
  district: string;
  code?: string;
  year: number;
  values: Record<Field, number | null>;
  references: Reference[];
  issues: string[];
  model: string;
};
export type SpatialContext = {
  neighbors: string[] | null;
  quadrant: string | null;
  neighborIncidence: number | null;
  neighborRisk: string;
  method: string;
  error?: string;
};
export function median(values: number[]) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b),
    m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
export function aggregateEvidence(
  datasets: EvidenceDataset[],
  active: string,
  model: string,
  verifiedOnly = false,
) {
  const synthetic = datasets.find((d) => d.id === active)?.classification === 'SYNTHETIC';
  const isolated = datasets.filter((d) =>
    synthetic ? d.classification === 'SYNTHETIC' : d.classification !== 'SYNTHETIC',
  );
  const eligible = isolated.filter(
    (d) =>
      !verifiedOnly ||
      ['VERIFIED', 'VERIFIED_RESEARCH_EXTRACTION'].includes(d.classification || ''),
  );
  const nameCodes = new Map<string, Set<string>>();
  for (const d of eligible)
    for (const r of d.rows)
      if (r.district_code) {
        const key = normalize(r.district);
        const codes = nameCodes.get(key) || new Set<string>();
        codes.add(r.district_code);
        nameCodes.set(key, codes);
      }
  const canonicalByCode = new Map<string, string>();
  for (const d of [
    ...eligible.filter((d) => d.id === active),
    ...eligible.filter((d) => d.id !== active),
  ])
    for (const r of d.rows)
      if (r.district_code && !canonicalByCode.has(r.district_code))
        canonicalByCode.set(r.district_code, r.district);
  const groups = new Map<string, { dataset: EvidenceDataset; row: Row }[]>();
  const identityIssues: string[] = [];
  for (const dataset of eligible)
    for (const row of dataset.rows) {
      const codes = nameCodes.get(normalize(row.district));
      if (codes && codes.size > 1) {
        identityIssues.push(
          `${row.district}: ambiguous district codes; manual confirmation required.`,
        );
        continue;
      }
      const code = row.district_code || (codes?.size === 1 ? [...codes][0] : undefined);
      const key = `${code ? 'code:' + code : 'name:' + normalize(row.district)}|${row.year}`;
      const group = groups.get(key) || [];
      group.push({ dataset, row });
      groups.set(key, group);
    }
  const records: Record360[] = [...groups.values()]
    .map((entries) => {
      const primary = entries.find((e) => e.dataset.id === active) || entries[0];
      const values = Object.fromEntries(fields.map((f) => [f, null])) as Record<
          Field,
          number | null
        >,
        references: Reference[] = [],
        issues: string[] = [];
      for (const field of fields) {
        const candidates = entries.filter(
          (e) => Number.isFinite(e.row[field]) && (field !== 'prediction' || e.row.model === model),
        );
        const distinct = [...new Set(candidates.map((e) => e.row[field]!))];
        const preferred = candidates.find((e) => e.dataset.id === active);
        const chosen =
          preferred ||
          (distinct.length === 1
            ? candidates.find((e) => e.dataset.classification === 'VERIFIED') || candidates[0]
            : undefined);
        if (chosen) values[field] = chosen.row[field]!;
        if (distinct.length > 1)
          issues.push(
            `${field}: conflicting sources${preferred ? '; selected global source takes precedence' : '; value withheld until a source is selected'}.`,
          );
        for (const e of candidates)
          references.push({
            datasetId: e.dataset.id,
            dataset: e.dataset.fieldSources?.[field]?.name || e.dataset.name,
            district: e.row.district,
            source: e.dataset.fieldSources?.[field]?.source || e.dataset.source,
            classification: e.dataset.classification || 'USER IMPORT',
            checksum: e.dataset.fieldSources?.[field]?.checksum || e.dataset.checksum,
            created: e.dataset.created,
            year: e.row.year,
            field,
            value: e.row[field]!,
            selected: e === chosen,
          });
      }
      if (
        values.cases !== null &&
        values.population !== null &&
        values.population > 0 &&
        values.incidence !== null &&
        Math.abs(values.incidence - (values.cases / values.population) * 1000) > 0.1
      )
        issues.push(
          'Supplied incidence differs from cases / population × 1,000; the case/population-derived value is used.',
        );
      const code =
        primary.row.district_code || entries.find((e) => e.row.district_code)?.row.district_code;
      return {
        district: code ? canonicalByCode.get(code) || primary.row.district : primary.row.district,
        code,
        year: primary.row.year,
        values,
        references,
        issues,
        model,
      };
    })
    .sort((a, b) => a.year - b.year || a.district.localeCompare(b.district));
  return { records, identityIssues: [...new Set(identityIssues)], datasets: eligible };
}
export function includeSuppliedIncidence(
  records: Record360[],
  summary: any,
  model: string,
  verifiedOnly = false,
) {
  if (records.some((r) => r.references.some((ref) => ref.classification === 'SYNTHETIC')))
    return records;
  const f = summary?.incidence;
  if (
    verifiedOnly ||
    !f ||
    typeof f.district !== 'string' ||
    !Number.isInteger(f.year) ||
    !Number.isFinite(f.value) ||
    f.value < 0 ||
    f.unit !== 'per 1,000 population'
  )
    return records;
  const match = records.find(
    (r) => normalize(r.district) === normalize(f.district) && r.year === f.year,
  );
  const ref: Reference = {
    datasetId: 'supplied-study-summary',
    dataset: 'research-summary.json',
    district: f.district,
    source: summary.source || 'User-supplied study specification; underlying records not supplied',
    classification: 'UNVERIFIED',
    checksum: '',
    year: f.year,
    field: 'incidence',
    value: f.value,
    selected:
      !match ||
      (match.values.incidence === null &&
        (match.values.cases === null || match.values.population === null)),
  };
  if (match)
    return records.map((r) =>
      r === match
        ? {
            ...r,
            values: { ...r.values, incidence: r.values.incidence ?? f.value },
            references: [...r.references, ref],
            issues:
              Math.abs((incidence360(r) ?? f.value) - f.value) > 0.1
                ? [
                    ...r.issues,
                    'Supplied study incidence differs from connected incidence; the supplied figure is retained as alternative evidence.',
                  ]
                : r.issues,
          }
        : r,
    );
  const fact: Record360 = {
    district: f.district,
    year: f.year,
    model,
    values: {
      cases: null,
      population: null,
      rainfall: null,
      temperature: null,
      humidity: null,
      prediction: null,
      incidence: f.value,
    },
    references: [ref],
    issues: [
      'Only a supplied study incidence ratio is available; underlying case and population observations were not supplied.',
    ],
  };
  return [...records, fact].sort((a, b) => a.year - b.year || a.district.localeCompare(b.district));
}
export function observed(r: Record360): Row | null {
  if (r.values.cases === null) return null;
  const row: Row = {
    district: r.district,
    year: r.year,
    cases: r.values.cases,
    model: r.model,
    district_code: r.code,
  };
  for (const f of fields) if (f !== 'cases' && r.values[f] !== null) row[f] = r.values[f]!;
  return row;
}
export function incidence360(r: Record360 | undefined) {
  return r?.values.cases !== null &&
    r?.values.cases !== undefined &&
    r.values.population !== null &&
    r.values.population > 0
    ? (r.values.cases / r.values.population) * 1000
    : (r?.values.incidence ?? null);
}
export function annualChange(current: Record360 | undefined, previous: Record360 | undefined) {
  return current?.values.cases !== null &&
    current?.values.cases !== undefined &&
    previous?.values.cases !== null &&
    previous?.values.cases !== undefined &&
    previous.values.cases > 0
    ? ((current.values.cases - previous.values.cases) / previous.values.cases) * 100
    : null;
}
export function anomaly(history: Record360[], year: number, field: 'rainfall' | 'temperature') {
  const current = history.find((r) => r.year === year)?.values[field] ?? null;
  const prior = history.filter((r) => r.year < year && r.values[field] !== null);
  if (current === null || prior.length < 3)
    return {
      value: null,
      n: prior.length,
      mean: null,
      sd: null,
      reason:
        current === null
          ? 'Current observation unavailable'
          : 'At least three prior annual observations required',
    };
  const mean = prior.reduce((a, r) => a + r.values[field]!, 0) / prior.length,
    sd = Math.sqrt(
      prior.reduce((a, r) => a + (r.values[field]! - mean) ** 2, 0) / (prior.length - 1),
    );
  return {
    value: sd ? (current - mean) / sd : null,
    n: prior.length,
    mean,
    sd,
    reason: sd
      ? '(Current value − prior mean) / prior sample standard deviation'
      : 'Prior observations have zero variation',
  };
}
export function rollingMean(history: Record360[], year: number) {
  const window = [year - 2, year - 1, year].map(
    (y) => history.find((r) => r.year === y)?.values.cases ?? null,
  );
  return window.every((v) => v !== null) ? window.reduce<number>((a, v) => a + v!, 0) / 3 : null;
}
export function consecutiveIncreases(history: Record360[], year: number) {
  let n = 0;
  for (let y = year; y > 1900; y--) {
    const c = history.find((r) => r.year === y)?.values.cases,
      p = history.find((r) => r.year === y - 1)?.values.cases;
    if (c === null || c === undefined || p === null || p === undefined || c <= p) break;
    n++;
  }
  return n;
}
export function buildDistrict360(
  records: Record360[],
  district: string,
  year: number,
  thresholds: number[],
  rules: Rule[],
  statuses: Record<string, { status: string; note: string }>,
  spatial?: SpatialContext,
) {
  const selectedCodes = new Set(
    records
      .filter(
        (r) =>
          normalize(r.district) === normalize(district) ||
          r.references.some((ref) => normalize(ref.district) === normalize(district)),
      )
      .map((r) => r.code)
      .filter(Boolean),
  );
  const selectedCode = selectedCodes.size === 1 ? [...selectedCodes][0] : null;
  const history = records
      .filter((r) =>
        selectedCode ? r.code === selectedCode : normalize(r.district) === normalize(district),
      )
      .sort((a, b) => a.year - b.year),
    current = history.find((r) => r.year === year),
    previous = history.find((r) => r.year === year - 1),
    incidence = incidence360(current),
    cohort = records.filter((r) => r.year === year);
  const incidenceCohort = cohort.filter((r) => incidence360(r) !== null),
    burdenCohort = cohort.filter((r) => r.values.cases !== null);
  const rank =
    incidence === null
      ? null
      : 1 + incidenceCohort.filter((r) => incidence360(r)! > incidence).length;
  const percentile =
    incidence === null || !incidenceCohort.length
      ? null
      : (100 *
          (incidenceCohort.filter((r) => incidence360(r)! < incidence).length +
            0.5 * incidenceCohort.filter((r) => incidence360(r) === incidence).length)) /
        incidenceCohort.length;
  const burdenRank =
    current?.values.cases === null || current?.values.cases === undefined
      ? null
      : 1 + burdenCohort.filter((r) => r.values.cases! > current.values.cases!).length;
  const top = [...incidenceCohort].sort(
    (a, b) => incidence360(b)! - incidence360(a)! || a.district.localeCompare(b.district),
  )[0];
  const riskLevel =
    incidence === null
      ? 'INSUFFICIENT DATA'
      : risk({ district, year, cases: incidence, population: 1000 }, thresholds);
  const sequence = consecutiveIncreases(history, year);
  const validPast = history.filter((r) => r.year <= year && r.values.cases !== null);
  const completeness = current
    ? (fields.filter((f) => f !== 'incidence' && current.values[f] !== null).length /
        (fields.length - 1)) *
      100
    : null;
  const earliest = history.filter((r) => r.year <= year).at(0)?.year;
  const expected = earliest === undefined ? 0 : year - earliest + 1;
  const gaps = expected
    ? Array.from({ length: expected }, (_, i) => earliest! + i).filter(
        (y) => !history.some((r) => r.year === y && r.values.cases !== null),
      )
    : [];
  const reasons: { rule: string; finding: string; kind: string }[] = [];
  if (['HIGH', 'VERY HIGH'].includes(riskLevel))
    reasons.push({
      rule: `Incidence ≥ ${thresholds[1]} per 1,000 (VERY HIGH ≥ ${thresholds[2]})`,
      finding: `${current?.values.cases !== null && current?.values.population !== null ? 'Observed-derived' : 'Supplied'} incidence is ${incidence!.toFixed(2)} per 1,000; configured risk is ${riskLevel}.`,
      kind: 'risk',
    });
  if (percentile !== null && percentile >= 90 && incidenceCohort.length >= 3)
    reasons.push({
      rule: 'Incidence midrank percentile ≥ 90, with at least 3 comparable districts',
      finding: `Incidence is at the ${percentile.toFixed(1)}th percentile among ${incidenceCohort.length} loaded districts.`,
      kind: 'percentile',
    });
  if (sequence >= 2)
    reasons.push({
      rule: 'Strict annual burden increase for at least 2 consecutive adjacent periods',
      finding: `Observed burden increased for ${sequence} consecutive periods through ${year}.`,
      kind: 'trend',
    });
  if (spatial && ['HIGH', 'VERY HIGH'].includes(spatial.neighborRisk))
    reasons.push({
      rule: `Mean neighbor incidence ≥ ${thresholds[1]} per 1,000`,
      finding: `The derived neighborhood-incidence category is ${spatial.neighborRisk} (${spatial.neighborIncidence!.toFixed(2)} per 1,000). This is not a significant-hotspot claim.`,
      kind: 'spatial',
    });
  const explanation =
    incidence === null
      ? 'Risk cannot be assessed because neither derived incidence nor a supplied incidence input is available.'
      : ['HIGH', 'VERY HIGH'].includes(riskLevel)
        ? 'Risk is elevated under the configured incidence thresholds. The loaded evidence supports the following analytical findings.'
        : 'This district does not meet the configured HIGH or VERY HIGH incidence thresholds. Additional analytical signals, if present, do not automatically change its risk category.';
  const sourceId =
    current?.references.find((r) => r.field === 'cases' && r.selected)?.datasetId ||
    current?.references.find((r) => r.field === 'incidence' && r.selected)?.datasetId ||
    'district-360';
  const sourceRef = current?.references.find((r) => r.datasetId === sourceId && r.selected);
  // NaN is an internal missing-value sentinel, never an invented observed case count.
  const signalRows: Row[] = records.map((r) => ({
    district: r.district,
    year: r.year,
    cases: r.values.cases ?? NaN,
    population: r.values.population ?? undefined,
    rainfall: r.values.rainfall ?? undefined,
    temperature: r.values.temperature ?? undefined,
    humidity: r.values.humidity ?? undefined,
    prediction: r.values.prediction ?? undefined,
    model: r.model,
  }));
  const signals = evaluate(signalRows, rules, sourceId, {
    thresholds,
    model: current?.model,
    datasetName: sourceRef?.dataset,
    datasetCreated: sourceRef?.created,
    source: sourceRef?.source,
    classification: sourceRef?.classification,
    checksum: sourceRef?.checksum,
    override: (row, name) => {
      const record = records.find((r) => r.district === row.district && r.year === row.year);
      if (name === 'incidence') return incidence360(record);
      if (name === 'risk_level') {
        const value = incidence360(record);
        return value === null
          ? null
          : value >= thresholds[2]
            ? 3
            : value >= thresholds[1]
              ? 2
              : value >= thresholds[0]
                ? 1
                : 0;
      }
      return undefined;
    },
  })
    .filter(
      (a) => normalize(a.district) === normalize(current?.district || district) && a.year === year,
    )
    .map((a) => ({
      ...a,
      sourceReferences: records
        .filter((r) => r.district === current?.district && r.year <= year)
        .flatMap((r) => r.references.filter((ref) => ref.selected)),
      status: statuses[a.id]?.status || 'NEW',
      note: statuses[a.id]?.note || '',
    }))
    .filter((a) => a.status !== 'RESOLVED');
  return {
    district,
    year,
    current,
    previous,
    history,
    cohort,
    incidence,
    riskLevel,
    rank,
    burdenRank,
    percentile,
    rankPopulation: incidenceCohort.length,
    cohortSize: cohort.length,
    topDistrict: top,
    papuaMedian: {
      cases: median(burdenCohort.map((r) => r.values.cases!)),
      incidence: median(incidenceCohort.map((r) => incidence360(r)!)),
      population: median(
        cohort.filter((r) => r.values.population !== null).map((r) => r.values.population!),
      ),
    },
    yoy: annualChange(current, previous),
    rolling: rollingMean(history, year),
    sequence,
    historicalBurden: validPast.length ? validPast.reduce((a, r) => a + r.values.cases!, 0) : null,
    historicalPeriods: validPast.length,
    rainfallAnomaly: anomaly(history, year, 'rainfall'),
    temperatureAnomaly: anomaly(history, year, 'temperature'),
    residual:
      current && current.values.prediction !== null && current.values.cases !== null
        ? current.values.prediction - current.values.cases
        : null,
    absoluteError:
      current && current.values.prediction !== null && current.values.cases !== null
        ? Math.abs(current.values.prediction - current.values.cases)
        : null,
    completeness,
    gaps,
    temporalCompleteness: expected ? (validPast.length / expected) * 100 : null,
    latestSurveillanceYear: history.filter((r) => r.values.cases !== null).at(-1)?.year ?? null,
    latestClimateYear:
      history
        .filter(
          (r) =>
            r.values.rainfall !== null ||
            r.values.temperature !== null ||
            r.values.humidity !== null,
        )
        .at(-1)?.year ?? null,
    explanation,
    reasons,
    signals,
    spatial: spatial || {
      neighbors: null,
      quadrant: null,
      neighborIncidence: null,
      neighborRisk: 'INSUFFICIENT DATA',
      method: 'Administrative geometry not connected',
    },
  };
}
export const readinessDomains: Record<string, string[]> = {
  'Surveillance awareness': [
    'Latest surveillance dataset available',
    'District-level data complete',
    'Trend reviewed',
    'High-risk districts identified',
  ],
  'Diagnostic-resource review': [
    'Diagnostic capability documented',
    'Testing availability reviewed',
    'Stock-status dataset connected',
  ],
  'Preventive-resource planning': [
    'Prevention-resource dataset reviewed',
    'Education material status',
    'Vector-control coordination status',
  ],
  'Staffing preparedness': ['Staffing capacity reviewed'],
  'Referral preparedness': [
    'Referral facility list available',
    'Referral contact information available',
  ],
  'Evacuation preparedness': [
    'Medical evacuation preparedness reviewed',
    'Receiving-facility information available',
  ],
  'Communication preparedness': ['Communication preparedness reviewed'],
  'Data readiness': ['Data provenance reviewed', 'Data quality reviewed'],
};
export function readinessStatus(
  domain: string,
  items: string[],
  checklist: Record<string, string>,
  riskLevel: string,
) {
  const values = items.map((i) => checklist[i] || 'NOT REVIEWED');
  return values.every((v) => v === 'AVAILABLE' || v === 'NOT APPLICABLE')
    ? 'READY'
    : values.some((v) => v === 'LIMITED' || v === 'UNAVAILABLE') ||
        (domain === 'Diagnostic-resource review' && ['HIGH', 'VERY HIGH'].includes(riskLevel))
      ? 'ATTENTION'
      : values.every((v) => v === 'NOT REVIEWED')
        ? 'INSUFFICIENT DATA'
        : 'REVIEW';
}
