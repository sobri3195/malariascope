import { booleanIntersects } from '@turf/turf';
import { incidence, normalize, risk, type Row } from './analytics.ts';
import { resolveFeatureRow } from './geometry.ts';
import { featureName, featureIdentity, type MapFeature } from './map-intelligence.ts';
import type { SpatialInput } from './moran.ts';
export type Adjacency = Record<string, string[]>;
export function adjacencyGraph(features: MapFeature[]): Adjacency {
  const graph: Adjacency = Object.fromEntries(features.map((f) => [featureIdentity(f), []]));
  for (let i = 0; i < features.length; i++)
    for (let j = i + 1; j < features.length; j++) {
      if (booleanIntersects(features[i] as any, features[j] as any)) {
        graph[featureIdentity(features[i])].push(featureIdentity(features[j]));
        graph[featureIdentity(features[j])].push(featureIdentity(features[i]));
      }
    }
  return graph;
}
export function hotspotContext(
  features: MapFeature[],
  graph: Adjacency,
  rows: Row[],
  year: number,
  selected: string,
  thresholds: number[],
) {
  const current = rows.filter((r) => r.year === year);
  const matched = features.map((f) => ({ feature: f, row: resolveFeatureRow(f, current) }));
  const unique = matched.filter(
    (m) => m.row && matched.filter((other) => other.row === m.row).length === 1,
  );
  const known = unique.filter((m) => Number.isFinite(m.row!.cases));
  const mean = known.length ? known.reduce((sum, m) => sum + m.row!.cases, 0) / known.length : null;
  const variance =
    mean === null
      ? 0
      : known.reduce((sum, m) => sum + (m.row!.cases - mean) ** 2, 0) / known.length;
  const clusters: Record<string, string> = {};
  for (const m of known) {
    const ids = graph[featureIdentity(m.feature)] || [];
    const neighbors = ids.map(
      (id) => unique.find((other) => featureIdentity(other.feature) === id)?.row,
    );
    if (
      known.length < 3 ||
      !variance ||
      !neighbors.length ||
      neighbors.some((r) => !r || !Number.isFinite(r.cases))
    )
      continue;
    const lag = neighbors.reduce((sum, r) => sum + r!.cases, 0) / neighbors.length;
    clusters[normalize(m.row!.district)] =
      m.row!.cases >= mean!
        ? lag >= mean!
          ? 'HIGH–HIGH'
          : 'HIGH–LOW'
        : lag >= mean!
          ? 'LOW–HIGH'
          : 'LOW–LOW';
  }
  const codes = new Set(
    rows
      .filter((r) => normalize(r.district) === normalize(selected))
      .map((r) => r.district_code)
      .filter(Boolean),
  );
  const selectedCode = codes.size === 1 ? [...codes][0] : null;
  const targets = matched.filter((m) =>
    selectedCode && (m.feature.properties.district_code || m.feature.properties.code)
      ? String(m.feature.properties.district_code || m.feature.properties.code) === selectedCode
      : normalize(m.row?.district || featureName(m.feature)) === normalize(selected),
  );
  const target = targets.length === 1 ? targets[0] : undefined;
  const neighborIds = target ? graph[featureIdentity(target.feature)] || [] : [];
  const neighborRows = neighborIds.map((id) =>
    matched.find((m) => featureIdentity(m.feature) === id),
  );
  const neighborMean = (field: 'cases' | 'incidence') => {
    const values = neighborRows.map((m) =>
      m?.row ? (field === 'cases' ? m.row.cases : incidence(m.row)) : null,
    );
    return values.length && values.every((v) => v !== null && Number.isFinite(v))
      ? values.reduce<number>((sum, v) => sum + v!, 0) / values.length
      : null;
  };
  const neighborBurden = neighborMean('cases'),
    neighborIncidence = neighborMean('incidence');
  const inc = target?.row ? incidence(target.row) : null;
  const input: SpatialInput = {
    names: known.map((m) => m.row!.district),
    values: known.map((m) => m.row!.cases),
    neighbors: known.map((m) =>
      (graph[featureIdentity(m.feature)] || [])
        .map((id) => known.findIndex((other) => featureIdentity(other.feature) === id))
        .filter((i) => i >= 0),
    ),
  };
  return {
    clusters,
    input,
    targetIdentity: target ? featureIdentity(target.feature) : null,
    neighborIds,
    selected: target?.row || null,
    neighbors: neighborRows.map((m) => ({
      district: m?.row?.district || (m ? featureName(m.feature) : 'Unmatched geometry'),
      cases: m?.row?.cases ?? null,
      incidence: m?.row ? incidence(m.row) : null,
    })),
    neighborBurden,
    neighborIncidence,
    burdenRatio:
      target?.row && neighborBurden !== null && neighborBurden > 0
        ? target.row.cases / neighborBurden
        : null,
    incidenceRatio:
      inc !== null && neighborIncidence !== null && neighborIncidence > 0
        ? inc / neighborIncidence
        : null,
    spatialRisk:
      neighborIncidence === null
        ? 'INSUFFICIENT DATA'
        : risk(
            { district: selected, year, cases: neighborIncidence, population: 1000 },
            thresholds,
          ),
    quadrant: target?.row ? clusters[normalize(target.row.district)] || null : null,
    geometryMatch: !!target,
    matched: known.length,
    total: features.length,
  };
}
