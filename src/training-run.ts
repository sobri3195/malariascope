import {
  forecastModels,
  forecastMetrics,
  type ForecastPair,
  type ForecastModel,
  type PrimaryMetric,
} from './forecasting.ts';
export const trainingRunKey = 'malariascope-training-runs';
type MetricSet = {
  n: number;
  mae: number;
  rmse: number;
  bias: number;
  medianAbsoluteError: number;
  r2: number | null;
};
export type TrainingRun = {
  schema: 'malariascope-training-run-v2';
  cohortMode: 'CASES ONLY' | 'CLIMATE COMPLETE CASE';
  datasetHash: string;
  trainingHash: string;
  source: string;
  license: string;
  classification: 'SYNTHETIC' | 'USER-TRAINED RESEARCH OUTPUT';
  seed: number;
  protocol: string;
  trainingStart: number;
  trainingEnd: number;
  trainingRows: number;
  testYear: number;
  environment: { python: string; numpy: string; scikitLearn: string };
  codeHashes: Record<string, string>;
  selection: Record<
    string,
    { status: string; parameters: Record<string, number>; folds: number[] }
  >;
  excluded: { district: string; year: number; reason: string }[];
  ignoredFuture: { district: string; year: number }[];
  limitations: string[];
  leaderboard: {
    model: ForecastModel;
    metrics: MetricSet;
    validationPeriod: string;
    pairedComparisons: {
      reference: ForecastModel;
      n: number;
      maeDifference: number;
      lower: number;
      upper: number;
      method: string;
      interpretation: string;
      crossesZero: boolean;
    }[];
    featureImportance?: {
      basis: string;
      limitation: string;
      values: {
        feature: string;
        unit: string;
        meanMAEIncrease: number;
        standardDeviation: number;
        repeats: number;
      }[];
    };
  }[];
  predictions: {
    district: string;
    year: number;
    cases: number;
    model: ForecastModel;
    prediction: number;
    residual: number;
    absoluteError: number;
    lower: number | null;
    upper: number | null;
    classification: string;
  }[];
  rollingOrigin: {
    model: ForecastModel;
    trainingEnd: number;
    testYear: number;
    metrics: MetricSet;
  }[];
};
const text = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const year = (v: unknown) => Number.isInteger(v) && Number(v) >= 1900 && Number(v) <= 2100;
const hash = (v: unknown) => typeof v === 'string' && /^[a-f0-9]{64}$/i.test(v);
const close = (a: number, b: number) =>
  Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b));
