import { aggregateEvidence, includeSuppliedIncidence } from '../district-intelligence.ts';
import {
  calculateRisk,
  riskConfiguration,
  readRiskScenario,
  recordIdentity,
  type RiskCalculation,
} from '../risk-engine.ts';
import { spatialRiskInputs } from '../risk-spatial.ts';
import { buildReadinessMatrix } from '../readiness-engine.ts';
import { districtMobileMetrics } from '../mobile/mobile-engine.ts';
import { normalize, conditionText, type evaluate } from '../analytics.ts';
import { safeRiskMode } from '../workspace-context.ts';
import type { State } from '../store.tsx';
export const watchScreens = [
  'Risk',
  'Surveillance',
  'Climate',
  'Forecast',
  'Alerts',
  'Readiness',
  'Sync',
  'Data',
  'District',
] as const;
export type WatchScreen = (typeof watchScreens)[number];
export type DistrictRiskSummary = {
  district: string;
  year: number;
  category: RiskCalculation['category'];
  score: number | null;
  incidence: number | null;
  cases: number | null;
  change: number | null;
  trend: 'Increasing' | 'Decreasing' | 'Stable' | 'No Data';
  explanation: string;
  experimental: boolean;
};
export type WatchAlert = {
  id: string;
  district: string;
  severity: string;
  status: string;
  trigger: string;
  timestamp: string | null;
};
export type WatchReadinessSummary = {
  domain: string;
  label: string;
  status: 'Ready' | 'Review' | 'Attention' | 'No Data';
  evidence: 'Derived / user-entered review';
};
export type WatchSyncStatus = {
  malaria: 'Synced' | 'Not Connected';
  climate: 'Synced' | 'Partial' | 'Not Connected';
  risk: 'Ready' | 'Not Connected';
  lastUpdate: string | null;
  basis: 'Local application state';
};
export type WatchSummary = {
  risk: DistrictRiskSummary;
  climate: {
    rainfall: number | null;
    temperature: number | null;
    status: WatchSyncStatus['climate'];
  };
  forecast: {
    model: string;
    prediction: number | null;
    status: 'Loaded output' | 'Not Connected';
    limitation: string;
  };
  alerts: {
    items: WatchAlert[];
    newCount: number | null;
    activeCount: number | null;
    highestSeverity: string | null;
    latest: WatchAlert | null;
  };
  readiness: WatchReadinessSummary[];
  sync: WatchSyncStatus;
  provenance: {
    year: number;
    status: 'Source-labeled VERIFIED' | 'Not independently verified' | 'Not Connected';
    derived: boolean;
    lastLoaded: string | null;
    cached: boolean;
    sourceCount: number;
  };
  identityIssues: boolean;
};
const severityOrder = ['INFO', 'LOW', 'MODERATE', 'WATCH', 'HIGH', 'VERY HIGH', 'CRITICAL'];
const domainAbbreviations: Record<string, string> = {
  surveillance: 'SURV',
  diagnostics: 'DX',
  prevention: 'PREV',
  referral: 'REF',
  evacuation: 'EVAC',
  data: 'DATA',
};
const nonnegative = (n: number | null | undefined) =>
  typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : null;
const validDate = (s: string | null | undefined) =>
  s && Number.isFinite(Date.parse(s)) ? s : null;
