import { masters, regionName, validDate, validTimestamp, validHttps } from './engine.ts';
export const skdrDataset = 'skdr-indonesia';
export type SkdrLevel = 'national' | 'province' | 'district';
export type Availability = 'reported' | 'partial' | 'unavailable';
export type SkdrRow = {
  level: SkdrLevel;
  regionCode: string;
  originalLabel: string | null;
  year: number;
  weekThrough: number;
  bulletin: string;
  metric: 'confirmed_cases';
  value: number | null;
  availability: Availability;
  page: number;
  sourceUrl: string | null;
};
export type SkdrSnapshot = {
  id: string;
  dataset: typeof skdrDataset;
  boundaryVersion: '2025';
  publishedAt: string;
  retrievedAt: string | null;
  sourceUrl: string | null;
  evidence: 'user-supplied-incomplete' | 'attachment-extraction';
  retrievalNote?: string;
  dataAsOf?: string;
  version?: string;
  pdfVerification?: { method: string; sha256: string; pages: number[] };
  sourceColumns?: { province: number; confirmed: number };
  sourcePages?: { national: number; provinces: number };
  rows: SkdrRow[];
};
export type SkdrSelection = {
  year: number;
  snapshot: string;
  region: string;
  source?: 'skdr' | 'sismal';
};
export const initialSkdr: SkdrSelection = { year: 2026, snapshot: '2026-m44', region: 'ID' };
export function parseSkdrSelection(q: URLSearchParams): SkdrSelection {
  return {
    source: q.get('source') === 'sismal' ? 'sismal' : 'skdr',
    year: Number(q.get('year') || 2026),
    snapshot:
      q.get('snapshot') ||
      (q.get('source') === 'sismal' ? `sismal-${q.get('year') || 2026}` : '2026-m44'),
    region: q.get('region') || 'ID',
  };
}
export function validateSkdr(s: SkdrSnapshot, complete = false): string[] {
  const errors: string[] = [];
  if (
    !s ||
    s.dataset !== skdrDataset ||
    typeof s.id !== 'string' ||
    !/^20\d{2}-m(?:[1-9]|[1-4]\d|5[0-3])$/.test(s.id) ||
    s.boundaryVersion !== '2025' ||
    !validDate(s.publishedAt) ||
    !Array.isArray(s.rows)
  )
    return ['Kontrak snapshot SKDR tidak sah.'];
  if (s.rows.some((r) => !r || typeof r !== 'object')) return ['Baris snapshot SKDR harus objek.'];
  if (s.sourceUrl !== null && !validHttps(s.sourceUrl)) errors.push('URL sumber tidak sah.');
  if (s.retrievedAt !== null && !validTimestamp(s.retrievedAt))
    errors.push('Waktu penarikan tidak sah.');
  if (s.dataAsOf !== undefined && !validTimestamp(s.dataAsOf))
    errors.push('Waktu cakupan sumber tidak sah.');
  if (
    s.pdfVerification &&
    (!/^[a-f0-9]{64}$/.test(s.pdfVerification.sha256) ||
      !s.pdfVerification.pages.length ||
      s.pdfVerification.pages.some((p) => !Number.isInteger(p) || p < 1))
  )
    errors.push('Hash/halaman PDF tidak sah.');
  const bulletin = 'M' + Number(s.id.split('-m')[1]);
  if (
    s.id === '2026-m44' &&
    (s.publishedAt !== '2026-11-10' || s.rows.some((r) => r.weekThrough !== 43))
  )
    errors.push('Metadata edisi M44 2026 tidak sesuai.');
  if (!['user-supplied-incomplete', 'attachment-extraction'].includes(s.evidence))
    errors.push('Asal bukti tidak sah.');
  const seen = new Set<string>();
  for (const r of s.rows) {
    if (
      typeof r.regionCode !== 'string' ||
      (r.originalLabel !== null && typeof r.originalLabel !== 'string') ||
      r.sourceUrl !== s.sourceUrl
    )
      errors.push('Kode, label, atau URL baris tidak sesuai kontrak.');
    if (r.originalLabel) {
      try {
        const mapped =
          r.level === 'national' && r.originalLabel.toLocaleLowerCase('id') === 'indonesia'
            ? 'ID'
            : mapSkdrLabel(r.originalLabel);
        if (mapped !== r.regionCode) errors.push('Label asli tidak cocok dengan kode wilayah.');
      } catch {
        errors.push('Label asli tidak terpetakan secara unik.');
      }
    }
    const level =
      r.regionCode === 'ID' ? 'national' : /^\d{2}$/.test(r.regionCode) ? 'province' : 'district';
    if (!regionName(s.boundaryVersion, r.regionCode) || r.level !== level)
      errors.push(`Kode/jenjang wilayah salah: ${r.regionCode}`);
    if (
      r.year !== Number(s.id.slice(0, 4)) ||
      !Number.isInteger(r.weekThrough) ||
      r.weekThrough < 1 ||
      r.weekThrough > 53 ||
      r.weekThrough !== s.rows[0]?.weekThrough ||
      r.bulletin !== bulletin ||
      r.metric !== 'confirmed_cases'
    )
      errors.push('Periode/metrik snapshot tidak cocok.');
    if (
      !['reported', 'partial', 'unavailable'].includes(r.availability) ||
      (r.availability === 'unavailable'
        ? r.value !== null
        : !Number.isSafeInteger(r.value) || r.value! < 0)
    )
      errors.push(`Nilai/status tidak sah: ${r.regionCode}`);
    if (
      (s.evidence === 'attachment-extraction' && !r.originalLabel) ||
      !Number.isInteger(r.page) ||
      r.page < 1 ||
      r.page !==
        (r.level === 'national'
          ? (s.sourcePages?.national ?? 36)
          : (s.sourcePages?.provinces ?? 45))
    )
      errors.push('Label asli/halaman sumber tidak sah.');
    const key = [r.level, r.regionCode, r.metric].join('|');
    if (seen.has(key)) errors.push('Snapshot memuat duplikat unit/metrik.');
    seen.add(key);
  }
  if (
    s.rows.filter((r) => r.level === 'national').length !== 1 ||
    s.rows.filter((r) => r.level === 'province').length !== 38 ||
    s.rows.length !== 39
  )
    errors.push('Snapshot harus tepat 1 nasional dan 38 provinsi.');
  const sum = s.rows
    .filter((r) => r.level === 'province' && typeof r.value === 'number')
    .reduce((total, r) => total + r.value!, 0);
  if (!Number.isSafeInteger(sum)) errors.push('Jumlah provinsi melebihi rentang integer aman.');
  if (complete) {
    try {
      const u = new URL(s.sourceUrl || '');
      if (
        u.protocol !== 'https:' ||
        !(u.hostname.endsWith('.go.id') || u.hostname === 'skdr.surveilans.org') ||
        u.username ||
        u.password
      )
        errors.push('URL publikasi resmi wajib.');
    } catch {
      errors.push('URL publikasi resmi wajib.');
    }
    if (!validTimestamp(s.retrievedAt)) errors.push('Waktu penarikan ISO wajib.');
    if (s.rows.some((r) => r.sourceUrl !== s.sourceUrl || !r.originalLabel))
      errors.push('URL/label asli baris belum lengkap.');
  }
  if (
    complete &&
    (s.rows.some((r) => r.value === null || r.availability !== 'reported') ||
      !s.retrievedAt ||
      !s.sourceUrl ||
      s.evidence !== 'attachment-extraction')
  )
    errors.push('Lampiran/metadata lengkap belum tersedia.');
  return errors;
}
export function skdrReconciliation(s: SkdrSnapshot) {
  const provinces = s.rows.filter((r) => r.level === 'province');
  const complete =
    provinces.length === 38 &&
    provinces.every((r) => r.value !== null && r.availability === 'reported');
  const reported = provinces.filter((r) => r.value !== null);
  const availableSum = reported.reduce((n, r) => n + r.value!, 0);
  const national = s.rows.find((r) => r.level === 'national')?.value ?? null;
  return {
    national,
    provinceCount: provinces.length,
    availableProvinceCount: reported.length,
    availableSum,
    provinceSum: complete ? availableSum : null,
    difference: complete && national !== null ? availableSum - national : null,
    status:
      complete && availableSum === national ? 'Sesuai' : 'Perbedaan sumber belum direkonsiliasi',
  };
}
export function selectedSkdr(s: SkdrSnapshot, selection: SkdrSelection) {
  if (
    selection.source === 'sismal' ||
    selection.year !== Number(s.id.slice(0, 4)) ||
    selection.snapshot !== s.id ||
    !regionName('2025', selection.region)
  )
    return [];
  return s.rows.filter((r) => r.regionCode === selection.region);
}
export function skdrExport(s: SkdrSnapshot, selection: SkdrSelection) {
  return {
    dataset: skdrDataset,
    selection,
    source: {
      id: s.id,
      publishedAt: s.publishedAt,
      retrievedAt: s.retrievedAt,
      url: s.sourceUrl,
      evidence: s.evidence,
      boundaryVersion: s.boundaryVersion,
      retrievalNote: s.retrievalNote,
      dataAsOf: s.dataAsOf,
      version: s.version,
      pdfSha256: s.pdfVerification?.sha256,
      pages: s.pdfVerification?.pages.join(', '),
    },
    records: selectedSkdr(s, selection),
    reconciliation:
      selection.year === Number(s.id.slice(0, 4)) && selection.snapshot === s.id
        ? skdrReconciliation(s)
        : undefined,
  };
}
export function mapSkdrLabel(label: string) {
  const norm = (s: string) =>
    s
      .toLocaleLowerCase('id')
      .replace(/[^a-z0-9]/g, '')
      .replace(/^di(?=yogyakarta)/, 'daerahistimewa');
  const aliases: Record<string, string> = {
    dkijakarta: '31',
    jakarta: '31',
    diyogyakarta: '34',
    yogyakarta: '34',
  };
  const matches = masters['2025'].regions.filter(
    (r) => /^\d{2}$/.test(r.code) && norm(r.name) === norm(label),
  );
  if (aliases[norm(label)]) return aliases[norm(label)];
  if (matches.length !== 1) throw Error(`Label SKDR ambigu/tidak ditemukan: ${label}`);
  return matches[0].code;
}

