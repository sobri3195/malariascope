import { masters, regionName } from './engine.ts';
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
    !/^2026-m(?:[1-9]|[1-4]\d|5[0-3])$/.test(s.id) ||
    s.boundaryVersion !== '2025' ||
    typeof s.publishedAt !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(s.publishedAt) ||
    !Number.isFinite(Date.parse(s.publishedAt)) ||
    !Array.isArray(s.rows)
  )
    return ['Kontrak snapshot SKDR tidak sah.'];
  if (s.rows.some((r) => !r || typeof r !== 'object')) return ['Baris snapshot SKDR harus objek.'];
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
    const level =
      r.regionCode === 'ID' ? 'national' : /^\d{2}$/.test(r.regionCode) ? 'province' : 'district';
    if (!regionName(s.boundaryVersion, r.regionCode) || r.level !== level)
      errors.push(`Kode/jenjang wilayah salah: ${r.regionCode}`);
    if (
      r.year !== 2026 ||
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
      ![36, 45].includes(r.page) ||
      r.page !== (r.level === 'national' ? 36 : 45)
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
    if (
      !s.retrievedAt ||
      !/^\d{4}-\d{2}-\d{2}T/.test(s.retrievedAt) ||
      !Number.isFinite(Date.parse(s.retrievedAt))
    )
      errors.push('Waktu penarikan ISO wajib.');
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
    selection.year !== 2026 ||
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
    },
    records: selectedSkdr(s, selection),
    reconciliation:
      selection.region === 'ID' && selection.year === 2026 && selection.snapshot === s.id
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
