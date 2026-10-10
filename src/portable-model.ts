export type Tree = {
  feature: number[];
  threshold: number[];
  left: number[];
  right: number[];
  value: number[];
};
export type PortableModel = {
  schema: 'malariascope-portable-model-v1';
  model: string;
  version: string;
  datasetHash: string;
  classification: string;
  features: { name: string; unit: string }[];
  trainingEnd: number;
  validationPeriod: string;
  mean: number[];
  scale: number[];
  coefficients?: number[];
  intercept?: number;
  trees?: Tree[];
  learningRate?: number;
  initial?: number;
  aggregation?: 'mean' | 'sum';
  provenance?: {
    modelIdentity: string;
    trainingHash: string;
    trainingStart: number;
    trainingRows: number;
    seed: number;
    source: string;
    license: string;
    parameters: Record<string, number>;
    environment: { python: string; numpy: string; scikitLearn: string };
    codeHashes: Record<string, string>;
    selection: {
      status: string;
      parameters: Record<string, number>;
      folds: number[];
      candidates: unknown[];
    };
    inputRanges: { minimum: number; maximum: number }[];
  };
};
export function validatePortableModel(value: unknown): asserts value is PortableModel {
  const a = value as PortableModel;
  if (
    !a ||
    a.schema !== 'malariascope-portable-model-v1' ||
    typeof a.model !== 'string' ||
    !a.model.trim() ||
    a.model.length > 100 ||
    typeof a.version !== 'string' ||
    !a.version.trim() ||
    a.version.length > 200 ||
    !/^([a-f0-9]{64})$/i.test(a.datasetHash) ||
    !['USER-TRAINED RESEARCH OUTPUT', 'SYNTHETIC'].includes(a.classification) ||
    !Number.isInteger(a.trainingEnd) ||
    a.trainingEnd < 1900 ||
    a.trainingEnd > 2100 ||
    typeof a.validationPeriod !== 'string' ||
    !a.validationPeriod.trim() ||
    a.validationPeriod.length > 120 ||
    !Array.isArray(a.features) ||
    !a.features.length ||
    a.features.length > 30 ||
    a.features.some(
      (f) =>
        !f ||
        typeof f.name !== 'string' ||
        !f.name.trim() ||
        f.name.length > 100 ||
        typeof f.unit !== 'string' ||
        !f.unit.trim() ||
        f.unit.length > 100,
    ) ||
    new Set(a.features.map((f) => f.name)).size !== a.features.length
  )
    throw Error('Invalid portable model provenance or feature contract.');
  if (
    !Array.isArray(a.mean) ||
    !Array.isArray(a.scale) ||
    a.mean.length !== a.features.length ||
    a.scale.length !== a.features.length ||
    a.mean.some((x) => !Number.isFinite(x)) ||
    a.scale.some((x) => !Number.isFinite(x) || x <= 0)
  )
    throw Error('Invalid preprocessing.');
  if (a.provenance !== undefined) {
    const p = a.provenance;
    if (
      !p ||
      typeof p !== 'object' ||
      !/^fit-[a-f0-9]{64}$/.test(p.modelIdentity) ||
      p.modelIdentity !== a.version ||
      !/^[a-f0-9]{64}$/.test(p.trainingHash) ||
      !Number.isInteger(p.trainingStart) ||
      p.trainingStart > a.trainingEnd ||
      p.trainingStart < 1900 ||
      !Number.isInteger(p.trainingRows) ||
      p.trainingRows < 8 ||
      !Number.isInteger(p.seed) ||
      p.seed < 0 ||
      p.seed > 4294967295 ||
      typeof p.source !== 'string' ||
      !p.source.trim() ||
      typeof p.license !== 'string' ||
      !p.license.trim() ||
      !p.parameters ||
      !Object.values(p.parameters).every((v) => typeof v === 'number' && Number.isFinite(v)) ||
      !p.environment ||
      !['python', 'numpy', 'scikitLearn'].every(
        (k) => typeof p.environment[k as keyof typeof p.environment] === 'string',
      ) ||
      !p.codeHashes ||
      !Object.values(p.codeHashes).length ||
      !Object.values(p.codeHashes).every((v) => /^[a-f0-9]{64}$/.test(v)) ||
      !p.selection ||
      typeof p.selection.status !== 'string' ||
      !Array.isArray(p.selection.folds) ||
      !p.selection.folds.every((y) => Number.isInteger(y) && y <= a.trainingEnd) ||
      !Array.isArray(p.selection.candidates) ||
      !Array.isArray(p.inputRanges) ||
      p.inputRanges.length !== a.features.length ||
      p.inputRanges.some(
        (r) =>
          !r || !Number.isFinite(r.minimum) || !Number.isFinite(r.maximum) || r.minimum > r.maximum,
      )
    )
      throw Error('Invalid fitted-model provenance or training input ranges.');
  }
  if (a.coefficients) {
    if (
      !Number.isFinite(a.intercept) ||
      !Array.isArray(a.coefficients) ||
      a.coefficients.length !== a.features.length ||
      a.coefficients.some((x) => !Number.isFinite(x))
    )
      throw Error('Invalid regression coefficients.');
  } else if (Array.isArray(a.trees) && a.trees.length) {
    if (
      a.trees.length > 1000 ||
      !['mean', 'sum'].includes(a.aggregation || '') ||
      !Number.isFinite(a.initial) ||
      !Number.isFinite(a.learningRate)
    )
      throw Error('Invalid tree ensemble.');
    let totalNodes = 0;
    for (const t of a.trees) {
      if (!t || !Array.isArray(t.value)) throw Error('Invalid tree values.');
      totalNodes += t.value.length;
      if (totalNodes > 200000) throw Error('Ensemble exceeds 200,000-node limit.');
      const n = t.value?.length;
      if (
        !n ||
        n > 100000 ||
        [t.feature, t.threshold, t.left, t.right].some(
          (x) => !Array.isArray(x) || x.length !== n,
        ) ||
        t.value.some((x) => !Number.isFinite(x))
      )
        throw Error('Invalid tree dimensions.');
      for (let i = 0; i < n; i++) {
        if (!Number.isFinite(t.threshold[i]) || !Number.isInteger(t.feature[i]))
          throw Error('Invalid split');
        if (t.left[i] === -1 && t.right[i] === -1) continue;
        if (
          t.feature[i] < 0 ||
          t.feature[i] >= a.features.length ||
          !Number.isInteger(t.left[i]) ||
          !Number.isInteger(t.right[i]) ||
          t.left[i] <= i ||
          t.right[i] <= i ||
          t.left[i] >= n ||
          t.right[i] >= n
        )
          throw Error('Invalid or cyclic tree.');
      }
    }
  } else throw Error('No supported model parameters.');
}
export function predictPortable(a: PortableModel, inputs: Record<string, number>) {
  validatePortableModel(a);
  const x = a.features.map((f, i) => {
    const v = inputs[f.name];
    if (!Number.isFinite(v)) throw Error(`Missing finite input: ${f.name} (${f.unit})`);
    if (
      ((f.name === 'cases_lag1' || f.name === 'rainfall_lag1') && v < 0) ||
      (f.name === 'humidity_lag1' && (v < 0 || v > 100))
    )
      throw Error(`Input outside physical domain: ${f.name}`);
    const scaled = (v - a.mean[i]) / a.scale[i];
    if (!Number.isFinite(scaled) || (a.trees && !Number.isFinite(Math.fround(scaled))))
      throw Error(`Preprocessing overflow: ${f.name}`);
    return scaled;
  });
  let result: number;
  if (a.coefficients) result = a.intercept! + a.coefficients.reduce((s, c, i) => s + c * x[i], 0);
  else {
    const outputs = a.trees!.map((t) => {
      let i = 0;
      while (t.left[i] !== -1)
        i = Math.fround(x[t.feature[i]]) <= t.threshold[i] ? t.left[i] : t.right[i];
      return t.value[i];
    });
    result =
      a.initial! +
      (a.learningRate! * outputs.reduce((s, v) => s + v, 0)) /
        (a.aggregation === 'mean' ? outputs.length : 1);
  }
  if (!Number.isFinite(result)) throw Error('Nonfinite model output.');
  return {
    rawPrediction: result,
    prediction: Math.max(0, result),
    clipped: result < 0,
    label: 'Scenario Output — Not Observed Data',
    model: a.model,
    version: a.version,
    datasetHash: a.datasetHash,
    warnings: a.provenance
      ? a.features.flatMap((f, i) =>
          inputs[f.name] < a.provenance!.inputRanges[i].minimum ||
          inputs[f.name] > a.provenance!.inputRanges[i].maximum
            ? [
                `${f.name}: outside observed training range ${a.provenance!.inputRanges[i].minimum}–${a.provenance!.inputRanges[i].maximum}; extrapolation is unvalidated`,
              ]
            : [],
        )
      : [
          'Training provenance and input ranges unavailable for this legacy artifact; applicability cannot be assessed',
        ],
  };
}
