import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { discoverSkdr, discoverSismal, extractSkdr, readDocument } from './extract.mjs';
import { sha, sourceEntry, stageVersion, publishCatalog, loadCatalog } from './catalog.mjs';
import { normalizeSismal } from '../../src/indonesia/sismal.ts';
import { normalizeRegional } from './regional.mjs';
import { FetchFailure } from './http.mjs';
export async function syncMalaria({
  root,
  download,
  year,
  dryRun = false,
  now = new Date().toISOString(),
  read = readDocument,
  regional = [],
}) {
  const catalog = structuredClone(await loadCatalog(root));
  const networkDownload = download;
  download = async (url, options) => {
    const host = new URL(url).hostname;
    const wait = Object.values(catalog.sources)
      .filter(
        (s) =>
          s.retryAt &&
          Date.parse(s.retryAt) > Date.parse(now) &&
          (s.kind === 'skdr'
            ? host === 'surveilans.kemkes.go.id'
            : s.kind === 'sismal'
              ? host === 'malaria.kemkes.go.id'
              : s.versions.some((v) => new URL(v.sourceUrl).hostname === host)),
      )
      .sort((a, b) => b.retryAt.localeCompare(a.retryAt))[0];
    if (wait)
      throw new FetchFailure(
        'Pemeriksaan ditunda sesuai Retry-After sampai ' + wait.retryAt,
        429,
        'retry-later',
        wait.retryAt,
      );
    return networkDownload(url, options);
  };
  const attempts = [];
  const pending = new Map();
  async function attempt(kind, y, task, suffix = '') {
    const entry = sourceEntry(catalog, kind, y, suffix);
    entry.lastCheckedAt = now;
    try {
      const result = await task();
      Object.assign(entry, {
        status: result.status,
        message: result.message,
        lastSuccessAt: now,
        retryAt: null,
      });
      attempts.push({
        source: kind,
        year: y,
        status: result.status,
        message: result.message,
        version: result.version?.id,
      });
    } catch (e) {
      entry.status = e.kind === 'review-required' ? 'review-required' : 'failed';
      entry.message = String(e.message || e);
      entry.retryAt = e.retryAt || null;
      attempts.push({
        source: kind,
        year: y,
        status: entry.status,
        message: entry.message,
        retainedVersion: entry.active,
      });
    }
  }
  let publications = [],
    discoveryError;
  try {
    publications = await discoverSkdr(download, { year, read });
    if (!publications.length)
      throw Error('Belum ada tautan buletin yang dikenali di indeks resmi.');
  } catch (e) {
    discoveryError = e;
  }
  const latestYear = publications[0]?.publicationYear || year || new Date(now).getUTCFullYear();
  if (discoveryError) {
    const affectedYears = year
      ? [year]
      : [
          ...new Set([
            latestYear,
            ...Object.values(catalog.sources)
              .filter((s) => s.kind === 'skdr')
              .map((s) => s.year),
          ]),
        ];
    for (const affected of affectedYears)
      await attempt('skdr', affected, async () => {
        throw discoveryError;
      });
  }
  // Recheck editions present in the index, including revised older editions; bounded per run.
  for (const publication of publications.slice(0, 8).reverse())
    await attempt('skdr', publication.publicationYear, async () => {
      const response = await download(publication.url);
      const rawSha256 = sha(response.body);
      const snapshot = extractSkdr(await read('pdf', response.body), publication, now, rawSha256);
      if (snapshot.rows[0].year !== publication.publicationYear)
        throw Object.assign(
          Error('Tahun data berbeda dari tahun terbit; pemisahan seri memerlukan tinjauan.'),
          { kind: 'review-required' },
        );
      return stageVersion({
        catalog,
        pending,
        root,
        kind: 'skdr',
        year: snapshot.rows[0].year,
        snapshot,
        rawSha256,
        rawBytes: response.body,
        now,
        dryRun,
      });
    });
  let portalError, portal;
  try {
    portal = await discoverSismal(download);
  } catch (e) {
    portalError = e;
  }
  const years = [
    ...new Set([
      latestYear,
      ...Object.values(catalog.sources)
        .filter((s) => s.kind === 'sismal')
        .map((s) => s.year),
      ...(latestYear === 2026 ? [2025] : []),
    ]),
  ];
  for (const y of years)
    await attempt('sismal', y, async () => {
      if (portalError) throw portalError;
      const url = portal.endpointTemplate.replace('{year}', String(y));
      const response = await download(url);
      const snapshot = normalizeSismal(
        JSON.parse(response.body.toString('utf8')),
        y,
        now,
        response.url,
      );
      // Retain only normalized aggregate JSON, not arbitrary fields returned by an upstream API.
      return stageVersion({
        catalog,
        pending,
        root,
        kind: 'sismal',
        year: y,
        snapshot,
        rawSha256: sha(response.body),
        now,
        dryRun,
      });
    });
  for (const config of regional)
    await attempt(
      'regional',
      config.year,
      async () => {
        const response = await download(config.url);
        const snapshot = normalizeRegional(JSON.parse(response.body.toString('utf8')), config, now);
        return stageVersion({
          catalog,
          pending,
          root,
          kind: 'regional',
          year: config.year,
          snapshot,
          rawSha256: sha(response.body),
          now,
          dryRun,
          suffix: config.id,
        });
      },
      config.id,
    );
  catalog.checkedAt = now;
  await publishCatalog(root, catalog, dryRun);
  return { dryRun, checkedAt: now, attempts, catalog };
}
export async function configuredRegional(root) {
  const registry = JSON.parse(
    await readFile(join(root, 'scripts/malaria/regional-sources.json'), 'utf8'),
  );
  if (registry.schema !== 'malariascope-regional-registry-v1' || !Array.isArray(registry.sources))
    throw Error('Registry sumber daerah tidak sah.');
  return registry.sources;
}
