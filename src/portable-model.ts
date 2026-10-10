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
};
export function validatePortableModel(value: unknown): asserts value is PortableModel {
  const a = value as PortableModel;
  if (
    !a ||
    a.schema !== 'malariascope-portable-model-v1' ||
    typeof a.model !== 'string' ||
    typeof a.version !== 'string' ||
    !/^([a-f0-9]{64})$/i.test(a.datasetHash) ||
    !['USER-TRAINED RESEARCH OUTPUT', 'SYNTHETIC'].includes(a.classification) ||
    !Number.isInteger(a.trainingEnd) ||
    !Array.isArray(a.features) ||
    !a.features.length ||
    a.features.length > 30 ||
    a.features.some((f) => !f || typeof f.name !== 'string' || typeof f.unit !== 'string') ||
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
  if (a.coefficients) {
    if (
      !Number.isFinite(a.intercept) ||
      a.coefficients.length !== a.features.length ||
      a.coefficients.some((x) => !Number.isFinite(x))
    )
      throw Error('Invalid regression coefficients.');
  } else if (a.trees?.length) {
    if (
      a.trees.length > 1000 ||
      !['mean', 'sum'].includes(a.aggregation || '') ||
      !Number.isFinite(a.initial) ||
      !Number.isFinite(a.learningRate)
    )
      throw Error('Invalid tree ensemble.');
    for (const t of a.trees) {
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
    return (v - a.mean[i]) / a.scale[i];
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
  };
}
