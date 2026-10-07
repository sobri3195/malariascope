import { normalize } from './analytics.ts';
import { validateGeometry } from './geometry.ts';
import { adjacencyGraph } from './hotspot-spatial.ts';
import { featureIdentity, featureName, type MapFeature } from './map-intelligence.ts';
import type { Record360 } from './district-intelligence.ts';
import { observedRiskInput, recordIdentity, type SpatialRiskInputs } from './risk-engine.ts';
export function spatialRiskInputs(geometry: unknown, records: Record360[]): SpatialRiskInputs {
  const result: SpatialRiskInputs = {};
  const unavailable = (reason: string) =>
    Object.fromEntries(
      records.map((record) => [
        recordIdentity(record),
        { value: null, neighbors: [], reason, geometryUsed: false },
      ]),
    );
  if (!geometry) return unavailable('District administrative geometry is not connected');
  try {
    validateGeometry(geometry);
    const features = (geometry as { features: MapFeature[] }).features;
    const matched = features.map((feature) => {
      const code = feature.properties.district_code || feature.properties.code;
      const candidates = records.filter((record) =>
        code && record.code
          ? String(code) === record.code
          : normalize(featureName(feature)) === normalize(record.district) ||
            record.references.some(
              (ref) => normalize(ref.district) === normalize(featureName(feature)),
            ),
      );
      return { feature, record: candidates.length === 1 ? candidates[0] : null };
    });
    const unique = matched.map((match) => ({
      ...match,
      record:
        match.record && matched.filter((other) => other.record === match.record).length === 1
          ? match.record
          : null,
    }));
    const graph = adjacencyGraph(features);
    for (const record of records) {
      const target = unique.find((match) => match.record === record);
      if (!target) {
        result[recordIdentity(record)] = {
          value: null,
          neighbors: [],
          reason: 'A unique one-to-one administrative match is required',
          geometryUsed: false,
        };
        continue;
      }
      const ids = graph[featureIdentity(target.feature)] || [];
      const neighbors = ids.map((id) => {
        const match = unique.find((other) => featureIdentity(other.feature) === id);
        const input = match?.record ? observedRiskInput(match.record) : null;
        return {
          district:
            match?.record?.district || (match ? featureName(match.feature) : 'Unmatched district'),
          value: input?.value ?? null,
          references: input?.references ?? [],
        };
      });
      const complete =
        neighbors.length > 0 &&
        neighbors.every((n) => n.value !== null && Number.isFinite(n.value));
      result[recordIdentity(record)] = {
        value: complete ? neighbors.reduce((sum, n) => sum + n.value!, 0) / neighbors.length : null,
        neighbors,
        geometryUsed: true,
        reason: !neighbors.length
          ? 'District has no queen-contiguous neighbors'
          : !complete
            ? 'At least one adjacent district has missing or ambiguous incidence inputs'
            : 'Queen contiguity: shared edge or vertex; all adjacent district inputs included. Not a significance-tested spatial cluster.',
      };
    }
    return result;
  } catch (error) {
    return unavailable(
      error instanceof Error ? error.message : 'Administrative geometry could not be analyzed',
    );
  }
}
