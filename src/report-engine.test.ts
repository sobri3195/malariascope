import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildResearchReport,
  reportCSV,
  reportTypes,
  reportSections,
  requiredSections,
  validateReportRequest,
  type ReportInput,
} from './report-engine.ts';
import { forecastModels } from './forecasting.ts';
import { evaluate } from './analytics.ts';
import type { State } from './store.tsx';
const polygon = (district: string, code: string, x: number) => ({
  type: 'Feature',
  properties: { district, district_code: code },
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [x, 0],
        [x + 1, 0],
        [x + 1, 1],
        [x, 1],
        [x, 0],
      ],
    ],
  },
});
function fixture(): ReportInput {
  const rows = [2021, 2022, 2023, 2024, 2025, 2026].flatMap((year, i) =>
    ['A', 'B', 'C'].map((district, j) => ({
      district,
      district_code: String(j + 1),
      year,
      cases: 100 * (j + 1) + i * 10,
      population: 1000,
      region: j === 0 ? 'WEST' : 'EAST',
      rainfall: 20 + i,
      temperature: 25 + i,
    })),
  );
  const datasets = forecastModels.map((model, i) => ({
    id: String(i),
    name: model + ' source',
    source: 'Isolated fixture',
    classification: 'USER IMPORT' as const,
    checksum: 'sha-' + i,
    created: '2026-01-01',
    rows: rows.map((r) => ({ ...r, model, prediction: r.cases + i * 5 })),
  }));
  const state: State = {
    datasets,
    active: '0',
    rules: [],
    alertStates: {},
    checklist: {},
    thresholds: [100, 300, 500],
    snapshots: [],
    audit: [],
    profile: 'RESEARCHER',
    geometry: {
      type: 'FeatureCollection',
      features: ['A', 'B', 'C'].map((d, i) => polygon(d, String(i + 1), i)),
    },
    geometrySource: {
      name: 'Fixture polygons',
      checksum: 'geo-sha',
      created: '2026-01-01',
      classification: 'USER IMPORT',
    },
    layer: 'cases',
    reduced: true,
  };
  return {
    state,
    request: {
      type: 'Executive Intelligence Summary',
      title: 'Fixture research report',
      start: 2025,
      end: 2025,
      district: 'All districts',
      model: 'Persistence',
      risk: 'ALL',
      region: 'ALL',
      sections: reportSections.map(([id]) => id),
    },
    now: '2026-10-07T12:00:00Z',
    supplied: {
      models: [
        { model: 'Persistence', year: 2025, mae: 10426 },
        { model: 'Random Forest', year: 2025, mae: 12690 },
      ],
      summary: { annual: [{ year: 2025, cases: 288131 }], source: 'Study' },
      spatial: { year: 2025, moranI: 0.165, pValue: 0.1301, districts: 9, source: 'Study' },
      provenance: {
        'model-performance.json': {
          source: 'Study',
          sha256: 'study-sha',
          classification: 'UNVERIFIED',
        },
      },
    },
    alerts: [],
  };
}
const getTable = (report: ReturnType<typeof buildResearchReport>, title: string) =>
  report.sections.flatMap((s) => s.tables).find((t) => t.title === title)!;
