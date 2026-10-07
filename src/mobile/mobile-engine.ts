import {
  aggregateEvidence,
  incidence360,
  annualChange,
  anomaly,
  type Record360,
} from '../district-intelligence.ts';
import {
  riskEvidence,
  calculateRisk,
  riskConfiguration,
  readRiskScenario,
  recordIdentity,
  type SpatialRiskInputs,
} from '../risk-engine.ts';
import { safeRiskMode } from '../workspace-context.ts';
import { normalize, validate } from '../analytics.ts';
import type { State } from '../store.tsx';
export function mobileEvidence(
  state: State,
  year: number,
  model: string,
  spatial: SpatialRiskInputs = {},
) {
  const joined = aggregateEvidence(state.datasets, state.active, model);
  const history = joined.records.filter((r) => r.year <= year);
  const records = history.filter((r) => r.year === year);
  const riskRecords = riskEvidence(state.datasets, state.active, model, year).records;
  const config = riskConfiguration(readRiskScenario(state.riskScenario));
  const risks = riskRecords.map((record) => ({
    record,
    calculation: calculateRisk(
      record,
      safeRiskMode(state.riskMode),
      config,
      spatial[recordIdentity(record)],
    ),
  }));
  const quality = state.datasets.map((d) => ({
    dataset: d,
    issues: validate((d.sourceRows ?? d.rows) as unknown as Record<string, unknown>[]).issues,
  }));
  return {
    history,
    records,
    risks,
    quality,
    identityIssues: joined.identityIssues,
    configuration: config,
  };
}
export function districtMobileMetrics(history: Record360[], district: string, year: number) {
  const candidates = history.filter((r) => normalize(r.district) === normalize(district));
  const ambiguous = new Set(candidates.map(recordIdentity)).size > 1;
  const records = ambiguous ? [] : candidates;
  const current = records.find((r) => r.year === year),
    previous = records.find((r) => r.year === year - 1);
  const incidence = incidence360(current),
    prevIncidence = incidence360(previous);
  const rainfall = anomaly(records, year, 'rainfall'),
    temperature = anomaly(records, year, 'temperature');
  const predicted = current?.values.prediction ?? null,
    cases = current?.values.cases ?? null;
  const fields = [
    'cases',
    'population',
    'rainfall',
    'temperature',
    'humidity',
    'prediction',
  ] as const;
  return {
    ambiguous,
    current,
    previous,
    cases,
    incidence,
    change: annualChange(current, previous),
    incidenceChange:
      incidence !== null && prevIncidence !== null && prevIncidence > 0
        ? ((incidence - prevIncidence) / prevIncidence) * 100
        : null,
    rainfall,
    temperature,
    predicted,
    residual: predicted !== null && cases !== null ? predicted - cases : null,
    absoluteError: predicted !== null && cases !== null ? Math.abs(predicted - cases) : null,
    completeness: current
      ? (fields.filter((f) => current.values[f] !== null).length / fields.length) * 100
      : null,
    trend: records.sort((a, b) => a.year - b.year),
  };
}
export function sourceStatus(
  records: Record360[],
  fields: ('cases' | 'rainfall' | 'temperature' | 'prediction')[],
  cached: boolean,
) {
  if (!records.length || !records.some((r) => fields.some((f) => r.values[f] !== null)))
    return 'Not Connected';
  return cached
    ? 'Cached'
    : records.every((r) => fields.every((f) => r.values[f] !== null))
      ? 'Connected'
      : 'Partial';
}

export function mobileDistrictRisk(
  risks: ReturnType<typeof mobileEvidence>['risks'],
  district: string,
) {
  const candidates = risks.filter((r) => normalize(r.record.district) === normalize(district));
  return candidates.length === 1 ? candidates[0].calculation : undefined;
}
