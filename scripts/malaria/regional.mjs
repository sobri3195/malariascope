import { masters, validDate, validTimestamp } from '../../src/indonesia/engine.ts';
import { ReviewRequired } from './extract.mjs';
// Explicit allowlist only. No guessed regional endpoint or province-to-district projection.
export function validateRegionalConfig(config) {
  const u = new URL(config.url);
  if (
    !/^[a-z0-9-]+$/.test(config.id) ||
    u.protocol !== 'https:' ||
    !u.hostname.endsWith('.go.id') ||
    u.username ||
    u.password ||
    ![2025, 2026].includes(config.year) ||
    !config.definition?.trim() ||
    !validDate(config.publishedAt) ||
    !validDate(config.periodStart) ||
    !validDate(config.periodEnd) ||
    config.periodStart > config.periodEnd ||
    !['national', 'province', 'district'].includes(config.level) ||
    !masters['2025'].regions.some((r) => r.code === config.regionCode)
  )
    throw new ReviewRequired('Konfigurasi unduhan daerah belum lengkap/resmi.');
}
export function normalizeRegional(payload, config, retrievedAt) {
  validateRegionalConfig(config);
  if (
    !validTimestamp(retrievedAt) ||
    !Array.isArray(payload) ||
    !payload.length ||
    payload.length > 10000
  )
    throw new ReviewRequired('Rekap daerah harus array agregat yang tidak kosong.');
  const columns = [
    'regionCode',
    'level',
    'year',
    'periodStart',
    'periodEnd',
    'metric',
    'definition',
    'value',
    'availability',
  ];
  const seen = new Set();
  for (const r of payload) {
    if (
      !r ||
      Object.keys(r).some((k) => !columns.includes(k)) ||
      columns.some((k) => !Object.hasOwn(r, k)) ||
      r.year !== config.year ||
      r.periodStart !== config.periodStart ||
      r.periodEnd !== config.periodEnd ||
      r.definition !== config.definition ||
      r.level !== config.level ||
      r.metric !== 'confirmed_cases' ||
      !masters['2025'].regions.some((x) => x.code === r.regionCode) ||
      (config.regionCode !== 'ID' &&
        r.regionCode !== config.regionCode &&
        !r.regionCode.startsWith(config.regionCode + '.')) ||
      (r.level === 'national'
        ? r.regionCode !== 'ID'
        : r.level === 'province'
          ? !/^\d{2}$/.test(r.regionCode)
          : !/^\d{2}\.\d{2}$/.test(r.regionCode)) ||
      !['reported', 'partial', 'unavailable'].includes(r.availability) ||
      (r.availability === 'unavailable'
        ? r.value !== null
        : !Number.isSafeInteger(r.value) || r.value < 0) ||
      seen.has(r.regionCode)
    )
      throw new ReviewRequired(
        'Skema/kode/duplikasi/periode rekap daerah tidak cocok; hanya agregat sesuai kontrak diterima.',
      );
    seen.add(r.regionCode);
  }
  return {
    id: `${config.id}-${config.year}`,
    source: 'regional',
    sourceUrl: config.url,
    publishedAt: config.publishedAt,
    retrievedAt,
    boundaryVersion: '2025',
    definition: config.definition,
    rows: payload,
  };
}
