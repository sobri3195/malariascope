import test from 'node:test';
import assert from 'node:assert/strict';
import {
  columns,
  compareSources,
  csv,
  masters,
  regionName,
  responseMetric,
  selectRows,
  validateRows,
  type Kind,
  type RecordRow,
} from './indonesia/engine.ts';
function fixture(kind: Kind, changes: RecordRow = {}): RecordRow {
  const row = Object.fromEntries(columns(kind).map((k) => [k, '']));
  Object.assign(row, {
    region_version: '2025',
    region_code: '31',
    period_start: '2025-01-01',
    period_end: '2025-12-31',
    source_id: 'TEST-ONLY',
    source_type: {
      situasi: 'profil',
      asal: 'pe-agregat',
      layanan: 'penilaian-fasyankes',
      respons: 'rekap-respons',
    }[kind],
    publication_version: 'uji-v1',
    published_at: '2026-01-01',
    reviewed_at: '2026-01-02',
    source_url: 'https://contoh.go.id/fixture-uji-bukan-data-resmi',
    locator: 'Fixture pengujian saja',
    definition: 'Kasus terkonfirmasi uji',
    coverage: 'Seluruh unit uji',
    geo_basis: 'pelaporan',
    status: 'reported',
  });
  if (kind === 'situasi') row.confirmed = '0';
  if (kind === 'asal')
    Object.assign(row, {
      confirmed: '10',
      imported: '3',
      introduced: '1',
      indigenous: '2',
      other: '1',
      unclassified: '3',
    });
  if (kind === 'layanan')
    Object.assign(row, {
      assessed_at: '2025-06-01',
      rdt_ready: '0',
      rdt_assessed: '0',
      microscopy_ready: '2',
      microscopy_assessed: '3',
      referral_ready: '3',
      referral_assessed: '3',
    });
  if (kind === 'respons')
    Object.assign(row, {
      stage: 'notifikasi',
      trigger_at: '2025-06-01T00:00:00Z',
      required_count: '10',
      completed_count: '7',
      timely_count: '6',
      deadline_hours: '24',
      as_of: '2025-06-03T00:00:00Z',
      sop_url: 'https://contoh.go.id/sop-uji',
      sop_version: 'uji',
      sop_effective_from: '2025-01-01',
      sop_effective_to: '2025-12-31',
    });
  return { ...row, ...changes };
}
test('master Kemendagri: 38 provinsi, 514 kab/kota; Jakarta, Papua, Jawa Tengah dan kabupaten tanpa angka dapat dipilih', () => {
  assert.equal(masters['2025'].regions.filter((r) => /^\d{2}$/.test(r.code)).length, 38);
  assert.equal(masters['2025'].regions.filter((r) => r.code.includes('.')).length, 514);
  for (const r of masters['2025'].regions.filter((r) => r.code.includes('.')))
    assert.ok(regionName('2025', r.code.slice(0, 2)));
  for (const code of ['31', '91', '33', '33.01']) assert.ok(regionName('2025', code));
  assert.equal(selectRows([], '2025', '33.01', '', '').length, 0);
  assert.equal(regionName('2020', '93'), undefined);
  assert.ok(regionName('2025', '93'));
});
for (const k of ['situasi', 'asal', 'layanan', 'respons'] as Kind[])
  test(`validasi kontrak ${k}`, () => assert.deepEqual(validateRows(k, [fixture(k)]), []));
