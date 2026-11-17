import { withPublicationLock } from './skdr-state.mjs';
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { atomicJson } from './sync-malaria.mjs';
import { validateSkdr, mapSkdrLabel, skdrReconciliation } from '../../src/indonesia/skdr.ts';
import { validateSkdrCatalog } from '../../src/indonesia/skdr-catalog.ts';
export const indexUrl = 'https://surveilans.kemkes.go.id/publikasi';
export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
export function discoverBulletin(html, year, bulletin) {
  const candidates = new Set();
  for (const match of html.matchAll(
    /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
  )) {
    const url = new URL(match[1].replaceAll('&amp;', '&'), indexUrl);
    const label = decodeURIComponent(url.pathname) + ' ' + match[2].replace(/<[^>]*>/g, ' ');
    if (
      url.protocol !== 'https:' ||
      url.hostname !== 'surveilans.kemkes.go.id' ||
      !/\.pdf$/i.test(url.pathname)
    )
      continue;
    if (
      new RegExp(`(?:^|[^a-z0-9])m(?:inggu)?[\\s_-]*0?${bulletin}(?!\\d)`, 'i').test(label) &&
      new RegExp(`(?:^|\\D)${year}(?!\\d)`).test(label)
    )
      candidates.add(url.href);
  }
  if (candidates.size !== 1)
    throw Error(
      `index-layout: edisi ${year}-m${bulletin} ditemukan ${candidates.size} URL; perlu pemeriksaan/impor resmi.`,
    );
  return [...candidates][0];
}
export function discoverLatestBulletin(html, year) {
  const found = [];
  for (let bulletin = 1; bulletin <= 53; bulletin++) {
    try {
      found.push({ bulletin, url: discoverBulletin(html, year, bulletin) });
    } catch {
      /* no unique supported link */
    }
  }
  if (!found.length) throw Error('index-layout: tidak ada buletin resmi yang dapat dipilih.');
  return found.at(-1);
}
// Require the complete province label and a separate numeric cell. Substring matching
// would incorrectly accept Papua's number on Papua Tengah/Papua Barat rows.
export function verifyPdfRows(snapshot, pages) {
  const rejectedRows = [];
  for (const row of snapshot.rows) {
    try {
      const text = pages[row.page];
      if (typeof text !== 'string') throw Error(`pdf-page: halaman ${row.page} tidak tersedia.`);
      const matches = text.split(/\r?\n/).filter((line) => {
        const cells = line
          .trim()
          .split(/\s{2,}|\t+/)
          .map((s) => s.trim());
        const labelIndex = cells.findIndex((cell) => {
          if (row.level === 'national') return /^indonesia$/i.test(cell);
          try {
            return mapSkdrLabel(cell) === row.regionCode;
          } catch {
            return false;
          }
        });
        if (labelIndex < 0) return false;
        const values =
          row.level === 'province' && snapshot.sourceColumns
            ? cells.length === 7 && labelIndex === snapshot.sourceColumns.province
              ? [cells[snapshot.sourceColumns.confirmed]]
              : []
            : cells.slice(labelIndex + 1);
        return values.some(
          (cell) =>
            /^(?:\d+|\d{1,3}(?:\.\d{3})+)$/.test(cell) &&
            Number(cell.replaceAll('.', '')) === row.value,
        );
      });
      if (row.level === 'national' && matches.length === 0) {
        const number = String(row.value).split('').join('[.]?');
        const prose = new RegExp(
          `(?:^|[^0-9])${number}\\s+kasus\\s+(?:positif|terkonfirmasi)\\s+malaria(?![a-z])`,
          'gi',
        );
        if ([...text.matchAll(prose)].length === 1) continue;
      }
      if (matches.length !== 1)
        throw Error(
          `pdf-row: ${row.originalLabel}, halaman ${row.page}: ${matches.length} baris cocok; periksa tata letak/kolom resmi.`,
        );
    } catch (e) {
      rejectedRows.push({
        regionCode: row.regionCode,
        label: row.originalLabel,
        page: row.page,
        reason: e.message,
      });
    }
  }
  if (rejectedRows.length)
    throw Object.assign(Error(rejectedRows.map((r) => r.reason).join('\n')), { rejectedRows });
}
export function verifyPdfMetadata(snapshot, pages) {
  const national = pages[snapshot.sourcePages?.national ?? 36] || '';
  const all = Object.values(pages).join(' ').toLocaleLowerCase('id');
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const months = [
    'januari',
    'februari',
    'maret',
    'april',
    'mei',
    'juni',
    'juli',
    'agustus',
    'september',
    'oktober',
    'november',
    'desember',
  ];
  const containsDate = (date, text) => {
    const [y, m, d] = date.slice(0, 10).split('-');
    return (
      norm(text).includes(norm(date.slice(0, 10))) ||
      norm(text).includes(`${Number(d)}${months[Number(m) - 1]}${y}`)
    );
  };
  if (
    !new RegExp(
      `minggu(?:\\s+(?:ke|sampai|hingga))*[-\\s]*${snapshot.rows[0].weekThrough}(?!\\d)`,
      'i',
    ).test(national)
  )
    throw Error('pdf-metadata: minggu cakupan malaria tidak cocok.');
  if (!containsDate(snapshot.publishedAt, all))
    throw Error('pdf-metadata: tanggal terbit tidak cocok dengan PDF.');
  if (snapshot.dataAsOf) {
    const time = snapshot.dataAsOf.slice(11, 16).replace(':', '[.:]');
    if (
      !containsDate(snapshot.dataAsOf, national) ||
      !new RegExp(time + '(?:\\s*WIB)?', 'i').test(national)
    )
      throw Error('pdf-metadata: waktu cakupan sumber tidak cocok.');
  }
}
export async function publishSnapshot(options) {
  if (options.dryRun) return publishUnlocked(options);
  return withPublicationLock(options.root, () => publishUnlocked(options));
}
async function publishUnlocked({ snapshot, pdf, root, dryRun = false }) {
  const errors = validateSkdr(snapshot, true);
  if (errors.length) throw Error(errors.join(' '));
  if (!Buffer.from(pdf).subarray(0, 5).equals(Buffer.from('%PDF-')))
    throw Error('Berkas bukan PDF.');
  const pdfHash = sha256(pdf);
  const content = {
    ...snapshot,
    retrievedAt: null,
    version: undefined,
    pdfVerification: {
      method: 'pdf-text-cells',
      sha256: pdfHash,
      pages: [...new Set(snapshot.rows.map((r) => r.page))],
    },
  };
  const version = sha256(JSON.stringify(content));
  const published = { ...snapshot, version, pdfVerification: content.pdfVerification };
  let catalog;
  try {
    catalog = validateSkdrCatalog(JSON.parse(await readFile(join(root, 'catalog.json'), 'utf8')));
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
    catalog = { schemaVersion: 1, latest: null, entries: [] };
  }
  const prior = catalog.entries.find((e) => e.id === snapshot.id);
  const status =
    prior?.version === version ? 'unchanged' : prior?.complete ? 'revised' : 'published';
  const path = `/data/indonesia/skdr/versions/${snapshot.id}-${version}.json`;
  const entry = {
    id: snapshot.id,
    version,
    path,
    complete: true,
    publishedAt: snapshot.publishedAt,
  };
  const entries = [...catalog.entries.filter((e) => e.id !== snapshot.id), entry].sort(
    (a, b) =>
      Number(a.id.slice(0, 4)) - Number(b.id.slice(0, 4)) ||
      Number(a.id.split('-m')[1]) - Number(b.id.split('-m')[1]),
  );
  const next = validateSkdrCatalog({
    schemaVersion: 1,
    latest: entries.filter((e) => e.complete).at(-1).id,
    entries,
  });
  if (!dryRun && status !== 'unchanged') {
    // Write immutable source and version assets before publishing the catalog pointer.
    await mkdir(join(root, 'sources'), { recursive: true });
    try {
      await writeFile(join(root, 'sources', `${pdfHash}.pdf`), pdf, { flag: 'wx' });
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      if (sha256(await readFile(join(root, 'sources', `${pdfHash}.pdf`))) !== pdfHash)
        throw Error('Hash arsip PDF berbeda.');
    }
    await atomicJson(join(root, 'versions', `${snapshot.id}-${version}.json`), published);
    await atomicJson(join(root, 'catalog.json'), next);
  }
  return {
    status,
    dryRun,
    before: prior || null,
    after: entry,
    latest: next.latest,
    reconciliation: skdrReconciliation(snapshot),
    pdfSha256: pdfHash,
  };
}
