import Papa from 'papaparse';
import { mapSkdrLabel, validateSkdr, type SkdrSnapshot, type SkdrRow } from './skdr.ts';
export function convertSkdrMarkdown(markdown: string): SkdrSnapshot {
  const blocks = [...markdown.matchAll(/```csv\s*\n([\s\S]*?)```/g)];
  if (blocks.length !== 1) throw Error('Lampiran harus memiliki tepat satu blok CSV.');
  const result = Papa.parse<Record<string, string>>(blocks[0][1].trim(), {
    header: true,
    skipEmptyLines: 'greedy',
  });
  const columns = [
    'level',
    'region_code',
    'original_label',
    'year',
    'week_through',
    'bulletin',
    'metric',
    'value',
    'availability',
    'page',
    'source_url',
    'published_at',
    'retrieved_at',
  ];
  if (
    result.errors.length ||
    columns.length !== result.meta.fields?.length ||
    columns.some((k) => !result.meta.fields?.includes(k))
  )
    throw Error(
      'Header/format CSV tidak cocok dengan kontrak SKDR; petakan header lampiran secara eksplisit, jangan menebak.',
    );
  const meta = result.data[0];
  if (!meta) throw Error('CSV kosong.');
  const rows = result.data.map((r) => {
    if (Object.values(r).some((v) => typeof v !== 'string'))
      throw Error('Kolom CSV tidak lengkap.');
    const mapped =
      r.level === 'national' && r.original_label.toLowerCase() === 'indonesia'
        ? 'ID'
        : mapSkdrLabel(r.original_label);
    if (r.region_code !== mapped)
      throw Error(
        `Kode tidak sesuai label SKDR: ${r.original_label} → ${mapped}, menerima ${r.region_code}`,
      );
    if (
      r.published_at !== meta.published_at ||
      r.retrieved_at !== meta.retrieved_at ||
      r.source_url !== meta.source_url
    )
      throw Error('Metadata publikasi berbeda dalam satu snapshot.');
    if (!/^(0|[1-9]\d*)$/.test(r.value))
      throw Error('Nilai harus integer agregat; jangan mengubah data kosong menjadi nol.');
    return {
      level: r.level,
      regionCode: r.region_code,
      originalLabel: r.original_label,
      year: Number(r.year),
      weekThrough: Number(r.week_through),
      bulletin: r.bulletin,
      metric: r.metric,
      value: Number(r.value),
      availability: r.availability,
      page: Number(r.page),
      sourceUrl: r.source_url,
    } as SkdrRow;
  });
  const snapshot: SkdrSnapshot = {
    id: `${meta.year}-m${meta.bulletin.replace(/^M/, '')}`,
    dataset: 'skdr-indonesia',
    boundaryVersion: '2025',
    publishedAt: meta.published_at,
    retrievedAt: meta.retrieved_at,
    sourceUrl: meta.source_url,
    evidence: 'attachment-extraction',
    rows,
  };
  const errors = validateSkdr(snapshot, true);
  if (errors.length) throw Error(errors.join('\n'));
  return snapshot;
}

export type OfficialSkdrMetadata = {
  year: number;
  bulletin: number;
  weekThrough: number;
  publishedAt: string;
  dataAsOf: string;
  sourceUrl: string;
  retrievedAt: string;
  national: number;
  nationalPage: number;
  provincePage: number;
  // Explicit column names: do not infer a metric from its numeric position.
  provinceColumn: string;
  confirmedColumn: string;
};
export function parseIndonesianInteger(value: string): number {
  if (!/^(?:0|[1-9]\d*|[1-9]\d{0,2}(?:\.\d{3})+)$/.test(value.trim()))
    throw Error(`Angka agregat Indonesia tidak sah: ${value}`);
  const number = Number(value.replaceAll('.', '').trim());
  if (!Number.isSafeInteger(number)) throw Error('Angka melebihi rentang integer aman.');
  return number;
}
export function convertOfficialSkdrCsv(input: string, meta: OfficialSkdrMetadata): SkdrSnapshot {
  const parsed = Papa.parse<Record<string, string>>(input.replace(/^\uFEFF/, ''), {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim(),
  });
  if (
    parsed.errors.length ||
    parsed.meta.fields?.length !== 7 ||
    !parsed.meta.fields.includes(meta.provinceColumn) ||
    !parsed.meta.fields.includes(meta.confirmedColumn) ||
    meta.provinceColumn === meta.confirmedColumn
  )
    throw Error(
      'Lampiran Indonesia harus memiliki 7 kolom dan pemetaan provinsi/kasus terkonfirmasi eksplisit.',
    );
  const rows: SkdrRow[] = parsed.data.map((r) => ({
    level: 'province',
    regionCode: mapSkdrLabel(r[meta.provinceColumn]),
    originalLabel: r[meta.provinceColumn].trim(),
    year: meta.year,
    weekThrough: meta.weekThrough,
    bulletin: `M${meta.bulletin}`,
    metric: 'confirmed_cases',
    value: parseIndonesianInteger(r[meta.confirmedColumn]),
    availability: 'reported',
    page: meta.provincePage,
    sourceUrl: meta.sourceUrl,
  }));
  rows.unshift({
    level: 'national',
    regionCode: 'ID',
    originalLabel: 'Indonesia',
    year: meta.year,
    weekThrough: meta.weekThrough,
    bulletin: `M${meta.bulletin}`,
    metric: 'confirmed_cases',
    value: meta.national,
    availability: 'reported',
    page: meta.nationalPage,
    sourceUrl: meta.sourceUrl,
  });
  const snapshot: SkdrSnapshot = {
    id: `${meta.year}-m${meta.bulletin}`,
    dataset: 'skdr-indonesia',
    boundaryVersion: '2025',
    publishedAt: meta.publishedAt,
    dataAsOf: meta.dataAsOf,
    retrievedAt: meta.retrievedAt,
    sourceUrl: meta.sourceUrl,
    evidence: 'attachment-extraction',
    sourcePages: { national: meta.nationalPage, provinces: meta.provincePage },
    sourceColumns: {
      province: parsed.meta.fields!.indexOf(meta.provinceColumn),
      confirmed: parsed.meta.fields!.indexOf(meta.confirmedColumn),
    },
    rows,
  };
  const errors = validateSkdr(snapshot, true);
  if (errors.length) throw Error(errors.join('\n'));
  return snapshot;
}
