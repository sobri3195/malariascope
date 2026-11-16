import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  normalizeSismal,
  mapSismalRegion,
  validateSismal,
  selectedSismal,
  surveillanceExport,
} from './indonesia/sismal.ts';
import { syncSismalYear } from '../scripts/lib/sync-malaria.mjs';
import { captureSurveillanceSnapshot, restoreSurveillanceSnapshot } from './workspace-context.ts';
const url = 'https://malaria.kemkes.go.id/api/sismal/chartMap/2025/?province=ACEH';
const now = '2026-11-16T06:00:00Z';
// Canonical synthetic adapter fixture, NOT a captured portal response.
const aceh = {
  source_id: '1105',
  district: 'ACEH TIMUR',
  province: 'ACEH',
  positive_cases: 4,
  reporting_year: 2025,
  validation_status: 'belum tervalidasi',
  updated_at: '2026-01-01',
};
const gorontalo = {
  source_id: '7501',
  district: 'Kabupaten Gorontalo',
  province: 'GORONTALO',
  positive_cases: 0,
  reporting_year: 2025,
  validation_status: 'belum tervalidasi',
};
test('source ID 1105 maps by period/name/parent to Aceh Timur 11.03; ID is not converted to Kemendagri', () => {
  assert.deepEqual(mapSismalRegion('1105', 'ACEH TIMUR', 'ACEH', 2025), {
    regionCode: '11.03',
    provinceCode: '11',
  });
  assert.throws(() => mapSismalRegion('1105', 'ACEH TIMUR', 'JAWA BARAT', 2025));
  assert.throws(() => mapSismalRegion('9999', 'Bogor', 'JAWA BARAT', 2025));
});
test('cross-province response is normalized once and exact selection never leaks other province/year', () => {
  const s = normalizeSismal([aceh, gorontalo], 2025, now, url);
  assert.deepEqual(validateSismal(s, 2025), []);
  assert.equal(s.rows.length, 2);
  const selected = {
    source: 'sismal' as const,
    year: 2025,
    snapshot: 'sismal-2025',
    region: '11.03',
  };
  assert.equal(selectedSismal(s, selected)[0].sourceId, '1105');
  assert.equal(selectedSismal(s, selected)[0].value, 4);
  assert.equal(selectedSismal(s, selected)[0].validationStatus, 'belum tervalidasi');
  assert.equal(selectedSismal(s, { ...selected, region: '11' }).length, 0);
  assert.equal(selectedSismal(s, { ...selected, year: 2026 }).length, 0);
  const out = surveillanceExport(null, s, selected)!;
  assert.equal(out.records.length, 1);
  assert.equal(out.selection.source, 'sismal');
  assert.equal(out.source.id, 'sismal-2025');
  assert.equal(out.records[0].reportingYear, 2025);
});
test('zero, unavailable, empty, malformed, wrong year and conflicting aliases are distinct', () => {
  const s = normalizeSismal([gorontalo, { ...aceh, positive_cases: null }], 2025, now, url);
  assert.equal(s.rows[0].value, 0);
  assert.equal(s.rows[0].availability, 'reported');
  assert.equal(s.rows[1].value, null);
  assert.equal(s.rows[1].availability, 'unavailable');
  assert.equal(normalizeSismal([], 2025, now, url).responseState, 'empty');
  for (const payload of [
    { message: 'error' },
    [{ ...aceh, positive_cases: -1 }],
    [{ ...aceh, reporting_year: 2026 }],
    [{ ...aceh, positif: 99 }],
    [{ ...aceh, positive_cases: { nested: 4 } }],
  ])
    assert.throws(() => normalizeSismal(payload, 2025, now, url));
});
test('identical duplicates deduplicate; conflicts fail; ambiguous mapping is reported, not assigned', () => {
  assert.equal(normalizeSismal([aceh, aceh], 2025, now, url).rows.length, 1);
  assert.throws(() => normalizeSismal([aceh, { ...aceh, positive_cases: 9 }], 2025, now, url));
  const s = normalizeSismal(
    [aceh, { ...aceh, source_id: '9999', district: 'Bogor', province: 'JAWA BARAT' }],
    2025,
    now,
    url,
  );
  assert.equal(s.rows.length, 1);
  assert.equal(s.unmapped.length, 1);
  assert.match(s.unmapped[0].reason, /ambigu/);
});
test('sync requests cross-province response once; failed/empty/coverage-regression retain last good artifact', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sismal-test-'));
  let requests = 0;
  try {
    const good = await syncSismalYear({
      year: 2025,
      root,
      now,
      download: async () => {
        requests++;
        return Buffer.from(JSON.stringify([aceh, gorontalo]));
      },
    });
    assert.equal(good.status, 'saved');
    assert.equal(requests, 1);
    const file = join(root, 'sismal', '2025.json'),
      original = await readFile(file, 'utf8');
    const failed = await syncSismalYear({
      year: 2025,
      root,
      now,
      download: async () => {
        throw Error('HTTP 403 fixture');
      },
    });
    assert.equal(failed.status, 'failed');
    assert.equal(await readFile(file, 'utf8'), original);
    const empty = await syncSismalYear({
      year: 2025,
      root,
      now,
      download: async () => Buffer.from('[]'),
    });
    assert.equal(empty.status, 'empty');
    assert.equal(await readFile(file, 'utf8'), original);
    const smaller = await syncSismalYear({
      year: 2025,
      root,
      now,
      download: async () => Buffer.from(JSON.stringify([aceh])),
    });
    assert.equal(smaller.status, 'coverage-regression');
    assert.equal(await readFile(file, 'utf8'), original);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test('SISMAL view snapshot restores source/year/version without turning into SKDR', () => {
  const selection = {
    source: 'sismal' as const,
    year: 2025,
    snapshot: 'sismal-2025',
    region: '11.03',
  };
  assert.deepEqual(
    restoreSurveillanceSnapshot(captureSurveillanceSnapshot(selection, 'SISMAL Aceh', 'id'))
      .selection,
    selection,
  );
});

test('sync preserves corrupt prior artifacts and keeps retrieval archives across identical response bytes', async () => {
  const { writeFile, readdir, mkdir } = await import('node:fs/promises');
  const root = await mkdtemp(join(tmpdir(), 'sismal-archive-'));
  try {
    await mkdir(join(root, 'sismal'), { recursive: true });
    const file = join(root, 'sismal', '2025.json');
    await writeFile(file, '{corrupt-original');
    let fetched = 0;
    const denied = await syncSismalYear({
      year: 2025,
      root,
      now,
      download: async () => {
        fetched++;
        return Buffer.from('[]');
      },
    });
    assert.equal(denied.status, 'failed');
    assert.equal(fetched, 0);
    assert.equal(await readFile(file, 'utf8'), '{corrupt-original');
    await rm(file);
    const download = async () => Buffer.from(JSON.stringify([aceh]));
    await syncSismalYear({ year: 2025, root, now, download });
    const first = await readdir(join(root, 'sismal', 'archive'));
    const originals = await Promise.all(
      first.map((f) => readFile(join(root, 'sismal', 'archive', f), 'utf8')),
    );
    const second = await syncSismalYear({
      year: 2025,
      root,
      now: '2026-11-17T06:00:00Z',
      download,
    });
    assert.equal(second.status, 'saved');
    for (let i = 0; i < first.length; i++)
      assert.equal(await readFile(join(root, 'sismal', 'archive', first[i]), 'utf8'), originals[i]);
    assert.ok((await readdir(join(root, 'sismal', 'archive'))).length > first.length);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