/** Audit acceptance gates, never a source for filling missing provincial observations. */
export function validateAuditTargets(s: SkdrSnapshot): string[] {
  const targets: Record<
    string,
    { week: number; national: number; sum: number; provinces?: Record<string, number> }
  > = {
    '2026-m44': { week: 43, national: 388495, sum: 394361 },
    '2026-m45': {
      week: 44,
      national: 399404,
      sum: 405363,
      provinces: { '11': 398, '31': 375, '91': 162947 },
    },
  };
  const target = targets[s.id];
  if (!target) return [];
  const r = skdrReconciliation(s);
  const errors: string[] = [];
  if (
    s.rows[0]?.weekThrough !== target.week ||
    r.national !== target.national ||
    r.provinceSum !== target.sum
  )
    errors.push(
      'Angka/pekan tidak cocok dengan acuan penerimaan audit; periksa sumber, jangan mengisi selisih.',
    );
  for (const [code, expected] of Object.entries(target.provinces || {}))
    if (s.rows.find((row) => row.regionCode === code)?.value !== expected)
      errors.push(`Angka provinsi ${code} berbeda dari acuan audit.`);
  if (
    s.id === '2026-m45' &&
    (s.publishedAt !== '2026-11-16' ||
      !s.dataAsOf ||
      new Date(s.dataAsOf).getTime() !== Date.parse('2026-11-14T03:00:00.000Z'))
  )
    errors.push('Tanggal terbit/waktu data M45 tidak cocok dengan acuan audit.');
  return errors;
}
