import { booleanIntersects, bboxPolygon } from '@turf/turf';
import { incidence, metric, normalize, risk, type Row } from './analytics.ts';
import { resolveFeatureRow } from './geometry.ts';
export type Bounds = { west: number; south: number; east: number; north: number };
export type MapFeature = {
  type: 'Feature';
  properties: Record<string, any>;
  geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: any[] };
};
export { layerOptions, modes, type LayerId } from './map-options.ts';
export const riskNames = ['LOW', 'MODERATE', 'HIGH', 'VERY HIGH'];
export const clusterNames = ['LOW–LOW', 'LOW–HIGH', 'HIGH–LOW', 'HIGH–HIGH'];
export const palette = ['#349b8a', '#e1bc56', '#d88853', '#b7504e'];
export const clusterPalette = ['#397fa6', '#99c5d7', '#e7ac80', '#b7504e'];
export function featureName(f: MapFeature) {
  return String(f.properties?.district || f.properties?.name || 'Unnamed district');
}
export function featureIdentity(f: MapFeature) {
  return String(f.properties?.district_code || f.properties?.code || normalize(featureName(f)));
}
export function matchedFeatures(features: MapFeature[], rows: Row[]) {
  const candidates = features.map((feature) => ({
    feature,
    row: resolveFeatureRow(feature, rows),
  }));
  const counts = new Map<Row, number>();
  for (const { row } of candidates) if (row) counts.set(row, (counts.get(row) || 0) + 1);
  return candidates.map((m) => ({ ...m, row: m.row && counts.get(m.row) === 1 ? m.row : null }));
}
export function geometryBounds(features: MapFeature[]): Bounds | null {
  let extent: Bounds | null = null;
  for (const f of features) {
    const polygons =
      f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const polygon of polygons)
      for (const ring of polygon)
        for (const [lon, lat] of ring) {
          if (!extent) extent = { west: lon, east: lon, south: lat, north: lat };
          else {
            extent.west = Math.min(extent.west, lon);
            extent.east = Math.max(extent.east, lon);
            extent.south = Math.min(extent.south, lat);
            extent.north = Math.max(extent.north, lat);
          }
        }
  }
  return extent;
}
export function intersectsBounds(feature: MapFeature, bounds: Bounds) {
  const extent = geometryBounds([feature]);
  if (!(
    extent !== null &&
    extent.east >= bounds.west &&
    extent.west <= bounds.east &&
    extent.north >= bounds.south &&
    extent.south <= bounds.north
  ))
    return false;
  return booleanIntersects(
    feature as any,
    bboxPolygon([bounds.west, bounds.south, bounds.east, bounds.north]),
  );
}
export function mapValue(
  row: Row | undefined | null,
  layer: string,
  rows: Row[],
  model: string,
  thresholds: number[],
  clusters: Record<string, string> = {},
): number | null {
  if (!row) return null;
  if (layer === 'cluster') {
    const index = clusterNames.indexOf(clusters[normalize(row.district)]);
    return index < 0 ? null : index;
  }
  if (layer === 'risk') {
    const index = riskNames.indexOf(risk(row, thresholds));
    return index < 0 ? null : index;
  }
  if (layer === 'prediction_risk') {
    if (
      row.model !== model ||
      !Number.isFinite(row.prediction) ||
      row.prediction! < 0 ||
      !Number.isFinite(row.population) ||
      row.population! <= 0
    )
      return null;
    const v = (row.prediction! / row.population!) * 1000;
    return v >= thresholds[2] ? 3 : v >= thresholds[1] ? 2 : v >= thresholds[0] ? 1 : 0;
  }
  if (layer === 'prediction')
    return Number.isFinite(row.prediction) && row.prediction! >= 0
      ? metric(row, rows, 'predicted_cases', { model })
      : null;
  if (
    ['residual', 'signed_residual'].includes(layer) &&
    (!Number.isFinite(row.cases) ||
      row.cases < 0 ||
      !Number.isFinite(row.prediction) ||
      row.prediction! < 0)
  )
    return null;
  if (layer === 'residual') return metric(row, rows, 'residual', { model });
  if (layer === 'signed_residual') return metric(row, rows, 'model_residual', { model });
  if (layer === 'completeness') return metric(row, rows, 'data_completeness', { model });
  if (layer === 'incidence') return incidence(row);
  if (layer === 'rainfall_anomaly' || layer === 'temperature_anomaly')
    return metric(row, rows, layer);
  const key = layer === 'boundaries' ? 'cases' : (layer as keyof Row);
  if (
    ['cases', 'population', 'rainfall', 'humidity'].includes(String(key)) &&
    (Number(row[key]) < 0 ||
      (key === 'population' && Number(row[key]) <= 0) ||
      (key === 'humidity' && Number(row[key]) > 100))
  )
    return null;
  return Number.isFinite(row[key]) ? (row[key] as number) : null;
}
export function commonBreaks(values: (number | null)[], classification: string) {
  const ordered = values
    .filter((v): v is number => v !== null && Number.isFinite(v))
    .sort((a, b) => a - b);
  if (!ordered.length) return [];
  return [1, 2, 3].map((i) =>
    classification === 'interval'
      ? ordered[0] + ((ordered.at(-1)! - ordered[0]) * i) / 4
      : ordered[Math.min(ordered.length - 1, Math.floor((ordered.length * i) / 4))],
  );
}
export function mapColor(value: number | null, layer: string, breaks: number[]) {
  if (layer === 'boundaries') return '#c5d4bf';
  if (value === null) return '#cbd4d4';
  if (layer === 'cluster') return clusterPalette[value] || '#cbd4d4';
  if (['risk', 'prediction_risk'].includes(layer)) return palette[value] || '#cbd4d4';
  return palette[breaks.filter((b) => value >= b).length] || palette[0];
}
export function valueLabel(value: number | null, layer: string) {
  if (value === null) return 'Data not available';
  if (layer === 'cluster') return clusterNames[value] || 'Data not available';
  if (['risk', 'prediction_risk'].includes(layer)) return riskNames[value] || 'Data not available';
  return value.toLocaleString('en-GB', { maximumFractionDigits: 2 });
}
export function mapStatistics(
  features: MapFeature[],
  rows: Row[],
  year: number,
  layer: string,
  model: string,
  thresholds: number[],
  bounds: Bounds | null,
  clusters: Record<string, string> = {},
  visible = true,
) {
  const shown = visible ? features.filter((f) => !bounds || intersectsBounds(f, bounds)) : [];
  const current = rows.filter((r) => r.year === year);
  const matched = matchedFeatures(features, current).filter((m) => shown.includes(m.feature));
  const values = matched
    .map(({ feature, row }) => ({
      district: row?.district || featureName(feature),
      value: mapValue(row, layer, rows, model, thresholds, clusters),
    }))
    .filter((d): d is { district: string; value: number } => d.value !== null)
    .sort((a, b) => a.value - b.value);
  const known = matched.map((d) => d.row).filter((r): r is Row => !!r);
  const categorical = ['risk', 'prediction_risk', 'cluster', 'boundaries'].includes(layer);
  return {
    visibleDistricts: shown.length,
    matchedDistricts: known.length,
    knownValues: values.length,
    highest: values.at(-1) || null,
    lowest: values[0] || null,
    median:
      values.length && !categorical
        ? (values[Math.floor((values.length - 1) / 2)].value +
            values[Math.floor(values.length / 2)].value) /
          2
        : null,
    mean:
      values.length && !categorical
        ? values.reduce((sum, d) => sum + d.value, 0) / values.length
        : null,
    highRisk: known.filter((r) => risk(r, thresholds) === 'HIGH').length,
    veryHighRisk: known.filter((r) => risk(r, thresholds) === 'VERY HIGH').length,
    knownRisk: known.filter((r) => incidence(r) !== null).length,
    categorical,
    values,
  };
}
export function comparisonRows(
  features: MapFeature[],
  rows: Row[],
  yearA: number,
  yearB: number,
  layer: string,
  model: string,
  thresholds: number[],
  clustersA: Record<string, string> = {},
  clustersB: Record<string, string> = {},
) {
  const matchedA = matchedFeatures(
      features,
      rows.filter((r) => r.year === yearA),
    ),
    matchedB = matchedFeatures(
      features,
      rows.filter((r) => r.year === yearB),
    );
  return features.map((f) => {
    const a = matchedA.find((m) => m.feature === f)?.row,
      b = matchedB.find((m) => m.feature === f)?.row;
    const valueA = mapValue(a, layer, rows, model, thresholds, clustersA),
      valueB = mapValue(b, layer, rows, model, thresholds, clustersB);
    const categorical = ['risk', 'prediction_risk', 'cluster', 'boundaries'].includes(layer);
    return {
      district: a?.district || b?.district || featureName(f),
      identity: featureIdentity(f),
      yearA,
      yearB,
      valueA,
      valueB,
      delta: !categorical && valueA !== null && valueB !== null ? valueB - valueA : null,
    };
  });
}

export function layerAvailability(
  features: MapFeature[],
  rows: Row[],
  year: number,
  layer: string,
  model: string,
  thresholds: number[],
  clusters: Record<string, string> = {},
) {
  if (layer === 'boundaries')
    return { available: true, count: features.length, reason: 'Local geographic context' };
  if (!features.length)
    return { available: false, count: 0, reason: 'District geometry not connected' };
  const matched = matchedFeatures(
    features,
    rows.filter((r) => r.year === year),
  );
  const count = matched.filter(
    ({ row }) => mapValue(row, layer, rows, model, thresholds, clusters) !== null,
  ).length;
  return {
    available: count > 0,
    count,
    reason: count
      ? `${count} / ${features.length} districts with available values; missing districts are gray.`
      : 'Layer unavailable — required dataset not connected.',
  };
}
