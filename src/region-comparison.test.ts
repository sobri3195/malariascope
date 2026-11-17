import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseRegionReference,
  comparisonObservation,
  compareRegions,
} from './region-comparison.ts';
const ref = {
  region: '11',
  source: 'skdr' as const,
  snapshot: '2026-m44',
  year: 2026,
  version: '2026-m44',
};
const a = comparisonObservation(
  ref,
  [{ regionCode: '11', value: 10, availability: 'reported' }],
  'province',
  'SKDR',
  'M43 2026',
  'skdr:m44',
  'Kasus terkonfirmasi',
);
test('two provinces in the same snapshot use B minus A and A as percentage denominator', () => {
  const b = { ...a, code: '31', value: 15 };
  assert.deepEqual(compareRegions(a, b), { reasons: [], difference: 5, relative: 50 });
  assert.equal(compareRegions(b, a).difference, -5);
  assert.ok(Math.abs(compareRegions(b, a).relative! + 100 / 3) < 1e-10);
});
test('zero is a real value but cannot be a relative denominator; missing never becomes zero', () => {
  assert.deepEqual(compareRegions({ ...a, value: 0 }, a), {
    reasons: [],
    difference: 10,
    relative: null,
  });
  assert.equal(compareRegions(a, { ...a, value: 0 }).relative, -100);
  const missing = compareRegions(a, { ...a, value: null });
  assert.equal(missing.difference, null);
  assert.match(missing.reasons.join(' '), /belum tersedia/);
});
test('each comparability dimension independently blocks differences', () => {
  for (const [field, value] of Object.entries({
    level: 'Kabupaten/Kota',
    indicator: 'Kasus positif',
    unit: 'per 1000',
    period: '2025',
    definition: 'sismal:2025',
  })) {
    const result = compareRegions(a, { ...a, [field]: value });
    assert.equal(result.difference, null, field);
    assert.ok(result.reasons.length, field);
  }
});
test('public references roundtrip identities and reject invalid regions, source, period and version', () => {
  assert.deepEqual(parseRegionReference(JSON.stringify(ref)), ref);
  for (const invalid of [
    null,
    'broken',
    '{}',
    JSON.stringify({ ...ref, region: 'xx' }),
    JSON.stringify({ ...ref, year: 2025 }),
    JSON.stringify({ ...ref, version: '' }),
    JSON.stringify({ ...ref, source: 'private' }),
  ])
    assert.equal(parseRegionReference(invalid), null);
  const extra = parseRegionReference(JSON.stringify({ ...ref, value: 1234 }));
  assert.ok(extra && !('value' in extra));
});
