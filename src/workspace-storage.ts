export const workspaceStorageKey = 'malariascope-v1';
export type StorageIssue = 'invalid' | 'unavailable' | 'write-failed' | null;
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

/** Structural validation protects consumers; scientific validity remains a separate audit. */
export function usableWorkspace(value: unknown): value is Record<string, unknown> {
  if (!object(value)) return false;
  const arrays = [
    'datasets',
    'rules',
    'snapshots',
    'audit',
    'scientificSources',
    'analyticalScenarios',
    'alertLog',
  ];
  const records = [
    'alertStates',
    'checklist',
    'districtChecklists',
    'readinessMetadata',
    'alertCreated',
  ];
  if (
    arrays.some(
      (k) => value[k] !== undefined && (!Array.isArray(value[k]) || !value[k].every(object)),
    )
  )
    return false;
  if (records.some((k) => value[k] !== undefined && !object(value[k]))) return false;
  if (
    value.datasets !== undefined &&
    !(value.datasets as Record<string, unknown>[]).every(
      (d) =>
        typeof d.id === 'string' &&
        typeof d.name === 'string' &&
        typeof d.source === 'string' &&
        Array.isArray(d.rows) &&
        d.rows.every(
          (r) => object(r) && typeof r.district === 'string' && Number.isInteger(r.year),
        ),
    )
  )
    return false;
  if (
    value.thresholds !== undefined &&
    (!Array.isArray(value.thresholds) ||
      value.thresholds.length !== 3 ||
      !value.thresholds.every(
        (n, i, a) =>
          typeof n === 'number' && Number.isFinite(n) && n >= 0 && (i === 0 || n > a[i - 1]),
      ))
  )
    return false;
  for (const key of ['active', 'profile', 'layer'])
    if (value[key] !== undefined && typeof value[key] !== 'string') return false;
  return true;
}
export function readWorkspace<T extends object>(defaults: T, storage: Pick<Storage, 'getItem'>) {
  let raw: string | null;
  try {
    raw = storage.getItem(workspaceStorageKey);
  } catch {
    return { state: { ...defaults }, issue: 'unavailable' as StorageIssue, raw: null };
  }
  if (raw === null) return { state: { ...defaults }, issue: null as StorageIssue, raw: null };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!usableWorkspace(parsed)) throw Error('Invalid workspace structure');
    return { state: { ...defaults, ...parsed }, issue: null as StorageIssue, raw };
  } catch {
    return { state: { ...defaults }, issue: 'invalid' as StorageIssue, raw };
  }
}
export function saveWorkspace(value: object, storage: Pick<Storage, 'setItem'>): boolean {
  try {
    storage.setItem(workspaceStorageKey, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
