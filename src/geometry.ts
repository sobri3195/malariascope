import { normalize, type Row } from './analytics';
export function resolveFeatureRow(feature: any, rows: Row[]) {
  const code = feature.properties?.district_code || feature.properties?.code;
  const coded = code
    ? rows.filter((r) => r.district_code && String(r.district_code) === String(code))
    : [];
  if (coded.length === 1) return coded[0];
  if (coded.length > 1) return null;
  const name = String(feature.properties?.district || feature.properties?.name || '');
  const named = rows.filter((r) => normalize(r.district) === normalize(name));
  return named.length === 1 ? named[0] : null;
}
export function validateGeometry(g: any) {
  if (g?.type !== 'FeatureCollection' || !Array.isArray(g.features) || !g.features.length)
    throw Error('GeoJSON requires a nonempty FeatureCollection.');
  if (g.features.length > 2000) throw Error('Maximum 2,000 administrative features per file.');
  const seen = new Set<string>();
  for (const feature of g.features) {
    if (
      feature?.type !== 'Feature' ||
      !['Polygon', 'MultiPolygon'].includes(feature.geometry?.type)
    )
      throw Error('Administrative geometry must contain Polygon or MultiPolygon Features.');
    const name = feature.properties?.district || feature.properties?.name;
    if (typeof name !== 'string' || !normalize(name))
      throw Error('Every feature needs a nonempty district or name property.');
    const identity = String(
      feature.properties?.district_code || feature.properties?.code || normalize(name),
    );
    if (seen.has(identity))
      throw Error(
        'Duplicate administrative identity: manual confirmation required. Use unique district codes.',
      );
    seen.add(identity);
    const polygons =
      feature.geometry.type === 'Polygon'
        ? [feature.geometry.coordinates]
        : feature.geometry.coordinates;
    if (!Array.isArray(polygons) || !polygons.length) throw Error('Polygon coordinates are empty.');
    for (const polygon of polygons) {
      if (!Array.isArray(polygon) || !polygon.length)
        throw Error('Polygon requires at least one ring.');
      for (const ring of polygon) {
        if (!Array.isArray(ring) || ring.length < 4)
          throw Error('Polygon rings require at least four coordinates.');
        for (const p of ring)
          if (
            !Array.isArray(p) ||
            p.length < 2 ||
            !Number.isFinite(p[0]) ||
            !Number.isFinite(p[1]) ||
            Math.abs(p[0]) > 180 ||
            Math.abs(p[1]) > 90
          )
            throw Error('Invalid geographic coordinates.');
        const first = ring[0],
          last = ring.at(-1);
        if (first[0] !== last[0] || first[1] !== last[1])
          throw Error('Polygon rings must be closed.');
        let area = 0;
        for (let i = 0; i < ring.length - 1; i++)
          area += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
        if (Math.abs(area) < 1e-12) throw Error('Polygon ring has zero area.');
      }
    }
  }
  return g;
}
