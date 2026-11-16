import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  stageVersion,
  emptyCatalog,
  publishCatalog,
  loadCatalog,
  sha,
} from '../scripts/malaria/catalog.mjs';
import {
  discoverSkdr,
  discoverSismal,
  extractSkdr,
  readDocument,
  publicationIdentity,
} from '../scripts/malaria/extract.mjs';
import { syncMalaria } from '../scripts/malaria/pipeline.mjs';
import { createDownloader, checkedUrl, retryDelay } from '../scripts/malaria/http.mjs';
import { normalizeRegional } from '../scripts/malaria/regional.mjs';
import { resolvePublication, validateCatalog } from './indonesia/publication-catalog.ts';
import { normalizeSismal } from './indonesia/sismal.ts';
import { masters } from './indonesia/engine.ts';
import { skdrReconciliation } from './indonesia/skdr.ts';
import { captureSurveillanceSnapshot, restoreSurveillanceSnapshot } from './workspace-context.ts';
const now = '2026-11-16T09:00:00Z';
const nextDay = '2026-11-17T09:00:00Z';
const publication = {
  id: '2026-m44',
  publicationYear: 2026,
  bulletinNumber: 44,
  publishedAt: '2026-11-10',
  url: 'https://surveilans.kemkes.go.id/real-index-link.pdf',
  indexUrl: 'https://surveilans.kemkes.go.id/publikasi',
};
// Synthetic arithmetic/layout fixture only; never placed in public data.
const counts: Record<string, number> = { '11': 228134, '31': 367, '75': 8252, '91': 157608 };
function pages(week = 43) {
  return [
    { page: 7, text: `Malaria Konfirmasi\nData sampai M${week} 2026\nIndonesia 388.495` },
    {
      page: 12,
      text:
        `Malaria Konfirmasi\nData sampai M${week} 2026\n` +
        masters['2025'].regions
          .filter((r) => /^\d{2}$/.test(r.code))
          .map((r) => `${r.name} ${counts[r.code] || 0}`)
          .join('\n'),
    },
  ];
}
function fixture(pub = publication) {
  return extractSkdr(pages(pub.bulletinNumber - 1), pub, now, 'a'.repeat(64));
}
const aceh = {
  source_id: '1105',
  district: 'ACEH TIMUR',
  province: 'ACEH',
  positive_cases: 4,
  reporting_year: 2025,
  validation_status: 'Belum tervalidasi',
};
async function temporary(fn: (root: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'malaria-test-'));
  try {
    await fn(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
function response(body: string | Buffer, url: string) {
  return { status: 200, headers: {}, body: Buffer.from(body), url };
}
const index = `<article><h2><a href="/real-index-link.pdf">Buletin situasi M44 2026</a></h2><time datetime="2026-11-10">10 November 2026</time></article>`;
const reader = async (mode: string, bytes: Buffer, url?: string) =>
  mode === 'pdf' ? JSON.parse(bytes.toString()) : readDocument(mode, bytes, url);
const downloader = async (url: string) => {
  if (url.endsWith('/publikasi')) return response(index, url);
  if (url.endsWith('.pdf')) return response(JSON.stringify(pages()), url);
  if (url.endsWith('/case'))
    return response('<script>const u="/api/sismal/chartMap/2025/";</script>', url);
  return response(url.includes('/2025/') ? JSON.stringify([aceh]) : '[]', url);
};
test('SKDR real anchors/title/date discovery, no guessed filename, dynamic section pages and distinct totals', async () => {
  assert.equal(publicationIdentity('M44 laporan 2026')?.id, '2026-m44');
  assert.equal(publicationIdentity('M44 M45 laporan 2026'), null);
  const found = await discoverSkdr(downloader, { year: 2026 });
  assert.equal(found[0].url, publication.url);
  assert.equal(found[0].publishedAt, '2026-11-10');
  const snapshot = fixture();
  assert.equal(snapshot.rows.length, 39);
  assert.equal(snapshot.rows[0].page, 7);
  assert.equal(snapshot.rows.find((r: { regionCode: string }) => r.regionCode === '31').page, 12);
  const totals = skdrReconciliation(snapshot);
  assert.equal(totals.national, 388495);
  assert.equal(totals.provinceSum, 394361);
  assert.equal(totals.difference, 5866);
  assert.throws(
    () =>
      extractSkdr(
        [{ page: 1, text: 'Malaria Konfirmasi scan unreadable' }],
        publication,
        now,
        'a'.repeat(64),
      ),
    /cakupan/,
  );
  assert.throws(
    () => extractSkdr(pages().slice(0, 1), publication, now, 'a'.repeat(64)),
    /38 provinsi/,
  );
  assert.throws(
    () => extractSkdr([...pages(), pages()[1]], publication, now, 'a'.repeat(64)),
    /berulang/,
  );
});
test('PDF reader runs Poppler and HTML reader retains index pagination and publication dates', async () => {
  // Minimal valid text PDF, generated here without external packages or a forged official document.
  const stream = 'BT /F1 12 Tf 50 750 Td (Malaria Konfirmasi) Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Count 1 /Kids [3 0 R] >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((o, i) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((o) => String(o).padStart(10, '0') + ' 00000 n \n')
    .join('')}trailer << /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const parsed = await readDocument('pdf', Buffer.from(pdf));
  assert.match(parsed[0].text, /Malaria Konfirmasi/);
  const html = await readDocument(
    'index',
    Buffer.from(index + '<a rel="next" href="?page=2">Next</a>'),
    publication.indexUrl,
  );
  assert.ok(html.links.some((l: { next: boolean }) => l.next));
});
test('immutable publication: new, duplicate despite fetch timestamp, same-bulletin revision, latest and pinned old URLs', async () =>
  temporary(async (root) => {
    const catalog = emptyCatalog();
    const snapshot = fixture();
    const first = await stageVersion({
      catalog,
      root,
      kind: 'skdr',
      year: 2026,
      snapshot,
      now,
      rawSha256: 'a'.repeat(64),
    });
    await publishCatalog(root, catalog);
    const duplicate = await stageVersion({
      catalog,
      root,
      kind: 'skdr',
      year: 2026,
      snapshot: { ...snapshot, retrievedAt: nextDay },
      now: nextDay,
      rawSha256: 'a'.repeat(64),
    });
    assert.equal(duplicate.status, 'unchanged');
    assert.equal(catalog.sources['skdr:2026'].versions.length, 1);
    const revision = structuredClone(snapshot);
    revision.rows[0].value++;
    const second = await stageVersion({
      catalog,
      root,
      kind: 'skdr',
      year: 2026,
      snapshot: revision,
      now: nextDay,
      rawSha256: 'b'.repeat(64),
    });
    assert.notEqual(first.version.id, second.version.id);
    assert.equal(
      resolvePublication(catalog, 'skdr', 2026, 'latest')?.version.id,
      second.version.id,
    );
    assert.equal(
      resolvePublication(catalog, 'skdr', 2026, first.version.id)?.version.id,
      first.version.id,
    );
    assert.equal(
      JSON.parse(
        await readFile(join(root, first.version.path.replace('/data/indonesia/', '')), 'utf8'),
      ).rows[0].value,
      388495,
    );
    const newest = {
      ...publication,
      id: '2026-m45',
      bulletinNumber: 45,
      publishedAt: '2026-11-17',
    };
    const third = await stageVersion({
      catalog,
      root,
      kind: 'skdr',
      year: 2026,
      snapshot: fixture(newest),
      now: nextDay,
      rawSha256: 'c'.repeat(64),
    });
    assert.equal(resolvePublication(catalog, 'skdr', undefined)?.version.id, third.version.id);
    const view = captureSurveillanceSnapshot(
      {
        source: 'skdr',
        year: 2026,
        snapshot: publication.id,
        versionId: first.version.id,
        region: '31',
      },
      'pinned',
      'test',
    );
    assert.equal(restoreSurveillanceSnapshot(view).selection?.versionId, first.version.id);
    await publishCatalog(root, catalog);
    assert.equal((await loadCatalog(root)).sources['skdr:2026'].versions.length, 3);
  }));
test('pipeline publishes manifest last, recheck is unchanged, empty 2026 and 2025 remain distinct, failures retain every old pointer', async () =>
  temporary(async (root) => {
    const good = await syncMalaria({ root, download: downloader, year: 2026, now, read: reader });
    assert.deepEqual(
      good.attempts.map((a: { status: string }) => a.status),
      ['updated', 'empty', 'updated'],
    );
    const old = await loadCatalog(root);
    assert.equal(old.sources['sismal:2026'].versions[0].coverage.available, 0);
    const again = await syncMalaria({
      root,
      download: downloader,
      year: 2026,
      now: nextDay,
      read: reader,
    });
    assert.ok(again.attempts.every((a: { status: string }) => a.status === 'unchanged'));
    const failed = await syncMalaria({
      root,
      year: 2026,
      now: nextDay,
      read: reader,
      download: async () => {
        throw Error('Timeout');
      },
    });
    assert.ok(failed.attempts.every((a: { status: string }) => a.status === 'failed'));
    for (const [key, s] of Object.entries(old.sources) as [string, { active: string }][])
      assert.equal(failed.catalog.sources[key].active, s.active);
    const bad = await syncMalaria({
      root,
      year: 2026,
      now: nextDay,
      read: reader,
      download: async (url: string) =>
        url.endsWith('.pdf')
          ? response(JSON.stringify([{ page: 1, text: 'Layout changed' }]), url)
          : downloader(url),
    });
    assert.equal(bad.catalog.sources['skdr:2026'].status, 'review-required');
    assert.equal(bad.catalog.sources['skdr:2026'].active, old.sources['skdr:2026'].active);
    assert.equal(bad.catalog.sources['sismal:2025'].status, 'unchanged');
    const before = await readFile(join(root, 'manifest.json'), 'utf8');
    const dry = await syncMalaria({
      root,
      year: 2026,
      dryRun: true,
      now: nextDay,
      read: reader,
      download: downloader,
    });
    assert.equal(dry.dryRun, true);
    assert.equal(await readFile(join(root, 'manifest.json'), 'utf8'), before);
  }));
test('dry-run on empty storage writes no files even with multiple new editions', async () =>
  temporary(async (root) => {
    const idx = index.replace(
      '</article>',
      '</article><article><a href="/m45.pdf">Buletin M45 2026</a><time datetime="2026-11-17"></time></article>',
    );
    const result = await syncMalaria({
      root,
      dryRun: true,
      now,
      read: reader,
      download: async (url: string) =>
        url.endsWith('/publikasi')
          ? response(idx, url)
          : url.endsWith('/m45.pdf')
            ? response(JSON.stringify(pages(44)), url)
            : downloader(url),
    });
    assert.ok(
      result.attempts.every((a: { status: string }) => ['updated', 'empty'].includes(a.status)),
    );
    assert.deepEqual(await readdir(root), []);
  }));
test('SISMAL ambiguous codes/foreign columns and coverage loss are held; known source status and reported zero survive', async () =>
  temporary(async (root) => {
    const catalog = emptyCatalog();
    const s = normalizeSismal(
      [aceh],
      2025,
      now,
      'https://malaria.kemkes.go.id/api/sismal/chartMap/2025/?province=ACEH',
    );
    assert.equal(s.rows[0].sourceId, '1105');
    assert.equal(s.rows[0].regionCode, '11.03');
    assert.equal(s.rows[0].validationStatus, 'Belum tervalidasi');
    const first = await stageVersion({
      catalog,
      root,
      kind: 'sismal',
      year: 2025,
      snapshot: s,
      now,
      rawSha256: 'a'.repeat(64),
    });
    await assert.rejects(
      stageVersion({
        catalog,
        root,
        kind: 'sismal',
        year: 2025,
        snapshot: { ...s, rows: [], responseState: 'empty' },
        now,
        rawSha256: 'b'.repeat(64),
      }),
      /Cakupan turun/,
    );
    const ambiguous = normalizeSismal(
      [{ ...aceh, source_id: '9999', district: 'UNKNOWN' }],
      2025,
      now,
      s.sourceUrl,
    );
    await assert.rejects(
      stageVersion({ catalog, root, kind: 'sismal', year: 2025, snapshot: ambiguous, now }),
      /belum terpetakan/,
    );
    assert.equal(catalog.sources['sismal:2025'].active, first.version.id);
    assert.throws(
      () => normalizeSismal([{ ...aceh, patient_name: 'private' }], 2025, now, s.sourceUrl),
      /kontrak agregat/,
    );
    assert.equal(
      normalizeSismal([{ ...aceh, positive_cases: 0 }], 2025, now, s.sourceUrl).rows[0]
        .availability,
      'reported',
    );
  }));
test('bounded downloader retries timeout/transient, honors Retry-After, validates every redirect, forbids oversized content', async () => {
  const calls: number[] = [],
    delays: number[] = [];
  const download = createDownloader({
    hosts: ['malaria.kemkes.go.id'],
    clock: () => Date.parse(now),
    sleep: async (ms: number) => {
      delays.push(ms);
    },
    transport: async () => {
      calls.push(1);
      if (calls.length === 1) throw Error('timeout');
      if (calls.length === 2)
        return { status: 429, headers: { 'retry-after': '2' }, body: Buffer.from('') };
      return response('[]', '');
    },
  });
  assert.equal((await download('https://malaria.kemkes.go.id/case')).body.toString(), '[]');
  assert.deepEqual(delays, [1000, 2000]);
  assert.equal(retryDelay('Tue, 17 Nov 2026 09:00:00 GMT', Date.parse(now)), 86400000);
  const deferred = createDownloader({
    hosts: ['malaria.kemkes.go.id'],
    transport: async () => ({
      status: 429,
      headers: { 'retry-after': '3600' },
      body: Buffer.from(''),
    }),
    sleep: async () => assert.fail('must not retry early'),
  });
  await assert.rejects(deferred('https://malaria.kemkes.go.id/case'), /ditunda/);
  assert.throws(
    () => checkedUrl('https://malaria.kemkes.go.id.evil.test/case', ['malaria.kemkes.go.id']),
    /di luar/,
  );
  const redirect = createDownloader({
    hosts: ['malaria.kemkes.go.id'],
    transport: async () => ({
      status: 302,
      headers: { location: 'https://evil.test/a' },
      body: Buffer.from(''),
    }),
  });
  await assert.rejects(redirect('https://malaria.kemkes.go.id/case'), /di luar/);
  const oversized = createDownloader({
    hosts: ['malaria.kemkes.go.id'],
    maxBytes: 2,
    transport: async () => response('long', ''),
  });
  await assert.rejects(oversized('https://malaria.kemkes.go.id/case'), /ukuran/);
  let tries = 0;
  const denied = createDownloader({
    hosts: ['malaria.kemkes.go.id'],
    transport: async () => {
      tries++;
      return { status: 403, headers: {}, body: Buffer.from('') };
    },
  });
  await assert.rejects(denied('https://malaria.kemkes.go.id/case'), /403/);
  assert.equal(tries, 1);
});
test('manifest invalid pointer/path/duplicate IDs fail validation; portal schema must be observable', async () =>
  temporary(async (root) => {
    const catalog = emptyCatalog();
    await stageVersion({
      catalog,
      root,
      kind: 'skdr',
      year: 2026,
      snapshot: fixture(),
      now,
      rawSha256: 'a'.repeat(64),
    });
    validateCatalog(catalog);
    for (const change of [
      (c: any) => (c.sources['skdr:2026'].active = 'missing'),
      (c: any) => (c.sources['skdr:2026'].versions[0].path = '/data/indonesia/../evil.json'),
      (c: any) => c.sources['skdr:2026'].versions.push(c.sources['skdr:2026'].versions[0]),
    ]) {
      const c = structuredClone(catalog);
      change(c);
      assert.throws(() => validateCatalog(c));
    }
    await discoverSismal(downloader);
    await assert.rejects(
      discoverSismal(async (url: string) => response('<html>No endpoint</html>', url)),
      /belum dapat diperiksa/,
    );
    assert.equal(sha('hello').length, 64);
  }));
test('regional adapter accepts only configured official aggregate definitions and exact periods', () => {
  const config = {
    id: 'official-example',
    url: 'https://dinkes.example.go.id/aggregate.json',
    year: 2026,
    definition: 'Kasus malaria terkonfirmasi',
    level: 'province',
    regionCode: '31',
    periodStart: '2026-01-01',
    periodEnd: '2026-10-31',
    publishedAt: '2026-11-10',
  };
  const row = {
    regionCode: '31',
    level: 'province',
    year: 2026,
    periodStart: config.periodStart,
    periodEnd: config.periodEnd,
    metric: 'confirmed_cases',
    definition: config.definition,
    value: 0,
    availability: 'reported',
  };
  assert.equal(normalizeRegional([row], config, now).rows[0].value, 0);
  assert.throws(() => normalizeRegional([{ ...row, regionCode: '91' }], config, now));
  assert.throws(() => normalizeRegional([{ ...row, patient_id: 'private' }], config, now));
  assert.throws(() => normalizeRegional([row], { ...config, url: 'https://example.com/x' }, now));
});

test('Retry-After persists across jobs and blocks a later early request while other sources still update', async () =>
  temporary(async (root) => {
    await syncMalaria({ root, year: 2026, now, read: reader, download: downloader });
    const delayed = createDownloader({
      hosts: ['surveilans.kemkes.go.id'],
      clock: () => Date.parse(now),
      transport: async () => ({
        status: 429,
        headers: { 'retry-after': '172800' },
        body: Buffer.from(''),
      }),
    });
    const held = await syncMalaria({
      root,
      year: 2026,
      now,
      read: reader,
      download: async (url: string) =>
        url.includes('surveilans.kemkes') ? delayed(url) : downloader(url),
    });
    assert.equal(held.catalog.sources['skdr:2026'].retryAt, '2026-11-18T09:00:00.000Z');
    let premature = 0;
    const second = await syncMalaria({
      root,
      year: 2026,
      now: nextDay,
      read: reader,
      download: async (url: string) => {
        if (url.includes('surveilans.kemkes')) premature++;
        return downloader(url);
      },
    });
    assert.equal(premature, 0);
    assert.match(second.catalog.sources['skdr:2026'].message, /ditunda/);
    assert.equal(second.catalog.sources['sismal:2025'].status, 'unchanged');
  }));

test('PDF error/card-title fallback and old-bulletin revision never roll back a newer active edition', async () =>
  temporary(async (root) => {
    await assert.rejects(readDocument('pdf', Buffer.from('not a PDF')), /Poppler/);
    const cards =
      '<article><h3>Buletin Minggu ke-44 tahun 2026</h3><a href="/actual.pdf">Download</a><time datetime="2026-11-10"></time></article>';
    const discovered = await discoverSkdr(async (url: string) => response(cards, url), {
      year: 2026,
    });
    assert.equal(discovered[0].url, 'https://surveilans.kemkes.go.id/actual.pdf');
    const catalog = emptyCatalog(),
      pending = new Map();
    const old = fixture(),
      latest = fixture({
        ...publication,
        id: '2026-m45',
        bulletinNumber: 45,
        publishedAt: '2026-11-17',
      });
    const first = await stageVersion({
      catalog,
      root,
      kind: 'skdr',
      year: 2026,
      snapshot: old,
      now,
      rawSha256: 'a'.repeat(64),
      pending,
    });
    const newest = await stageVersion({
      catalog,
      root,
      kind: 'skdr',
      year: 2026,
      snapshot: latest,
      now: nextDay,
      rawSha256: 'b'.repeat(64),
      pending,
    });
    const revision = structuredClone(old);
    revision.rows[0].value++;
    const revised = await stageVersion({
      catalog,
      root,
      kind: 'skdr',
      year: 2026,
      snapshot: revision,
      now: nextDay,
      rawSha256: 'c'.repeat(64),
      pending,
    });
    assert.equal(catalog.sources['skdr:2026'].active, newest.version.id);
    assert.equal(
      resolvePublication(catalog, 'skdr', 2026, '2026-m44')?.version.id,
      revised.version.id,
    );
    assert.notEqual(first.version.id, revised.version.id);
    const restored = await stageVersion({
      catalog,
      root,
      kind: 'skdr',
      year: 2026,
      snapshot: { ...old, retrievedAt: '2026-11-18T09:00:00Z' },
      now: '2026-11-18T09:00:00Z',
      rawSha256: 'a'.repeat(64),
      pending,
    });
    assert.equal(restored.status, 'updated');
    assert.equal(
      resolvePublication(catalog, 'skdr', 2026, '2026-m44')?.version.id,
      restored.version.id,
    );
    assert.equal(catalog.sources['skdr:2026'].active, newest.version.id);
    assert.notEqual(restored.version.id, first.version.id);
  }));
