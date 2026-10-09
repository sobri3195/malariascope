import { validArchivedReport } from './report-archive-validation.ts';
import { usableWorkspace, workspaceStorageKey } from './workspace-storage.ts';
export const backupSchema = 'malariascope-workspace-backup-v2';
export const companionKeys = [
  'malariascope-prospective',
  'malariascope-iot-data',
  'malariascope-iot-settings',
  'malariascope-iot-alerts',
  'malariascope-desktop-layout',
  'malariascope-desktop-view',
  'malariascope-watch-screen',
  'malariascope-report-archive',
  'malariascope-evidence-review',
  'malariascope-model-artifacts',
  'malariascope-resource-evidence',
  'malariascope-boundary-crosswalk',
  'malariascope-periodic-surveillance',
] as const;
export type Backup = {
  schema: typeof backupSchema;
  created: string;
  workspace: Record<string, unknown>;
  companions: Record<string, string>;
  drafts: Record<string, string>;
};
export function captureBackup(workspace: object, storage: Storage): Backup {
  const companions: Record<string, string> = {},
    drafts: Record<string, string> = {};
  for (const key of companionKeys) {
    const value = storage.getItem(key);
    if (value !== null) companions[key] = value;
  }
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key?.startsWith('malariascope-rule-draft:')) drafts[key] = storage.getItem(key)!;
  }
  return {
    schema: backupSchema,
    created: new Date().toISOString(),
    workspace: structuredClone(workspace) as Record<string, unknown>,
    companions,
    drafts,
  };
}
export function validateBackup(value: unknown): asserts value is Backup {
  const b = value as Backup;
  if (
    !b ||
    b.schema !== backupSchema ||
    !Number.isFinite(Date.parse(b.created)) ||
    !usableWorkspace(b.workspace) ||
    !b.companions ||
    !b.drafts
  )
    throw Error('Unsupported or invalid workspace backup.');
  for (const [key, raw] of Object.entries({ ...b.companions, ...b.drafts })) {
    if (
      typeof raw !== 'string' ||
      (!companionKeys.includes(key as (typeof companionKeys)[number]) &&
        !key.startsWith('malariascope-rule-draft:'))
    )
      throw Error('Backup contains unsupported storage keys.');
    if (key.endsWith('-view') || key.endsWith('-screen')) continue;
    const data: unknown = JSON.parse(raw);
    if (data === null || typeof data !== 'object') throw Error(`Invalid companion data: ${key}`);
    if (
      key === 'malariascope-prospective' &&
      (!Array.isArray(data) ||
        data.some(
          (r) =>
            !r ||
            typeof r.forecast_id !== 'string' ||
            typeof r.model !== 'string' ||
            !Number.isFinite(r.prediction),
        ))
    )
      throw Error('Invalid prospective registry.');
    if (
      key === 'malariascope-report-archive' &&
      (!Array.isArray(data) ||
        data.some(
          (r) =>
            !r ||
            typeof r.id !== 'string' ||
            typeof r.saved !== 'string' ||
            !validArchivedReport(r.report),
        ))
    )
      throw Error('Invalid report archive.');
    if (
      key === 'malariascope-iot-data' &&
      (!Array.isArray((data as any).sensors) || !Array.isArray((data as any).readings))
    )
      throw Error('Invalid IoT backup.');
  }
}
export function restoreBackup(backup: unknown, storage: Storage) {
  validateBackup(backup);
  const keys = [workspaceStorageKey, ...companionKeys, ...Object.keys(backup.drafts)];
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (k?.startsWith('malariascope-rule-draft:') && !keys.includes(k)) keys.push(k);
  }
  const original = new Map(keys.map((k) => [k, storage.getItem(k)]));
  try {
    storage.setItem(workspaceStorageKey, JSON.stringify(backup.workspace));
    for (const key of keys.filter((k) => k !== workspaceStorageKey)) {
      const raw = backup.companions[key] ?? backup.drafts[key];
      if (raw === undefined) storage.removeItem(key);
      else storage.setItem(key, raw);
    }
  } catch {
    let rollbackFailed = false;
    for (const [key, raw] of original)
      try {
        if (raw === null) storage.removeItem(key);
        else storage.setItem(key, raw);
      } catch {
        rollbackFailed = true;
      }
    throw Error(
      rollbackFailed
        ? 'Restore failed and rollback could not finish. Preserve your exported backup.'
        : 'Restore failed; original workspace restored. Check browser storage capacity.',
    );
  }
}
export function resetWorkspace(
  storage: Storage,
  scope: 'workspace' | 'iot' | 'prospective' | 'all',
) {
  const keys =
    scope === 'all'
      ? [workspaceStorageKey, ...companionKeys]
      : scope === 'workspace'
        ? [workspaceStorageKey]
        : scope === 'prospective'
          ? ['malariascope-prospective']
          : companionKeys.filter((k) => k.startsWith('malariascope-iot-'));
  if (scope === 'all')
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k?.startsWith('malariascope-rule-draft:')) keys.push(k as (typeof keys)[number]);
    }
  keys.forEach((k) => storage.removeItem(k));
}
