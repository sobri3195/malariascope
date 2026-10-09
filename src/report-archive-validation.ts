import type { ResearchReport } from './report-engine.ts';
const strings = (v: unknown) => Array.isArray(v) && v.every((x) => typeof x === 'string');
const cell = (v: unknown) =>
  v === null || typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v));
/** Consumer shape validation only; never a scientific verification claim. */
export function validArchivedReport(value: unknown): value is ResearchReport {
  const r = value as any,
    m = r?.metadata;
  if (
    !r ||
    r.schema !== 'malariascope-research-report-v1' ||
    typeof r.disclaimer !== 'string' ||
    !m ||
    !['title', 'type', 'district', 'generatedAt', 'analysisDate'].every(
      (k) => typeof m[k] === 'string',
    ) ||
    !Number.isFinite(m.period?.start) ||
    !Number.isFinite(m.period?.end) ||
    !Array.isArray(m.dataVersion) ||
    !m.dataVersion.every(
      (v: any) => v && typeof v.name === 'string' && typeof v.checksum === 'string',
    ) ||
    !m.selectedFilters ||
    !Object.values(m.selectedFilters).every(cell) ||
    typeof m.analyticalConfiguration?.model !== 'string' ||
    !Array.isArray(m.analyticalConfiguration.incidenceThresholds) ||
    !m.analyticalConfiguration.incidenceThresholds.every(Number.isFinite) ||
    !strings(r.selectedSections) ||
    !strings(r.knownLimitations)
  )
    return false;
  if (
    !Array.isArray(r.sections) ||
    !r.sections.every(
      (s: any) =>
        s &&
        typeof s.id === 'string' &&
        typeof s.title === 'string' &&
        strings(s.paragraphs) &&
        Array.isArray(s.tables) &&
        s.tables.every(
          (t: any) =>
            t &&
            typeof t.title === 'string' &&
            Array.isArray(t.columns) &&
            t.columns.every(
              (c: any) => c && typeof c.key === 'string' && typeof c.label === 'string',
            ) &&
            Array.isArray(t.rows) &&
            t.rows.every(
              (row: any) => row && typeof row === 'object' && Object.values(row).every(cell),
            ),
        ),
    )
  )
    return false;
  if (
    r.trend !== null &&
    (!Array.isArray(r.trend) ||
      !r.trend.every(
        (t: any) => t && Number.isFinite(t.year) && (t.cases === null || Number.isFinite(t.cases)),
      ))
  )
    return false;
  if (r.map !== null) {
    const map = r.map;
    const coordinates = (v: any): boolean =>
      Array.isArray(v) && v.every((x) => (Array.isArray(x) ? coordinates(x) : Number.isFinite(x)));
    if (
      !map ||
      !Array.isArray(map.features) ||
      !map.features.every(
        (f: any) =>
          f &&
          typeof f.district === 'string' &&
          ['Polygon', 'MultiPolygon'].includes(f.geometry?.type) &&
          coordinates(f.geometry.coordinates) &&
          (f.cases === null || Number.isFinite(f.cases)),
      ) ||
      (map.bounds !== null &&
        !['west', 'east', 'north', 'south'].every((k) => Number.isFinite(map.bounds?.[k])))
    )
      return false;
  }
  return true;
}
