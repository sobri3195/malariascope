import { masters, regionName, validDate, validHttps, validTimestamp } from './engine.ts';
import { districtCoverage } from '../region-profile.ts';
import { mapSkdrLabel, type SkdrSelection, type SkdrSnapshot, skdrExport } from './skdr.ts';
export type SismalRow = {
  level: 'district';
  sourceId: string;
  regionCode: string;
  provinceCode: string;
  originalDistrict: string;
  originalProvince: string;
  reportingYear: number;
  updatedAt: string | null;
  validationStatus: string;
  value: number | null;
  availability: 'reported' | 'partial' | 'unavailable';
  metric: 'positive_cases';
};
export type SismalSnapshot = {
  id: string;
  source: 'sismal';
  reportingYear: number;
  retrievedAt: string | null;
  sourceUrl: string;
  evidence: 'portal-response' | 'reviewed-aggregate' | 'user-supplied-incomplete';
  responseState: 'available' | 'empty' | 'not-fetched';
  boundaryVersion: '2025';
  rows: SismalRow[];
  unmapped: { sourceId: string; reason: string }[];
};
export const sismalEvidence: Record<SismalSnapshot['evidence'], string> = {
  'portal-response': 'Respons portal SISMAL',
  'reviewed-aggregate': 'Rekap resmi SISMAL yang ditinjau dan diimpor',
  'user-supplied-incomplete': 'Data parsial dari permintaan; belum diperiksa terhadap portal',
};
const districtLabel = (s: string) =>
  s
    .trim()
    .toLocaleUpperCase('id')
    .replace(/^KAB\.?\s+/, 'KABUPATEN ')
    .replace(/\s+/g, ' ');
const normalized = (s: string) =>
  districtLabel(s)
    .replace(/^(KABUPATEN|KOTA)\s+/, '')
    .replace(/[^A-Z0-9]/g, '');
// Source IDs are NOT Kemendagri codes. This override comes from the supplied source example.
export const sourceMappings = [
  {
    sourceId: '1105',
    regionCode: '11.03',
    provinceCode: '11',
    name: 'ACEH TIMUR',
    from: 2025,
    to: 2026,
  },
];
export function mapSismalRegion(sourceId: string, name: string, province: string, year: number) {
  if (![2025, 2026].includes(year)) throw Error('Versi batas untuk tahun ini belum didukung.');
  const provinceCode = mapSkdrLabel(province);
  const override = sourceMappings.find(
    (r) => r.sourceId === sourceId && year >= r.from && year <= r.to,
  );
  if (override) {
    if (override.provinceCode !== provinceCode || normalized(override.name) !== normalized(name))
      throw Error('ID sumber bertentangan dengan nama/induk/periode.');
    return { regionCode: override.regionCode, provinceCode };
  }
  const candidates = masters['2025'].regions.filter(
    (r) => r.code.startsWith(provinceCode + '.') && normalized(r.name) === normalized(name),
  );
  // City and regency names cannot be disambiguated by silently dropping their type.
  const exact = candidates.filter((r) => districtLabel(r.name) === districtLabel(name));
  const typed = /^(KABUPATEN|KOTA)\s/.test(districtLabel(name));
  const match = typed || exact.length === 1 ? exact : candidates;
  if (match.length !== 1)
    throw Error(`Wilayah tidak terpetakan/ambigu dalam induk ${provinceCode}.`);
  return { regionCode: match[0].code, provinceCode };
}
const aliases = {
  sourceId: ['source_id', 'id', 'id_kabupaten', 'kabupaten_id'],
  district: ['district', 'kabupaten', 'kabupaten_kota', 'nama_kabupaten', 'nama_kab', 'namakab'],
  province: ['province', 'provinsi', 'nama_provinsi', 'nama_prov'],
  value: ['positive_cases', 'positif', 'kasus_positif', 'jumlah_positif', 'positive'],
  year: ['reporting_year', 'tahun', 'year'],
  updated: ['updated_at', 'tanggal_pembaruan', 'last_updated'],
  status: ['validation_status', 'status_validasi', 'validasi'],
} as const;
function field(row: Record<string, unknown>, names: readonly string[], required = false): unknown {
  const present = names.filter((k) => Object.hasOwn(row, k));
  if (present.length > 1 && new Set(present.map((k) => String(row[k]))).size > 1)
    throw Error(`Kolom sumber ambigu: ${present.join(', ')}`);
  if (!present.length) {
    if (required) throw Error(`Kolom wajib tidak ditemukan: ${names.join('/')}`);
    return null;
  }
  return row[present[0]];
}
export function normalizeSismal(
  payload: unknown,
  year: number,
  retrievedAt: string,
  sourceUrl: string,
): SismalSnapshot {
  if (![2025, 2026].includes(year)) throw Error('Tahun SISMAL belum didukung oleh master wilayah.');
  // Only explicit known array envelopes; unfamiliar schemas fail closed, without inferred counts.
  const raw = Array.isArray(payload)
    ? payload
    : payload && typeof payload === 'object' && Array.isArray((payload as { data?: unknown }).data)
      ? (payload as { data: unknown[] }).data
      : null;
  if (!raw || raw.length > 100000)
    throw Error('Skema respons SISMAL harus array atau {data:array}, maksimal 100.000 baris.');
  const rows: SismalRow[] = [],
    unmapped: SismalSnapshot['unmapped'] = [];
  const keys = new Map<string, SismalRow>();
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry))
      throw Error('Baris SISMAL bukan objek agregat.');
    const r = entry as Record<string, unknown>;
    const sourceId = String(field(r, aliases.sourceId, true));
    const district = field(r, aliases.district, true),
      province = field(r, aliases.province, true);
    if (typeof district !== 'string' || typeof province !== 'string' || !/^\d{4}$/.test(sourceId))
      throw Error('Identitas unit agregat tidak sah.');
    const declaredYear = field(r, aliases.year, true);
    if (declaredYear === null || Number(declaredYear) !== year)
      throw Error('Tahun respons tidak cocok dengan tahun permintaan.');
    const value = field(r, aliases.value, true);
    const missing = value === null || value === '';
    if (
      !missing &&
      ((typeof value !== 'string' && typeof value !== 'number') ||
        !/^\d+$/.test(String(value)) ||
        !Number.isSafeInteger(Number(value)))
    )
      throw Error('Nilai positif SISMAL bukan integer cacah.');
    const updated = field(r, aliases.updated),
      status = field(r, aliases.status);
    if (updated !== null && !validDate(updated) && !validTimestamp(updated))
      throw Error('Tanggal pembaruan SISMAL tidak sah.');
    if (status !== null && typeof status !== 'string')
      throw Error('Status validasi harus teks sumber, tidak boleh diasumsikan tervalidasi.');
    let mapped: ReturnType<typeof mapSismalRegion>;
    try {
      mapped = mapSismalRegion(sourceId, district, province, year);
    } catch (e) {
      unmapped.push({ sourceId, reason: String(e) });
      continue;
    }
    const row: SismalRow = {
      level: 'district',
      sourceId,
      ...mapped,
      originalDistrict: district,
      originalProvince: province,
      reportingYear: year,
      updatedAt: updated as string | null,
      validationStatus: (status as string) || 'Status validasi tidak dinyatakan sumber',
      value: missing ? null : Number(value),
      availability: missing ? 'unavailable' : 'reported',
      metric: 'positive_cases',
    };
    const key = `${year}|${row.regionCode}|${row.metric}`;
    const old = keys.get(key);
    if (old) {
      if (JSON.stringify(old) !== JSON.stringify(row))
        throw Error(`Duplikat konflik observasi SISMAL: ${key}`);
      continue;
    }
    keys.set(key, row);
    rows.push(row);
  }
  return {
    id: `sismal-${year}`,
    source: 'sismal',
    reportingYear: year,
    retrievedAt,
    sourceUrl,
    evidence: 'portal-response',
    responseState: raw.length ? 'available' : 'empty',
    boundaryVersion: '2025',
    rows,
    unmapped,
  };
}

