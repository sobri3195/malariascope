import { booleanIntersects } from '@turf/turf';
import { normalize, risk } from './analytics';
import { incidence360, type Record360, type SpatialContext } from './district-intelligence';
export function districtSpatialContext(
  geometry: any,
  records: Record360[],
  district: string,
  year: number,
  thresholds: number[],
): SpatialContext {
  if (!geometry)
    return {
      neighbors: null,
      quadrant: null,
      neighborIncidence: null,
      neighborRisk: 'INSUFFICIENT DATA',
      method: 'District administrative geometry not connected',
    };
  const selected = records.find(
    (r) =>
      normalize(r.district) === normalize(district) ||
      r.references.some((ref) => normalize(ref.district) === normalize(district)),
  );
  const identify = (f: any) => {
    const code = f.properties?.district_code || f.properties?.code,
      name = String(f.properties?.district || f.properties?.name || '');
    const candidates = records.filter(
      (r) =>
        r.year === year &&
        (code
          ? r.code === String(code)
          : normalize(r.district) === normalize(name) ||
            r.references.some((ref) => normalize(ref.district) === normalize(name))),
    );
    return candidates.length === 1 ? candidates[0] : undefined;
  };
  const features = geometry.features || [];
  const target = features.filter((f: any) => {
    const code = f.properties?.district_code || f.properties?.code;
    return selected?.code && code
      ? String(code) === selected.code
      : normalize(String(f.properties?.district || f.properties?.name || '')) ===
          normalize(district);
  });
  if (target.length !== 1)
    return {
      neighbors: null,
      quadrant: null,
      neighborIncidence: null,
      neighborRisk: 'INSUFFICIENT DATA',
      method: 'A unique administrative match is required',
      error: 'District geometry unmatched or ambiguous; manual confirmation required.',
    };
  const adjacent = features.filter((f: any) => f !== target[0] && booleanIntersects(target[0], f));
  const neighbors = adjacent.map(
    (f: any) => identify(f)?.district || String(f.properties?.district || f.properties?.name || ''),
  );
  const linked = adjacent.map(identify);
  const incs = linked.map((r: Record360 | undefined) => incidence360(r));
  const neighborIncidence =
    incs.length && incs.every((v: number | null) => v !== null)
      ? incs.reduce((a: number, v: number | null) => a + v!, 0) / incs.length
      : null;
  const cohort = records.filter((r) => r.year === year && r.values.cases !== null),
    current = cohort.find((r) =>
      selected?.code ? r.code === selected.code : normalize(r.district) === normalize(district),
    );
  const mean = cohort.length
    ? cohort.reduce((a, r) => a + r.values.cases!, 0) / cohort.length
    : null;
  const neighborCases = linked.map((r: Record360 | undefined) => r?.values.cases ?? null);
  const lag =
    neighborCases.length && neighborCases.every((v: number | null) => v !== null)
      ? neighborCases.reduce((a: number, v: number | null) => a + v!, 0) / neighborCases.length
      : null;
  const quadrant =
    current &&
    cohort.length >= 3 &&
    new Set(cohort.map((r) => r.values.cases)).size > 1 &&
    mean !== null &&
    lag !== null
      ? current.values.cases! >= mean
        ? lag >= mean
          ? 'HIGH–HIGH'
          : 'HIGH–LOW'
        : lag >= mean
          ? 'LOW–HIGH'
          : 'LOW–LOW'
      : null;
  return {
    neighbors,
    quadrant,
    neighborIncidence,
    neighborRisk:
      neighborIncidence === null
        ? 'INSUFFICIENT DATA'
        : risk({ district, year, cases: neighborIncidence, population: 1000 }, thresholds),
    method:
      'Queen contiguity; quadrant compares current and mean neighbor cases with the loaded cohort mean (minimum 3 districts). Neighbor incidence requires complete adjacent-district inputs. Exploratory classifications do not imply statistical significance.',
  };
}
