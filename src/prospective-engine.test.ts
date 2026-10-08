import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createProspective,
  lockProspective,
  attachOutcome,
  monitorProspective,
  targetWindow,
} from './prospective-engine.ts';
const input = {
  issue_date: '2026-10-01',
  data_cutoff: '2026-09-30',
  target_period: '2027',
  dataset_version: 'fixture',
  dataset_hash: 'a'.repeat(64),
  model_version: 'fixture',
  model: 'Persistence',
  prediction: 120,
  persistence_prediction: 100,
  district: 'Test only',
};
test('prospective registry is empty until explicit user records and rejects retrospective issue/cutoff', () => {
  assert.equal(monitorProspective([]).status, 'INSUFFICIENT NEW OUTCOMES');
  assert.throws(() => createProspective({ ...input, target_period: '2025' }), /dates/);
  assert.throws(() => createProspective({ ...input, data_cutoff: '2026-10-02' }), /dates/);
  assert.throws(() => createProspective({ ...input, dataset_hash: 'not a hash' }), /SHA/);
});
test('locking preserves original prediction and issue metadata; outcomes cannot overwrite', () => {
  const record = createProspective(input, '2026-10-07'),
    locked = lockProspective(record, '2026-10-07');
  assert.equal(record.locked, false);
  assert.equal(locked.locked, true);
  assert.throws(() => lockProspective(record, '2027-02-01'), /Cannot lock/);
  assert.throws(() => attachOutcome(record, 110, '2028-01-01'), /Lock/);
  assert.throws(() => attachOutcome(locked, 110, '2026-11-01'), /period/);
  const outcome = attachOutcome(locked, 110, '2028-01-01');
  assert.equal(outcome.error, 10);
  assert.equal(outcome.issue_date, input.issue_date);
  assert.equal(outcome.prediction, 120);
  assert.throws(() => attachOutcome(outcome, 111, '2028-01-02'), /overwrite/);
  const metrics = monitorProspective([outcome]);
  assert.equal(metrics.model?.mae, 10);
  assert.equal(metrics.persistence?.mae, 10);
  assert.equal(metrics.model?.bias, 10);
});

test('prospective outcomes require completed target periods and reject calendar rollovers', () => {
  assert.throws(() => targetWindow('2027-02-30'), /Invalid/);
  assert.throws(() => targetWindow('2027Q1'), /Target/);
  const locked = lockProspective(createProspective(input, '2026-10-07'), '2026-10-07');
  assert.throws(() => attachOutcome(locked, 110, '2027-06-01'), /not complete/);
  assert.throws(() => createProspective(input, '2027-01-01'), /after registration/);
});
