import { normalize, type Row } from './analytics.ts';
import { featureDistrictIdentity, resolveDistrict } from './district-registry.ts';
export function resolveFeatureRow(feature: any, rows: Row[]) {
  return resolveDistrict(featureDistrictIdentity(feature), rows).row;
}
export function validateGeometry(g: any, context = false) {
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
    const properties = feature.properties || {};
    if (
      !context &&
      (['country', 'admin0', '0'].includes(
        String(properties.admin_level ?? properties.administrativeLevel ?? '').toLowerCase(),
      ) ||
        properties['ISO3166-1-Alpha-3'])
    )
      throw Error('Country context geometry cannot be imported as district analytical boundaries.');
    if (
      Object.keys(properties).some((key) =>
        /military|troop|deployment|tactical|route/i.test(key),
      ) ||
      [
        'district',
        'name',
        'canonical_name',
        'normalized_name',
        'aliases',
        'type',
        'kind',
        'landuse',
        'building',
        'amenity',
      ].some((key) =>
        /military|troop|deployment|barracks|garrison|naval|army base|tactical/i.test(
          String(properties[key] || ''),
        ),
      )
    )
      throw Error(
        'Only administrative district polygons are supported; operational and military geometries are excluded.',
      );
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