test('nol, parsial dan unavailable berbeda; kosong bukan nol; integer aman', () => {
  assert.deepEqual(validateRows('situasi', [fixture('situasi')]), []);
  assert.ok(validateRows('situasi', [fixture('situasi', { confirmed: '' })]).length);
  assert.deepEqual(
    validateRows('situasi', [fixture('situasi', { confirmed: '', status: 'unavailable' })]),
    [],
  );
  assert.deepEqual(
    validateRows('situasi', [fixture('situasi', { confirmed: '3', status: 'partial' })]),
    [],
  );
  for (const confirmed of ['-1', 'NaN', '1.5', '9007199254740992'])
    assert.ok(validateRows('situasi', [fixture('situasi', { confirmed })]).length);
});
test('asal: jumlah semua kategori, termasuk belum diklasifikasi, wajib sesuai', () => {
  assert.ok(validateRows('asal', [fixture('asal', { unclassified: '0' })]).length);
  assert.ok(validateRows('asal', [fixture('asal', { geo_basis: 'tidak diketahui' })]).length);
});
test('layanan: pembilang tidak boleh melampaui penyebut; tanggal penilaian wajib', () => {
  assert.ok(validateRows('layanan', [fixture('layanan', { rdt_ready: '1' })]).length);
  assert.ok(validateRows('layanan', [fixture('layanan', { assessed_at: '2025-02-30' })]).length);
});
test('respons: seluruh kejadian wajib jatuh tempo masuk penyebut walau belum selesai', () => {
  const r = fixture('respons');
  assert.deepEqual(responseMetric([r]), {
    numerator: 6,
    denominator: 10,
    percent: 60,
    partial: false,
  });
  assert.equal(responseMetric([{ ...r, as_of: '2025-06-01T12:00:00Z' }])?.denominator, 0);
  assert.equal(responseMetric([{ ...r, as_of: '2025-06-02T00:00:00Z' }])?.denominator, 10);
  assert.equal(responseMetric([{ ...r, status: 'unavailable' }]), null);
  assert.equal(responseMetric([r, { ...r, stage: 'penyelidikan' }]), null);
  assert.equal(responseMetric([r, { ...r, publication_version: 'v2' }]), null);
  for (const change of [
    { timely_count: '8' },
    { completed_count: '11' },
    { sop_effective_to: '2024-12-31' },
    { deadline_hours: '0' },
    { as_of: '2025-05-31T00:00:00Z' },
  ])
    assert.ok(validateRows('respons', [fixture('respons', change)]).length);
});
test('cakupan SKDR, URL resmi, urutan tanggal dan duplikat diperiksa', () => {
  assert.ok(validateRows('situasi', [fixture('situasi', { source_type: 'skdr' })]).length);
  assert.deepEqual(
    validateRows('situasi', [
      fixture('situasi', { source_type: 'skdr', week_start: '1', week_end: '20' }),
    ]),
    [],
  );
  assert.ok(
    validateRows('situasi', [fixture('situasi', { source_url: 'https://example.com/angka' })])
      .length,
  );
  assert.ok(validateRows('situasi', [fixture('situasi', { published_at: '2026-02-01' })]).length);
  assert.ok(validateRows('situasi', [fixture('situasi'), fixture('situasi')]).length);
});
test('identitas pasien/kolom asing ditolak; CSV aman dari formula', () => {
  assert.ok(validateRows('situasi', [{ ...fixture('situasi'), nik: '123' }]).length);
  assert.ok(
    validateRows('situasi', [fixture('situasi', { definition: 'NIK 1234567890123456' })]).length,
  );
  assert.ok(
    validateRows('situasi', [fixture('situasi', { definition: 'pasien@example.com' })]).length,
  );
  assert.ok(csv(['value'], [{ value: ' =1+1' }]).includes("' =1+1"));
  assert.ok(csv(['value'], [{ value: 'a,"b"' }]).includes('"a,""b"""'));
});
test('pemekaran: versi batas tidak digabung; induk tidak mengisi anak; versi publikasi terpisah', () => {
  const records = [
    fixture('situasi'),
    fixture('situasi', { region_code: '31.01' }),
    fixture('situasi', { region_version: '2020' }),
    fixture('situasi', { publication_version: 'v2' }),
  ];
  assert.equal(selectRows(records, '2025', '31', '', '').length, 2);
  assert.equal(selectRows(records, '2025', '31.02', '', '').length, 0);
  assert.equal(selectRows(records, '2025', '31', '2025', 'TEST-ONLY@uji-v1').length, 1);
  assert.ok(compareSources(records[0], records[2]).includes('region_version'));
  assert.ok(compareSources(records[0], records[3]).includes('publication_version'));
});

test('URL prototype keys and truncated response rows fail safely', () => {
  assert.equal(regionName('__proto__', '31'), undefined);
  const row = fixture('respons');
  delete row.sop_version;
  assert.ok(validateRows('respons', [row], columns('respons')).length);
});
