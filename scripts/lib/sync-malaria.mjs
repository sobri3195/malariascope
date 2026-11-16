import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import { normalizeSismal, validateSismal } from '../../src/indonesia/sismal.ts';
export const pdfUrl =
  'https://surveilans.kemkes.go.id/assets/publikasi/laporan-mingguan-situasi-terkini-penyakit-infem-dan-potensial-klb-wabah-m44-2026.pdf';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
export async function atomicJson(file, value) {
  await mkdir(join(file, '..'), { recursive: true });
  const tmp = file + '.tmp-' + randomUUID();
  await writeFile(tmp, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
  try {
    await rename(tmp, file);
  } catch (e) {
    await import('node:fs/promises').then((fs) => fs.rm(tmp, { force: true }));
    throw e;
  }
}
export async function syncSismalYear({ year, root, download, now }) {
  const url = `https://malaria.kemkes.go.id/api/sismal/chartMap/${year}/?province=ACEH`;
  const file = join(root, 'sismal', `${year}.json`);
  let prior = null;
  let priorRaw = null;
  const base = { source: 'sismal', reportingYear: year, url, attemptedAt: now };
  try {
    try {
      priorRaw = await readFile(file, 'utf8');
      prior = JSON.parse(priorRaw);
      const errors = validateSismal(prior, year);
      if (errors.length) throw Error('Artefak lama tidak sah; dipertahankan untuk diperiksa.');
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
    const bytes = await download(url);
    const s = normalizeSismal(JSON.parse(bytes.toString('utf8')), year, now, url);
    const errors = validateSismal(s, year);
    if (errors.length) throw Error(errors.join(' '));
    const sha256 = hash(bytes);
    if (!s.rows.length)
      return {
        ...base,
        status: s.responseState === 'empty' ? 'empty' : 'unmapped',
        rawSha256: sha256,
        receivedMappedRows: 0,
        unmapped: s.unmapped.length,
        retainedRows: Array.isArray(prior?.rows) ? prior.rows.length : 0,
      };
    // Never replace valid observations with an all-unavailable payload or a regressing coverage set.
    const available = new Set(s.rows.filter((r) => r.value !== null).map((r) => r.regionCode));
    const priorAvailable =
      prior?.evidence === 'portal-response'
        ? prior.rows.filter((r) => r.value !== null).map((r) => r.regionCode)
        : [];
    if (!available.size || priorAvailable.some((code) => !available.has(code)))
      return {
        ...base,
        status: 'coverage-regression',
        rawSha256: sha256,
        receivedMappedRows: s.rows.length,
        retainedRows: Array.isArray(prior?.rows) ? prior.rows.length : 0,
      };
    // Unmapped rows remain in the manifest for review, without raw fields or patient identifiers.
    if (priorRaw !== null) {
      const priorHash = hash(Buffer.from(priorRaw));
      await atomicJson(
        join(root, 'sismal', 'archive', `${year}-previous-${priorHash}.json`),
        prior,
      );
    }
    const archiveHash = hash(Buffer.from(JSON.stringify(s)));
    const archive = join(root, 'sismal', 'archive', `${year}-${archiveHash}.json`);
    await atomicJson(archive, s);
    await atomicJson(file, s);
    return {
      ...base,
      status: 'saved',
      rawSha256: sha256,
      archive: `sismal/archive/${year}-${archiveHash}.json`,
      mappedRows: s.rows.length,
      availableRegions: available.size,
      provinceLabels: new Set(s.rows.map((r) => r.originalProvince)).size,
      unmapped: s.unmapped,
    };
  } catch (e) {
    return {
      ...base,
      status: 'failed',
      error: String(e),
      retainedRows: Array.isArray(prior?.rows) ? prior.rows.length : 0,
    };
  }
}