export function trainingPairs(
  run: TrainingRun,
  filterYear = run.testYear,
  district = 'All districts',
): ForecastPair[] {
  return run.predictions
    .filter(
      (r) =>
        r.year === filterYear &&
        (district === 'All districts' ||
          r.district.trim().toLowerCase() === district.trim().toLowerCase()),
    )
    .map((r) => ({
      key: r.model + '|' + r.district + '|' + r.year,
      district: r.district,
      year: r.year,
      observed: r.cases,
      predicted: r.prediction,
      residual: r.prediction - r.cases,
      absoluteError: Math.abs(r.prediction - r.cases),
      model: r.model,
      references: [],
    }));
}
export function rankTrainingRun(
  run: TrainingRun,
  metric: PrimaryMetric,
  filterYear = run.testYear,
  district = 'All districts',
) {
  const pairs = trainingPairs(run, filterYear, district);
  return run.leaderboard
    .map((r) => ({
      model: r.model,
      metrics: forecastMetrics(pairs.filter((p) => p.model === r.model)),
    }))
    .filter((r) => r.metrics[metric] !== null)
    .sort(
      (a, b) =>
        (metric === 'r2' ? -1 : 1) * (a.metrics[metric]! - b.metrics[metric]!) ||
        a.model.localeCompare(b.model),
    );
}
export function validateTrainingRun(value: unknown): asserts value is TrainingRun {
  const r = value as TrainingRun;
  if (
    !r ||
    r.schema !== 'malariascope-training-run-v2' ||
    !['CASES ONLY', 'CLIMATE COMPLETE CASE'].includes(r.cohortMode) ||
    !hash(r.datasetHash) ||
    !hash(r.trainingHash) ||
    !text(r.source) ||
    !text(r.license) ||
    !['SYNTHETIC', 'USER-TRAINED RESEARCH OUTPUT'].includes(r.classification) ||
    !year(r.testYear) ||
    !year(r.trainingStart) ||
    !year(r.trainingEnd) ||
    r.trainingStart > r.trainingEnd ||
    r.trainingEnd >= r.testYear ||
    !Number.isInteger(r.trainingRows) ||
    r.trainingRows < 8 ||
    !Number.isInteger(r.seed) ||
    r.seed < 0 ||
    r.seed > 4294967295 ||
    !text(r.protocol) ||
    !r.environment ||
    !['python', 'numpy', 'scikitLearn'].every((k) =>
      text(r.environment[k as keyof typeof r.environment]),
    ) ||
    !r.codeHashes ||
    !Object.values(r.codeHashes).length ||
    !Object.values(r.codeHashes).every(hash) ||
    !Array.isArray(r.limitations) ||
    !r.limitations.every(text)
  )
    throw Error(
      'Invalid training run v2 provenance or temporal contract. Legacy run v1 requires regeneration with the audited pipeline.',
    );
  if (
    !Array.isArray(r.predictions) ||
    !r.predictions.length ||
    r.predictions.length > 100000 ||
    !Array.isArray(r.leaderboard) ||
    r.leaderboard.length < 2 ||
    r.leaderboard.length > 5
  )
    throw Error('Invalid paired holdout observations.');
  const seen = new Set<string>();
  for (const p of r.predictions) {
    if (
      !p ||
      !text(p.district) ||
      p.district.length > 100 ||
      p.year !== r.testYear ||
      !forecastModels.includes(p.model) ||
      !Number.isInteger(p.cases) ||
      p.cases < 0 ||
      !Number.isFinite(p.prediction) ||
      p.prediction < 0 ||
      p.classification !== r.classification ||
      !Number.isFinite(p.residual) ||
      !close(p.residual, p.prediction - p.cases) ||
      !Number.isFinite(p.absoluteError) ||
      !close(p.absoluteError, Math.abs(p.prediction - p.cases)) ||
      ((p.lower !== null || p.upper !== null) &&
        (!Number.isFinite(p.lower) ||
          !Number.isFinite(p.upper) ||
          p.lower! < 0 ||
          p.lower! > p.upper!))
    )
      throw Error('Invalid prediction values, interval or signed-error convention.');
    const key = p.model + '|' + p.district.trim().toLowerCase();
    if (seen.has(key)) throw Error('Duplicate model/district holdout pair.');
    seen.add(key);
  }
  const models = new Set<string>();
  let cohort: Map<string, number> | null = null;
  for (const row of r.leaderboard) {
    if (
      !row ||
      !forecastModels.includes(row.model) ||
      models.has(row.model) ||
      row.validationPeriod !== String(r.testYear)
    )
      throw Error('Invalid or duplicate holdout model.');
    models.add(row.model);
    const pairs = trainingPairs(r).filter((p) => p.model === row.model),
      m = forecastMetrics(pairs);
    if (
      pairs.length < 3 ||
      !row.metrics ||
      !['n', 'mae', 'rmse', 'bias', 'medianAbsoluteError'].every(
        (k) =>
          Number.isFinite(row.metrics[k as keyof MetricSet]) &&
          close(row.metrics[k as keyof MetricSet]!, m[k as keyof MetricSet]!),
      ) ||
      (m.r2 === null
        ? row.metrics.r2 !== null
        : !Number.isFinite(row.metrics.r2) || !close(m.r2, row.metrics.r2!))
    )
      throw Error('Reported metrics disagree with held-out pairs.');
    const current = new Map(pairs.map((p) => [p.district.trim().toLowerCase(), p.observed]));
    if (
      cohort &&
      (current.size !== cohort.size || [...cohort].some(([d, y]) => current.get(d) !== y))
    )
      throw Error('Models do not share an identical observed holdout cohort.');
    cohort = current;
    const s = r.selection?.[row.model];
    if (
      !s ||
      !text(s.status) ||
      !s.parameters ||
      !Object.values(s.parameters).every(Number.isFinite) ||
      !Array.isArray(s.folds) ||
      !s.folds.every((y) => year(y) && y < r.testYear)
    )
      throw Error('Invalid pre-holdout selection trace.');
    if (
      !Array.isArray(row.pairedComparisons) ||
      row.pairedComparisons.some(
        (c) =>
          !c ||
          !forecastModels.includes(c.reference) ||
          c.reference === row.model ||
          c.n !== pairs.length ||
          ![c.maeDifference, c.lower, c.upper].every(Number.isFinite) ||
          c.lower > c.upper ||
          !text(c.method) ||
          !text(c.interpretation) ||
          c.crossesZero !== (c.lower <= 0 && c.upper >= 0),
      )
    )
      throw Error('Invalid paired comparison.');
    if (
      row.featureImportance &&
      (!text(row.featureImportance.basis) ||
        !text(row.featureImportance.limitation) ||
        !Array.isArray(row.featureImportance.values) ||
        row.featureImportance.values.some(
          (f) =>
            !f ||
            !text(f.feature) ||
            !text(f.unit) ||
            !Number.isFinite(f.meanMAEIncrease) ||
            !Number.isFinite(f.standardDeviation) ||
            f.standardDeviation < 0 ||
            !Number.isInteger(f.repeats) ||
            f.repeats < 1,
        ))
    )
      throw Error('Invalid descriptive feature importance.');
  }
  if (
    r.cohortMode === 'CASES ONLY' &&
    [...models].some((m) => !['Persistence', 'Ridge Regression — no climate'].includes(m))
  )
    throw Error('Case-only runs may not declare climate-dependent models.');
  if (r.predictions.some((p) => !models.has(p.model))) throw Error('Unreported prediction model.');
  for (const row of r.leaderboard)
    for (const c of row.pairedComparisons) {
      const reference = r.leaderboard.find((m) => m.model === c.reference);
      if (!reference || !close(c.maeDifference, row.metrics.mae - reference.metrics.mae))
        throw Error('Paired difference disagrees with model errors.');
    }
  if (
    !Array.isArray(r.rollingOrigin) ||
    r.rollingOrigin.some(
      (f) =>
        !f ||
        !models.has(f.model) ||
        !year(f.trainingEnd) ||
        !year(f.testYear) ||
        f.trainingEnd >= f.testYear ||
        f.testYear >= r.testYear ||
        !f.metrics ||
        !Number.isInteger(f.metrics.n) ||
        f.metrics.n < 3 ||
        ![f.metrics.mae, f.metrics.rmse, f.metrics.bias, f.metrics.medianAbsoluteError].every(
          Number.isFinite,
        ) ||
        (f.metrics.r2 !== null && !Number.isFinite(f.metrics.r2)),
    )
  )
    throw Error('Backtesting must end before the final holdout.');
  if (
    !Array.isArray(r.excluded) ||
    r.excluded.some((x) => !x || !text(x.district) || !year(x.year) || !text(x.reason)) ||
    !Array.isArray(r.ignoredFuture) ||
    r.ignoredFuture.some((x) => !x || !text(x.district) || !year(x.year) || x.year <= r.testYear)
  )
    throw Error('Invalid exclusion accounting.');
}
