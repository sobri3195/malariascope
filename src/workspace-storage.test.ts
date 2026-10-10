import test from 'node:test';
import assert from 'node:assert/strict';
import {
  readWorkspace,
  saveWorkspace,
  usableWorkspace,
  workspaceStorageKey,
} from './workspace-storage.ts';
const defaults = {
  datasets: [],
  rules: [],
  audit: [],
  snapshots: [],
  active: '',
  thresholds: [100, 300, 500],
};
test('workspace read accepts legacy partial state without mutating defaults', () => {
  const loaded = readWorkspace(defaults, { getItem: () => '{"active":"saved","datasets":[]}' });
  assert.equal(loaded.issue, null);
  assert.equal(loaded.state.active, 'saved');
  assert.equal(defaults.active, '');
});
test('corrupt JSON and invalid structures retain exact original for recovery', () => {
  for (const raw of [
    '{broken',
    'null',
    '[]',
    '{"datasets":null}',
    '{"rules":[null]}',
    '{"thresholds":[500,100,300]}',
    '{"datasets":[{"id":"x","name":"bad","source":"test","rows":[{"district":null,"year":2025}]}]}',
  ]) {
    const loaded = readWorkspace(defaults, { getItem: () => raw });
    assert.equal(loaded.issue, 'invalid');
    assert.equal(loaded.raw, raw);
    assert.deepEqual(loaded.state, defaults);
  }
});
test('unavailable storage and quota failures are explicit and do not throw', () => {
  const loaded = readWorkspace(defaults, {
    getItem: () => {
      throw Error('blocked');
    },
  });
  assert.equal(loaded.issue, 'unavailable');
  assert.equal(
    saveWorkspace(defaults, {
      setItem: () => {
        throw Error('quota');
      },
    }),
    false,
  );
  let content = '';
  assert.equal(
    saveWorkspace(defaults, {
      setItem: (key, value) => {
        assert.equal(key, workspaceStorageKey);
        content = value;
      },
    }),
    true,
  );
  assert.deepEqual(JSON.parse(content), { ...defaults, __workspaceVersion: 2 });
});
test('structural checks do not claim scientific validation or reject missing optional observations', () => {
  assert.equal(
    usableWorkspace({
      datasets: [
        {
          id: 'x',
          name: 'partial',
          source: 'user',
          rows: [{ district: 'A', year: 2025, cases: null }],
        },
      ],
    }),
    true,
  );
});
