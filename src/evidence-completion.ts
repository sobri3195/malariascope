import { normalize, type Row } from './analytics.ts';
export function coverageGaps(rows: Row[], districts: string[], start: number, end: number) {
  const lookup = new Map(rows.map((r) => [`${normalize(r.district)}:${r.year}`, r]));
  const gaps = [];
  for (const d of districts)
    for (let year = start; year <= end; year++) {
      const r = lookup.get(`${normalize(d)}:${year}`);
      const missing = ['cases', 'population', 'rainfall', 'temperature', 'humidity'].filter(
        (k) =>
          !r || !Number.isFinite(r[k as keyof Row]) || (k === 'population' && r.population! <= 0),
      );
      if (missing.length)
        gaps.push({
          district: d,
          year,
          missing,
          sourceStatus: r ? 'Partial observation' : 'No observation supplied',
        });
    }
  return gaps;
}
export type Review = {
  id: string;
  subject: string;
  source: string;
  license: string;
  reviewer: string;
  date: string;
  decision: string;
  note: string;
};
export function validateReview(r: Review) {
  for (const k of ['subject', 'source', 'license', 'reviewer', 'date', 'decision'] as const)
    if (typeof r[k] !== 'string' || !r[k].trim()) throw Error(`Missing ${k}`);
  if (!Number.isFinite(Date.parse(r.date))) throw Error('Invalid review date');
  return { ...r, id: r.id || crypto.randomUUID(), note: r.note.slice(0, 2000) };
}
