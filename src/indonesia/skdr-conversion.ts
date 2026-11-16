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
    id: '2026-m44',
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
