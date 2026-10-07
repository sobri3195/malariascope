import { booleanIntersects } from '@turf/turf';
import { type Row } from './analytics';
import { resolveFeatureRow } from './geometry';
import type {SpatialInput} from './moran';
export {moran,type SpatialInput} from './moran';
export function spatialInput(geometry: any, rows: Row[]): SpatialInput {
  const features = geometry?.features || [];
  const matched = features
    .map((f: any) => ({ f, name: String(f.properties?.district || f.properties?.name || '') }))
    .map((o: any) => ({ ...o, row: resolveFeatureRow(o.f, rows) }))
    .filter((o: any) => o.row);
  const neighbors: number[][] = matched.map(() => []);
  for (let i = 0; i < matched.length; i++)
    for (let j = i + 1; j < matched.length; j++) {
      try {
        if (booleanIntersects(matched[i].f, matched[j].f)) {
          neighbors[i].push(j);
          neighbors[j].push(i);
        }
      } catch {
        throw Error(
          'Administrative polygons could not be analyzed. Validate the imported geometry.',
        );
      }
    }
  return {
    names: matched.map((o: any) => o.row.district),
    values: matched.map((o: any) => o.row.cases),
    neighbors,
  };
}
