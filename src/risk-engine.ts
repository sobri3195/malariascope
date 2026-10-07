import { normalize } from './analytics.ts';
import {
  aggregateEvidence,
  type EvidenceDataset,
  type Record360,
  type Reference,
} from './district-intelligence.ts';
export const riskModes = [
  'OBSERVED RISK',
  'SPATIAL RISK',
  'MODEL-ASSISTED RISK',
  'COMPOSITE RESEARCH RISK',
] as const;
export type RiskMode = (typeof riskModes)[number];
export const riskVariables = ['observed', 'predicted', 'neighbor'] as const;
export type RiskVariable = (typeof riskVariables)[number];
export type RiskWeights = Record<RiskVariable, number>;
export type RiskScenario = { active: boolean; weights: RiskWeights };
export const defaultResearchModel = Object.freeze({
  id: 'malariascope-risk-v2-default',
  version: 2,
  name: 'Default Research Model',
  thresholds: Object.freeze([100, 300, 500]),
  weights: Object.freeze({ observed: 1, predicted: 1, neighbor: 0 }),
  verification: 'No independent formula verification record supplied',
});
export function validRiskWeights(weights: unknown): weights is RiskWeights {
  if (!weights || typeof weights !== 'object') return false;
  const w = weights as RiskWeights;
  return (
    riskVariables.every(
      (key) =>
        typeof w[key] === 'number' && Number.isFinite(w[key]) && w[key] >= 0 && w[key] <= 100,
    ) && riskVariables.reduce((sum, key) => sum + w[key], 0) > 0
  );
}
export function readRiskScenario(value: unknown): RiskScenario | null {
  const scenario = value as RiskScenario | undefined;
  return scenario && typeof scenario.active === 'boolean' && validRiskWeights(scenario.weights)
    ? { active: scenario.active, weights: { ...scenario.weights } }
    : null;
}
export function canEditRiskScenario(profile: string) {
  return profile === 'RESEARCHER' || profile === 'ANALYST';
}
export function riskConfiguration(scenario: RiskScenario | null) {
  const experimental = !!scenario?.active && validRiskWeights(scenario.weights);
  return {
    id: experimental ? 'malariascope-risk-v2-scenario' : defaultResearchModel.id,
    version: 2,
    name: experimental ? 'Experimental Scenario Model' : defaultResearchModel.name,
    experimental,
    weights: { ...(experimental ? scenario!.weights : defaultResearchModel.weights) },
    thresholds: [...defaultResearchModel.thresholds],
    verification: experimental
      ? 'EXPERIMENTAL — NOT VERIFIED RESEARCH OUTPUT'
      : defaultResearchModel.verification,
  };
}
export type RiskConfiguration = ReturnType<typeof riskConfiguration>;
export type NeighborInput = { district: string; value: number | null; references: Reference[] };
export type SpatialRiskInput = {
  value: number | null;
  neighbors: NeighborInput[];
  reason: string;
  geometryUsed: boolean;
};
export type SpatialRiskInputs = Record<string, SpatialRiskInput>;
export function recordIdentity(record: Record360) {
  return record.code ? `code:${record.code}` : `name:${normalize(record.district)}`;
}
function selectedReferences(record: Record360, fields: Reference['field'][]) {
  return record.references.filter((ref) => ref.selected && fields.includes(ref.field));
}
function usable(value: number | null) {
  return value !== null && Number.isFinite(value) && value >= 0;
}
export function observedRiskInput(record: Record360) {
  const { cases, population, incidence } = record.values;
  if (cases !== null && population !== null) {
    return {
      value:
        usable(cases) && usable(population) && population > 0 ? (cases / population) * 1000 : null,
      formula: 'observed cases ÷ population × 1,000',
      references: selectedReferences(record, ['cases', 'population']),
    };
  }
  return {
    value: usable(incidence) ? incidence : null,
    formula: 'source-supplied incidence per 1,000 (counts/population not both available)',
    references: selectedReferences(record, ['incidence']),
  };
}
export function riskEvidence(
  datasets: EvidenceDataset[],
  active: string,
  model: string,
  year: number,
) {
  const aggregate = aggregateEvidence(datasets, active, model);
  const identities = new Map<string, Record360>();
  for (const record of aggregate.records) identities.set(recordIdentity(record), record);
  const records = [...identities.values()]
    .map(
      (record) =>
        aggregate.records.find(
          (r) => recordIdentity(r) === recordIdentity(record) && r.year === year,
        ) || {
          ...record,
          year,
          values: {
            cases: null,
            population: null,
            prediction: null,
            rainfall: null,
            temperature: null,
            humidity: null,
            incidence: null,
          },
          references: [],
          issues: [`No observed record for selected year ${year}.`],
        },
    )
    .sort((a, b) => a.district.localeCompare(b.district));
  return { records, issues: aggregate.identityIssues };
}
export function calculateRisk(
  record: Record360,
  mode: RiskMode,
  configuration: RiskConfiguration,
  spatial?: SpatialRiskInput,
) {
  const observed = observedRiskInput(record),
    population = record.values.population,
    prediction = record.values.prediction;
  const predictedValue =
    usable(prediction) && population !== null && population > 0 && Number.isFinite(population)
      ? (prediction! / population) * 1000
      : null;
  const weights: RiskWeights =
    mode === 'COMPOSITE RESEARCH RISK'
      ? configuration.weights
      : {
          observed: mode === 'OBSERVED RISK' ? 1 : 0,
          predicted: mode === 'MODEL-ASSISTED RISK' ? 1 : 0,
          neighbor: mode === 'SPATIAL RISK' ? 1 : 0,
        };
  const totalWeight = riskVariables.reduce((sum, key) => sum + weights[key], 0);
  const components = [
    {
      id: 'observed' as const,
      label: 'Observed incidence',
      value: observed.value,
      formula: observed.formula,
      references: observed.references,
      raw: [
        { variable: 'Observed cases', value: record.values.cases },
        { variable: 'Population', value: population },
        { variable: 'Supplied incidence', value: record.values.incidence },
      ],
    },
    {
      id: 'predicted' as const,
      label: 'Predicted incidence',
      value: predictedValue,
      formula: `${record.model} predicted cases ÷ population × 1,000`,
      references: selectedReferences(record, ['prediction', 'population']),
      raw: [
        { variable: `${record.model} predicted cases`, value: prediction },
        { variable: 'Population', value: population },
      ],
    },
    {
      id: 'neighbor' as const,
      label: 'Neighbor incidence',
      value: spatial?.value ?? null,
      formula: 'arithmetic mean observed incidence of all queen-contiguous neighbors',
      references: spatial?.neighbors.flatMap((n) => n.references) ?? [],
      raw:
        spatial?.neighbors.map((n) => ({
          variable: `${n.district} incidence / 1,000`,
          value: n.value,
        })) ?? [],
    },
  ].map((component) => ({
    ...component,
    weight: weights[component.id],
    normalizedWeight: totalWeight > 0 ? weights[component.id] / totalWeight : 0,
    contribution:
      weights[component.id] === 0
        ? 0
        : component.value === null || !Number.isFinite(component.value)
          ? null
          : (component.value * weights[component.id]) / totalWeight,
  }));
  const reasons: string[] = [];
  if (!validRiskWeights(weights))
    reasons.push('A finite, nonnegative configuration with positive total weight is required.');
  for (const component of components)
    if (component.weight > 0 && component.contribution === null)
      reasons.push(
        `${component.label} is unavailable${component.id === 'neighbor' ? `: ${spatial?.reason || 'Administrative geometry not connected'}` : '; required source fields missing or invalid'}.`,
      );
  let score = reasons.length ? null : components.reduce((sum, c) => sum + c.contribution!, 0);
  if (score !== null && !Number.isFinite(score)) {
    reasons.push('Calculated score exceeds finite numeric range.');
    score = null;
  }
  const [moderate, high, veryHigh] = configuration.thresholds;
  const category =
    score === null
      ? 'INSUFFICIENT DATA'
      : score >= veryHigh
        ? 'VERY HIGH'
        : score >= high
          ? 'HIGH'
          : score >= moderate
            ? 'MODERATE'
            : 'LOW';
  const classificationThreshold =
    score === null
      ? 'Unavailable: required inputs missing'
      : category === 'VERY HIGH'
        ? `score ≥ ${veryHigh}`
        : category === 'HIGH'
          ? `${high} ≤ score < ${veryHigh}`
          : category === 'MODERATE'
            ? `${moderate} ≤ score < ${high}`
            : `0 ≤ score < ${moderate}`;
  const references = components.filter((c) => c.weight > 0).flatMap((c) => c.references);
  const dataVerification =
    references.length && references.every((ref) => ref.classification === 'VERIFIED')
      ? 'All contributing tabular inputs labeled VERIFIED in the source registry; not independently audited'
      : 'Contributing inputs missing or not all labeled VERIFIED; see source registry classifications';
  return {
    district: record.district,
    code: record.code,
    year: record.year,
    model: record.model,
    mode,
    configuration,
    components,
    score,
    category,
    classificationThreshold,
    references,
    reasons,
    issues: record.issues,
    usesGeometry: components.some((c) => c.id === 'neighbor' && c.weight > 0),
    dataVerification,
    normalization:
      'All component values use incidence per 1,000. No min-max scaling, z-score normalization, or clipping is applied. Weights are divided by their sum. Missing positive-weight inputs are never dropped or reweighted.',
    formula:
      mode === 'OBSERVED RISK'
        ? observed.formula
        : mode === 'MODEL-ASSISTED RISK'
          ? `${record.model} predicted cases ÷ population × 1,000`
          : mode === 'SPATIAL RISK'
            ? 'mean observed incidence of all queen-contiguous neighbors'
            : `(${weights.observed} × observed incidence + ${weights.predicted} × predicted incidence + ${weights.neighbor} × neighbor incidence) ÷ ${totalWeight}`,
  };
}
export type RiskCalculation = ReturnType<typeof calculateRisk>;