function officialSismalUrl(url: unknown): url is string {
  return validHttps(url) && new URL(url).origin === 'https://malaria.kemkes.go.id';
}

export function normalizeReviewedSismal(input: unknown, year: number): SismalSnapshot {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw Error('Berkas rekap SISMAL harus berupa objek JSON.');
  const { sourceUrl, retrievedAt, rows, ...extra } = input as Record<string, unknown>;
  if (
    Object.keys(extra).length ||
    !officialSismalUrl(sourceUrl) ||
    !validTimestamp(retrievedAt) ||
    !Array.isArray(rows) ||
    !rows.length ||
    rows.length > 100000
  )
    throw Error('Rekap SISMAL wajib berisi sourceUrl resmi, retrievedAt, dan rows agregat.');
  const columns = new Set<string>(Object.values(aliases).map(([canonical]) => canonical));
  for (const [i, row] of rows.entries()) {
    if (
      !row ||
      typeof row !== 'object' ||
      Array.isArray(row) ||
      Object.keys(row).some((key) => !columns.has(key)) ||
      Object.values(row).some(
        (value) =>
          typeof value === 'string' &&
          (value.length > 250 || /\b\d{16}\b|[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(value)),
      )
    )
      throw Error(`Baris ${i + 1}: hanya kolom rekap agregat SISMAL yang diizinkan.`);
  }
  const snapshot = normalizeSismal(rows, year, retrievedAt, sourceUrl);
  if (snapshot.unmapped.length)
    throw Error(
      `Rekap ditolak: ${snapshot.unmapped.length} baris tidak terpetakan (ID ${snapshot.unmapped
        .slice(0, 10)
        .map((row) => row.sourceId)
        .join(', ')}).`,
    );
  return { ...snapshot, evidence: 'reviewed-aggregate' };
}

export function validateSismal(s: SismalSnapshot, year: number): string[] {
  if (
    !s ||
    ![2025, 2026].includes(year) ||
    s.id !== `sismal-${year}` ||
    s.source !== 'sismal' ||
    s.reportingYear !== year ||
    s.boundaryVersion !== '2025' ||
    !Array.isArray(s.rows) ||
    !Array.isArray(s.unmapped) ||
    !Object.hasOwn(sismalEvidence, s.evidence) ||
    !['available', 'empty', 'not-fetched'].includes(s.responseState)
  )
    return ['Snapshot SISMAL tidak sah.'];
  const errors: string[] = [];
  const keys = new Set<string>();
  for (const r of s.rows) {
    if (
      !r ||
      r.level !== 'district' ||
      typeof r.sourceId !== 'string' ||
      !/^\d{4}$/.test(r.sourceId) ||
      typeof r.regionCode !== 'string' ||
      !regionName('2025', r.regionCode) ||
      !r.regionCode.startsWith(r.provinceCode + '.') ||
      r.reportingYear !== year ||
      r.metric !== 'positive_cases' ||
      typeof r.validationStatus !== 'string' ||
      !r.validationStatus.trim() ||
      typeof r.originalDistrict !== 'string' ||
      typeof r.originalProvince !== 'string' ||
      (r.updatedAt !== null && !validDate(r.updatedAt) && !validTimestamp(r.updatedAt)) ||
      !['reported', 'partial', 'unavailable'].includes(r.availability) ||
      (r.availability === 'unavailable'
        ? r.value !== null
        : !Number.isSafeInteger(r.value) || r.value! < 0)
    ) {
      errors.push('Kode/induk/tahun/nilai/status baris SISMAL salah.');
      continue;
    }
    try {
      const mapped = mapSismalRegion(r.sourceId, r.originalDistrict, r.originalProvince, year);
      if (mapped.regionCode !== r.regionCode || mapped.provinceCode !== r.provinceCode)
        errors.push('Pemetaan ID/nama/induk tidak cocok.');
    } catch {
      errors.push('Pemetaan ID/nama/induk tidak sah atau ambigu.');
    }
    const key = r.regionCode;
    if (keys.has(key)) errors.push('Duplikat unit pada snapshot SISMAL.');
    keys.add(key);
  }
  if (s.evidence !== 'user-supplied-incomplete' && !validTimestamp(s.retrievedAt))
    errors.push('Penarikan portal wajib bertanggal.');
  if (!officialSismalUrl(s.sourceUrl)) errors.push('URL sumber SISMAL tidak sah.');
  if (s.responseState === 'empty' && (s.rows.length || s.unmapped.length))
    errors.push('Respons kosong tidak boleh memuat observasi.');
  if (s.evidence !== 'user-supplied-incomplete' && s.responseState === 'not-fetched')
    errors.push('Status respons bertentangan dengan bukti penarikan.');
  if (s.evidence === 'reviewed-aggregate' && (!s.rows.length || s.unmapped.length))
    errors.push('Rekap impor wajib berisi observasi yang terpetakan.');
  if (s.unmapped.some((r) => !r || typeof r.sourceId !== 'string' || typeof r.reason !== 'string'))
    errors.push('Daftar pemetaan ditolak tidak sah.');
  return errors;
}
export function selectedSismal(s: SismalSnapshot, selection: SkdrSelection) {
  if (
    selection.source !== 'sismal' ||
    selection.snapshot !== s.id ||
    selection.year !== s.reportingYear
  )
    return [];
  return s.rows.filter(
    (r) => r.regionCode === selection.region && r.provinceCode === selection.region.slice(0, 2),
  );
}
export function scopedSismal(s: SismalSnapshot, selection: SkdrSelection) {
  if (
    selection.source !== 'sismal' ||
    selection.snapshot !== s.id ||
    selection.year !== s.reportingYear
  )
    return [];
  return selection.region === 'ID'
    ? s.rows
    : /^\d{2}$/.test(selection.region)
      ? s.rows.filter(
          (r) =>
            r.provinceCode === selection.region && r.regionCode.startsWith(selection.region + '.'),
        )
      : selectedSismal(s, selection);
}
export function surveillanceExport(
  skdr: SkdrSnapshot | null,
  sismal: SismalSnapshot | null,
  selection: SkdrSelection,
) {
  if (selection.source !== 'sismal') return skdr ? skdrExport(skdr, selection) : null;
  if (
    !sismal ||
    validateSismal(sismal, selection.year).length ||
    !regionName('2025', selection.region) ||
    selection.snapshot !== sismal.id
  )
    return null;
  return {
    dataset: 'skdr-indonesia',
    selection,
    source: {
      id: sismal.id,
      series: 'sismal',
      publishedAt: null,
      retrievedAt: sismal.retrievedAt,
      url: sismal.sourceUrl,
      evidence: sismal.evidence,
      boundaryVersion: sismal.boundaryVersion,
      reportingYear: sismal.reportingYear,
      responseState: sismal.responseState,
    },
    records: scopedSismal(sismal, selection),
    coverage: districtCoverage(selection.region, sismal.rows),
    reconciliation: undefined,
  };
}
