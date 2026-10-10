import { compareValue, normalize, validCondition, type Condition } from './analytics.ts';
export type PeriodicRecord = {
  district: string;
  period: string;
  source: string;
  metrics: Record<string, number | null>;
};
export function periodIndex(period: string, frequency: 'monthly' | 'weekly') {
  if (frequency === 'monthly') {
    if (!/^\d{4}-\d{2}$/.test(period)) throw Error('Monthly period requires YYYY-MM');
    const [y, m] = period.split('-').map(Number);
    if (m < 1 || m > 12 || y < 1900 || y > 2100) throw Error('Invalid month');
    return y * 12 + m - 1;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(period)) throw Error('Weekly period requires Monday YYYY-MM-DD');
  const d = new Date(period + 'T00:00:00Z');
  if (!Number.isFinite(+d) || d.toISOString().slice(0, 10) !== period || d.getUTCDay() !== 1)
    throw Error('Weekly periods must start on a valid Monday');
  return +d / 604800000;
}
export function evaluatePeriodic(
  records: PeriodicRecord[],
  condition: Condition,
  frequency: 'monthly' | 'weekly',
  persistence: number,
  suppress: boolean,
) {
  if (!validCondition(condition) || ![1, 2, 3].includes(persistence))
    throw Error('Invalid condition or persistence');
  const seen = new Set<string>();
  const ordered = records
    .map((r) => {
      if (
        !r ||
        typeof r.district !== 'string' ||
        !r.district.trim() ||
        typeof r.source !== 'string' ||
        !r.source.trim() ||
        !r.metrics ||
        Object.values(r.metrics).some((v) => v !== null && !Number.isFinite(v))
      )
        throw Error('Each record requires district, period, source and finite or missing metrics');
      const index = periodIndex(r.period, frequency);
      const key = normalize(r.district) + ':' + index;
      if (seen.has(key)) throw Error('Duplicate district-period');
      seen.add(key);
      return { r, index };
    })
    .sort((a, b) => a.index - b.index);
  const histories = new Map<
    string,
    { index: number; streak: number; value: number | null; evidence: PeriodicRecord[] }
  >();
  const alerts = [];
  for (const { r, index } of ordered) {
    const d = normalize(r.district),
      prior = histories.get(d),
      value = r.metrics[condition.metric] ?? null;
    const adjacent = prior?.index === index - 1;
    let compared = value;
    if (['increased by', 'decreased by'].includes(condition.operator))
      compared =
        adjacent && value !== null && prior.value !== null && prior.value > 0
          ? ((value - prior.value) / prior.value) * 100
          : null;
    const matched = compareValue(compared, condition),
      streak = matched ? (adjacent ? prior.streak : 0) + 1 : 0;
    const evidence = matched ? [...(adjacent ? prior.evidence : []), r].slice(-persistence) : [];
    histories.set(d, { index, streak, value, evidence });
    if (streak >= persistence && (!suppress || streak === persistence))
      alerts.push({
        district: r.district,
        period: r.period,
        frequency,
        source: r.source,
        comparedValue: compared,
        condition: { ...condition },
        persistence,
        evidence,
        explanation: `Explicit ${frequency} condition matched across ${persistence} adjacent periods. Missing periods reset persistence. Analytical decision support only.`,
        timestamp: new Date().toISOString(),
      });
  }
  return alerts;
}
