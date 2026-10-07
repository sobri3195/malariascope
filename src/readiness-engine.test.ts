import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateEvidence,
  readinessDomains,
  type EvidenceDataset,
} from './district-intelligence.ts';
import {
  assessDistrictReadiness,
  buildReadinessMatrix,
  readinessChecklistKey,
  safeChecklistState,
  readinessDomainDefinitions,
} from './readiness-engine.ts';
const datasets: EvidenceDataset[] = [
  {
    id: 'readiness-fixture',
    name: 'Isolated readiness surveillance',
    source: 'Automated fixture',
    checksum: 'readiness-sha',
    created: '2026-01-01',
    classification: 'USER IMPORT',
    rows: [2024, 2025].flatMap((year) =>
      ['A', 'B'].map((district, i) => ({
        district,
        district_code: String(i + 1),
        year,
        cases: district === 'A' ? (year === 2024 ? 20000 : 30000) : 100,
        population: 100000,
        prediction: 1000000,
        model: 'Random Forest',
      })),
    ),
  },
];
const records = aggregateEvidence(datasets, datasets[0].id, 'Random Forest').records;
const assess = (
  district = 'A',
  checklist: Record<string, string> = {},
  overrides: Partial<Parameters<typeof assessDistrictReadiness>[0]> = {},
) =>
  assessDistrictReadiness({
    district,
    year: 2025,
    current: records.find((r) => r.district === district && r.year === 2025),
    previous: records.find((r) => r.district === district && r.year === 2024),
    checklist,
    ...overrides,
  });
const cell = (result: ReturnType<typeof assess>, domain: string) =>
  result.cells.find((c) => c.domain === domain)!;
const full = (legacy: string, status = 'AVAILABLE') =>
  Object.fromEntries(readinessDomains[legacy].map((item) => [item, status]));
