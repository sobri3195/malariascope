import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { masters, csv, responseMetric } from './indonesia/engine.ts';
import {
  validateSkdr,
  skdrReconciliation,
  skdrExport,
  mapSkdrLabel,
  type SkdrSnapshot,
  initialSkdr,
} from './indonesia/skdr.ts';
import { convertSkdrMarkdown } from './indonesia/skdr-conversion.ts';
import { captureSurveillanceSnapshot, restoreSurveillanceSnapshot } from './workspace-context.ts';
const supplied = JSON.parse(
  readFileSync(new URL('../public/data/indonesia/skdr/2026-m44.json', import.meta.url), 'utf8'),
) as SkdrSnapshot;
// Synthetic complete fixture tests arithmetic/conversion only, not real provincial statistics.
function complete(): SkdrSnapshot {
  const s = structuredClone(supplied);
  s.evidence = 'attachment-extraction';
  s.sourceUrl = 'https://contoh.go.id/FIXTURE-ONLY.pdf';
  s.retrievedAt = '2026-11-16T00:00:00Z';
  for (const r of s.rows) {
    r.originalLabel = masters['2025'].regions.find((x) => x.code === r.regionCode)!.name;
    r.sourceUrl = s.sourceUrl;
    if (r.value === null) {
      r.value = 0;
      r.availability = 'reported';
    }
  }
  s.rows.find((r) => r.regionCode === '11')!.value = 228134;
  return s;
}
test('supplied snapshot: exact 39 rows, known values; missing 34 provinces are null, never fabricated', () => {
  assert.deepEqual(validateSkdr(supplied), []);
  assert.ok(validateSkdr(supplied, true).length);
  for (const [code, value] of [
    ['ID', 388495],
    ['31', 367],
    ['75', 8252],
    ['91', 157608],
  ] as const)
    assert.equal(supplied.rows.find((r) => r.regionCode === code)?.value, value);
  const r = skdrReconciliation(supplied);
  assert.equal(r.availableProvinceCount, 4);
  assert.equal(r.provinceSum, null);
  assert.equal(r.difference, null);
});
test('reconciliation is derived from actual rows; never includes national in province sum', () => {
  const s = complete(),
    r = skdrReconciliation(s);
  assert.equal(r.provinceCount, 38);
  assert.equal(r.provinceSum, 394361);
  assert.equal(r.difference, 5866);
  assert.equal(r.national, 388495);
  s.rows.find((r) => r.regionCode === '11')!.value!++;
  assert.equal(skdrReconciliation(s).difference, 5867);
});
test('invalid region, duplicate snapshot row, missing/negative values and provenance fail', () => {
  for (const mutate of [
    (s: SkdrSnapshot) => (s.rows[1].regionCode = '9999'),
    (s: SkdrSnapshot) => s.rows.push({ ...s.rows[1] }),
    (s: SkdrSnapshot) => (s.rows[1].value = -1),
    (s: SkdrSnapshot) => (s.sourceUrl = 'https://example.com/fake'),
  ]) {
    const s = complete();
    mutate(s);
    assert.ok(validateSkdr(s, true).length);
  }
  const s = complete();
  s.rows[2].value = null;
  s.rows[2].availability = 'unavailable';
  assert.equal(skdrReconciliation(s).provinceSum, null);
});
test('selection exports exact level, version and provenance; empty district never falls back to province', () => {
  const province = skdrExport(supplied, { ...initialSkdr, region: '31' });
  assert.equal(province.records.length, 1);
  assert.equal(province.records[0].value, 367);
  assert.equal(province.reconciliation, undefined);
  assert.equal(skdrExport(supplied, { ...initialSkdr, region: '31.01' }).records.length, 0);
  assert.equal(skdrExport(supplied, { ...initialSkdr, snapshot: '2026-m43' }).records.length, 0);
  assert.equal(skdrExport(supplied, { ...initialSkdr, year: 2025 }).records.length, 0);
  assert.equal(responseMetric([]), null);
  assert.equal(
    responseMetric([
      {
        status: 'reported',
        stage: 'notifikasi',
        source_id: 'uji',
        publication_version: 'v1',
        sop_url: 'https://contoh.go.id/sop',
        sop_version: 'v1',
        as_of: '2026-11-16T00:00:00Z',
        trigger_at: '2026-11-15T00:00:00Z',
        deadline_hours: '24',
        required_count: '0',
        timely_count: '0',
      },
    ])?.percent,
    null,
  );
  assert.equal(
    skdrExport(supplied, { ...initialSkdr, snapshot: 'wrong' }).reconciliation,
    undefined,
  );
});
test('SKDR snapshot context restores separately from legacy research and rejects invalid code', () => {
  const s = captureSurveillanceSnapshot({ ...initialSkdr, region: '91' }, 'Papua', 'view-id');
  assert.deepEqual(restoreSurveillanceSnapshot(s).selection, s.selection);
  assert.ok(
    restoreSurveillanceSnapshot({ ...s, selection: { ...s.selection, region: 'WRONG' } }).error,
  );
});
test('label mapping preserves strings and rejects unknown aliases', () => {
  assert.equal(mapSkdrLabel('DKI Jakarta'), '31');
  assert.equal(mapSkdrLabel('Gorontalo'), '75');
  assert.equal(mapSkdrLabel('Papua'), '91');
  assert.throws(() => mapSkdrLabel('Papua gabungan'));
});
test('Markdown CSV extraction validates full snapshot and metadata before output', () => {
  const s = complete();
  const rows = s.rows.map((r) => ({
    level: r.level,
    region_code: r.regionCode,
    original_label: r.originalLabel!,
    year: String(r.year),
    week_through: String(r.weekThrough),
    bulletin: r.bulletin,
    metric: r.metric,
    value: String(r.value),
    availability: r.availability,
    page: String(r.page),
    source_url: s.sourceUrl!,
    published_at: s.publishedAt,
    retrieved_at: s.retrievedAt!,
  }));
  const markdown = '```csv\n' + csv(Object.keys(rows[0]), rows).replace(/^\uFEFF/, '') + '\n```';
  const converted = convertSkdrMarkdown(markdown);
  assert.deepEqual(validateSkdr(converted, true), []);
  assert.equal(skdrReconciliation(converted).difference, 5866);
  assert.throws(() => convertSkdrMarkdown(markdown + '\n' + markdown));
  assert.throws(() => convertSkdrMarkdown(markdown.replace('Gorontalo', 'Unknown province')));
});

test('new 2026 bulletin is a separate snapshot; old M44 URL still selects only M44', () => {
  const old = complete(),
    next = complete();
  next.id = '2026-m45';
  next.publishedAt = '2026-11-17';
  for (const r of next.rows) {
    r.weekThrough = 44;
    r.bulletin = 'M45';
  }
  assert.deepEqual(validateSkdr(next, true), []);
  assert.equal(
    skdrExport(next, { year: 2026, snapshot: '2026-m44', region: 'ID' }).records.length,
    0,
  );
  assert.equal(
    skdrExport(old, { year: 2026, snapshot: '2026-m44', region: 'ID' }).records.length,
    1,
  );
  assert.equal(
    skdrExport(next, { year: 2026, snapshot: '2026-m45', region: 'ID' }).records.length,
    1,
  );
});
