import regions from './regions.json' with { type: 'json' };
export const masters = regions;
export type Master = keyof typeof masters;
export const kinds = ['situasi', 'asal', 'layanan', 'respons'] as const;
export type Kind = (typeof kinds)[number];
export type RecordRow = Record<string, string>;
export const common = [
  'region_version',
  'region_code',
  'period_start',
  'period_end',
  'source_id',
  'source_type',
  'publication_version',
  'published_at',
  'source_url',
  'locator',
  'definition',
  'coverage',
  'geo_basis',
  'status',
  'reviewed_at',
];
export const extra: Record<Kind, string[]> = {
  situasi: ['confirmed', 'week_start', 'week_end'],
  asal: ['confirmed', 'imported', 'introduced', 'indigenous', 'other', 'unclassified'],
  layanan: [
    'assessed_at',
    'rdt_ready',
    'rdt_assessed',
    'microscopy_ready',
    'microscopy_assessed',
    'referral_ready',
    'referral_assessed',
  ],
  respons: [
    'stage',
    'trigger_at',
    'required_count',
    'completed_count',
    'timely_count',
    'deadline_hours',
    'as_of',
    'sop_url',
    'sop_version',
    'sop_effective_from',
    'sop_effective_to',
  ],
};
export const columns = (kind: Kind) => [...common, ...extra[kind]];
export function regionName(version: string, code: string) {
  return Object.hasOwn(masters, version)
    ? masters[version as Master].regions.find((r) => r.code === code)?.name
    : undefined;
}
const count = (v: string) => /^(0|[1-9]\d*)$/.test(v) && Number.isSafeInteger(Number(v));
const date = (v: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  Number.isFinite(Date.parse(v)) &&
  new Date(v).toISOString().slice(0, 10) === v;
const timestamp = (v: string) =>
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(Z|[+-]\d{2}:\d{2})$/.test(v) &&
  date(v.slice(0, 10)) &&
  Number.isFinite(Date.parse(v));
const url = (v: string) => {
  try {
    const u = new URL(v);
    return u.protocol === 'https:' && !u.username && !u.password;
  } catch {
    return false;
  }
};
export function validateRows(
  kind: Kind,
  input: RecordRow[],
  headers = input.length ? Object.keys(input[0]) : [],
): string[] {
  const errors: string[] = [];
  const allowed = columns(kind);
  if (headers.length !== allowed.length || allowed.some((k) => !headers.includes(k)))
    return ['Kolom harus persis sesuai templat agregat; kolom identitas atau kolom asing ditolak.'];
  if (!input.length || input.length > 10000) return ['Rekap harus berisi 1–10.000 baris agregat.'];
  const seen = new Set<string>();
  input.forEach((r, i) => {
    const fail = (s: string) => errors.push(`Baris ${i + 2}: ${s}`);
    if (
      allowed.some((k) => typeof r[k] !== 'string') ||
      Object.keys(r).some((k) => !allowed.includes(k)) ||
      Object.values(r).some((v) => typeof v !== 'string' || v.length > 2000)
    ) {
      fail('Format baris tidak sah.');
      return;
    }
    if (!regionName(r.region_version, r.region_code)) fail('Kode/versi wilayah tidak dikenal.');
    for (const k of common.filter((k) => !['coverage'].includes(k)))
      if (!r[k]?.trim()) fail(`${k} wajib diisi.`);
    for (const k of ['period_start', 'period_end', 'published_at', 'reviewed_at'])
      if (!date(r[k])) fail(`${k} harus tanggal ISO yang sah.`);
    if (r.period_start > r.period_end || r.published_at > r.reviewed_at)
      fail('Urutan tanggal tidak sah.');
    if (!url(r.source_url)) fail('URL sumber HTTPS wajib.');
    if (['profil', 'skdr', 'rekap-resmi'].includes(r.source_type) && url(r.source_url)) {
      const host = new URL(r.source_url).hostname;
      if (!(host.endsWith('.go.id') || host === 'skdr.surveilans.org'))
        fail('Angka situasi harus merujuk publikasi pemerintah atau SKDR resmi.');
    }
    if (Object.values(r).some((v) => /\b\d{16}\b|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(v)))
      fail('Pola identitas pribadi ditemukan; hanya rekap agregat diterima.');
    if (!['pelaporan', 'domisili', 'paparan'].includes(r.geo_basis))
      fail('Basis wilayah harus pelaporan, domisili, atau paparan.');
    if (!['reported', 'partial', 'unavailable'].includes(r.status)) fail('Status tidak sah.');
    if (!r.coverage?.trim()) fail('Cakupan wajib dijelaskan, termasuk bagian yang belum lengkap.');
    const sourceTypes: Record<Kind, string[]> = {
      situasi: ['profil', 'skdr', 'rekap-resmi'],
      asal: ['pe-agregat'],
      layanan: ['penilaian-fasyankes'],
      respons: ['rekap-respons'],
    };
    if (!sourceTypes[kind].includes(r.source_type)) fail('Jenis sumber tidak sesuai panel.');
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
        ].includes(k),
    );
    for (const k of numeric) {
      if (r.status === 'unavailable' ? r[k] !== '' : !count(r[k]))
        fail(`${k}: gunakan bilangan cacah, atau kosong hanya jika unavailable.`);
    }
    if (kind === 'situasi') {
      if (r.source_type === 'skdr') {
        if (
          !count(r.week_start) ||
          !count(r.week_end) ||
          +r.week_start < 1 ||
          +r.week_end > 53 ||
          +r.week_start > +r.week_end
        )
          fail('Cakupan minggu SKDR 1–53 wajib.');
      } else if (r.week_start || r.week_end) fail('Minggu hanya untuk SKDR.');
      if (
        r.source_type === 'profil' &&
        (r.period_start.slice(0, 4) !== r.period_end.slice(0, 4) ||
          !r.period_start.endsWith('-01-01') ||
          !r.period_end.endsWith('-12-31'))
      )
        fail('Profil harus periode tahunan penuh.');
    }
    if (
      kind === 'asal' &&
      r.status !== 'unavailable' &&
      ['imported', 'introduced', 'indigenous', 'other', 'unclassified'].reduce(
        (n, k) => n + Number(r[k]),
        0,
      ) !== Number(r.confirmed)
    )
      fail('Jumlah kategori asal harus sama dengan total terkonfirmasi.');
    if (kind === 'layanan') {
      if (!date(r.assessed_at) || r.assessed_at < r.period_start || r.assessed_at > r.period_end)
        fail('Tanggal penilaian harus dalam periode.');
      for (const p of ['rdt', 'microscopy', 'referral'])
        if (r.status !== 'unavailable' && +r[p + '_ready'] > +r[p + '_assessed'])
          fail(`${p}: pembilang melebihi penyebut.`);
    }
    if (kind === 'respons') {
      if (!['notifikasi', 'penyelidikan', 'penanggulangan'].includes(r.stage))
        fail('Tahap respons tidak sah.');
      if (
        !timestamp(r.trigger_at) ||
        !timestamp(r.as_of) ||
        Date.parse(r.as_of) < Date.parse(r.trigger_at)
      )
        fail('Waktu pemicu/as_of ISO dengan zona waktu wajib.');
      if (
        !date(r.sop_effective_from) ||
        !date(r.sop_effective_to) ||
        r.trigger_at.slice(0, 10) < r.sop_effective_from ||
        r.trigger_at.slice(0, 10) > r.sop_effective_to ||
        !url(r.sop_url) ||
        !r.sop_version.trim()
      )
        fail('SOP dan masa berlaku yang mencakup pemicu wajib.');
      if (
        r.status !== 'unavailable' &&
        (+r.deadline_hours < 1 ||
          +r.timely_count > +r.completed_count ||
          +r.completed_count > +r.required_count)
      )
        fail('Jumlah tahap/tenggat tidak konsisten.');
      if (r.trigger_at.slice(0, 10) < r.period_start || r.trigger_at.slice(0, 10) > r.period_end)
        fail('Pemicu harus dalam periode.');
    }
    const key = [
      r.region_version,
      r.region_code,
      r.period_start,
      r.period_end,
      r.source_id,
      r.publication_version,
      kind === 'respons' ? r.stage : '',
      kind === 'respons' ? r.trigger_at : '',
    ].join('|');
    if (seen.has(key)) fail('Duplikat unit agregat/versi sumber.');
    seen.add(key);
  });
  return errors;
}
export function responseMetric(rows: RecordRow[]) {
  // Never mix stage denominators, incomplete inputs, SOP versions or publication revisions.
  if (
    !rows.length ||
    rows.some((r) => r.status === 'unavailable') ||
    new Set(
      rows.map((r) =>
        [r.stage, r.source_id, r.publication_version, r.sop_url, r.sop_version, r.as_of].join('|'),
      ),
    ).size !== 1
  )
    return null;
  const due = rows.filter(
    (r) => Date.parse(r.trigger_at) + Number(r.deadline_hours) * 3600000 <= Date.parse(r.as_of),
  );
  const denominator = due.reduce((n, r) => n + Number(r.required_count), 0);
  const numerator = due.reduce((n, r) => n + Number(r.timely_count), 0);
  return {
    numerator,
    denominator,
    percent: denominator ? (100 * numerator) / denominator : null,
    partial: rows.some((r) => r.status === 'partial'),
  };
}
export function selectRows(
  rows: RecordRow[],
  version: string,
  region: string,
  period: string,
  source: string,
) {
  // Exact geography only. Parent totals and child rows are never added or substituted.
  return rows.filter(
    (r) =>
      r.region_version === version &&
      r.region_code === region &&
      (!period || r.period_start.slice(0, 4) === period) &&
      (!source || `${r.source_id}@${r.publication_version}` === source),
  );
}
export function compareSources(a: RecordRow, b: RecordRow) {
  return [
    'region_version',
    'region_code',
    'period_start',
    'period_end',
    'week_start',
    'week_end',
    'definition',
    'coverage',
    'geo_basis',
    'source_type',
    'publication_version',
  ].filter((k) => (a[k] || '') !== (b[k] || ''));
}
export function csv(headers: string[], rows: RecordRow[]) {
  const cell = (s: string) =>
    '"' + (/^[\s]*[=+@\-\t\r]/.test(s) ? "'" + s : s).replaceAll('"', '""') + '"';
  return (
    '\uFEFF' +
    [headers, ...rows.map((r) => headers.map((k) => r[k] || ''))]
      .map((r) => r.map(cell).join(','))
      .join('\r\n')
  );
}
