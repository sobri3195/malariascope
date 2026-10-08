export type ReadinessStatus =
  | 'CONNECTED'
  | 'PARTIAL'
  | 'SUMMARY ONLY'
  | 'NOT CONNECTED'
  | 'INVALID'
  | 'VERIFIED RESEARCH EXTRACTION'
  | 'SUPPLIED STUDY OUTPUT';
export function fieldReadiness(
  rows: { [key: string]: unknown }[],
  fields: string[],
): ReadinessStatus {
  if (!rows.length) return 'NOT CONNECTED';
  if (
    rows.some((r) =>
      fields.some(
        (f) =>
          Number.isFinite(r[f]) &&
          ((['cases', 'population', 'prediction', 'rainfall', 'humidity'].includes(f) &&
            Number(r[f]) < 0) ||
            (f === 'population' && Number(r[f]) <= 0) ||
            (f === 'humidity' && Number(r[f]) > 100)),
      ),
    )
  )
    return 'INVALID';
  const count = rows.filter((r) =>
    fields.every((f) => Number.isFinite(r[f]) && (f !== 'population' || Number(r[f]) > 0)),
  ).length;
  return count === rows.length
    ? 'CONNECTED'
    : rows.some((r) => fields.some((f) => Number.isFinite(r[f])))
      ? 'PARTIAL'
      : 'NOT CONNECTED';
}
