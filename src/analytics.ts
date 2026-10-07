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
  'rolling_average',
  'predicted_cases',
  'temperature_anomaly',
  'risk_level',
  'model_residual',
  'data_completeness',
  'dataset_age',
] as const;
export type Condition = {
  metric: (typeof ruleMetrics)[number];
  operator:
    '>' | '>=' | '<' | '<=' | '=' | 'between' | 'outside range' | 'increased by' | 'decreased by';
  upper?: number;
  value: number;
};
export type Rule = Condition & {
  id: string;
  enabled: boolean;
  severity: string;
  join?: 'AND' | 'OR';
  secondary?: Condition;
  name?: string;
  description?: string;
  category?: string;
  priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  persistence?: 1 | 2 | 3;
  suppress?: boolean;
  revision?: number;
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
  return Number.isFinite(r.cases) && Number.isFinite(r.population) && r.population! > 0
    ? (r.cases / r.population!) * 1000
    : null;
}
export function change(r: Row, rows: Row[]) {
  const prev = rows.find(
    (x) => normalize(x.district) === normalize(r.district) && x.year === r.year - 1,
  );
  return prev && Number.isFinite(r.cases) && Number.isFinite(prev.cases) && prev.cases > 0
    ? ((r.cases - prev.cases) / prev.cases) * 100
    : null;
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
export type EvaluationContext = {
  datasetCreated?: string;
  datasetName?: string;
  source?: string;
  checksum?: string;
  classification?: string;
  now?: string;
  model?: string;
  thresholds?: number[];
  override?: (row: Row, name: Rule['metric']) => number | null | undefined;
};
export const metricLabels: Record<Rule['metric'], string> = {
  cases: 'Malaria cases',
  incidence: 'Malaria incidence / 1,000',
  change: 'Year-over-year change (%)',
  rolling_average: '3-year rolling average (cases)',
  predicted_cases: 'Predicted cases',
  prediction_increase: 'Prediction deviation from historical baseline (%)',
  rainfall_anomaly: 'Rainfall anomaly (SD)',
  temperature_anomaly: 'Temperature anomaly (SD)',
  risk_level: 'District risk level (0–3)',
  model_residual: 'Model residual (predicted − observed cases)',
  residual: 'Absolute prediction error (cases)',
  data_completeness: 'Data completeness (%)',
  dataset_age: 'Dataset age (days since ingestion)',
  consecutive_increase: 'Consecutive annual increases',
  missing_fields: 'Missing core fields',
  climate_age: 'Climate observation age (years)',
};
export const operators: Condition['operator'][] = [
  '>',
  '>=',
  '<',
  '<=',
  '=',
  'between',
  'outside range',
  'increased by',
  'decreased by',
];
export function validCondition(c: Condition) {
  return (
    ruleMetrics.includes(c.metric) &&
    operators.includes(c.operator) &&
    Number.isFinite(c.value) &&
    (!['between', 'outside range'].includes(c.operator) ||
      (Number.isFinite(c.upper) && c.upper! >= c.value)) &&
    (!['increased by', 'decreased by'].includes(c.operator) || c.value >= 0)
  );
}
export function compareValue(v: number | null, c: Condition) {
  if (v === null || !Number.isFinite(v) || !validCondition(c)) return false;
  switch (c.operator) {
    case '>':
      return v > c.value;
    case '>=':
      return v >= c.value;
    case '<':
      return v < c.value;
    case '<=':
      return v <= c.value;
    case '=':
      return v === c.value;
    case 'between':
      return v >= c.value && v <= c.upper!;
    case 'outside range':
      return v < c.value || v > c.upper!;
    case 'increased by':
      return v > 0 && v >= c.value;
    case 'decreased by':
      return v < 0 && -v >= c.value;
  }
}
export function metric(
  r: Row,
  rows: Row[],
  name: Rule['metric'],
  context: EvaluationContext = {},
): number | null {
  const overridden = context.override?.(r, name);
  if (overridden !== undefined) return overridden;
  if (name === 'dataset_age') {
    // Registry age is current metadata; do not fabricate historical ingestion snapshots.
    if (rows.some((x) => normalize(x.district) === normalize(r.district) && x.year > r.year))
      return null;
    const created = Date.parse(context.datasetCreated || ''),
      now = Date.parse(context.now || new Date().toISOString());
    return Number.isFinite(created) && Number.isFinite(now) && now >= created
      ? (now - created) / 86400000
      : null;
  }
  if (name === 'data_completeness')
    return (
      (['cases', 'population', 'rainfall', 'temperature', 'humidity', 'prediction'].filter(
        (k) =>
          Number.isFinite(r[k as keyof Row]) &&
          (k !== 'prediction' || !context.model || r.model === context.model),
      ).length /
        6) *
      100
    );
  if (name === 'risk_level') {
    const v = incidence(r),
      t = context.thresholds || [100, 300, 500];
    return v === null ? null : v >= t[2] ? 3 : v >= t[1] ? 2 : v >= t[0] ? 1 : 0;
  }
  if (
    ['prediction_increase', 'predicted_cases', 'residual', 'model_residual'].includes(name) &&
    context.model &&
    r.model !== context.model
  )
    return null;
  if (name === 'predicted_cases') return Number.isFinite(r.prediction) ? r.prediction! : null;
  if (name === 'model_residual')
    return Number.isFinite(r.cases) && Number.isFinite(r.prediction)
      ? r.prediction! - r.cases
      : null;
  if (name === 'rolling_average') {
    const window = [0, 1, 2].map((offset) =>
      rows.find(
        (x) => normalize(x.district) === normalize(r.district) && x.year === r.year - offset,
      ),
    );
    return window.every((x) => x && Number.isFinite(x.cases))
      ? window.reduce((sum, x) => sum + x!.cases, 0) / 3
      : null;
  }

  if (name === 'cases') return Number.isFinite(r.cases) ? r.cases : null;
  if (name === 'incidence') return incidence(r);
  if (name === 'change') return change(r, rows);
  if (name === 'residual')
    return !Number.isFinite(r.cases) || !Number.isFinite(r.prediction)
      ? null
      : Math.abs(r.cases - r.prediction!);
  const history = rows
    .filter((x) => normalize(x.district) === normalize(r.district) && x.year < r.year)
    .sort((a, b) => b.year - a.year);
  if (name === 'prediction_increase') {
    const recent = history.filter((x) => Number.isFinite(x.cases)).slice(0, 3);
    if (!Number.isFinite(r.prediction) || !recent.length) return null;
    const mean = recent.reduce((a, x) => a + x.cases, 0) / recent.length;
    return mean > 0 ? ((r.prediction! - mean) / mean) * 100 : null;
  }
  if (name === 'rainfall_anomaly' || name === 'temperature_anomaly') {
    const field = name === 'rainfall_anomaly' ? 'rainfall' : 'temperature';
    const climate = history.filter((x) => Number.isFinite(x[field]));
    if (!Number.isFinite(r[field]) || climate.length < 3) return null;
    const mean = climate.reduce((a, x) => a + x[field]!, 0) / climate.length,
      sd = Math.sqrt(
        climate.reduce((a, x) => a + (x[field]! - mean) ** 2, 0) / (climate.length - 1),
      );
    return sd ? (r[field]! - mean) / sd : null;
  }
  if (name === 'consecutive_increase') {
    let count = 0,
      current = r;
    for (const previous of history) {
      if (
        !Number.isFinite(current.cases) ||
        !Number.isFinite(previous.cases) ||
        previous.year !== current.year - 1 ||
        current.cases <= previous.cases
      )
        break;
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
export function conditionValue(
  r: Row,
  rows: Row[],
  condition: Condition,
  context: EvaluationContext = {},
) {
  const current = metric(r, rows, condition.metric, context);
  if (!['increased by', 'decreased by'].includes(condition.operator)) return current;
  const previous = rows.find(
    (x) => normalize(x.district) === normalize(r.district) && x.year === r.year - 1,
  );
  const baseline = previous ? metric(previous, rows, condition.metric, context) : null;
  return current !== null && baseline !== null && baseline > 0
    ? ((current - baseline) / baseline) * 100
    : null;
}
export function conditionText(c: Condition) {
  return `${metricLabels[c.metric]} ${c.operator} ${c.value}${['between', 'outside range'].includes(c.operator) ? ` to ${c.upper}` : ''}${['increased by', 'decreased by'].includes(c.operator) ? '% vs previous adjacent year' : ''}`;
}
export function ruleText(rule: Rule) {
  return `IF ${conditionText(rule)}${rule.secondary ? ` ${rule.join || 'AND'} ${conditionText(rule.secondary)}` : ''} for ${rule.persistence || 1} consecutive period(s) THEN ${rule.severity} analytical alert${rule.suppress ? '; suppress repeats until condition clears' : ''}`;
}
export function evaluate(
  rows: Row[],
  rules: Rule[],
  dataset = '',
  context: EvaluationContext = {},
) {
  const ordered = [...rows].sort(
    (a, b) => a.year - b.year || normalize(a.district).localeCompare(normalize(b.district)),
  );
  const evaluatePeriod = (r: Row, rule: Rule) => {
    const conditions = [rule, ...(rule.secondary ? [rule.secondary] : [])].map((c) => ({
      condition: conditionText(c),
      metric: c.metric,
      operator: c.operator,
      threshold: c.value,
      upper: c.upper,
      value: conditionValue(r, rows, c, context),
      rawValue: metric(r, rows, c.metric, context),
      previousValue: ['increased by', 'decreased by'].includes(c.operator)
        ? (() => {
            const previous = rows.find(
              (x) => normalize(x.district) === normalize(r.district) && x.year === r.year - 1,
            );
            return previous ? metric(previous, rows, c.metric, context) : null;
          })()
        : undefined,
      matched: compareValue(conditionValue(r, rows, c, context), c),
    }));
    return {
      year: r.year,
      conditions,
      matched:
        rule.secondary && rule.join === 'OR'
          ? conditions.some((c) => c.matched)
          : conditions.every((c) => c.matched),
    };
  };
  return rules
    .filter(
      (rule) =>
        rule.enabled &&
        validCondition(rule) &&
        (!rule.secondary || validCondition(rule.secondary)) &&
        (!rule.persistence || [1, 2, 3].includes(rule.persistence)),
    )
    .flatMap((rule) => {
      const streaks = new Map<
        string,
        { year: number; periods: ReturnType<typeof evaluatePeriod>[] }
      >();
      return ordered.flatMap((r) => {
        const districtKey = normalize(r.district),
          period = evaluatePeriod(r, rule),
          prior = streaks.get(districtKey);
        const periods = period.matched
          ? [...(prior && prior.year === r.year - 1 ? prior.periods : []), period]
          : [];
        streaks.set(districtKey, { year: r.year, periods });
        const required = rule.persistence || 1;
        if (periods.length < required || (rule.suppress && periods.length > required)) return [];
        return [
          {
            id: `${dataset ? dataset + ':' : ''}${rule.id}:${districtKey}:${r.year}${rule.revision ? `:v${rule.revision}` : ''}${context.model && [rule.metric, rule.secondary?.metric].some((m) => ['predicted_cases', 'prediction_increase', 'model_residual', 'residual'].includes(m || '')) ? `:model=${context.model}` : ''}${context.thresholds && [rule.metric, rule.secondary?.metric].includes('risk_level') ? `:risk=${context.thresholds.join(',')}` : ''}`,
            district: r.district,
            year: r.year,
            severity: rule.severity,
            priority: rule.priority || 'NORMAL',
            category: rule.category || 'Surveillance',
            value: period.conditions[0].value,
            threshold: rule.value,
            metric: rule.metric,
            rule: rule.id,
            reason: period.conditions
              .map(
                (c) =>
                  `${c.metric} ${c.value?.toFixed(2) ?? 'unavailable'} ${c.operator} ${c.threshold}${c.upper === undefined ? '' : ` to ${c.upper}`} (${c.matched ? 'matched' : 'not matched'})`,
              )
              .join(` ${rule.join || 'AND'} `),
            exactRule: ruleText(rule),
            ruleSnapshot: {
              ...rule,
              secondary: rule.secondary ? { ...rule.secondary } : undefined,
            },
            explanation: `The ${rule.join || 'AND'} expression matched for ${periods.length} adjacent annual period(s) ending ${r.year}; ${required} required. ${rule.suppress ? 'First qualifying alert in this uninterrupted episode; subsequent matches suppressed.' : 'One alert per qualifying district-year.'} Analytical decision support only.`,
            triggeringData: periods.slice(-required),
            observations: rows
              .filter((x) => normalize(x.district) === districtKey && x.year <= r.year)
              .map((x) => ({ ...x })),
            sourceDataset: {
              id: dataset,
              name: context.datasetName || dataset,
              source: context.source || '',
              checksum: context.checksum || '',
              classification: context.classification || 'UNVERIFIED',
              created: context.datasetCreated || null,
            },
            model: context.model || null,
            riskThresholds: context.thresholds || [100, 300, 500],
          },
        ];
      });
    })
    .sort(
      (a, b) =>
        ['URGENT', 'HIGH', 'NORMAL', 'LOW'].indexOf(a.priority) -
          ['URGENT', 'HIGH', 'NORMAL', 'LOW'].indexOf(b.priority) || b.year - a.year,
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
    medianResidual:
      [...errors]
        .sort((a, b) => a - b)
        .slice(Math.floor((errors.length - 1) / 2), Math.floor(errors.length / 2) + 1)
        .reduce((a, v) => a + v, 0) / (errors.length % 2 ? 1 : 2),
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