test('all report types support selectable sections with mandatory integrity content', () => {
  for (const type of reportTypes) {
    const f = fixture();
    f.request.type = type;
    f.request.sections = [];
    const r = buildResearchReport(f);
    assert.deepEqual(r.selectedSections, requiredSections);
    assert.match(r.disclaimer, /RESEARCH PROTOTYPE/);
    assert.equal(r.metadata.analysisDate, f.now);
    assert.ok(r.knownLimitations.length);
  }
});
test('period totals use unique joined observations, never duplicate five model sources', () => {
  const r = buildResearchReport(fixture());
  assert.equal(getTable(r, 'District profile').rows.length, 3);
  assert.equal(
    getTable(r, 'Key indicators').rows.find(
      (v) => v.indicator === 'Observed cases (available records)',
    )?.value,
    720,
  );
  assert.equal(
    getTable(r, 'Key indicators').rows.find(
      (v) => v.indicator === 'Population (complete selected cohort)',
    )?.value,
    3000,
  );
  assert.equal(r.metadata.dataVersion.length, 5);
});
test('report snapshot and CSV remain immutable when live data and filters change', () => {
  const f = fixture(),
    before = JSON.stringify(f.state),
    r = buildResearchReport(f),
    snapshot = JSON.stringify(r),
    csv = reportCSV(r);
  assert.equal(JSON.stringify(f.state), before);
  f.state.datasets[0].rows[0].cases = 900;
  f.request.district = 'B';
  assert.equal(JSON.stringify(r), snapshot);
  assert.equal(reportCSV(r), csv);
  assert.equal(r.metadata.selectedFilters.district, 'All districts');
});
test('district, annual period, risk and region filters use the captured scope', () => {
  const f = fixture();
  f.request.region = 'WEST';
  f.request.start = 2024;
  f.request.end = 2025;
  const r = buildResearchReport(f);
  assert.deepEqual(
    getTable(r, 'District profile').rows.map((v) => v.district),
    ['A', 'A'],
  );
  assert.equal(r.trend?.length, 2);
  f.request.risk = 'HIGH';
  assert.equal(getTable(buildResearchReport(f), 'District profile').rows.length, 0);
});
test('temporal gaps and incomplete denominators remain unavailable', () => {
  const f = fixture();
  for (const d of f.state.datasets)
    d.rows = d.rows
      .filter((r) => r.year !== 2024)
      .map((r) => (r.district === 'B' ? { ...r, population: undefined } : r));
  f.request.start = 2024;
  const r = buildResearchReport(f);
  assert.equal(r.trend?.[0].cases, null);
  assert.equal(
    getTable(r, 'Key indicators').rows.find((v) => v.indicator === 'Cohort incidence per 1,000')
      ?.value,
    null,
  );
  assert.equal(
    getTable(r, 'Observed risk analysis').rows.find((v) => v.district === 'A')?.change,
    null,
  );
});
test('climate anomalies and provenance never use future observations', () => {
  const f = fixture(),
    r = buildResearchReport(f);
  assert.ok(getTable(r, 'Climate evidence').rows[0].rainfallAnomaly !== null);
  assert.ok(getTable(r, 'Selected field evidence').rows.every((row) => Number(row.year) <= 2025));
  for (const d of f.state.datasets)
    d.rows = d.rows.map((v) => (v.year === 2026 ? { ...v, rainfall: 999999 } : v));
  assert.deepEqual(
    getTable(buildResearchReport(f), 'Climate evidence'),
    getTable(r, 'Climate evidence'),
  );
});
test('forecast metrics use common paired evidence and exact loaded predictions', () => {
  const r = buildResearchReport(fixture()),
    t = getTable(r, 'Model performance');
  assert.equal(t.rows[0].model, 'Persistence');
  assert.equal(t.rows[0].mae, 0);
  assert.equal(t.rows[0].n, 3);
  assert.equal(getTable(r, 'Forecast inspection').rows[0].residual, 0);
});
test('conflicting prediction source outcomes are withheld, never paired by district alone', () => {
  const f = fixture();
  f.request.model = 'Random Forest';
  f.state.datasets[2].rows = f.state.datasets[2].rows.map((row) => ({
    ...row,
    cases: row.cases + 999,
  }));
  const r = buildResearchReport(f);
  assert.ok(
    getTable(r, 'Forecast inspection').rows.every(
      (row) => row.prediction === null && row.residual === null,
    ),
  );
  assert.ok(r.knownLimitations.some((l) => l.includes('conflict')));
});
test('supplied aggregates are isolated from district reports and loaded cohorts', () => {
  const f = fixture();
  f.state.datasets = [];
  f.request.sections = ['performance', 'overview'];
  let r = buildResearchReport(f);
  assert.equal(getTable(r, 'Model performance').rows[0].mae, 10426);
  assert.ok(r.metadata.suppliedDataVersions.length);
  f.request.district = 'A';
  r = buildResearchReport(f);
  assert.ok(getTable(r, 'Model performance').rows.every((row) => row.mae === null));
  assert.equal(
    getTable(r, 'Supplied study aggregates — not connected district observations'),
    undefined,
  );
});
test('full source quality audit retains rows outside selected district and year', () => {
  const f = fixture();
  f.request.district = 'A';
  f.state.datasets[0].sourceRows = [
    ...f.state.datasets[0].rows,
    { district: 'B', year: 2020, cases: -9 },
  ];
  const r = buildResearchReport(f);
  assert.equal(getTable(r, 'Dataset health').rows[0].rows, 19);
  assert.ok(getTable(r, 'Data quality issues').rows.some((row) => row.row === 19));
  assert.ok(getTable(r, 'Quality score calculation').rows.length > 0);
});
test('readiness keeps eight domains and source/manual evidence separate', () => {
  const r = buildResearchReport(fixture());
  assert.equal(getTable(r, 'Readiness matrix').rows.length, 24);
  assert.ok(getTable(r, 'Readiness evidence').rows.some((row) => row.group === 'Not Connected'));
  assert.match(String(getTable(r, 'Readiness matrix').rows[0].evidence), /not independently/);
});
test('static GIS snapshot and spatial statistics use legitimate matched administrative geometry', () => {
  const f = fixture();
  f.request.type = 'Spatial Analysis Report';
  const r = buildResearchReport(f);
  assert.equal(r.map?.features.length, 3);
  assert.equal(getTable(r, 'Loaded spatial analysis').rows[0].districts, 3);
  f.state.geometry.features[0].properties.military = 'restricted';
  const invalid = buildResearchReport(f);
  assert.equal(invalid.map?.features.length, 0);
  assert.match(invalid.map?.error ?? '', /operational|military/);
});
test('CSV exports selected tables plus integrity metadata and escapes formula-like text', () => {
  const f = fixture();
  f.request.sections = ['district'];
  f.request.title = '=SUM(1,2)';
  const r = buildResearchReport(f),
    csv = reportCSV(r);
  assert.ok(csv.includes("'=SUM(1,2)"));
  assert.ok(csv.includes('RESEARCH PROTOTYPE'));
  assert.ok(csv.includes('Selected filters'));
  assert.ok(csv.includes('Known limitations'));
  assert.ok(!csv.includes('Climate evidence'));
  assert.ok(
    !getTable(r, 'Selected field evidence').rows.some(
      (row) => row.field === 'rainfall' || row.field === 'prediction',
    ),
  );
});
test('invalid source values and invalid request boundaries are never silently accepted', () => {
  const f = fixture();
  for (const d of f.state.datasets) d.rows = d.rows.map((row) => ({ ...row, cases: -1 }));
  assert.equal(
    getTable(buildResearchReport(f), 'Key indicators').rows.find(
      (row) => row.indicator === 'Observed cases (available records)',
    )?.value,
    null,
  );
  for (const patch of [
    { start: 2026, end: 2025 },
    { start: NaN },
    { end: 2101 },
    { title: '' },
    { risk: 'invented' },
  ])
    assert.ok(validateReportRequest({ ...f.request, ...patch }));
  assert.throws(() => buildResearchReport({ ...f, request: { ...f.request, start: 2026 } }));
});
test('alerts retain exact triggering rule, data, source and timestamp basis', () => {
  const f = fixture();
  f.state.rules = [
    { id: 'burden', metric: 'cases', operator: '>', value: 50, enabled: true, severity: 'HIGH' },
  ];
  f.alerts = evaluate(f.state.datasets[0].rows, f.state.rules, '0', {
    datasetName: 'Fixture',
    model: 'Persistence',
  });
  const r = buildResearchReport(f),
    row = getTable(r, 'Analytical alerts').rows[0];
  assert.match(String(row.rule), /cases > 50/);
  assert.equal(row.timestamp, f.now);
  assert.equal(row.timestampBasis, 'Report-time rule evaluation');
  assert.equal(r.metadata.analyticalConfiguration.alertRules[0].id, 'burden');
});
