import test from 'node:test';
import assert from 'node:assert/strict';
import { districtCoverage, regionProfile } from './region-profile.ts';
import { masters } from './indonesia/engine.ts';
test('profile keeps explicit zero, unavailable district and parent observation separate', () => {
  const values = [
    { regionCode: '11', value: 391, availability: 'reported' },
    { regionCode: '11.03', value: null, availability: 'unavailable' },
  ];
  const missing = regionProfile('11.03', values);
  assert.equal(missing.value, null);
  assert.equal(missing.parent?.value, 391);
  assert.equal(missing.code, '11.03');
  assert.equal(missing.level, 'Kabupaten/Kota');
  const zero = regionProfile('11.03', [
    ...values.filter((r) => r.regionCode !== '11.03'),
    { regionCode: '11.03', value: 0, availability: 'reported' },
  ]);
  assert.equal(zero.value, 0);
  assert.equal(zero.parent, null);
  assert.equal(regionProfile('11.03', []).parent, null);
  assert.throws(() => regionProfile('WRONG', values));
});
test('coverage follows source level and counts unique master identities, never national totals', () => {
  const rows = [
    { regionCode: 'ID', value: 1000, availability: 'reported' },
    { regionCode: '11.03', value: 4, availability: 'reported' },
    { regionCode: '11.03', value: 4, availability: 'reported' },
    { regionCode: 'UNKNOWN', value: 42, availability: 'reported' },
  ];
  const profile = regionProfile('11.03', rows, 'district');
  assert.equal(profile.coverage.available, 1);
  assert.equal(profile.coverage.label, 'kabupaten/kota');
  assert.equal(profile.coverage.total, 1);
  assert.equal(
    regionProfile('ID', rows, 'district').coverage.total,
    masters['2025'].regions.filter((r) => /^\d{2}\.\d{2}$/.test(r.code)).length,
  );
  assert.equal(regionProfile('11.03', rows).coverage.available, 0);
  assert.equal(regionProfile('11', []).coverage.total, 38);
});

test('district coverage is scoped and separates zero, partial, missing value and missing row', () => {
  const values = [
    { regionCode: '11.03', value: 0, availability: 'reported' },
    { regionCode: '11.04', value: 4, availability: 'partial' },
    { regionCode: '11.05', value: null, availability: 'unavailable' },
    { regionCode: '31.01', value: 42, availability: 'reported' },
  ];
  assert.deepEqual(districtCoverage('11', values), {
    available: 2,
    total: 23,
    partial: 1,
    unavailable: 1,
    missing: 20,
  });
  assert.equal(districtCoverage('ID', values).available, 3);
  assert.equal(districtCoverage('11.05', values).unavailable, 1);
  assert.equal(districtCoverage('11.06', values).missing, 1);
});
