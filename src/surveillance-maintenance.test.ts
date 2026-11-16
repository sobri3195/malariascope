import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  columns,
  validateRows,
  responseMetric,
  validDate,
  validTimestamp,
  type Kind,
  type RecordRow,
} from './indonesia/engine.ts';
import {
  emptyAggregates,
  parseAggregates,
  reconcileAggregates,
  proportion,
} from './indonesia/aggregate-data.ts';
import {
  readRepository,
  writeRepository,
  restartRepository,
} from './indonesia/local-repository.ts';
import { parseViews } from './indonesia/snapshot-data.ts';
import { captureSurveillanceSnapshot } from './workspace-context.ts';
import { validateSkdr } from './indonesia/skdr.ts';
import { normalizeSismal, validateSismal } from './indonesia/sismal.ts';
function memory() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      data.set(k, v);
    },
  };
}
function row(kind: Kind, changes: RecordRow = {}): RecordRow {
  const fields = Object.fromEntries(columns(kind).map((k) => [k, '']));
  Object.assign(fields, {
    region_version: '2025',
    region_code: '31',
    period_start: '2025-01-01',
    period_end: '2025-12-31',
    source_id: 'TEST',
    source_type:
      kind === 'situasi'
        ? 'profil'
        : kind === 'asal'
          ? 'pe-agregat'
          : kind === 'layanan'
            ? 'penilaian-fasyankes'
            : 'rekap-respons',
    publication_version: 'v1',
    published_at: '2026-01-01',
    source_url: 'https://contoh.go.id/fixture',
    locator: 'Fixture only',
    definition: 'Kasus uji',
    coverage: 'Seluruh unit uji',
    geo_basis: 'pelaporan',
    status: 'reported',
    reviewed_at: '2026-01-02',
  });
  if (kind === 'situasi') fields.confirmed = '10';
  if (kind === 'respons')
    Object.assign(fields, {
      stage: 'notifikasi',
      trigger_at: '2025-06-01T00:00:00Z',
      required_count: '10',
      completed_count: '7',
      timely_count: '6',
      deadline_hours: '24',
      as_of: '2025-06-03T00:00:00Z',
      sop_url: 'https://contoh.go.id/sop',
      sop_version: 'v1',
      sop_effective_from: '2025-01-01',
      sop_effective_to: '2025-12-31',
    });
  return { ...fields, ...changes };
}
test('malformed aggregate objects and headers return validation errors without throwing', () => {
  for (const bad of [null, {}, [null], [[]], ['record']])
    assert.ok(validateRows('asal', bad).length);
  assert.throws(() => parseAggregates({ situasi: [null], asal: [], layanan: [], respons: [] }));
  assert.deepEqual(parseAggregates(emptyAggregates()), emptyAggregates());
});
test('date validation rejects rollover and time 24:00; equivalent timezone cohorts cannot be imported twice', () => {
  assert.equal(validDate('2025-02-30'), false);
  assert.equal(validTimestamp('2025-06-01T24:00:00Z'), false);
  assert.equal(validTimestamp('2025-06-01T00:00:00.123Z'), true);
  const a = row('respons');
  assert.ok(validateRows('respons', [a, { ...a, trigger_at: '2025-06-01T07:00:00+07:00' }]).length);
  assert.ok(validateRows('respons', [{ ...a, deadline_hours: '9007199254740991' }]).length);
});
test('response denominators reject mixed geography, scope, definitions, SOP or duplicate cohorts', () => {
  const a = row('respons');
  for (const changes of [
    { region_code: '33' },
    { geo_basis: 'domisili' },
    { definition: 'Definisi lain' },
    { period_start: '2025-02-01' },
    { sop_effective_from: '2025-02-01' },
  ])
    assert.equal(
      responseMetric([a, { ...a, ...changes, trigger_at: '2025-06-02T00:00:00Z' }]),
      null,
    );
  assert.equal(responseMetric([a, a]), null);
  const future = {
    ...a,
    trigger_at: '2025-06-03T00:00:00Z',
    required_count: '5',
    completed_count: '0',
    timely_count: '0',
  };
  assert.equal(responseMetric([a, future])?.denominator, 10);
  assert.equal(responseMetric([a, future])?.numerator, 6);
});
test('reconciliation permits version comparisons but withholds deltas for mismatched definitions and partial data', () => {
  const a = row('situasi');
  const b = { ...a, confirmed: '15', publication_version: 'v2' };
  assert.equal(reconcileAggregates('situasi', a, b).differences[0].delta, 5);
  assert.equal(reconcileAggregates('situasi', a, b).revisionChanged, true);
  assert.equal(reconcileAggregates('situasi', a, { ...b, definition: 'Suspek' }).comparable, false);
  assert.equal(
    reconcileAggregates('situasi', a, { ...b, status: 'partial' }).differences.length,
    0,
  );
  assert.equal(proportion(0, 0), null);
  assert.equal(proportion(0, 10), 0);
});
test('repository preserves corrupt originals and archives before an explicit restart', () => {
  const storage = memory();
  const raw = '{"situasi":null,"preserve":"original"}';
  storage.setItem('key', raw);
  const loaded = readRepository(storage, 'key', parseAggregates, emptyAggregates);
  assert.ok(loaded.error);
  assert.equal(loaded.raw, raw);
  assert.equal(storage.getItem('key'), raw);
  const restarted = restartRepository(storage, 'key', raw, emptyAggregates(), parseAggregates);
  assert.equal(restarted.error, '');
  assert.ok(
    [...storage.data.entries()].some(([k, v]) => k.startsWith('key.recovery.') && v === raw),
  );
});
test('repository prevents lost updates and retains state on quota/access errors', () => {
  const storage = memory();
  const first = writeRepository(storage, 'key', null, emptyAggregates(), parseAggregates);
  storage.setItem('key', 'other tab');
  assert.throws(
    () => writeRepository(storage, 'key', first.raw, emptyAggregates(), parseAggregates),
    /tab lain/,
  );
  assert.equal(storage.getItem('key'), 'other tab');
  const denied = {
    getItem: () => {
      throw Error('Blocked');
    },
    setItem: () => {
      throw Error('Full');
    },
  };
  assert.ok(readRepository(denied, 'key', parseAggregates, emptyAggregates).error);
  assert.throws(() => restartRepository(denied, 'key', null, emptyAggregates(), parseAggregates));
});
test('view snapshots reject duplicates and unsupported source while preserving independent source/year context', () => {
  const view = captureSurveillanceSnapshot(
    { source: 'sismal', region: '11.03', year: 2025, snapshot: 'sismal-2025' },
    'Aceh',
    'id',
  );
  assert.deepEqual(parseViews([view]), [view]);
  assert.throws(() => parseViews([view, view]));
  assert.throws(() =>
    parseViews([{ ...view, selection: { ...view.selection, source: 'unknown' } }]),
  );
});
test('SKDR snapshot validation rejects label/code conflicts, impossible dates and URL mismatch', () => {
  const supplied = JSON.parse(
    readFileSync(new URL('../public/data/indonesia/skdr/2026-m44.json', import.meta.url), 'utf8'),
  );
  const wrong = structuredClone(supplied);
  wrong.rows.find((r: any) => r.regionCode === '31').originalLabel = 'Papua';
  assert.ok(validateSkdr(wrong).some((e) => e.includes('Label')));
  const bad = structuredClone(supplied);
  bad.publishedAt = '2026-02-30';
  assert.ok(validateSkdr(bad).length);
  const url = structuredClone(supplied);
  url.rows[0].sourceUrl = 'https://other.go.id';
  assert.ok(validateSkdr(url).length);
});
test('SISMAL snapshot validation checks original labels, update date and response state', () => {
  const raw = {
    source_id: '1105',
    district: 'ACEH TIMUR',
    province: 'ACEH',
    positive_cases: 4,
    reporting_year: 2025,
    validation_status: 'belum tervalidasi',
  };
  const s = normalizeSismal(
    [raw],
    2025,
    '2026-11-16T00:00:00Z',
    'https://malaria.kemkes.go.id/api/sismal/chartMap/2025/?province=ACEH',
  );
  assert.deepEqual(validateSismal(s, 2025), []);
  assert.ok(validateSismal({ ...s, responseState: 'empty' }, 2025).length);
  assert.ok(
    validateSismal({ ...s, rows: [{ ...s.rows[0], originalDistrict: 'KOTA BANDA ACEH' }] }, 2025)
      .length,
  );
  assert.ok(
    validateSismal({ ...s, rows: [{ ...s.rows[0], updatedAt: '2025-02-30' }] }, 2025).length,
  );
  assert.throws(() => normalizeSismal([raw], 2024, '2026-11-16T00:00:00Z', s.sourceUrl));
});

