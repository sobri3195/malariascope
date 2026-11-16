import {
  columns,
  extra,
  kinds,
  responseMetric,
  validateRows,
  type Kind,
  type RecordRow,
} from './engine.ts';
export type AggregateData = Record<Kind, RecordRow[]>;
export const emptyAggregates = (): AggregateData => ({
  situasi: [],
  asal: [],
  layanan: [],
  respons: [],
});
export function parseAggregates(value: unknown): AggregateData {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((k) => !kinds.includes(k as Kind))
  )
    throw Error('Penyimpanan rekap tidak sah.');
  const data = value as AggregateData;
  for (const kind of kinds)
    if (!Array.isArray(data[kind]) || (data[kind].length && validateRows(kind, data[kind]).length))
      throw Error(`Rekap ${kind} tidak sah.`);
  return data;
}
export const fieldLabels: Record<string, string> = {
  confirmed: 'Total terkonfirmasi',
  imported: 'Impor',
  introduced: 'Lokal terkait impor',
  indigenous: 'Setempat',
  other: 'Klasifikasi lain',
  unclassified: 'Belum diklasifikasi',
  assessed_at: 'Tanggal penilaian',
  rdt_ready: 'RDT siap',
  rdt_assessed: 'RDT dinilai',
  microscopy_ready: 'Mikroskopi siap',
  microscopy_assessed: 'Mikroskopi dinilai',
  referral_ready: 'Rujukan siap',
  referral_assessed: 'Rujukan dinilai',
  stage: 'Tahap',
  trigger_at: 'Waktu pemicu',
  required_count: 'Wajib ditindaklanjuti',
  completed_count: 'Selesai',
  timely_count: 'Tepat waktu',
  deadline_hours: 'Tenggat (jam)',
  as_of: 'Waktu evaluasi',
  period_start: 'Awal periode',
  period_end: 'Akhir periode',
  published_at: 'Tanggal terbit',
  week_start: 'Minggu awal',
  week_end: 'Minggu akhir',
  definition: 'Definisi',
  coverage: 'Cakupan',
  geo_basis: 'Basis wilayah',
  reviewed_at: 'Tanggal diperiksa pengimpor',
  locator: 'Halaman/tabel',
  region_version: 'Versi batas',
  region_code: 'Kode wilayah',
  source_id: 'Sumber',
  publication_version: 'Versi publikasi',
  source_type: 'Jenis sumber',
  status: 'Status',
  source_url: 'URL sumber',
  sop_url: 'URL SOP',
  sop_version: 'Versi SOP',
  sop_effective_from: 'SOP berlaku mulai',
  sop_effective_to: 'SOP berlaku sampai',
};
export const label = (key: string) => fieldLabels[key] || key;
export function proportion(n: number, d: number) {
  return d > 0 ? (100 * n) / d : null;
}
export function aggregateIdentity(kind: Kind, r: RecordRow) {
  return JSON.stringify([
    r.region_version,
    r.region_code,
    r.period_start,
    r.period_end,
    r.source_id,
    r.publication_version,
    ...(kind === 'respons' ? [r.stage, new Date(r.trigger_at).toISOString()] : []),
  ]);
}
export function responseGroups(rows: RecordRow[]) {
  const groups = new Map<string, RecordRow[]>();
  for (const r of rows) {
    const key = JSON.stringify([
      r.region_version,
      r.region_code,
      r.period_start,
      r.period_end,
      r.source_id,
      r.publication_version,
      r.geo_basis,
      r.definition,
      r.coverage,
      r.stage,
      r.sop_url,
      r.sop_version,
      r.sop_effective_from,
      r.sop_effective_to,
      new Date(r.as_of).toISOString(),
    ]);
    const group = groups.get(key) || [];
    group.push(r);
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => ({
    row: group[0],
    cohorts: group.length,
    metric: responseMetric(group),
  }));
}
export function reconcileAggregates(kind: Kind, a: RecordRow, b: RecordRow) {
  const semantic = [
    'region_version',
    'region_code',
    'period_start',
    'period_end',
    'definition',
    'coverage',
    'geo_basis',
    'source_type',
    ...(kind === 'situasi'
      ? ['week_start', 'week_end']
      : kind === 'layanan'
        ? ['assessed_at']
        : kind === 'respons'
          ? [
              'stage',
              'as_of',
              'trigger_at',
              'sop_url',
              'sop_version',
              'sop_effective_from',
              'sop_effective_to',
              'deadline_hours',
            ]
          : []),
  ];
  const blockers = semantic.filter((k) => a[k] !== b[k]);
  const numeric = extra[kind].filter(
    (k) =>
      ![
        'week_start',
        'week_end',
        'assessed_at',
        'stage',
        'trigger_at',
        'as_of',
        'sop_url',
        'sop_version',
        'sop_effective_from',
        'sop_effective_to',
        'deadline_hours',
      ].includes(k),
  );
  const comparable = !blockers.length && a.status === 'reported' && b.status === 'reported';
  const differences = comparable
    ? numeric.map((k) => ({
        field: k,
        a: Number(a[k]),
        b: Number(b[k]),
        delta: Number(b[k]) - Number(a[k]),
      }))
    : [];
  return {
    comparable,
    blockers,
    differences,
    revisionChanged: a.publication_version !== b.publication_version,
  };
}
export function aggregateExport(kind: Kind, rows: RecordRow[], filters: Record<string, string>) {
  return {
    panel: kind,
    filters,
    records: rows,
    definitions: Object.fromEntries(columns(kind).map((k) => [k, label(k)])),
    notice:
      'Rekap agregat yang diperiksa pengimpor; validasi struktur bukan verifikasi independen sumber.',
  };
}
