import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { masters } from './indonesia/engine.ts';
import { convertOfficialSkdrCsv, parseIndonesianInteger } from './indonesia/skdr-conversion.ts';
import { validateSkdrCatalog } from './indonesia/skdr-catalog.ts';
// @ts-expect-error Node executes the native ESM synchronization library.
import {
  discoverBulletin,
  discoverLatestBulletin,
  verifyPdfRows,
  verifyPdfMetadata,
  publishSnapshot,
} from '../scripts/lib/skdr-publication.mjs';
import { skdrReconciliation, validateAuditTargets } from './indonesia/skdr.ts';
const metadata = {
  year: 2026,
  bulletin: 45,
  weekThrough: 44,
  publishedAt: '2026-11-16',
  dataAsOf: '2026-11-14T10:00:00+07:00',
  retrievedAt: '2026-11-17T00:00:00Z',
  sourceUrl: 'https://surveilans.kemkes.go.id/TEST-ONLY.pdf',
  national: 399404,
  nationalPage: 36,
  provincePage: 45,
  provinceColumn: 'Provinsi',
  confirmedColumn: 'Kasus Terkonfirmasi',
};
// Entirely synthetic rows exercise the contract; never source evidence or shipped observations.
function fixture() {
  const provinces = masters['2025'].regions.filter((r) => /^\d{2}$/.test(r.code));
  const csv =
    'No,Provinsi,Kasus Terkonfirmasi,A,B,C,D\n' +
    provinces.map((p, i) => `${i + 1},${p.name},${i + 1},0,0,0,0`).join('\n');
  return { csv, snapshot: convertOfficialSkdrCsv(csv, metadata) };
}
test('seven-column Indonesian attachment maps every full province label; preserves source times and national', () => {
  const { snapshot } = fixture();
  assert.equal(snapshot.rows.length, 39);
  assert.equal(snapshot.dataAsOf, metadata.dataAsOf);
  assert.equal(skdrReconciliation(snapshot).national, 399404);
  assert.equal(skdrReconciliation(snapshot).provinceSum, 741);
  assert.equal(skdrReconciliation(snapshot).difference, 741 - 399404);
  const papua = snapshot.rows.filter((r) => r.originalLabel?.startsWith('Papua'));
  assert.equal(papua.length, 6);
  assert.equal(new Set(papua.map((r) => r.regionCode)).size, 6);
  assert.throws(() =>
    convertOfficialSkdrCsv(fixture().csv.replace('Papua Tengah', 'Papua gabungan'), metadata),
  );
  assert.throws(() =>
    convertOfficialSkdrCsv(fixture().csv, { ...metadata, confirmedColumn: 'Unknown' }),
  );
  assert.equal(parseIndonesianInteger('162.947'), 162947);
  for (const invalid of ['', '-', '1.23', '-1', '1,200', '1e3'])
    assert.throws(() => parseIndonesianInteger(invalid));
});
test('official index selects exact year/edition and detects ambiguous links', () => {
  const html =
    '<a href="/m44-2026.pdf">M44 2026</a><a href="/m45-2026.pdf">M45 2026</a><a href="https://evil.test/m45-2026.pdf">M45</a>';
  assert.equal(discoverBulletin(html, 2026, 44), 'https://surveilans.kemkes.go.id/m44-2026.pdf');
  assert.equal(discoverLatestBulletin(html, 2026).bulletin, 45);
  assert.throws(() => discoverBulletin(html, 2025, 45));
  assert.throws(() => discoverBulletin(html + '<a href="/another-m45-2026.pdf">M45</a>', 2026, 45));
});
test('PDF verification requires full labels, distinct numeric cells and unique rows', () => {
  const { snapshot } = fixture();
  const pages: Record<number, string> = {
    36: 'Indonesia  399.404',
    45: snapshot.rows
      .slice(1)
      .map((r, i) => `${i + 1}  ${r.originalLabel}  ${r.value}  0  0  0  0`)
      .join('\n'),
  };
  verifyPdfRows(snapshot, pages);
  const papua = snapshot.rows.find((r) => r.originalLabel === 'Papua')!;
  assert.throws(() =>
    verifyPdfRows(snapshot, {
      ...pages,
      45: pages[45].replace(`Papua  ${papua.value}`, `Papua Tengah  ${papua.value}`),
    }),
  );
  assert.throws(() => verifyPdfRows(snapshot, { ...pages, 45: pages[45] + '\n' + pages[45] }));
});
test('atomic catalog publication: dry run, unchanged retrieval, new edition, revision and invalid retention', async () => {
  const root = await mkdtemp(join(tmpdir(), 'skdr-publication-test-'));
  try {
    const { snapshot } = fixture(),
      pdf = Buffer.from('%PDF-TEST-ONLY');
    const input = { snapshot, pdf, root };
    assert.equal((await publishSnapshot({ ...input, dryRun: true })).status, 'published');
    await assert.rejects(readFile(join(root, 'catalog.json')));
    const first = await publishSnapshot(input);
    const before = await readFile(join(root, 'catalog.json'), 'utf8');
    assert.equal(validateSkdrCatalog(JSON.parse(before)).latest, '2026-m45');
    assert.equal(
      (
        await publishSnapshot({
          ...input,
          snapshot: { ...snapshot, retrievedAt: '2026-11-18T00:00:00Z' },
        })
      ).status,
      'unchanged',
    );
    assert.equal(await readFile(join(root, 'catalog.json'), 'utf8'), before);
    const revised = structuredClone(snapshot);
    revised.rows[1].value!++;
    assert.equal((await publishSnapshot({ ...input, snapshot: revised })).status, 'revised');
    assert.notEqual(
      JSON.parse(await readFile(join(root, 'catalog.json'), 'utf8')).entries[0].version,
      first.after.version,
    );
    await readFile(join(root, 'versions', `${snapshot.id}-${first.after.version}.json`));
    const valid = await readFile(join(root, 'catalog.json'), 'utf8');
    const invalid = structuredClone(snapshot);
    invalid.rows.pop();
    await assert.rejects(publishSnapshot({ ...input, snapshot: invalid }));
    assert.equal(await readFile(join(root, 'catalog.json'), 'utf8'), valid);
    const next = structuredClone(snapshot);
    next.id = '2026-m46';
    next.rows.forEach((r) => {
      r.bulletin = 'M46';
      r.weekThrough = 45;
    });
    assert.equal((await publishSnapshot({ ...input, snapshot: next })).status, 'published');
    assert.equal(JSON.parse(await readFile(join(root, 'catalog.json'), 'utf8')).latest, '2026-m46');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('source dates and coverage must match PDF; audit gates reject synthetic provincial totals', () => {
  const { snapshot } = fixture();
  const pages = {
    1: 'Tanggal terbit: 16 November 2026',
    36: 'Malaria sampai minggu 44. Data per 14 November 2026 pukul 10.00 WIB.',
  };
  verifyPdfMetadata(snapshot, pages);
  assert.throws(() =>
    verifyPdfMetadata({ ...snapshot, dataAsOf: '2026-11-14T11:00:00+07:00' }, pages),
  );
  assert.throws(() => verifyPdfMetadata({ ...snapshot, publishedAt: '2026-11-15' }, pages));
  assert.ok(validateAuditTargets(snapshot).length);
});

// @ts-expect-error Native ESM synchronization helpers are exercised by Node.
import { withPublicationLock, recordSyncAttempt } from '../scripts/lib/skdr-state.mjs';
test('publisher excludes concurrent writers and releases its own lock after failure', async () => {
  const root = await mkdtemp(join(tmpdir(), 'skdr-lock-'));
  try {
    await withPublicationLock(root, async () => {
      await assert.rejects(
        publishSnapshot({ root, snapshot: fixture().snapshot, pdf: Buffer.from('%PDF-TEST') }),
        { code: 'SKDR_LOCKED' },
      );
      await assert.rejects(
        withPublicationLock(root, () => null),
        { code: 'SKDR_LOCKED' },
      );
    });
    await assert.rejects(
      withPublicationLock(root, () => {
        throw Error('simulated failure');
      }),
    );
    assert.equal(await withPublicationLock(root, () => 123), 123);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test('attempt ledger retains success and active version after source failure without claiming display', async () => {
  const root = await mkdtemp(join(tmpdir(), 'skdr-ledger-'));
  try {
    const result = await publishSnapshot({
      root: join(root, 'skdr'),
      snapshot: fixture().snapshot,
      pdf: Buffer.from('%PDF-TEST'),
    });
    const first = await recordSyncAttempt(root, {
      source: 'skdr',
      status: result.status,
      attemptedAt: '2026-11-17T01:00:00Z',
    });
    const failed = await recordSyncAttempt(root, {
      source: 'skdr',
      status: 'failed',
      failedStage: 'download',
      attemptedAt: '2026-11-17T02:00:00Z',
      error: 'HTTP 403',
    });
    assert.deepEqual(failed.active, first.active);
    assert.equal(failed.lastSuccessAt, first.lastSuccessAt);
    assert.equal(failed.lastPublishedAt, first.lastPublishedAt);
    assert.equal(failed.lastAttemptedAt, '2026-11-17T02:00:00Z');
    assert.equal(failed.publicationState, 'retained');
    assert.equal(failed.attempts[0].failedStage, 'download');
    assert.equal(failed.displayedAt, undefined);
    const same = await recordSyncAttempt(root, {
      source: 'skdr',
      status: 'unchanged',
      attemptedAt: '2026-11-17T03:00:00Z',
    });
    assert.equal(same.lastPublishedAt, first.lastPublishedAt);
    assert.equal(same.lastSuccessAt, '2026-11-17T03:00:00Z');
    const other = await recordSyncAttempt(root, {
      source: 'sismal',
      status: 'saved',
      attemptedAt: '2026-11-17T04:00:00Z',
    });
    assert.equal(other.lastSuccessAt, same.lastSuccessAt);
    assert.equal(other.attempts.length, 2);
    assert.equal(other.publicationState, same.publicationState);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test('rejected PDF row report includes all affected province codes and source pages', () => {
  assert.throws(
    () => verifyPdfRows(fixture().snapshot, {}),
    (e: unknown) => {
      const error = e as { rejectedRows: { regionCode: string; page: number }[] };
      assert.equal(error.rejectedRows.length, 39);
      assert.ok(error.rejectedRows.some((r) => r.regionCode === '91' && r.page === 45));
      return true;
    },
  );
});
