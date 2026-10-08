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
export function monitorProspective(records: ProspectiveRecord[]) {
  const pairs = records.filter((r) => r.locked && r.outcome !== null);
  const metrics = (baseline = false) => {
    if (!pairs.length) return null;
    const errors = pairs.map(
      (r) => (baseline ? r.persistence_prediction : r.prediction) - r.outcome!,
    );
    return {
      n: errors.length,
      mae: errors.reduce((s, v) => s + Math.abs(v), 0) / errors.length,
      rmse: Math.sqrt(errors.reduce((s, v) => s + v * v, 0) / errors.length),
      bias: errors.reduce((s, v) => s + v, 0) / errors.length,
    };
  };
  return {
    status: pairs.length ? 'PERFORMANCE REVIEW AVAILABLE' : 'INSUFFICIENT NEW OUTCOMES',
    pairs,
    model: metrics(),
    persistence: metrics(true),
  };
}
