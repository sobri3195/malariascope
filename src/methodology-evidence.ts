import type { ResearchPackage } from './research-data/research';
export const methodologyLimitations = [
  ['Small sample', 'Eight temporal-test districts; uncertain generalisability.'],
  ['Annual temporal resolution', 'Cannot resolve shorter climate lags.'],
  [
    'Publication-time uncertainty',
    'True operational availability of historical predictors is unknown.',
  ],
  ['Ecological data', 'No individual infection-risk inference.'],
  ['Civilian surveillance', 'No direct military attack-rate estimation.'],
  [
    'Spatial resolution',
    'Only nine administrative units; no confirmed local hotspot significance.',
  ],
  ['No prospective validation', 'Current evaluation is retrospective hindcasting.'],
  ['No usability validation', 'Human-factors benefit has not been established.'],
  ['No operational validation', 'Deployment utility has not been established.'],
];
export const evidenceDefinitions = {
  OBSERVED: 'Actual reported surveillance outcome.',
  DERIVED: 'Calculated from observed or source values.',
  PREDICTED: 'Output from a fitted forecasting model.',
  CONTEXT: 'Historical or contemporary information outside the primary analytical outcome.',
  SCENARIO: 'User-modified exploratory assumption.',
  'USER IMPORT': 'Locally imported dataset outside the bundled study evidence.',
  'NO DATA': 'No supported value available.',
};
export const modelLabel = (name: string) =>
  name === 'Ridge Regression' ? 'Ridge Regression — climate' : name;
export function methodologyEvidence(p: ResearchPackage) {
  const years = [...new Set(p.balanced.map((r) => Number(r.year)))].sort((a, b) => a - b);
  const annual = years.map((year, i) => {
    const cases = p.balanced.filter((r) => r.year === year).reduce((sum, r) => sum + r.cases, 0);
    const previous = i
      ? p.balanced.filter((r) => r.year === years[i - 1]).reduce((sum, r) => sum + r.cases, 0)
      : null;
    return {
      year,
      cases,
      changePercent:
        previous === null || previous === 0 ? null : ((cases - previous) / previous) * 100,
    };
  });
  const benchmark = p.performance
    .filter((r) => r.year === 2025)
    .map((r) => ({ ...r, model: modelLabel(r.model) }))
    .sort((a, b) => a.mae - b.mae);
  const without = benchmark.find((r) => r.model === 'Ridge Regression — no climate');
  const withClimate = benchmark.find((r) => r.model === 'Ridge Regression — climate');
  return {
    study: {
      version: p.manifest.version,
      design: 'Retrospective ecological geospatial forecasting study',
      period: '2020–2025',
      geography: 'Papua study districts',
      classification: 'VERIFIED RESEARCH EXTRACTION',
      verification: p.manifest.verification,
      output: 'RETROSPECTIVE HINDCAST',
      generatedDate: new Date().toISOString(),
    },
    coverage: p.coverage,
    status: p.status,
    annual,
    balancedTotal: annual.reduce((sum, r) => sum + r.cases, 0),
    spatialEpisodes: p.spatial.reduce((sum, r) => sum + r.cases, 0),
    spatialRows: p.spatial,
    benchmark,
    climateMaeDifference: withClimate && without ? withClimate.mae - without.mae : null,
    validation: p.performance.filter((r) => r.year === 2024),
    uncertainty: p.uncertainty,
    spatial: p.spatialResult,
    sourceIssues: p.ledger,
    limitations: methodologyLimitations,
    provenance: p.manifest.files,
  };
}
// Long-format CSV keeps every supported export field without serializing objects into cells.
export function evidenceCsv(value: unknown): string {
  const rows: string[][] = [['Section', 'Field', 'Value']];
  const walk = (v: unknown, path: string[]) => {
    if (v !== null && typeof v === 'object')
      Object.entries(v).forEach(([key, item]) => walk(item, [...path, key]));
    else
      rows.push([
        path[0] || 'evidence',
        path.slice(1).join(' / '),
        v === null ? 'Not supplied' : String(v),
      ]);
  };
  walk(value, []);
  return rows
    .map((row) =>
      row
        .map((cell) => '"' + (/^[=+@\-]/.test(cell) ? "'" : '') + cell.replaceAll('"', '""') + '"')
        .join(','),
    )
    .join('\r\n');
}
