import { area, distance, polygon, kinks, booleanIntersects } from '@turf/turf';
import type { Feature, Polygon, Position } from 'geojson';
import type { Geometry } from './engine.ts';
export type MapTool = 'inspect' | 'distance' | 'area';
export type Measurement = {
  value: number;
  unit: 'km' | 'km²';
  geometry: Feature<Polygon> | null;
  districts: string[];
};
export function validPoint(point: Position) {
  return (
    point.length === 2 &&
    point.every(Number.isFinite) &&
    Math.abs(point[0]) <= 180 &&
    Math.abs(point[1]) <= 85
  );
}
export function measure(
  mode: Exclude<MapTool, 'inspect'>,
  points: Position[],
  study: Geometry | null = null,
): Measurement {
  if (points.length > 256 || points.some((p) => !validPoint(p)))
    throw Error('Use up to 256 valid longitude/latitude coordinates (latitude −85 to 85).');
  if (mode === 'distance') {
    if (points.length < 2) throw Error('Add at least two points to measure a distance.');
    return {
      value: points
        .slice(1)
        .reduce((sum, p, i) => sum + distance(points[i], p, { units: 'kilometers' }), 0),
      unit: 'km',
      geometry: null,
      districts: [],
    };
  }
  if (new Set(points.map((p) => p.join(','))).size < 3)
    throw Error('Add at least three distinct points to define a study area.');
  const ring = [...points.map((p) => [...p]), [...points[0]]];
  if (ring.some((p, i) => i > 0 && Math.abs(p[0] - ring[i - 1][0]) > 180))
    throw Error('Split polygons at the antimeridian before measuring area.');
  const geometry = polygon([ring]);
  if (kinks(geometry).features.length || area(geometry) < 1)
    throw Error('Use a non-intersecting polygon with an area of at least one square metre.');
  return {
    value: area(geometry) / 1e6,
    unit: 'km²',
    geometry,
    districts:
      study?.features
        .filter((f) => booleanIntersects(f, geometry))
        .map((f) => String(f.properties?.district || f.properties?.name)) || [],
  };
}
