import { masters, regionName } from './indonesia/engine.ts';
export type RegionalValue = { regionCode: string; value: number | null; availability: string };
export function districtCoverage(code: string, values: readonly RegionalValue[]) {
  const districts = masters['2025'].regions.filter(
    (r) =>
      /^\d{2}\.\d{2}$/.test(r.code) &&
      (code === 'ID' || r.code === code || r.code.startsWith(code + '.')),
  );
  const byCode = new Map(values.map((row) => [row.regionCode, row]));
  let available = 0;
  let partial = 0;
  let unavailable = 0;
  let missing = 0;
  for (const district of districts) {
    const row = byCode.get(district.code);
    if (!row) missing++;
    else if (row.value === null) unavailable++;
    else {
      available++;
      if (row.availability === 'partial') partial++;
    }
  }
  return { available, total: districts.length, partial, unavailable, missing };
}
export function regionProfile(
  code: string,
  values: RegionalValue[],
  level: 'province' | 'district' = 'province',
) {
  const master = masters['2025'].regions;
  const name = regionName('2025', code);
  if (!name) throw Error('Kode wilayah tidak sah.');
  const row = values.find((r) => r.regionCode === code);
  const parent = code.includes('.')
    ? values.find((r) => r.regionCode === code.slice(0, 2))
    : undefined;
  const expected = new Set(master.filter((r) => /^\d{2}$/.test(r.code)).map((r) => r.code));
  const available = new Set(
    values.filter((r) => expected.has(r.regionCode) && r.value !== null).map((r) => r.regionCode),
  );
  return {
    code,
    name,
    level: code === 'ID' ? 'Nasional' : code.includes('.') ? 'Kabupaten/Kota' : 'Provinsi',
    value: row?.value ?? null,
    availability: row?.availability || 'unavailable',
    parent:
      row?.value == null && parent?.value != null
        ? {
            code: parent.regionCode,
            name: regionName('2025', parent.regionCode),
            value: parent.value,
          }
        : null,
    coverage:
      level === 'district'
        ? { ...districtCoverage(code, values), label: 'kabupaten/kota' }
        : { available: available.size, total: expected.size, label: 'provinsi' },
  };
}
