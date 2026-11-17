import test from 'node:test';
import assert from 'node:assert/strict';
import { regionProfile } from './region-profile.ts';
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
  assert.equal(
    profile.coverage.total,
    masters['2025'].regions.filter((r) => /^\d{2}\.\d{2}$/.test(r.code)).length,
  );
  assert.equal(regionProfile('11.03', rows).coverage.available, 0);
  assert.equal(regionProfile('11', []).coverage.total, 38);
});
