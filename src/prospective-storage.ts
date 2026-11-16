import {
  createProspective,
  lockProspective,
  attachOutcome,
  type ProspectiveRecord,
} from './prospective-engine.ts';
export const emptyProspective = (): ProspectiveRecord[] => [];
export function parseProspective(value: unknown): ProspectiveRecord[] {
  if (!Array.isArray(value) || value.length > 10000) throw Error('Invalid prospective registry.');
  const ids = new Set<string>();
  for (const r of value) {
    if (
      !r ||
      typeof r !== 'object' ||
      typeof r.forecast_id !== 'string' ||
      !r.forecast_id.trim() ||
      typeof r.created_at !== 'string' ||
      typeof r.locked !== 'boolean' ||
      ids.has(r.forecast_id)
    )
      throw Error('Invalid or duplicate prospective identifier.');
    ids.add(r.forecast_id);
    let checked = createProspective(r, r.created_at);
    if (r.locked) {
      if (
        typeof r.locked_at !== 'string' ||
        !Number.isFinite(Date.parse(r.locked_at)) ||
        Date.parse(r.locked_at) < Date.parse(r.created_at)
      )
        throw Error('Invalid lock provenance.');
      checked = lockProspective(checked, r.locked_at);
    } else if (r.locked_at !== undefined)
      throw Error('Unlocked forecast cannot have a lock timestamp.');
    if (r.outcome !== null) {
      if (
        typeof r.outcome_received_at !== 'string' ||
        !Number.isFinite(Date.parse(r.outcome_received_at))
      )
        throw Error('Missing outcome timestamp.');
      checked = attachOutcome(checked, r.outcome, r.outcome_received_at);
    } else if (r.outcome_received_at !== undefined)
      throw Error('Outcome timestamp without outcome.');
    if (checked.status !== r.status || checked.locked !== r.locked || checked.error !== r.error)
      throw Error('Inconsistent forecast status or residual.');
  }
  return value;
}
export function previewOutcomes(
  value: unknown,
  records: ProspectiveRecord[],
  now = new Date().toISOString(),
) {
  if (!Array.isArray(value) || !value.length || value.length > 10000)
    throw Error('Nonempty JSON array of forecast_id/outcome required (maximum 10,000).');
  const next = [...records];
  const seen = new Set<string>();
  for (const r of value) {
    if (
      !r ||
      typeof r !== 'object' ||
      Object.keys(r).length !== 2 ||
      typeof r.forecast_id !== 'string' ||
      !Object.hasOwn(r, 'outcome')
    )
      throw Error('Only aggregate forecast_id/outcome columns are accepted.');
    if (seen.has(r.forecast_id)) throw Error('Duplicate outcome identifier');
    seen.add(r.forecast_id);
    const index = next.findIndex((row) => row.forecast_id === r.forecast_id);
    if (index < 0) throw Error('Unknown forecast identifier');
    next[index] = attachOutcome(next[index], r.outcome, now);
  }
  return { records: parseProspective(next), changed: seen.size, base: JSON.stringify(records) };
}