test('prospective registry validates persisted states and stages outcomes without mutating originals', async () => {
  const { createProspective, lockProspective } = await import('./prospective-engine.ts');
  const { parseProspective, previewOutcomes } = await import('./prospective-storage.ts');
  const input = {
    issue_date: '2024-01-01',
    data_cutoff: '2023-12-31',
    target_period: '2025',
    dataset_version: 'fixture',
    dataset_hash: 'a'.repeat(64),
    model_version: 'fixture',
    model: 'Ridge',
    district: 'Fixture',
    prediction: 120,
    persistence_prediction: 100,
  };
  const record = lockProspective(createProspective(input, '2024-01-01'), '2024-01-02');
  assert.deepEqual(parseProspective([record]), [record]);
  assert.throws(() => parseProspective([record, record]));
  assert.throws(() => parseProspective([{ ...record, status: 'DRAFT' }]));
  const preview = previewOutcomes(
    [{ forecast_id: record.forecast_id, outcome: 110 }],
    [record],
    '2026-01-01',
  );
  assert.equal(record.outcome, null);
  assert.equal(preview.records[0].outcome, 110);
  assert.equal(preview.records[0].error, 10);
  assert.throws(() =>
    previewOutcomes(
      [{ forecast_id: record.forecast_id, outcome: 110, patient: 'forbidden' }],
      [record],
      '2026-01-01',
    ),
  );
  assert.throws(() => createProspective({ ...input, issue_date: '2024-02-30' }, '2024-03-01'));
});
