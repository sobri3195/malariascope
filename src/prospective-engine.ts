export type ProspectiveRecord = {
  forecast_id: string;
  issue_date: string;
  target_period: string;
  data_cutoff: string;
  dataset_version: string;
  dataset_hash: string;
  model_version: string;
  model: string;
  prediction: number;
  persistence_prediction: number;
  district: string;
  status: 'DRAFT' | 'LOCKED' | 'OUTCOME AVAILABLE';
  locked: boolean;
  outcome: number | null;
  error: number | null;
  created_at: string;
  locked_at?: string;
  outcome_received_at?: string;
  features?: Record<string, number>;
  predictionInterval?: [number, number];
};
export function targetWindow(period: string) {
  if (!/^\d{4}(-\d{2}(-\d{2})?)?$/.test(period))
    throw Error('Target period must be YYYY, YYYY-MM or YYYY-MM-DD.');
  const [year, month = 1, day = 1] = period.split('-').map(Number),
    start = Date.UTC(year, month - 1, day);
  if (
    year < 1900 ||
    year > 2100 ||
    new Date(start).toISOString().slice(0, 10) !==
      [year, String(month).padStart(2, '0'), String(day).padStart(2, '0')].join('-')
  )
    throw Error('Invalid target period.');
  return {
    start,
    end:
      period.length === 4
        ? Date.UTC(year + 1, 0, 1)
        : period.length === 7
          ? Date.UTC(year, month, 1)
          : start + 86400000,
  };
}
export function createProspective(
  input: Omit<
    ProspectiveRecord,
    'forecast_id' | 'status' | 'locked' | 'outcome' | 'error' | 'created_at'
  >,
  now = new Date().toISOString(),
): ProspectiveRecord {
  for (const field of [
    'issue_date',
    'target_period',
    'data_cutoff',
    'dataset_version',
    'dataset_hash',
    'model_version',
    'model',
    'district',
  ] as const)
    if (typeof input[field] !== 'string' || !input[field].trim()) throw Error(`Missing ${field}`);
  if (!/^[a-f\d]{64}$/i.test(input.dataset_hash)) throw Error('Dataset hash must be SHA-256.');
  if (
    input.predictionInterval !== undefined &&
    (!Array.isArray(input.predictionInterval) ||
      input.predictionInterval.length !== 2 ||
      !input.predictionInterval.every(Number.isFinite) ||
      input.predictionInterval[0] < 0 ||
      input.predictionInterval[1] < input.predictionInterval[0])
  )
    throw Error('Prediction interval must contain ordered finite nonnegative bounds.');
  const issue = Date.parse(input.issue_date),
    cutoff = Date.parse(input.data_cutoff),
    target = targetWindow(input.target_period).start;
  if (
    !Number.isFinite(issue) ||
    !Number.isFinite(cutoff) ||
    !Number.isFinite(target) ||
    cutoff > issue ||
    target <= issue
  )
    throw Error('Require valid dates: data cutoff ≤ issue date < target period start.');
  if (!Number.isFinite(Date.parse(now)) || Date.parse(now) >= target)
    throw Error('Prospective target period must begin after registration.');
  if (issue > Date.parse(now)) throw Error('Issue date cannot be in the future.');
  if (
    !Number.isFinite(input.prediction) ||
    input.prediction < 0 ||
    !Number.isFinite(input.persistence_prediction) ||
    input.persistence_prediction < 0
  )
    throw Error('Both point predictions must be nonnegative.');
  if (
    input.features !== undefined &&
    (!input.features ||
      typeof input.features !== 'object' ||
      Array.isArray(input.features) ||
      Object.entries(input.features).some(
        ([k, v]) =>
          !k.trim() ||
          /password|secret|token|patient|troop|military/i.test(k) ||
          !Number.isFinite(v),
      ))
  )
    throw Error(
      'Feature values must be finite, aggregated analytical inputs without sensitive metadata.',
    );
  return {
    ...input,
    forecast_id: crypto.randomUUID(),
    locked: false,
    status: 'DRAFT',
    outcome: null,
    error: null,
    created_at: now,
  };
}
export function lockProspective(record: ProspectiveRecord, now = new Date().toISOString()) {
  if (record.locked) return record;
  if (Date.parse(now) >= targetWindow(record.target_period).start)
    throw Error('Cannot lock as prospective after the target period begins.');
  return { ...record, locked: true, status: 'LOCKED' as const, locked_at: now };
}
export function attachOutcome(
  record: ProspectiveRecord,
  outcome: number,
  now = new Date().toISOString(),
) {
  if (!record.locked) throw Error('Lock the forecast before adding an outcome.');
  if (record.outcome !== null)
    throw Error('An outcome is already registered; no silent overwrite.');
  if (!Number.isSafeInteger(outcome) || outcome < 0)
    throw Error('Outcome must be a nonnegative episode count.');
  if (Date.parse(now) < targetWindow(record.target_period).end)
    throw Error('Target period is not complete; an annual/monthly outcome is not yet eligible.');
  return {
    ...record,
    outcome,
    error: record.prediction - outcome,
    status: 'OUTCOME AVAILABLE' as const,
    outcome_received_at: now,
  };
}
export function prospectiveMetrics(pairs: ProspectiveRecord[], baseline = false) {
  if (!pairs.length) return null;
  const errors = pairs.map(
    (r) => (baseline ? r.persistence_prediction : r.prediction) - r.outcome!,
  );
  const absolute = errors.map(Math.abs).sort((a, b) => a - b);
  const residuals = [...errors].sort((a, b) => a - b);
  const intervalPairs = baseline
    ? []
    : pairs.filter(
        (r) =>
          Array.isArray(r.predictionInterval) &&
          r.predictionInterval.length === 2 &&
          r.predictionInterval.every(Number.isFinite) &&
          r.predictionInterval[0] >= 0 &&
          r.predictionInterval[0] <= r.predictionInterval[1],
      );

  return {
    residualDistribution: {
      minimum: residuals[0],
      median:
        (residuals[Math.floor((residuals.length - 1) / 2)] +
          residuals[Math.floor(residuals.length / 2)]) /
        2,
      maximum: residuals[residuals.length - 1],
    },
    intervalReview: intervalPairs.length
      ? {
          n: intervalPairs.length,
          coverage:
            intervalPairs.filter(
              (r) =>
                r.outcome! >= r.predictionInterval![0] && r.outcome! <= r.predictionInterval![1],
            ).length / intervalPairs.length,
          meanWidth:
            intervalPairs.reduce(
              (sum, r) => sum + r.predictionInterval![1] - r.predictionInterval![0],
              0,
            ) / intervalPairs.length,
        }
      : null,
    n: errors.length,
    mae: absolute.reduce((s, v) => s + v, 0) / errors.length,
    rmse: Math.sqrt(errors.reduce((s, v) => s + v * v, 0) / errors.length),
    bias: errors.reduce((s, v) => s + v, 0) / errors.length,
    medianAbsoluteError:
      (absolute[Math.floor((absolute.length - 1) / 2)] +
        absolute[Math.floor(absolute.length / 2)]) /
      2,
  };
}
export function monitorProspective(records: ProspectiveRecord[]) {
  const pairs = records.filter((r) => r.locked && r.outcome !== null && Number.isFinite(r.outcome));
  const keys = [
    ...new Set(
      pairs.map((r) =>
        JSON.stringify([
          r.model,
          r.model_version,
          r.target_period,
          r.dataset_version,
          r.dataset_hash,
        ]),
      ),
    ),
  ];
  const groups = keys.map((key) => {
    const cohort = pairs.filter(
      (r) =>
        JSON.stringify([
          r.model,
          r.model_version,
          r.target_period,
          r.dataset_version,
          r.dataset_hash,
        ]) === key,
    );
    const first = cohort[0];
    const duplicateDistricts = [
      ...new Set(
        cohort
          .filter((r) => cohort.filter((x) => x.district === r.district).length > 1)
          .map((r) => r.district),
      ),
    ];
    const usable = cohort.filter((r) => !duplicateDistricts.includes(r.district));
    return {
      key,
      modelName: first.model,
      version: first.model_version,
      period: first.target_period,
      datasetVersion: first.dataset_version,
      datasetHash: first.dataset_hash,
      pairs: usable,
      duplicateDistricts,
      model: prospectiveMetrics(usable),
      persistence: prospectiveMetrics(usable, true),
    };
  });
  const comparable = [
    ...new Set(
      groups.map((g) => JSON.stringify([g.modelName, g.version, g.datasetVersion, g.datasetHash])),
    ),
  ];
  const drift = comparable.flatMap((key) => {
    const series = groups
      .filter(
        (g) => JSON.stringify([g.modelName, g.version, g.datasetVersion, g.datasetHash]) === key,
      )
      .sort((a, b) => a.period.localeCompare(b.period));
    if (series.length < 2) return [];
    const first = series[0],
      last = series[series.length - 1];
    const common = [...new Set(first.pairs.map((r) => r.district))].filter((d) =>
      last.pairs.some((r) => r.district === d),
    );
    const reference = prospectiveMetrics(first.pairs.filter((r) => common.includes(r.district))),
      current = prospectiveMetrics(last.pairs.filter((r) => common.includes(r.district)));
    const features = [...new Set(first.pairs.flatMap((r) => Object.keys(r.features || {})))].map(
      (name) => {
        const a = first.pairs
          .filter((r) => common.includes(r.district))
          .map((r) => r.features?.[name])
          .filter((v): v is number => v !== undefined && Number.isFinite(v));
        const b = last.pairs
          .filter((r) => common.includes(r.district))
          .map((r) => r.features?.[name])
          .filter((v): v is number => v !== undefined && Number.isFinite(v));
        const mean = (x: number[]) => x.reduce((s, v) => s + v, 0) / x.length;
        const variance =
          a.length >= 3 ? a.reduce((s, v) => s + (v - mean(a)) ** 2, 0) / (a.length - 1) : 0;
        return {
          name,
          referenceN: a.length,
          currentN: b.length,
          standardizedMeanShift:
            a.length >= 3 && b.length >= 3 && variance > 0
              ? (mean(b) - mean(a)) / Math.sqrt(variance)
              : null,
        };
      },
    );
    return [
      {
        features,
        key,
        model: first.modelName,
        version: first.version,
        referencePeriod: first.period,
        currentPeriod: last.period,
        commonDistricts: common.length,
        maeChange: common.length >= 3 && current && reference ? current.mae - reference.mae : null,
        maePercentageChange:
          common.length >= 3 && current && reference && reference.mae > 0
            ? ((current.mae - reference.mae) / reference.mae) * 100
            : null,
        biasChange:
          common.length >= 3 && current && reference ? current.bias - reference.bias : null,
        status:
          common.length >= 3
            ? 'DESCRIPTIVE ERROR SHIFT — NOT A SIGNIFICANCE TEST'
            : 'INSUFFICIENT MATCHED DISTRICTS',
      },
    ];
  });
  return {
    drift,
    status: pairs.length ? 'PERFORMANCE REVIEW AVAILABLE' : 'INSUFFICIENT NEW OUTCOMES',
    pairs,
    groups,
    // Compatibility summaries are only available for a single homogeneous cohort.
    model: groups.length === 1 ? groups[0].model : null,
    persistence: groups.length === 1 ? groups[0].persistence : null,
  };
}
