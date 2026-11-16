import { parseAggregates } from './indonesia/aggregate-data.ts';
import { parseViews } from './indonesia/snapshot-data.ts';
import { parseProspective } from './prospective-storage.ts';
import { validArchivedReport } from './report-archive-validation.ts';
import { usableWorkspace, workspaceStorageKey } from './workspace-storage.ts';
export const backupSchema = 'malariascope-workspace-backup-v2';
export const companionKeys = [
  'malariascope-indonesia-aggregate-v1',
  'malariascope-skdr-views-v1',
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
const regionalKeys = ['malariascope-indonesia-aggregate-v1', 'malariascope-skdr-views-v1'];
export const recoveryKey = (key: string) =>
  [...regionalKeys, 'malariascope-prospective'].some((base) => key.startsWith(base + '.recovery.'));
export type Backup = {
  schema: typeof backupSchema;
  created: string;
  workspace: Record<string, unknown>;
  companions: Record<string, string>;
  drafts: Record<string, string>;
  includedKeys?: string[];
  recoveries?: Record<string, string>;
};
export function captureBackup(workspace: object, storage: Storage): Backup {
  const companions: Record<string, string> = {},
    drafts: Record<string, string> = {},
    recoveries: Record<string, string> = {};
  for (const key of companionKeys) {
    const value = storage.getItem(key);
    if (value !== null) companions[key] = value;
  }
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key?.startsWith('malariascope-rule-draft:')) drafts[key] = storage.getItem(key)!;
    if (key && recoveryKey(key)) recoveries[key] = storage.getItem(key)!;
  }
  return {
    schema: backupSchema,
    created: new Date().toISOString(),
    workspace: structuredClone(workspace) as Record<string, unknown>,
    companions,
    drafts,
    includedKeys: [...companionKeys],
    recoveries,
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
  if (
    b.includedKeys !== undefined &&
    (!Array.isArray(b.includedKeys) ||
      new Set(b.includedKeys).size !== b.includedKeys.length ||
      b.includedKeys.some((k) => !companionKeys.includes(k as (typeof companionKeys)[number])))
  )
    throw Error('Invalid backup key scope.');
  if (
    b.recoveries !== undefined &&
    (!b.recoveries ||
      typeof b.recoveries !== 'object' ||
      Array.isArray(b.recoveries) ||
      Object.entries(b.recoveries).some(([k, v]) => !recoveryKey(k) || typeof v !== 'string'))
  )
    throw Error('Invalid recovery archives.');
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
    if (key === 'malariascope-prospective') parseProspective(data);
    if (key === 'malariascope-indonesia-aggregate-v1') parseAggregates(data);
    if (key === 'malariascope-skdr-views-v1') parseViews(data);
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
  // Older v2 backups did not know regional stores; absence must not erase newer data.
  const scope = backup.includedKeys ?? companionKeys.filter((k) => !regionalKeys.includes(k));
  const keys = [
    ...new Set([
      workspaceStorageKey,
      ...scope,
      ...Object.keys(backup.companions),
      ...Object.keys(backup.drafts),
      ...Object.keys(backup.recoveries ?? {}),
    ]),
  ];
  for (const [key, raw] of Object.entries(backup.recoveries ?? {})) {
    const existing = storage.getItem(key);
    if (existing !== null && existing !== raw)
      throw Error('Recovery archive conflict; export current data first.');
  }
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (k?.startsWith('malariascope-rule-draft:') && !keys.includes(k)) keys.push(k);
  }
  const original = new Map(keys.map((k) => [k, storage.getItem(k)]));
  try {
    storage.setItem(workspaceStorageKey, JSON.stringify(backup.workspace));
    for (const key of keys.filter((k) => k !== workspaceStorageKey)) {
      const raw = backup.companions[key] ?? backup.drafts[key] ?? backup.recoveries?.[key];
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
      if (k && (k.startsWith('malariascope-rule-draft:') || recoveryKey(k)))
        keys.push(k as (typeof keys)[number]);
    }
  keys.forEach((k) => storage.removeItem(k));
}
