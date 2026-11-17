import Papa from 'papaparse';
import { mapSkdrLabel } from '../../src/indonesia/skdr.ts';
import {
  convertOfficialSkdrCsv,
  parseIndonesianInteger,
} from '../../src/indonesia/skdr-conversion.ts';
// Strict supported text layout. Unknown headers or metadata fail closed and require
// the explicit reviewed CSV/metadata route; numeric positions are never guessed.
export function extractPdfSnapshot(pages, meta) {
  const page = pages[meta.provincePage];
  if (!page || !/malaria/i.test(page))
    throw Error('pdf-layout: halaman lampiran malaria tidak ditemukan.');
  const lines = page.split(/\r?\n/).map((line) => line.trim().split(/\s{2,}|\t+/));
  const header = lines.find(
    (cells) =>
      cells.length === 7 &&
      cells.includes(meta.provinceColumn) &&
      cells.includes(meta.confirmedColumn),
  );
  if (!header)
    throw Error(
      'pdf-layout: header 7 kolom tidak dikenal; gunakan CSV resmi dengan pemetaan kolom.',
    );
  const labelIndex = header.indexOf(meta.provinceColumn);
  const records = lines.filter((cells) => {
    if (cells.length !== 7) return false;
    try {
      mapSkdrLabel(cells[labelIndex]);
      return true;
    } catch {
      return false;
    }
  });
  return convertOfficialSkdrCsv(Papa.unparse({ fields: header, data: records }), meta);
}
export function extractPdfMetadata(pages, { year, bulletin, sourceUrl, retrievedAt }) {
  const entries = Object.entries(pages);
  const national = entries.filter(
    ([, text]) =>
      /malaria/i.test(text) &&
      /kasus\s+(?:positif|terkonfirmasi)/i.test(text) &&
      /minggu/i.test(text),
  );
  const province = entries.filter(
    ([, text]) =>
      /Papua Tengah/i.test(text) && /Papua Barat Daya/i.test(text) && /malaria/i.test(text),
  );
  if (national.length !== 1 || province.length !== 1)
    throw Error('pdf-layout: halaman malaria tidak unik; gunakan metadata yang diperiksa.');
  const text = national[0][1];
  const week = text.match(/(?:sampai|hingga)\s+(?:dengan\s+)?minggu\s*(?:ke[-\s]*)?(\d{1,2})/i);
  const number = text.match(/([\d.]+)\s+kasus\s+(?:positif|terkonfirmasi)\s+malaria/i);
  // ISO date/time must be explicitly printed in supported layout. Indonesian prose
  // dates need reviewed metadata, rather than deriving publication time from fetch time.
  const published = entries
    .map(([, t]) => t)
    .join('\n')
    .match(/(?:Tanggal terbit|Published)\s*:\s*(\d{4}-\d{2}-\d{2})/i);
  const asOf = text.match(
    /(?:Data per|Data sampai)\s*:\s*(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2}))/i,
  );
  if (!week || !number || !published || !asOf)
    throw Error(
      'pdf-metadata: periode/tanggal terbit/waktu data tidak terbaca; impor metadata resmi yang diperiksa.',
    );
  return {
    year,
    bulletin,
    sourceUrl,
    retrievedAt,
    weekThrough: Number(week[1]),
    national: parseIndonesianInteger(number[1]),
    publishedAt: published[1],
    dataAsOf: asOf[1],
    nationalPage: Number(national[0][0]),
    provincePage: Number(province[0][0]),
    provinceColumn: 'Provinsi',
    confirmedColumn: 'Kasus Terkonfirmasi',
  };
}
