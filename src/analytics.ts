export type Row = {
  district: string;
  year: number;
  cases: number;
  population?: number;
  rainfall?: number;
  temperature?: number;
  humidity?: number;
  prediction?: number;
  model?: string;
  district_code?: string;
  region?: string;
  incidence?: number;
};
export type Issue = { row: number; severity: 'ERROR' | 'WARNING'; message: string };
export const ruleMetrics = [
  'cases',
  'incidence',
  'change',
  'residual',
  'prediction_increase',
  'rainfall_anomaly',
  'consecutive_increase',
  'missing_fields',
  'climate_age',
] as const;
export type Condition = {
  metric: (typeof ruleMetrics)[number];
  operator: '>' | '<';
  value: number;
};
export type Rule = Condition & {
  id: string;
  enabled: boolean;
  severity: string;
  join?: 'AND' | 'OR';
  secondary?: Condition;
};
export const defaults: Rule[] = [
  { id: 'burden', metric: 'cases', operator: '>', value: 20000, enabled: true, severity: 'HIGH' },
  { id: 'increase', metric: 'change', operator: '>', value: 25, enabled: true, severity: 'WATCH' },
];
export const normalize = (s: string) =>
  s
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[\p{P}\p{Z}]+/gu, ' ')
    .trim()
    .replace(/^(kabupaten|kab) /, '')
    .replace(/ regency$/, '')
    .replace(/^city of /, 'kota ')
    .replace(/^(.+) city$/, 'kota $1');
