import {
  aggregateEvidence,
  annualChange,
  anomaly,
  type EvidenceDataset,
  type Reference,
} from './district-intelligence.ts';
export const SCENARIO_LABEL = 'Scenario Output — Not Observed Data';
export const scenarioModels = [
  'Persistence',
  'Ridge Regression',
  'Random Forest',
  'Gradient Boosting',
] as const;
export type Inputs = {
  burden: number | null;
  annualChange: number | null;
  rainfall: number | null;
  temperature: number | null;
  population: number | null;
  model: string;
  thresholds: number[];
};
export type Baseline = {
  district: string;
  year: number;
  captured: string;
  inputs: Inputs;
  references: Reference[];
  issues: string[];
  verification: string;
};
export type SavedScenario = {
  id: string;
  name: string;
  created: string;
  label: typeof SCENARIO_LABEL;
  baseline: Baseline;
  inputs: Inputs;
};
export function captureBaseline(
  datasets: EvidenceDataset[],
  active: string,
  district: string,
  year: number,
  thresholds: number[],
): Baseline {
  const records = aggregateEvidence(datasets, active, 'Persistence').records;
  const history = records.filter((r) => r.district === district && r.year <= year);
  const current = history.find((r) => r.year === year);
  const references = history.flatMap((r) =>
    r.references.filter((ref) => ref.selected && ref.field !== 'prediction'),
  );
  return {
    district,
    year,
    captured: new Date().toISOString(),
    inputs: {
      burden: current?.values.cases ?? null,
      population: current?.values.population ?? null,
      annualChange: annualChange(
        current,
        history.find((r) => r.year === year - 1),
      ),
      rainfall: anomaly(history, year, 'rainfall').value,
      temperature: anomaly(history, year, 'temperature').value,
      model: 'Persistence',
      thresholds: [...thresholds],
    },
    references,
    issues: current?.issues ?? ['No district-year observation available'],
    verification: !current
      ? 'No baseline available'
      : references.length && references.every((r) => r.classification === 'VERIFIED')
        ? 'Source records marked VERIFIED; extrapolation is not verified research output'
        : 'Source verification incomplete — baseline must not be treated as verified',
  };
}
export function category(score: number | null, thresholds: number[]) {
  if (score === null || !Number.isFinite(score) || !validThresholds(thresholds))
    return 'INSUFFICIENT DATA';
  return score < thresholds[0]
    ? 'LOW'
    : score < thresholds[1]
      ? 'MODERATE'
      : score < thresholds[2]
        ? 'HIGH'
        : 'VERY HIGH';
}
export function validThresholds(t: number[]) {
  return (
    t.length === 3 && t.every((v, i) => Number.isFinite(v) && v > 0 && (i === 0 || v > t[i - 1]))
  );
}
export function baselineScore(b: Baseline) {
  return b.inputs.burden !== null &&
    b.inputs.burden >= 0 &&
    b.inputs.population !== null &&
    b.inputs.population > 0
    ? (b.inputs.burden / b.inputs.population) * 1000
    : null;
}
export function simulate(inputs: Inputs) {
  const errors: string[] = [];
  if (inputs.burden === null || !Number.isFinite(inputs.burden) || inputs.burden < 0)
    errors.push('Burden must be a finite nonnegative number');
  if (inputs.population === null || !Number.isFinite(inputs.population) || inputs.population <= 0)
    errors.push('Population must be a finite positive number');
  if (
    inputs.annualChange === null ||
    !Number.isFinite(inputs.annualChange) ||
    inputs.annualChange < -100
  )
    errors.push('Annual change must be supplied and at least −100%');
  if (!validThresholds(inputs.thresholds))
    errors.push('Three positive, strictly increasing risk thresholds required');
  for (const field of ['rainfall', 'temperature'] as const)
    if (inputs[field] !== null && !Number.isFinite(inputs[field]))
      errors.push(`${field} must be finite or missing`);
  if (!scenarioModels.includes(inputs.model as (typeof scenarioModels)[number]))
    errors.push('Unsupported model selection');
  const projected = errors.length ? null : inputs.burden! * (1 + inputs.annualChange! / 100);
  const score0 = projected === null ? null : (projected / inputs.population!) * 1000;
  const overflow = projected !== null && (!Number.isFinite(projected) || !Number.isFinite(score0));
  if (overflow) errors.push('Projection exceeds finite numeric range');
  const cases = overflow ? null : projected,
    score = overflow ? null : score0;
  return {
    label: SCENARIO_LABEL,
    cases,
    score,
    category: category(score, inputs.thresholds),
    errors,
    modelOutput: inputs.model === 'Persistence' && errors.length === 0 ? inputs.burden : null,
    modelSupport:
      inputs.model === 'Persistence'
        ? 'Persistence: next-period cases = adjusted baseline burden; annual change and climate are not model features.'
        : 'Unavailable: trained model artifact and inference feature specification are not connected. No counterfactual model prediction is fabricated.',
    formula:
      'One-year projected cases = burden × (1 + annual percentage change / 100); analytical risk score = projected cases / population × 1,000. Climate effects are unsupported: no coefficients supplied.',
  };
}
export function sensitivity(b: Baseline, inputs: Inputs) {
  const current = simulate(inputs).score;
  return (['burden', 'annualChange', 'population', 'rainfall', 'temperature'] as const)
    .map((field) => {
      const supported = !['rainfall', 'temperature'].includes(field);
      const reverted =
        supported && b.inputs[field] !== null
          ? simulate({ ...inputs, [field]: b.inputs[field] }).score
          : null;
      return {
        field,
        adjusted: inputs[field] !== b.inputs[field],
        effect: current !== null && reverted !== null ? current - reverted : null,
        status: !supported
          ? 'Unsupported climate effect; not evidence of no biological effect'
          : reverted === null
            ? 'Baseline or valid projection unavailable'
            : 'Current score minus score with this input alone restored to baseline',
      };
    })
    .sort((a, b) => Math.abs(b.effect ?? 0) - Math.abs(a.effect ?? 0));
}
export function scenarioExport(s: SavedScenario) {
  const result = simulate(s.inputs),
    observed = baselineScore(s.baseline);
  return {
    schema: 'malariascope-exploratory-scenario-v1',
    ...s,
    horizon: 'One period after baseline year',
    result,
    changeFromObservedBaseline:
      result.score !== null && observed !== null ? result.score - observed : null,
    sensitivity: sensitivity(s.baseline, s.inputs),
    restriction: 'Separate exploratory output; never insert into observation datasets',
  };
}
export function validSavedScenario(value: unknown): value is SavedScenario {
  if (!value || typeof value !== 'object') return false;
  const s = value as SavedScenario;
  return (
    typeof s.id === 'string' &&
    typeof s.name === 'string' &&
    typeof s.created === 'string' &&
    s.label === SCENARIO_LABEL &&
    !!s.baseline &&
    typeof s.baseline.district === 'string' &&
    Number.isInteger(s.baseline.year) &&
    Array.isArray(s.baseline.references) &&
    !!s.baseline.inputs &&
    !!s.inputs &&
    ['burden', 'population', 'annualChange', 'rainfall', 'temperature'].every((k) =>
      [s.inputs, s.baseline.inputs].every(
        (i) => i[k as keyof Inputs] === null || typeof i[k as keyof Inputs] === 'number',
      ),
    ) &&
    [s.inputs, s.baseline.inputs].every(
      (i) => Array.isArray(i.thresholds) && typeof i.model === 'string',
    )
  );
}
