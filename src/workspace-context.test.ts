import test from 'node:test';
import assert from 'node:assert/strict';
import {
  captureWorkspaceSnapshot,
  restoreWorkspaceSnapshot,
  validYear,
  safeRiskMode,
  textEntry,
  routeCommands,
  chordRoutes,
  activityNotification,
} from './workspace-context.ts';
import type { State } from './store.tsx';
const state: State = {
  datasets: [
    {
      id: 'source',
      name: 'Source',
      rows: [],
      source: 'fixture',
      checksum: 'sha',
      created: '2026-01-01',
    },
  ],
  active: 'source',
  rules: [],
  alertStates: {},
  checklist: {},
  thresholds: [100, 300, 500],
  snapshots: [],
  audit: [],
  profile: 'RESEARCHER',
  geometry: null,
  layer: 'cases',
  reduced: false,
  filters: { risk: 'HIGH', region: 'ALL', mode: 'observed' },
};
const capture = () =>
  captureWorkspaceSnapshot(
    state,
    {
      year: 2025,
      district: 'A',
      model: 'Random Forest',
      riskMode: 'MODEL-ASSISTED RISK',
      view: '/risk-map',
    },
    'Snapshot',
    'id',
    '2026-10-07T12:00:00Z',
  );
test('snapshot captures complete isolated context and source version', () => {
  const s = capture();
  assert.equal(s.view, '/risk-map');
  assert.equal(s.datasetVersion, 'sha');
  assert.equal(s.riskMode, 'MODEL-ASSISTED RISK');
  s.filters!.risk = 'LOW';
  assert.equal(state.filters?.risk, 'HIGH');
  assert.equal('rows' in s, false);
});
test('restore roundtrips filters, year, source, model, mode, map layer and view', () => {
  const r = restoreWorkspaceSnapshot(capture(), state);
  assert.ok(!('error' in r));
  if ('error' in r) return;
  assert.equal(r.model, 'Random Forest');
  assert.equal(r.riskMode, 'MODEL-ASSISTED RISK');
  assert.equal(r.patch.active, 'source');
  assert.equal(r.patch.layer, 'cases');
  assert.equal(r.patch.filters?.risk, 'HIGH');
  assert.equal(r.view, '/risk-map');
  assert.equal(r.warning, null);
});
test('unavailable datasets block restoration without silently substituting evidence', () => {
  assert.match(
    restoreWorkspaceSnapshot({ ...capture(), dataset: 'missing' }, state).error ?? '',
    /no longer connected/,
  );
});
test('version drift is explicit and snapshots never restore source rows', () => {
  const r = restoreWorkspaceSnapshot({ ...capture(), datasetVersion: 'old' }, state);
  assert.ok(!('error' in r));
  if ('error' in r) return;
  assert.match(r.warning ?? '', /checksum has changed/);
  assert.equal('datasets' in r.patch, false);
});
test('legacy snapshots have explicit bounded fallback and invalid values are rejected', () => {
  const s = capture();
  delete s.view;
  delete s.riskMode;
  const r = restoreWorkspaceSnapshot(s, state);
  assert.ok(!('error' in r));
  if ('error' in r) return;
  assert.equal(r.view, '/dashboard');
  assert.equal(r.riskMode, 'OBSERVED RISK');
  assert.match(r.warning ?? '', /Legacy snapshot/);
  assert.ok(restoreWorkspaceSnapshot({ ...s, year: 1 }, state).error);
  assert.ok(restoreWorkspaceSnapshot({ ...s, model: 'Invented' }, state).error);
});
test('query enums and annual boundaries cannot establish invalid context', () => {
  assert.equal(validYear(2025), true);
  assert.equal(validYear(2025.5), false);
  assert.equal(validYear(0), false);
  assert.equal(validYear('2025'), false);
  assert.equal(safeRiskMode('bad'), 'OBSERVED RISK');
});
test('shortcut helper protects editable targets and command routes are complete', () => {
  assert.equal(textEntry({ closest: () => ({}) } as unknown as EventTarget), true);
  assert.equal(textEntry({ closest: () => null } as unknown as EventTarget), false);
  assert.equal(textEntry(null), false);
  assert.equal(routeCommands.length, 8);
  assert.deepEqual(Object.keys(chordRoutes), ['d', 'm', 'a', 'f', 'r']);
});
test('notifications reflect concrete analytical lifecycle events', () => {
  assert.equal(activityNotification('Dataset imported'), 'Dataset loaded');
  assert.equal(activityNotification('Validation completed'), 'Validation completed');
  assert.equal(activityNotification('Snapshot saved'), 'Snapshot saved');
  assert.equal(activityNotification('Research report generated'), 'Report generated');
  assert.equal(activityNotification('Animation preference changed'), 'Settings changed');
});
