import { readinessDomainDefinitions, readinessStates } from './readiness-engine.ts';
export type ResourceEvidence = {
  district: string;
  year: number;
  domain: string;
  status: string;
  source: string;
  license: string;
  reviewedAt: string;
  expiresAt: string;
  note?: string;
};
export function validateResources(input: unknown): ResourceEvidence[] {
  if (!Array.isArray(input)) throw Error('Resource evidence must be a JSON array');
  const seen = new Set<string>();
  return input.map((r, i) => {
    if (
      !r ||
      !['district', 'source', 'license'].every((k) => typeof r[k] === 'string' && r[k].trim()) ||
      !Number.isInteger(r.year) ||
      r.year < 1900 ||
      r.year > 2100 ||
      !readinessDomainDefinitions.some((d) => d.id === r.domain) ||
      !readinessStates.includes(r.status) ||
      !Number.isFinite(Date.parse(r.reviewedAt)) ||
      !Number.isFinite(Date.parse(r.expiresAt)) ||
      Date.parse(r.expiresAt) <= Date.parse(r.reviewedAt)
    )
      throw Error(`Invalid resource evidence row ${i + 1}`);
    const key = `${r.district.toLowerCase()}:${r.year}:${r.domain}`;
    if (seen.has(key)) throw Error('Duplicate resource evidence');
    seen.add(key);
    return { ...r, note: typeof r.note === 'string' ? r.note.slice(0, 1000) : '' };
  });
}
export function resourceFreshness(r: ResourceEvidence, now = Date.now()) {
  return now < Date.parse(r.reviewedAt)
    ? 'FUTURE REVIEW DATE'
    : now > Date.parse(r.expiresAt)
      ? 'EXPIRED — REVIEW REQUIRED'
      : 'WITHIN DECLARED REVIEW WINDOW';
}