export function validate(input: Record<string, unknown>[]) {
  const issues: Issue[] = [];
  const rows: Row[] = [];
  const seen = new Set<string>();
  const codes = new Map<string, string>();
  const names = new Map<string, string>();
  input.forEach((r, i) => {
    let invalid = false;
    for (const key of ['district', 'year', 'cases'])
      if (
        r[key] === undefined ||
        r[key] === null ||
        (typeof r[key] === 'string' && String(r[key]).trim() === '')
      ) {
        issues.push({ row: i + 1, severity: 'ERROR', message: `Missing required field: ${key}` });
        invalid = true;
      }
    const year = Number(r.year),
      cases = Number(r.cases);
    if (!Number.isInteger(year) || year < 1900 || year > 2100) {
      issues.push({ row: i + 1, severity: 'ERROR', message: 'Invalid year' });
      invalid = true;
    }
    if (
      !Number.isSafeInteger(cases) ||
      cases < 0 ||
      !['string', 'number'].includes(typeof r.cases)
    ) {
      issues.push({
        row: i + 1,
        severity: 'ERROR',
        message: 'Cases must be a nonnegative integer',
      });
      invalid = true;
    }
    const district = String(r.district ?? '').trim();
    if (district.length > 100 || !normalize(district) || typeof r.district !== 'string') {
      issues.push({
        row: i + 1,
        severity: 'ERROR',
        message: 'District name must be nonempty text up to 100 characters',
      });
      invalid = true;
    }
    const row: Row = { district, year, cases };
    for (const field of [
      'population',
      'rainfall',
      'temperature',
      'humidity',
      'prediction',
    ] as const) {
      if (
        r[field] !== undefined &&
        r[field] !== null &&
        !(typeof r[field] === 'string' && String(r[field]).trim() === '')
      ) {
        const n = Number(r[field]);
        if (
          !Number.isFinite(n) ||
          !['string', 'number'].includes(typeof r[field]) ||
          (field === 'population' && n <= 0) ||
          (field !== 'temperature' && n < 0) ||
          (field === 'humidity' && n > 100)
        ) {
          issues.push({ row: i + 1, severity: 'ERROR', message: `Invalid ${field}` });
          invalid = true;
        } else row[field] = n;
      }
    }
    if (r.model) row.model = String(r.model);
    if (r.district_code) row.district_code = String(r.district_code);
    if (r.region) row.region = String(r.region);
    if (r.incidence !== undefined && r.incidence !== '') {
      const v = Number(r.incidence);
      if (!Number.isFinite(v) || v < 0) {
        issues.push({ row: i + 1, severity: 'ERROR', message: 'Invalid supplied incidence' });
        invalid = true;
      } else {
        row.incidence = v;
        if (row.population && Math.abs(v - (row.cases / row.population) * 1000) > 0.1)
          issues.push({
            row: i + 1,
            severity: 'WARNING',
            message: 'Supplied incidence differs from cases / population × 1,000',
          });
      }
    }
    if (row.prediction !== undefined && !row.model)
      issues.push({
        row: i + 1,
        severity: 'WARNING',
        message: 'Prediction has no model label; excluded from model-specific comparison',
      });
    if (row.district_code) {
      const prior = codes.get(row.district_code),
        oldCode = names.get(normalize(district));
      if ((prior && prior !== normalize(district)) || (oldCode && oldCode !== row.district_code))
        issues.push({
          row: i + 1,
          severity: 'ERROR',
          message: 'District-code mismatch: manual confirmation required',
        });
      codes.set(row.district_code, normalize(district));
      names.set(normalize(district), row.district_code);
    }
    const allowed = [
      'district',
      'year',
      'cases',
      'population',
      'rainfall',
      'temperature',
      'humidity',
      'prediction',
      'model',
      'district_code',
      'region',
      'incidence',
    ];
    const unknown = Object.keys(r).filter((k) => !allowed.includes(k));
    if (unknown.length)
      issues.push({
        row: i + 1,
        severity: 'WARNING',
        message: `Unexpected fields excluded from observations: ${unknown.join(', ')}`,
      });
    const key = `${normalize(district)}|${year}`;
    if (seen.has(key)) {
      issues.push({
        row: i + 1,
        severity: 'WARNING',
        message:
          'Duplicate district-year: manual confirmation required; import blocked until duplicate is removed',
      });
    }
    seen.add(key);
    if (!invalid && !issues.some((issue) => issue.row === i + 1 && issue.severity === 'ERROR'))
      rows.push(row);
  });
  if (!input.length)
    issues.push({ row: 0, severity: 'ERROR', message: 'Dataset contains no observations' });
  return { rows, issues };
}
export function incidence(r: Row) {
  return r.population ? (r.cases / r.population) * 1000 : null;
}
export function change(r: Row, rows: Row[]) {
  const prev = rows.find(
    (x) => normalize(x.district) === normalize(r.district) && x.year === r.year - 1,
  );
  return prev && prev.cases > 0 ? ((r.cases - prev.cases) / prev.cases) * 100 : null;
}
export function risk(r: Row, thresholds: number[] = [100, 300, 500]) {
  const v = incidence(r);
  return v === null
    ? 'INSUFFICIENT DATA'
    : v >= thresholds[2]
      ? 'VERY HIGH'
      : v >= thresholds[1]
        ? 'HIGH'
        : v >= thresholds[0]
          ? 'MODERATE'
          : 'LOW';
}
export function metric(r: Row, rows: Row[], name: Rule['metric']): number | null {
  if (name === 'cases') return r.cases;
  if (name === 'incidence') return incidence(r);
  if (name === 'change') return change(r, rows);
  if (name === 'residual')
    return r.prediction === undefined ? null : Math.abs(r.cases - r.prediction);
  const history = rows
    .filter((x) => normalize(x.district) === normalize(r.district) && x.year < r.year)
    .sort((a, b) => b.year - a.year);
  if (name === 'prediction_increase') {
    const recent = history.slice(0, 3);
    if (r.prediction === undefined || !recent.length) return null;
    const mean = recent.reduce((a, x) => a + x.cases, 0) / recent.length;
    return mean > 0 ? ((r.prediction - mean) / mean) * 100 : null;
  }
  if (name === 'rainfall_anomaly') {
    const climate = history.filter((x) => x.rainfall !== undefined);
    if (r.rainfall === undefined || climate.length < 3) return null;
    const mean = climate.reduce((a, x) => a + x.rainfall!, 0) / climate.length,
      sd = Math.sqrt(
        climate.reduce((a, x) => a + (x.rainfall! - mean) ** 2, 0) / (climate.length - 1),
      );
    return sd ? (r.rainfall - mean) / sd : null;
  }
  if (name === 'consecutive_increase') {
    let count = 0,
      current = r;
    for (const previous of history) {
      if (previous.year !== current.year - 1 || current.cases <= previous.cases) break;
      count++;
      current = previous;
    }
    return count;
  }
  if (name === 'missing_fields')
    return ['population', 'rainfall', 'temperature'].filter((k) => r[k as keyof Row] === undefined)
      .length;
  if (name === 'climate_age') {
    const climate = [r, ...history].find(
      (x) => x.rainfall !== undefined || x.temperature !== undefined,
    );
    return climate ? r.year - climate.year : null;
  }
  return null;
}
function triggered(r: Row, rows: Row[], condition: Condition) {
  const v = metric(r, rows, condition.metric);
  return v !== null && (condition.operator === '>' ? v > condition.value : v < condition.value);
}
export function evaluate(rows: Row[], rules: Rule[], dataset = '') {
  return rows.flatMap((r) =>
    rules
      .filter((rule) => {
        if (!rule.enabled) return false;
        const first = triggered(r, rows, rule);
        return rule.secondary
          ? rule.join === 'OR'
            ? first || triggered(r, rows, rule.secondary)
            : first && triggered(r, rows, rule.secondary)
          : first;
      })
      .map((rule) => ({
        id: `${dataset ? dataset + ':' : ''}${rule.id}:${normalize(r.district)}:${r.year}`,
        district: r.district,
        year: r.year,
        severity: rule.severity,
        value: metric(r, rows, rule.metric),
        threshold: rule.value,
        metric: rule.metric,
        reason: `${rule.metric} ${metric(r, rows, rule.metric)?.toFixed(2) ?? 'unavailable'} ${rule.operator} ${rule.value}${rule.secondary ? ` ${rule.join || 'AND'} ${rule.secondary.metric} ${metric(r, rows, rule.secondary.metric)?.toFixed(2) ?? 'unavailable'} ${rule.secondary.operator} ${rule.secondary.value}` : ''}`,
        rule: rule.id,
      })),
  );
}
export function performance(rows: Row[]) {
  const r = rows.filter((x) => x.prediction !== undefined);
  if (!r.length) return null;
  const errors = r.map((x) => x.prediction! - x.cases),
    mean = r.reduce((a, x) => a + x.cases, 0) / r.length,
    sst = r.reduce((a, x) => a + (x.cases - mean) ** 2, 0),
    sse = errors.reduce((a, x) => a + x * x, 0);
  return {
    mae: errors.reduce((a, x) => a + Math.abs(x), 0) / r.length,
    rmse: Math.sqrt(sse / r.length),
    r2: sst ? 1 - sse / sst : null,
    residual: errors.reduce((a, x) => a + x, 0) / r.length,
    medianResidual: [...errors].sort((a,b)=>a-b).slice(Math.floor((errors.length-1)/2),Math.floor(errors.length/2)+1).reduce((a,v)=>a+v,0)/(errors.length%2?1:2),
    n: r.length,
  };
}
export function correlation(pairs: [number, number][]) {
  if (pairs.length < 3) return null;
  const x = pairs.reduce((a, p) => a + p[0], 0) / pairs.length,
    y = pairs.reduce((a, p) => a + p[1], 0) / pairs.length;
  const num = pairs.reduce((a, p) => a + (p[0] - x) * (p[1] - y), 0),
    den = Math.sqrt(
      pairs.reduce((a, p) => a + (p[0] - x) ** 2, 0) *
        pairs.reduce((a, p) => a + (p[1] - y) ** 2, 0),
    );
  return den ? num / den : null;
}
export function download(name: string, data: unknown, csv = false) {
  const text = csv ? String(data) : JSON.stringify(data, null, 2),
    url = URL.createObjectURL(new Blob([text], { type: csv ? 'text/csv' : 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name.replace(/[^a-zA-Z0-9._-]/g, '_');
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function toCSV(rows: Row[]) {
  const keys = [
    'district',
    'year',
    'cases',
    'population',
    'rainfall',
    'temperature',
    'humidity',
    'prediction',
    'model',
    'region',
    'district_code',
  ] as const;
  return [
    keys.join(','),
    ...rows.map((r) =>
      keys
        .map((k) => {
          const v = r[k];
          if (typeof v === 'number') return String(v);
          let text = String(v ?? '');
          if (/^\s*[=+@-]/.test(text)) text = "'" + text;
          return `"${text.replaceAll('"', '""')}"`;
        })
        .join(','),
    ),
  ].join('\n');
}
