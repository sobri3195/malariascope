import { regionName } from './indonesia/engine.ts';
import { regionProfile, type RegionalValue } from './region-profile.ts';

// URL references contain identities only; observations always come from validated snapshots.
export type RegionReference = {
  region: string;
  source: 'skdr' | 'sismal';
  snapshot: string;
  year: number;
  version: string;
};
export function parseRegionReference(raw: string | null): RegionReference | null {
  if (raw && raw.length > 2000) return null;
  try {
    const r = JSON.parse(raw || 'null');
    if (!r || !regionName('2025', r.region) || !Number.isInteger(r.year)) return null;
    if (r.source !== 'skdr' && r.source !== 'sismal') return null;
    if (typeof r.version !== 'string' || !r.version || r.version.length > 200) return null;
    if (
      r.source === 'sismal'
        ? ![2025, 2026].includes(r.year) || r.snapshot !== `sismal-${r.year}`
        : typeof r.snapshot !== 'string' ||
          !/^20\d{2}-m(?:[1-9]|[1-4]\d|5[0-3])$/.test(r.snapshot) ||
          Number(r.snapshot.slice(0, 4)) !== r.year
    )
      return null;
    return {
      region: r.region,
      source: r.source,
      snapshot: r.snapshot,
      year: r.year,
      version: r.version,
    };
  } catch {
    return null;
  }
}
export function comparisonObservation(
  ref: RegionReference,
  values: RegionalValue[],
  level: 'province' | 'district',
  source: string,
  period: string,
  definition: string,
  indicator: string,
) {
  return {
    ...regionProfile(ref.region, values, level),
    source,
    period,
    definition,
    indicator,
    unit: 'kasus',
  };
}
export type ComparisonObservation = ReturnType<typeof comparisonObservation>;
export function compareRegions(a: ComparisonObservation, b: ComparisonObservation) {
  const reasons: string[] = [];
  if (a.level !== b.level) reasons.push('Jenjang wilayah berbeda.');
  if (a.indicator !== b.indicator) reasons.push('Indikator berbeda.');
  if (a.unit !== b.unit) reasons.push('Satuan berbeda.');
  if (a.period !== b.period) reasons.push('Periode berbeda.');
  if (!a.definition || !b.definition || a.definition !== b.definition)
    reasons.push('Definisi sumber atau versi snapshot berbeda.');
  if (a.value === null || b.value === null)
    reasons.push('Angka salah satu wilayah belum tersedia.');
  if (reasons.length) return { reasons, difference: null, relative: null };
  return {
    reasons,
    difference: b.value! - a.value!,
    relative: a.value! > 0 ? ((b.value! - a.value!) / a.value!) * 100 : null,
  };
}
