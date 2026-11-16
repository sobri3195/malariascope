import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { masters, validDate } from '../../src/indonesia/engine.ts';
import { mapSkdrLabel, validateSkdr } from '../../src/indonesia/skdr.ts';
const run = promisify(execFile);
const reader = fileURLToPath(new URL('./publication-reader.py', import.meta.url));
export class ReviewRequired extends Error {
  kind = 'review-required';
}
export async function readDocument(mode, bytes, url) {
  const dir = await mkdtemp(join(tmpdir(), 'malaria-reader-'));
  try {
    const file = join(dir, mode === 'pdf' ? 'source.pdf' : 'index.html');
    await writeFile(file, bytes);
    const { stdout } = await run('python3', [reader, mode, file, ...(url ? [url] : [])], {
      timeout: 50000,
      maxBuffer: 20 * 1024 * 1024,
    });
    return JSON.parse(stdout);
  } catch (e) {
    if (mode === 'pdf')
      throw new ReviewRequired(
        'PDF tidak dapat dibaca oleh Poppler; periksa format/layout/OCR: ' + String(e.message),
      );
    throw e;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
export function publicationIdentity(title) {
  const years = [...new Set(title.match(/\b20\d{2}\b/g))];
  const weeks = [...title.matchAll(/\b(?:M\s*|minggu\s*(?:ke[-\s]*)?)(\d{1,2})\b/gi)].map((m) =>
    Number(m[1]),
  );
  if (years.length !== 1 || new Set(weeks).size !== 1 || weeks[0] < 1 || weeks[0] > 53) return null;
  return { publicationYear: +years[0], bulletinNumber: weeks[0], id: `${years[0]}-m${weeks[0]}` };
}
export function publicationDate(link) {
  if (validDate(link.publishedAt)) return link.publishedAt;
  const text = `${link.title || ''} ${link.context || ''}`;
  const iso = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (iso && validDate(iso[1])) return iso[1];
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
  const m = text
    .toLowerCase()
    .match(new RegExp(`\\b(\\d{1,2})\\s+(${months.join('|')})\\s+(20\\d{2})\\b`));
  if (!m) return null;
  const date = `${m[3]}-${String(months.indexOf(m[2]) + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return validDate(date) ? date : null;
}
// Only actual anchors are followed; filenames never synthesize a publication URL.
export async function discoverSkdr(download, { year, read = readDocument, maxPages = 8 } = {}) {
  const queue = ['https://surveilans.kemkes.go.id/publikasi'],
    seen = new Set(),
    found = [];
  while (queue.length && seen.size < maxPages) {
    const url = queue.shift();
    if (seen.has(url)) continue;
    seen.add(url);
    const response = await download(url, { maxBytes: 4 * 1024 * 1024 });
    const doc = await read('index', response.body, response.url);
    for (const link of doc.links) {
      if (new URL(link.href).hostname !== 'surveilans.kemkes.go.id') continue;
      if (link.next) {
        queue.push(link.href);
        continue;
      }
      const title = publicationIdentity(link.title || '')
        ? link.title
        : link.publicationTitle || '';
      const identity = publicationIdentity(title);
      if (!identity || (year && identity.publicationYear !== year)) continue;
      if (/\.pdf(?:\?|$)/i.test(link.href)) {
        found.push({
          ...identity,
          title,
          url: link.href,
          indexUrl: url,
          publishedAt: publicationDate(link),
        });
      } else if (/minggu|buletin|situasi/i.test(title)) {
        const detailResponse = await download(link.href, { maxBytes: 4 * 1024 * 1024 });
        const detail = await read('index', detailResponse.body, detailResponse.url);
        const pdfs = [
          ...new Set(
            detail.links
              .filter(
                (a) =>
                  /\.pdf(?:\?|$)/i.test(a.href) &&
                  new URL(a.href).hostname === 'surveilans.kemkes.go.id',
              )
              .map((a) => a.href),
          ),
        ];
        if (pdfs.length !== 1) throw new ReviewRequired(`Tautan PDF ambigu untuk ${identity.id}.`);
        found.push({
          ...identity,
          title,
          url: pdfs[0],
          indexUrl: url,
          publishedAt:
            publicationDate(link) || publicationDate({ publishedAt: detail.publishedAt }),
        });
      }
    }
  }
  const unique = new Map();
  for (const item of found) {
    const prior = unique.get(item.id);
    if (prior && (prior.url !== item.url || prior.publishedAt !== item.publishedAt))
      throw new ReviewRequired(`Identitas publikasi ${item.id} memiliki tautan/tanggal berbeda.`);
    unique.set(item.id, item);
  }
  return [...unique.values()].sort(
    (a, b) => b.publicationYear - a.publicationYear || b.bulletinNumber - a.bulletinNumber,
  );
}
const count = (text) => {
  if (!/^(?:\d+|\d{1,3}(?:[.,]\d{3})+)$/.test(text))
    throw new ReviewRequired('Format bilangan PDF tidak dikenal.');
  const n = Number(text.replace(/[.,]/g, ''));
  if (!Number.isSafeInteger(n)) throw new ReviewRequired('Angka PDF di luar rentang aman.');
  return n;
};
// Conservative, text-readable layout adapter. Unsupported charts/scans are held for review.
export function extractSkdr(pages, publication, retrievedAt, sha256) {
  if (!publication.publishedAt)
    throw new ReviewRequired('Tanggal terbit tidak ditemukan pada publikasi.');
  const sections = pages.filter((p) => /malaria\s+konfirmasi/i.test(p.text));
  if (!sections.length)
    throw new ReviewRequired('Bagian Malaria Konfirmasi tidak ditemukan; periksa layout/OCR.');
  const coverage = [];
  for (const p of sections)
    for (const m of p.text.matchAll(
      /(?:sampai|s\.d\.|hingga|s\/d)\s*(?:dengan\s*)?(?:minggu\s*(?:ke[-\s]*)?|M\s*)(\d{1,2})\s*(?:tahun\s*)?(20\d{2})/gi,
    ))
      coverage.push(`${+m[2]}:${+m[1]}`);
  if (new Set(coverage).size !== 1)
    throw new ReviewRequired('Tahun data/minggu cakupan malaria hilang atau ambigu.');
  const [year, weekThrough] = coverage[0].split(':').map(Number);
  if (![2025, 2026].includes(year) || weekThrough < 1 || weekThrough > 53)
    throw new ReviewRequired('Periode/master batas malaria belum didukung.');
  const national = [],
    provinces = new Map();
  for (const p of sections) {
    for (const line of p.text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)) {
      const n = line.match(
        /^(?:Indonesia|(?:total|jumlah)\s+(?:kasus\s+)?(?:malaria\s+konfirmasi|nasional))\s*[:=]?\s+([\d.,]+)(?:\s+kasus)?$/i,
      );
      if (n) national.push({ value: count(n[1]), page: p.page });
      const match =
        line.match(/^([\p{L} .()/-]+?)\s*[:=]?\s+([\d.,]+)$/u) ||
        line
          .match(/^([\d.,]+)\s+([\p{L} .()/-]+)$/u)
          ?.slice(0)
          .map((v, i, a) => (i === 1 ? a[2] : i === 2 ? a[1] : v));
      if (!match) continue;
      let code;
      try {
        code = mapSkdrLabel(match[1].trim());
      } catch {
        continue;
      }
      if (provinces.has(code)) throw new ReviewRequired(`Baris provinsi berulang/ambigu: ${code}.`);
      provinces.set(code, {
        regionCode: code,
        originalLabel: match[1].trim(),
        value: count(match[2]),
        page: p.page,
      });
    }
  }
  if (national.length !== 1 || provinces.size !== 38)
    throw new ReviewRequired(
      `Layout malaria belum dikenali lengkap: ${national.length} angka nasional, ${provinces.size}/38 provinsi. Tidak dipublikasikan.`,
    );
  const base = {
    year,
    weekThrough,
    bulletin: `M${publication.bulletinNumber}`,
    metric: 'confirmed_cases',
    availability: 'reported',
    sourceUrl: publication.url,
  };
  const rows = [
    { ...base, level: 'national', regionCode: 'ID', originalLabel: 'Indonesia', ...national[0] },
    ...masters['2025'].regions
      .filter((r) => /^\d{2}$/.test(r.code))
      .map((r) => ({ ...base, level: 'province', ...provinces.get(r.code) })),
  ];
  const result = {
    id: publication.id,
    dataset: 'skdr-indonesia',
    boundaryVersion: '2025',
    publicationYear: publication.publicationYear,
    bulletinNumber: publication.bulletinNumber,
    publishedAt: publication.publishedAt,
    retrievedAt,
    sourceUrl: publication.url,
    indexUrl: publication.indexUrl,
    evidence: 'attachment-extraction',
    pdfVerification: {
      method: 'malaria-section-text-labels-v1',
      sha256,
      pages: [...new Set(rows.map((r) => r.page))],
    },
    rows,
  };
  const errors = validateSkdr(result, true);
  if (errors.length) throw new ReviewRequired(errors.join(' '));
  return result;
}
// The endpoint must be observable in the public portal or its first-party bundles.
export async function discoverSismal(download) {
  const portal = await download('https://malaria.kemkes.go.id/case', { maxBytes: 4 * 1024 * 1024 });
  const documents = [portal.body.toString('utf8')];
  const scripts = [...documents[0].matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)].map(
    (m) => new URL(m[1], portal.url),
  );
  function endpointFrom(text) {
    // Preserve the observed trailing slash and query. Never guess a URL from a filename.
    const candidates = [
      ...text.matchAll(
        /(?:https:\/\/malaria\.kemkes\.go\.id)?\/api\/sismal\/chartMap\/(?:20\d{2}|\$\{[\w.]+\})\/?(?:\?province=(?:[A-Z%+]+|\$\{[\w.]+\}))?/g,
      ),
    ].map((m) =>
      m[0].replace(/20\d{2}|\$\{[\w.]+\}/, '{year}').replace(/(province=)\$\{[\w.]+\}/, '$1ACEH'),
    );
    const unique = [
      ...new Set(
        candidates.map((v) => new URL(v, portal.url).href.replace('%7Byear%7D', '{year}')),
      ),
    ];
    if (unique.length > 1)
      throw new ReviewRequired('Beberapa pola endpoint chartMap berbeda; periksa request portal.');
    return unique[0] || null;
  }
  let endpointTemplate = endpointFrom(documents[0]);
  for (const script of scripts.slice(0, 12)) {
    if (endpointTemplate) break;
    if (script.hostname !== 'malaria.kemkes.go.id') continue;
    const response = await download(script.href, { maxBytes: 6 * 1024 * 1024 });
    endpointTemplate = endpointFrom(response.body.toString('utf8'));
  }
  if (!endpointTemplate)
    throw new ReviewRequired(
      'URL chartMap persis belum dapat diperiksa dari portal/bundle publik (layout adapter belum dikenali).',
    );
  return { portalUrl: portal.url, endpointTemplate, inspected: true };
}