test('matrix defines all eight domains and every cell has an auditable non-directive explanation', () => {
  const result = assess();
  assert.equal(result.cells.length, 8);
  assert.equal(readinessDomainDefinitions.length, 8);
  for (const c of result.cells) {
    assert.ok(c.reason && c.rule && c.evidenceStatus && c.suggestedReviewCategory);
    assert.ok(Array.isArray(c.triggeringData));
    assert.ok(Array.isArray(c.missingInformation));
    assert.doesNotMatch(
      c.reason + ' ' + c.suggestedReviewCategory,
      /send personnel|deploy resources|move troops/i,
    );
  }
});
test('high observed burden and rising adjacent incidence flag unconfirmed diagnostics with exact source values', () => {
  const result = assess(),
    diagnostics = cell(result, 'diagnostics');
  assert.equal(diagnostics.state, 'ATTENTION');
  assert.match(diagnostics.reason, /30000 cases > 20000/);
  assert.match(diagnostics.reason, /200 → 300/);
  assert.match(diagnostics.reason, /not connected/);
  assert.equal(result.context.incidenceChange, 50);
  assert.ok(
    diagnostics.triggeringData.some(
      (e) => e.label === 'Observed malaria cases' && e.value === 30000,
    ),
  );
  assert.equal(result.evidence.find((e) => e.label === 'Previous observed incidence')!.year, 2024);
});
test('high predictions alone do not infer observed burden or resource readiness', () => {
  const result = assess('B');
  assert.equal(result.context.highBurden, false);
  assert.equal(result.context.highIncidence, false);
  assert.equal(cell(result, 'diagnostics').state, 'INSUFFICIENT DATA');
  assert.ok(result.cells.every((c) => c.state !== 'READY'));
  assert.equal(cell(result, 'staffing').state, 'INSUFFICIENT DATA');
  assert.ok(
    result.evidence
      .filter((e) => e.group === 'Derived')
      .every((e) => e.references.every((ref) => ref.field !== 'prediction')),
  );
});
test('explicit local gaps, partial reviews, and complete applicable checklists produce distinct states', () => {
  assert.equal(
    cell(assess('B', { 'Diagnostic capability documented': 'LIMITED' }), 'diagnostics').state,
    'ATTENTION',
  );
  assert.equal(
    cell(assess('B', { 'Diagnostic capability documented': 'AVAILABLE' }), 'diagnostics').state,
    'REVIEW',
  );
  const ready = cell(assess('A', full('Diagnostic-resource review')), 'diagnostics');
  assert.equal(ready.state, 'READY');
  assert.match(ready.reason, /not independently verified/);
  assert.match(ready.evidenceStatus, /user-entered/);
  assert.equal(
    cell(assess('B', { 'Staffing capacity reviewed': 'AVAILABLE' }), 'staffing').state,
    'READY',
  );
});
test('all NOT APPLICABLE cannot establish READY and malformed checklist values are treated as unreviewed', () => {
  assert.equal(
    cell(assess('B', full('Diagnostic-resource review', 'NOT APPLICABLE')), 'diagnostics').state,
    'INSUFFICIENT DATA',
  );
  const values = {
    ...full('Diagnostic-resource review'),
    'Stock-status dataset connected': 'NOT APPLICABLE',
  };
  assert.equal(cell(assess('B', values), 'diagnostics').state, 'READY');
  assert.equal(safeChecklistState('VERIFIED READY'), 'NOT REVIEWED');
  assert.equal(safeChecklistState(null), 'NOT REVIEWED');
});
test('surveillance/data readiness require real selected-year inputs despite fully completed local reviews', () => {
  const all = { ...full('Surveillance awareness'), ...full('Data readiness') };
  const result = assess('A', all, { current: undefined });
  assert.equal(cell(result, 'surveillance').state, 'INSUFFICIENT DATA');
  assert.equal(cell(result, 'data').state, 'INSUFFICIENT DATA');
  const available = assess('B', all);
  assert.equal(cell(available, 'surveillance').state, 'READY');
  assert.equal(cell(available, 'data').state, 'READY');
  const noPopulation = {
    ...records.find((r) => r.district === 'B' && r.year === 2025)!,
    values: {
      ...records.find((r) => r.district === 'B' && r.year === 2025)!.values,
      population: null,
    },
  };
  assert.equal(
    cell(assess('B', all, { current: noPopulation }), 'data').state,
    'INSUFFICIENT DATA',
  );
});
test('Known, Unknown, Not Connected, Derived and User-entered evidence never promote local statements to source facts', () => {
  const result = assess('B', { 'Staffing capacity reviewed': 'AVAILABLE' });
  assert.deepEqual(
    new Set(result.evidence.map((e) => e.group)),
    new Set(['Known', 'Unknown', 'Not Connected', 'Derived', 'User-entered']),
  );
  assert.ok(
    result.evidence.filter((e) => e.group === 'Known').every((e) => e.references.length > 0),
  );
  assert.ok(
    result.evidence
      .filter((e) => e.group === 'User-entered')
      .every((e) => e.references.length === 0),
  );
  assert.equal(result.evidence.filter((e) => e.group === 'Not Connected').length, 8);
  assert.ok(
    cell(assess('B'), 'diagnostics')
      .triggeringData.filter((e) => e.label === 'Diagnostic capability documented')
      .every((e) => e.group === 'Unknown'),
  );
});
test('missing or non-adjacent surveillance periods do not manufacture a rise or percent change', () => {
  const result = assess('A', {}, { previous: undefined });
  assert.equal(result.context.incidenceChange, null);
  assert.equal(result.context.risingIncidence, false);
  assert.doesNotMatch(cell(result, 'diagnostics').reason, /rising/);
  const wrongYear = { ...records.find((r) => r.district === 'A' && r.year === 2024)!, year: 2023 };
  assert.equal(assess('A', {}, { previous: wrongYear }).context.previousIncidence, null);
  const zeroPrevious = {
    ...records.find((r) => r.district === 'A' && r.year === 2024)!,
    values: { ...records.find((r) => r.district === 'A' && r.year === 2024)!.values, cases: 0 },
  };
  const zero = assess('A', {}, { previous: zeroPrevious });
  assert.equal(zero.context.incidenceChange, null);
  assert.equal(zero.context.risingIncidence, true);
});
test('district-year entries remain isolated and unconnected manual districts retain unknown surveillance', () => {
  const matrix = buildReadinessMatrix({
    datasets,
    active: datasets[0].id,
    year: 2025,
    model: 'Random Forest',
    checklists: {
      [readinessChecklistKey('A', 2025)]: { 'Staffing capacity reviewed': 'AVAILABLE' },
      [readinessChecklistKey('B', 2024)]: { 'Staffing capacity reviewed': 'AVAILABLE' },
    },
    manualDistricts: ['Unconnected District'],
  });
  assert.equal(
    cell(
      matrix.districts.find((d) => d.district === 'A')!,
      'staffing',
    ).state,
    'READY',
  );
  assert.equal(
    cell(
      matrix.districts.find((d) => d.district === 'B')!,
      'staffing',
    ).state,
    'INSUFFICIENT DATA',
  );
  assert.equal(
    matrix.districts.find((d) => d.district === 'Unconnected District')!.context.cases,
    null,
  );
  assert.equal(readinessChecklistKey('Kabupaten A', 2025), readinessChecklistKey('A', 2025));
});
test('source conflicts and scientific integrity errors keep data readiness in REVIEW despite local completion', () => {
  const result = assess('B', full('Data readiness'), {
    sourceQualityIssues: ['Duplicate district-year observations remain unresolved.'],
  });
  assert.equal(cell(result, 'data').state, 'REVIEW');
  assert.match(cell(result, 'data').reason, /1 source conflict/);
  const conflict = {
    ...datasets[0],
    id: 'conflict',
    rows: datasets[0].rows.map((row) => ({ ...row, cases: row.cases + 1 })),
  };
  const matrix = buildReadinessMatrix({
    datasets: [datasets[0], conflict],
    active: datasets[0].id,
    year: 2025,
    model: 'Random Forest',
    checklists: { [readinessChecklistKey('B', 2025)]: full('Data readiness') },
  });
  assert.equal(
    cell(
      matrix.districts.find((d) => d.district === 'B')!,
      'data',
    ).state,
    'REVIEW',
  );
  const duplicated = { ...datasets[0], rows: [...datasets[0].rows, datasets[0].rows[0]] };
  const duplicateMatrix = buildReadinessMatrix({
    datasets: [duplicated],
    active: duplicated.id,
    year: 2025,
    model: 'Random Forest',
    checklists: { [readinessChecklistKey('A', 2025)]: full('Data readiness') },
  });
  assert.equal(cell(duplicateMatrix.districts[0], 'data').state, 'REVIEW');
});
test('metadata timestamps and notes stay user-entered and stale status metadata is not assigned to a new statement', () => {
  const checklist = { 'Staffing capacity reviewed': 'AVAILABLE' },
    metadata = {
      'Staffing capacity reviewed': {
        status: 'AVAILABLE',
        note: 'Isolated review note',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    };
  const result = assess('B', checklist, { metadata });
  const entry = result.evidence.find((e) => e.group === 'User-entered')!;
  assert.equal(entry.note, 'Isolated review note');
  assert.equal(entry.updatedAt, '2026-01-01T00:00:00Z');
  metadata['Staffing capacity reviewed'].status = 'LIMITED';
  const stale = assess('B', checklist, { metadata });
  assert.equal(cell(stale, 'staffing').items[0].updatedAt, null);
  assert.equal(cell(stale, 'staffing').items[0].note, '');
});
test('readiness assessment is deterministic and preserves all observed inputs and checklist records', () => {
  const checklist = full('Diagnostic-resource review'),
    before = JSON.stringify({ datasets, checklist });
  assert.deepEqual(assess('A', checklist), assess('A', checklist));
  assert.equal(JSON.stringify({ datasets, checklist }), before);
  const matrix = buildReadinessMatrix({
    datasets: [],
    active: '',
    year: 2025,
    model: 'Persistence',
    checklists: {},
  });
  assert.equal(matrix.districts.length, 0);
});
