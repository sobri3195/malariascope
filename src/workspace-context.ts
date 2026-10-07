import { riskModes, type RiskMode } from './risk-engine.ts';
import { forecastModels } from './forecasting.ts';
import { layerOptions } from './map-intelligence.ts';
import type { State } from './store.tsx';
export const workspaceViews = [
  'dashboard',
  'risk-map',
  'surveillance',
  'district-intelligence',
  'climate',
  'forecasting',
  'model-benchmarking',
  'spatial-analysis',
  'early-warning',
  'risk-intelligence',
  'force-health',
  'scenario',
  'data-center',
  'data-quality',
  'reports',
  'alerts',
  'audit',
  'settings',
  'methodology',
  'provenance',
  'about',
  'presentation',
];
export const routeCommands = [
  ['Go to District', 'district-intelligence'],
  ['Open Risk Map', 'risk-map'],
  ['Open Alert Center', 'alerts'],
  ['Search Dataset', 'data-center'],
  ['Compare Models', 'model-benchmarking'],
  ['Generate Report', 'reports'],
  ['Open Settings', 'settings'],
  ['Open Presentation Mode', 'presentation'],
] as const;
export function validYear(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1900 && value <= 2100;
}
export function safeRiskMode(value: unknown): RiskMode {
  return riskModes.includes(value as RiskMode) ? (value as RiskMode) : 'OBSERVED RISK';
}
export function textEntry(target: EventTarget | null) {
  const element = target as HTMLElement | null;
  return (
    typeof element?.closest === 'function' &&
    !!element.closest(
      'input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]',
    )
  );
}
export const chordRoutes: Record<string, string> = {
  d: 'dashboard',
  m: 'risk-map',
  a: 'alerts',
  f: 'forecasting',
  r: 'reports',
};
export function captureWorkspaceSnapshot(
  state: State,
  context: { year: number; district: string; model: string; riskMode: RiskMode; view: string },
  name: string,
  id: string,
  date: string,
) {
  return structuredClone({
    id,
    name: name.trim() || 'Analytical snapshot',
    year: context.year,
    district: context.district,
    model: context.model,
    riskMode: context.riskMode,
    view: workspaceViews.includes(context.view.replace(/^\//, '')) ? context.view : '/dashboard',
    layer: state.layer,
    mapLayers: [state.layer],
    date,
    dataset: state.active,
    datasetVersion: state.datasets.find((d) => d.id === state.active)?.checksum,
    filters: state.filters,
    thresholds: state.thresholds,
    riskScenario: state.riskScenario,
  });
}
export function restoreWorkspaceSnapshot(snapshot: State['snapshots'][number], state: State) {
  if (
    !validYear(snapshot.year) ||
    typeof snapshot.district !== 'string' ||
    !forecastModels.includes(snapshot.model as (typeof forecastModels)[number]) ||
    !layerOptions.some(([id]) => id === snapshot.layer)
  )
    return { error: 'Snapshot contains an invalid year, district, model, or map layer.' } as const;
  if (snapshot.dataset && !state.datasets.some((d) => d.id === snapshot.dataset))
    return {
      error:
        'Snapshot dataset is no longer connected. Load that dataset before restoring this snapshot.',
    } as const;
  const view =
    snapshot.view && workspaceViews.includes(snapshot.view.replace(/^\//, ''))
      ? '/' + snapshot.view.replace(/^\//, '')
      : '/dashboard';
  const changed =
    snapshot.datasetVersion &&
    snapshot.datasetVersion !== state.datasets.find((d) => d.id === snapshot.dataset)?.checksum;
  return {
    year: snapshot.year,
    district: snapshot.district,
    model: snapshot.model,
    riskMode: safeRiskMode(snapshot.riskMode),
    view,
    patch: {
      active: snapshot.dataset ?? '',
      layer: snapshot.layer,
      filters: structuredClone(snapshot.filters),
      thresholds:
        snapshot.thresholds?.length === 3 &&
        snapshot.thresholds.every(
          (n, i) => Number.isFinite(n) && n >= 0 && (i === 0 || n > snapshot.thresholds![i - 1]),
        )
          ? [...snapshot.thresholds]
          : state.thresholds,
      riskScenario: structuredClone(snapshot.riskScenario),
    },
    warning: changed
      ? 'Dataset checksum has changed. This snapshot restores the view against the currently connected data; it does not restore historical source rows.'
      : !snapshot.view
        ? 'Legacy snapshot: current view and risk mode were not captured; using Dashboard and Observed Risk.'
        : null,
  } as const;
}
export function activityNotification(event: string) {
  if (/validation/i.test(event)) return 'Validation completed';
  if (/dataset imported|GIS boundaries imported/i.test(event)) return 'Dataset loaded';
  if (/alert generated/i.test(event)) return 'Analytical alert generated';
  if (/snapshot.*created|snapshot.*saved/i.test(event)) return 'Snapshot saved';
  if (/report.*generated/i.test(event)) return 'Report generated';
  if (/settings|profile|animation|risk mode/i.test(event)) return 'Settings changed';
  return event;
}
