import { readFile, mkdir, writeFile, link, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { atomicJson } from '../lib/sync-malaria.mjs';
import { validateCatalog } from '../../src/indonesia/publication-catalog.ts';
import { validateSkdr } from '../../src/indonesia/skdr.ts';
import { validateSismal } from '../../src/indonesia/sismal.ts';
import { ReviewRequired } from './extract.mjs';
export const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const encoded = (value) => JSON.stringify(value, null, 2) + '\n';
function semantic(value) {
  if (Array.isArray(value)) return value.map(semantic);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([k]) => !['retrievedAt', 'fetchedAt', 'indexUrl'].includes(k))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => [k, semantic(v)]),
  );
}
export function emptyCatalog() {
  return { schema: 'malariascope-publications-v1', checkedAt: null, sources: {} };
}
export async function loadCatalog(root) {
  try {
    const c = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8'));
    validateCatalog(c);
    return c;
  } catch (e) {
    if (e.code === 'ENOENT') return emptyCatalog();
    throw e;
  }
}
export function sourceEntry(catalog, kind, year, suffix = '') {
  const key = `${kind}:${suffix ? suffix + ':' : ''}${year}`;
  return (catalog.sources[key] ||= {
    kind,
    year,
    active: null,
    status: 'bootstrap',
    lastCheckedAt: null,
    lastSuccessAt: null,
    message: '',
    versions: [],
  });
}
async function immutable(root, relative, bytes) {
  const path = join(root, relative);
  await mkdir(join(path, '..'), { recursive: true });
  const temporary = path + '.tmp-' + (await import('node:crypto')).randomUUID();
  try {
    await writeFile(temporary, bytes, { flag: 'wx' });
    try {
      await link(temporary, path);
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      if (!(await readFile(path)).equals(Buffer.from(bytes)))
        throw Error('Benturan artefak immutable: ' + relative);
    }
  } finally {
    await rm(temporary, { force: true });
  }
}
export async function stageVersion({
  catalog,
  root,
  kind,
  year,
  snapshot,
  rawSha256 = null,
  rawBytes = null,
  now,
  dryRun = false,
  bootstrap = false,
  suffix = '',
  pending = new Map(),
}) {
  const entry = sourceEntry(catalog, kind, year, suffix);
  const errors =
    kind === 'skdr'
      ? validateSkdr(snapshot, !bootstrap)
      : kind === 'sismal'
        ? validateSismal(snapshot, year)
        : [];
  if (kind === 'skdr' && snapshot.rows?.[0]?.year !== year)
    errors.push('Tahun seri berbeda dari tahun data.');
  if (errors.length) throw new ReviewRequired(errors.join(' '));
  if (snapshot.unmapped?.length)
    throw new ReviewRequired(
      `${snapshot.unmapped.length} kode belum terpetakan; seluruh kandidat ditahan. ${snapshot.unmapped
        .slice(0, 100)
        .map((r) => r.sourceId + ': ' + r.reason)
        .join('; ')}`,
    );
  const active = entry.versions.find((v) => v.id === entry.active);
  const available = snapshot.rows.filter(
    (r) => r.value !== null && r.availability !== 'unavailable',
  );
  if (active) {
    let prior = pending.get(active.id);
    if (!prior) {
      const priorBytes = await readFile(join(root, active.path.replace('/data/indonesia/', '')));
      if (sha(priorBytes) !== active.dataSha256)
        throw new ReviewRequired('Checksum artefak lama berubah; tinjau sebelum publikasi.');
      prior = JSON.parse(priorBytes.toString('utf8'));
    }
    const present = new Set(available.map((r) => `${r.level}|${r.regionCode}`));
    if (
      prior.rows.some(
        (r) =>
          r.value !== null &&
          r.availability !== 'unavailable' &&
          !present.has(`${r.level}|${r.regionCode}`),
      )
    )
      throw new ReviewRequired('Cakupan turun; wilayah dengan angka pada versi terakhir hilang.');
  }
  const semanticSha256 = sha(encoded(semantic(snapshot)));
  const duplicate = entry.versions.filter((v) => v.publicationId === snapshot.id).at(-1);
  if (
    duplicate &&
    duplicate.sourceSha256 === rawSha256 &&
    duplicate.semanticSha256 === semanticSha256
  )
    return {
      status: 'unchanged',
      version: duplicate,
      message: 'Tidak ada pembaruan; checksum dan data publikasi sama.',
    };
  const bytes = encoded(snapshot);
  const dataSha256 = sha(bytes);
  const version = {
    id: `${snapshot.id}-${bootstrap ? 'bootstrap' : rawSha256?.slice(0, 16) || 'aggregate'}-${dataSha256.slice(0, 16)}`,
    publicationId: snapshot.id,
    year,
    path: '',
    sourceUrl: snapshot.sourceUrl,
    sourceSha256: rawSha256,
    dataSha256,
    semanticSha256,
    createdAt: now,
    publishedAt: snapshot.publishedAt || null,
    weekThrough: snapshot.rows[0]?.weekThrough ?? null,
    coverage: {
      national: snapshot.rows.filter((r) => r.level === 'national').length,
      province: snapshot.rows.filter((r) => r.level === 'province').length,
      district: snapshot.rows.filter((r) => r.level === 'district').length,
      available: available.length,
    },
    ...(bootstrap ? { bootstrap: true } : {}),
  };
  version.path = `/data/indonesia/versions/${kind}/${version.id}.json`;
  // All evidence is public aggregate; individual line lists are never accepted here.
  if (!dryRun) {
    if (rawBytes && rawSha256)
      await immutable(
        root,
        `evidence/${kind}/${rawSha256}.${kind === 'skdr' ? 'pdf' : 'json'}`,
        rawBytes,
      );
    await immutable(root, version.path.replace('/data/indonesia/', ''), bytes);
  }
  pending.set(version.id, snapshot);
  entry.versions.push(version);
  // Revisiting an older bulletin must not roll the latest pointer back.
  if (!active || snapshot.id.localeCompare(active.publicationId, undefined, { numeric: true }) >= 0)
    entry.active = version.id;
  return {
    status: snapshot.responseState === 'empty' ? 'empty' : bootstrap ? 'bootstrap' : 'updated',
    version,
    message: bootstrap
      ? 'Artefak awal belum diverifikasi langsung terhadap sumber resmi.'
      : 'Versi baru lulus validasi struktural; lihat status validasi sumber.',
  };
}
export async function publishCatalog(root, catalog, dryRun = false) {
  validateCatalog(catalog);
  if (!dryRun) await atomicJson(join(root, 'manifest.json'), catalog);
}
