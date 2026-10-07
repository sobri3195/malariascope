import { normalize } from './analytics.ts';
import {
  aggregateEvidence,
  median,
  type EvidenceDataset,
  type Reference,
  type Record360,
} from './district-intelligence.ts';
export const forecastModels = [
  'Persistence',
  'Ridge Regression',
  'Random Forest',
  'Gradient Boosting',
] as const;
export type ForecastModel = (typeof forecastModels)[number];
export const primaryMetrics = [
  ['mae', 'MAE'],
  ['rmse', 'RMSE'],
  ['r2', 'R²'],
  ['medianAbsoluteError', 'Median absolute error'],
  ['absoluteBias', 'Absolute prediction bias'],
] as const;
export type PrimaryMetric = (typeof primaryMetrics)[number][0];
export type ForecastPair = {
  key: string;
  district: string;
  year: number;
  observed: number;
  predicted: number;
  residual: number;
  absoluteError: number;
  model: ForecastModel;
  references: Reference[];
};
export type ForecastMetrics = {
  mae: number | null;
  rmse: number | null;
  r2: number | null;
  medianAbsoluteError: number | null;
  bias: number | null;
  absoluteBias: number | null;
  n: number | null;
};
export type ModelEvaluation = {
  model: ForecastModel;
  metrics: ForecastMetrics;
  pairs: ForecastPair[];
  rank: number | null;
  period: string;
  basis: 'LOADED' | 'SUPPLIED';
};
const missing: ForecastMetrics = {
  mae: null,
  rmse: null,
  r2: null,
  medianAbsoluteError: null,
  bias: null,
  absoluteBias: null,
  n: null,
};
export function forecastMetrics(pairs: ForecastPair[]): ForecastMetrics {
  if (!pairs.length) return { ...missing, n: 0 };
  const n = pairs.length,
    mae = pairs.reduce((s, p) => s + p.absoluteError, 0) / n,
    rmse = Math.sqrt(pairs.reduce((s, p) => s + p.residual ** 2, 0) / n),
    mean = pairs.reduce((s, p) => s + p.observed, 0) / n,
    den = pairs.reduce((s, p) => s + (p.observed - mean) ** 2, 0),
    bias = pairs.reduce((s, p) => s + p.residual, 0) / n;
  return {
    mae,
    rmse,
    r2: den ? 1 - pairs.reduce((s, p) => s + p.residual ** 2, 0) / den : null,
    medianAbsoluteError: median(pairs.map((p) => p.absoluteError)),
    bias,
    absoluteBias: Math.abs(bias),
    n,
  };
}
export function loadedForecastEvidence(datasets: EvidenceDataset[], active: string) {
  const pairs: ForecastPair[] = [],
    issues: string[] = [],
    observations: Record360[] = [];
  for (const model of forecastModels) {
    const aggregate = aggregateEvidence(datasets, active, model, false);
    issues.push(...aggregate.identityIssues);
    for (const record of aggregate.records) {
      issues.push(...record.issues.map((issue) => `${record.district} · ${record.year}: ${issue}`));
      if (model === 'Persistence') observations.push(record);
      const ref = record.references.find((r) => r.field === 'prediction' && r.selected),
        caseRef = record.references.find((r) => r.field === 'cases' && r.selected);
      if (record.values.cases === null || record.values.prediction === null || !ref || !caseRef)
        continue;
      const source = datasets.find((d) => d.id === ref.datasetId);
      const raw = source?.rows.find(
        (r) =>
          r.year === record.year &&
          r.model === model &&
          normalize(r.district) === normalize(ref.district),
      );
      if (!raw || raw.cases !== record.values.cases) {
        issues.push(
          `${model} · ${record.district} · ${record.year}: prediction source observed cases conflict with selected observations; pair withheld.`,
        );
        continue;
      }
      if (record.values.cases < 0 || record.values.prediction < 0) continue;
      const observed = record.values.cases,
        predicted = record.values.prediction;
      pairs.push({
        key: `${record.code ? 'code:' + record.code : normalize(record.district)}:${record.year}`,
        district: record.district,
        year: record.year,
        observed,
        predicted,
        residual: predicted - observed,
        absoluteError: Math.abs(predicted - observed),
        model,
        references: [caseRef, ref],
      });
    }
  }
  return { pairs, issues: [...new Set(issues)], observations };
}
export function rankEvaluations(evaluations: ModelEvaluation[], metric: PrimaryMetric) {
  const direction = metric === 'r2' ? -1 : 1;
  const available = evaluations
    .map((e) => e.metrics[metric])
    .filter((v): v is number => v !== null && Number.isFinite(v));
  return evaluations
    .map((e) => ({
      ...e,
      rank:
        e.metrics[metric] === null || !Number.isFinite(e.metrics[metric])
          ? null
          : 1 + available.filter((v) => direction * v < direction * e.metrics[metric]!).length,
    }))
    .sort(
      (a, b) =>
        (a.rank ?? Infinity) - (b.rank ?? Infinity) ||
        forecastModels.indexOf(a.model) - forecastModels.indexOf(b.model),
    );
}
export function evaluateForecasts(
  pairs: ForecastPair[],
  models: ForecastModel[],
  start: number,
  end: number,
  metric: PrimaryMetric,
  common = true,
) {
  const scoped = pairs.filter((p) => p.year >= start && p.year <= end && models.includes(p.model));
  const participating = models.filter((m) => scoped.some((p) => p.model === m));
  const keys = new Set(scoped.map((p) => p.key));
  const commonKeys = new Set(
    [...keys].filter((key) =>
      participating.every((m) => scoped.some((p) => p.key === key && p.model === m)),
    ),
  );
  const evaluations: ModelEvaluation[] = models.map((model) => {
    const modelPairs = scoped.filter(
      (p) => p.model === model && (!common || commonKeys.has(p.key)),
    );
    return {
      model,
      pairs: modelPairs,
      metrics: forecastMetrics(modelPairs),
      rank: null,
      period: start === end ? String(end) : `${start}–${end}`,
      basis: 'LOADED',
    };
  });
  const cohorts = evaluations
    .filter((e) => e.pairs.length)
    .map((e) =>
      e.pairs
        .map((p) => p.key)
        .sort()
        .join('|'),
    );
  return {
    evaluations: rankEvaluations(evaluations, metric),
    participating,
    commonPairs: commonKeys.size,
    comparable: cohorts.length >= 2 && new Set(cohorts).size === 1,
    scoped,
  };
}
export function studyEvaluations(
  study: any[],
  year: number,
  models: ForecastModel[],
  metric: PrimaryMetric,
): ModelEvaluation[] {
  return rankEvaluations(
    models.map((model) => {
      const entries = study.filter((r) => r.model === model && r.year === year),
        entry = entries.length === 1 ? entries[0] : null;
      const valid = (name: string) =>
        typeof entry?.[name] === 'number' &&
        Number.isFinite(entry[name]) &&
        (name === 'r2' || entry[name] >= 0)
          ? entry[name]
          : null;
      return {
        model,
        rank: null,
        pairs: [],
        basis: 'SUPPLIED',
        period: String(year),
        metrics: {
          ...missing,
          mae: valid('mae'),
          rmse: valid('rmse'),
          r2: valid('r2'),
          medianAbsoluteError: valid('medianAbsoluteError'),
        },
      };
    }),
    metric,
  );
}
export function scientificInterpretation(
  evaluations: ModelEvaluation[],
  metric: PrimaryMetric,
  comparable: boolean,
) {
  const eligible = evaluations.filter((e) => e.metrics[metric] !== null),
    label = primaryMetrics.find(([id]) => id === metric)![1],
    period = evaluations[0]?.period || 'selected period';
  if (!eligible.length)
    return `No ${label} values are available for ${period}; a model ranking cannot be established.`;
  if (eligible.length < 2)
    return `Only ${eligible[0].model} has an available ${period} ${label} value. No cross-model superiority conclusion is supported.`;
  const supplied = eligible[0].basis === 'SUPPLIED';
  if (!supplied && !comparable)
    return `The ${period} ${label} leaderboard is descriptive: models use different district-year cohorts. A fair superiority conclusion requires a common cohort.`;
  const best = eligible.filter((e) => e.rank === 1);
  if (best.length > 1)
    return `${best.map((e) => e.model).join(' and ')} tied on the primary ${period} ${label} metric${supplied ? ' in the supplied study results' : ''}.`;
  return `${eligible[0].model} outperformed ${eligible[1].model} on the primary ${period} ${label} metric.`;
}
export function districtErrorRanking(pairs: ForecastPair[]) {
  const districts = [...new Set(pairs.map((p) => p.district))];
  return districts
    .map((district) => {
      const selected = pairs.filter((p) => p.district === district);
      return {
        district,
        metrics: forecastMetrics(selected),
        pairs: selected,
        worst: selected.reduce((worst, p) => (p.absoluteError > worst.absoluteError ? p : worst)),
      };
    })
    .sort((a, b) => b.metrics.mae! - a.metrics.mae! || a.district.localeCompare(b.district));
}
export function modelFailureAnalysis(e: ModelEvaluation) {
  if (!e.pairs.length)
    return [
      'District-level model failure analysis is unavailable without paired observations and predictions. Aggregate metrics cannot identify failure locations.',
    ];
  const ranking = districtErrorRanking(e.pairs),
    total = e.pairs.reduce((sum, p) => sum + p.absoluteError, 0),
    worst = e.pairs.reduce((a, b) => (a.absoluteError >= b.absoluteError ? a : b));
  if (total === 0)
    return [
      `No observed prediction error in these ${e.pairs.length} evaluated pairs. This does not establish performance in other districts or periods.`,
    ];
  const direction =
    e.metrics.bias! > 0
      ? 'overprediction'
      : e.metrics.bias! < 0
        ? 'underprediction'
        : 'no net directional bias';
  return [
    `Largest mean district error: ${ranking[0].district}, MAE ${ranking[0].metrics.mae!.toFixed(2)} cases across ${ranking[0].pairs.length} period(s).`,
    `Worst individual error: ${worst.district} (${worst.year}), absolute error ${worst.absoluteError.toFixed(2)} cases; observed ${worst.observed}, predicted ${worst.predicted}.`,
    `Mean signed bias is ${e.metrics.bias!.toFixed(2)} cases (${direction}); ${e.pairs.filter((p) => p.residual > 0).length} overpredicted, ${e.pairs.filter((p) => p.residual < 0).length} underpredicted, ${e.pairs.filter((p) => p.residual === 0).length} exact.`,
    `The largest individual error accounts for ${((worst.absoluteError / total) * 100).toFixed(1)}% of total absolute error in this evaluated cohort. Findings are descriptive and do not explain causal model failure.`,
  ];
}
export function residualHistogram(pairs: ForecastPair[], bins = 8) {
  if (!pairs.length) return [];
  const min = Math.min(...pairs.map((p) => p.residual)),
    max = Math.max(...pairs.map((p) => p.residual));
  if (min === max) return [{ label: min.toFixed(2), lower: min, upper: max, count: pairs.length }];
  const width = (max - min) / bins,
    result = Array.from({ length: bins }, (_, i) => ({
      label: `${(min + i * width).toFixed(1)}…${(min + (i + 1) * width).toFixed(1)}`,
      lower: min + i * width,
      upper: min + (i + 1) * width,
      count: 0,
    }));
  for (const p of pairs) result[Math.min(bins - 1, Math.floor((p.residual - min) / width))].count++;
  return result;
}