export function watchEvidence(state: State, model: string, study?: unknown) {
  const joined = aggregateEvidence(state.datasets, state.active, model);
  // Study ratios are the existing supplied evidence, never manufactured counts.
  const records = state.datasets.length
    ? joined.records
    : includeSuppliedIncidence(joined.records, study, model);
  return { ...joined, records };
}
export function buildWatchSummary(input: {
  state: State;
  year: number;
  district: string;
  model: string;
  alerts: ReturnType<typeof evaluate>;
  study?: unknown;
  loadedAt: string | null;
  cached?: boolean;
}): WatchSummary {
  const { state, year, district, model } = input,
    joined = watchEvidence(state, model, input.study);
  const history = joined.records.filter((r) => r.year <= year),
    metrics = districtMobileMetrics(history, district, year);
  const candidates = history.filter(
    (r) => r.year === year && normalize(r.district) === normalize(district),
  );
  const record = candidates.length === 1 ? candidates[0] : undefined;
  const mode = safeRiskMode(state.riskMode),
    config = riskConfiguration(readRiskScenario(state.riskScenario));
  const spatial = ['SPATIAL RISK', 'COMPOSITE RESEARCH RISK'].includes(mode)
    ? spatialRiskInputs(
        state.geometry,
        history.filter((r) => r.year === year),
      )
    : {};
  const calculation = record
    ? calculateRisk(record, mode, config, spatial[recordIdentity(record)])
    : null;
  const fields = record?.values;
  const cases = nonnegative(metrics.cases),
    incidence = nonnegative(metrics.incidence),
    prediction = nonnegative(metrics.predicted);
  const change = cases !== null ? metrics.change : null;
  const malaria = cases !== null || incidence !== null ? 'Synced' : 'Not Connected';
  const climate =
    !fields || (fields.rainfall === null && fields.temperature === null)
      ? 'Not Connected'
      : fields.rainfall !== null && fields.temperature !== null
        ? 'Synced'
        : 'Partial';
  const primary = state.datasets.find((d) => d.id === state.active);
  const aliases = new Set([
    normalize(district),
    ...(record?.references.map((r) => normalize(r.district)) ?? []),
  ]);
  const alertConnected = !!primary && !!record && malaria === 'Synced';
  const items: WatchAlert[] = alertConnected
    ? input.alerts
        .filter((a) => a.year === year && aliases.has(normalize(a.district)))
        .map((a) => ({
          id: a.id,
          district,
          severity: severityOrder.includes(a.severity) ? a.severity : 'Analytical',
          status: ['NEW', 'REVIEWED', 'ACKNOWLEDGED', 'RESOLVED'].includes(
            state.alertStates[a.id]?.status,
          )
            ? state.alertStates[a.id].status
            : 'NEW',
          trigger:
            conditionText(a.ruleSnapshot) +
            (a.ruleSnapshot.secondary
              ? ` ${a.ruleSnapshot.join === 'OR' ? 'OR' : 'AND'} ${conditionText(a.ruleSnapshot.secondary)}`
              : ''),
          timestamp: validDate(state.alertCreated?.[a.id]),
        }))
        .sort(
          (a, b) =>
            (b.timestamp ? Date.parse(b.timestamp) : 0) -
              (a.timestamp ? Date.parse(a.timestamp) : 0) || a.id.localeCompare(b.id),
        )
    : [];
  const active = items.filter((a) => !['ACKNOWLEDGED', 'RESOLVED'].includes(a.status));
  const newest = items.filter((a) => a.status === 'NEW');
  const matrix = buildReadinessMatrix({
    datasets: state.datasets,
    active: state.active,
    year,
    model,
    checklists: state.districtChecklists ?? {},
    metadata: state.readinessMetadata,
    thresholds: state.thresholds,
    records: joined.records,
    manualDistricts: district === 'All districts' ? [] : [district],
  });
  const readinessCandidates = matrix.districts.filter(
    (d) => normalize(d.district) === normalize(district),
  );
  const readiness = readinessCandidates.length === 1 ? readinessCandidates[0].cells : [];
  const refs = [
    ...(record?.references.filter((r) => r.selected) ?? []),
    ...(calculation?.references ?? []),
  ];
  const known = !!record && refs.length > 0;
  const trend =
    change === null ? 'No Data' : change > 0 ? 'Increasing' : change < 0 ? 'Decreasing' : 'Stable';
  const connected = malaria === 'Synced' || climate !== 'Not Connected' || prediction !== null;
  return {
    risk: {
      district,
      year,
      category: calculation?.category ?? 'INSUFFICIENT DATA',
      score: calculation?.score ?? null,
      incidence,
      cases,
      change,
      trend,
      explanation: calculation
        ? calculation.score === null
          ? calculation.reasons.join(' ')
          : `${calculation.category}: ${calculation.formula}; score ${calculation.score.toFixed(2)}. ${calculation.classificationThreshold}.`
        : 'A unique selected district-year observation is required.',
      experimental: config.experimental,
    },
    climate: {
      rainfall: metrics.rainfall.value,
      temperature: metrics.temperature.value,
      status: climate,
    },
    forecast: {
      model,
      prediction,
      status: prediction === null ? 'Not Connected' : 'Loaded output',
      limitation:
        'No validated confidence interval connected. A stored model output is not a clinical forecast.',
    },
    alerts: {
      items,
      newCount: alertConnected ? newest.length : null,
      activeCount: alertConnected ? active.length : null,
      highestSeverity: active.length
        ? [...active].sort(
            (a, b) => severityOrder.indexOf(b.severity) - severityOrder.indexOf(a.severity),
          )[0].severity
        : null,
      latest: active[0] ?? null,
    },
    readiness: Object.entries(domainAbbreviations).map(([domain, label]) => {
      const cell = readiness.find((c) => c.domain === domain);
      return {
        domain,
        label,
        status:
          cell?.state === 'READY'
            ? 'Ready'
            : cell?.state === 'REVIEW'
              ? 'Review'
              : cell?.state === 'ATTENTION'
                ? 'Attention'
                : 'No Data',
        evidence: 'Derived / user-entered review',
      };
    }),
    sync: {
      malaria,
      climate,
      risk: calculation?.score != null ? 'Ready' : 'Not Connected',
      lastUpdate: connected ? validDate(input.loadedAt) : null,
      basis: 'Local application state',
    },
    provenance: {
      year,
      status: !known
        ? 'Not Connected'
        : refs.every((r) => r.classification === 'VERIFIED') &&
            (!calculation?.usesGeometry || state.geometrySource?.classification === 'VERIFIED')
          ? 'Source-labeled VERIFIED'
          : 'Not independently verified',
      derived: calculation?.score != null,
      lastLoaded: connected ? validDate(input.loadedAt) : null,
      cached: !!input.cached,
      sourceCount: new Set(refs.map((r) => r.datasetId)).size,
    },
    identityIssues: joined.identityIssues.length > 0 || metrics.ambiguous,
  };
}
export function watchNumber(n: number | null | undefined, suffix = '') {
  return n == null || !Number.isFinite(n)
    ? '—'
    : n.toLocaleString('en-GB', { maximumFractionDigits: 1 }) + suffix;
}
export function watchTimestamp(timestamp: string | null, compact = false) {
  if (!validDate(timestamp)) return '—';
  return (
    new Date(timestamp!).toLocaleString('en-GB', {
      timeZone: 'Asia/Bangkok',
      ...(compact ? { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' } : {}),
    }) + ' ICT'
  );
}
export function watchCategory(summary: DistrictRiskSummary) {
  return summary.category === 'INSUFFICIENT DATA' ? 'No Data' : summary.category;
}
// Only aggregate, allowlisted fields leave this adapter. Source rows, checklist notes,
// geometry/coordinates, custom descriptions and individual attributes are not serialized.
