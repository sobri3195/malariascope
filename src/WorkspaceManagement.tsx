import OfflineReadiness from './OfflineReadiness';
import { useEffect, useState } from 'react';
import { useStore } from './store';
import { download } from './analytics';
import {
  captureBackup,
  validateBackup,
  restoreBackup,
  resetWorkspace,
  type Backup,
} from './workspace-backup';
export default function WorkspaceManagement() {
  const { backupWorkspace } = useStore();
  const [pending, setPending] = useState<Backup | null>(null),
    [error, setError] = useState(''),
    [scope, setScope] = useState<'workspace' | 'iot' | 'prospective' | 'all'>('workspace'),
    [confirmed, setConfirmed] = useState(false);
  const [conflict, setConflict] = useState(false);
  useEffect(() => {
    const changed = (e: StorageEvent) => {
      if (e.key === 'malariascope-v1') setConflict(true);
    };
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  }, []);
  const run = (fn: () => void) => {
    try {
      fn();
      setError('');
    } catch (e) {
      setError(String(e));
    }
  };
  return (
    <>
      <OfflineReadiness />
      <section className="panel" aria-label="Workspace backup and recovery">
        <h2>Workspace backup & recovery</h2>
        {conflict && (
          <p role="alert">
            Another tab changed this workspace. Export this tab before reconciling.{' '}
            <button className="button" onClick={() => location.reload()}>
              Load latest saved version
            </button>
          </p>
        )}
        <p>
          One versioned backup includes shared evidence, registry, IoT, workstation settings, report
          archive, reviews, model artifacts and rule drafts. Browser-local records are not
          independently verified.
        </p>
        <div className="toolbar">
          <button
            className="button"
            onClick={() =>
              run(() =>
                download(
                  'malariascope-complete-backup.json',
                  captureBackup(backupWorkspace(), localStorage),
                ),
              )
            }
          >
            Export complete backup
          </button>
          <label className="button">
            Inspect backup
            <input
              aria-label="Inspect workspace backup"
              type="file"
              accept=".json"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f)
                  void f
                    .text()
                    .then((t) =>
                      run(() => {
                        const b: unknown = JSON.parse(t);
                        validateBackup(b);
                        setPending(b);
                        setConfirmed(false);
                      }),
                    )
                    .catch((e) => setError(String(e)));
              }}
            />
          </label>
        </div>
        {pending && (
          <div>
            <h3>Restore preview</h3>
            <p>
              {pending.created} · {Object.keys(pending.companions).length} companion stores ·{' '}
              {Object.keys(pending.drafts).length} drafts ·{' '}
              {Array.isArray(pending.workspace.datasets) ? pending.workspace.datasets.length : 0}{' '}
              datasets.
            </p>
            <p>
              Restoring replaces application data in this browser. Export the current workspace
              first.
            </p>
            <label>
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              I have reviewed this replacement.
            </label>
            <button
              className="button"
              disabled={!confirmed}
              onClick={() =>
                run(() => {
                  restoreBackup(pending, localStorage);
                  location.assign(location.pathname);
                })
              }
            >
              Restore complete backup
            </button>
            <button className="button" onClick={() => setPending(null)}>
              Cancel restore
            </button>
          </div>
        )}
        <details>
          <summary>Scoped reset</summary>
          <label>
            Reset scope
            <select value={scope} onChange={(e) => setScope(e.target.value as typeof scope)}>
              <option value="workspace">Primary workspace only</option>
              <option value="iot">IoT only</option>
              <option value="prospective">Prospective registry only</option>
              <option value="all">All application stores and drafts</option>
            </select>
          </label>
          <button
            className="button"
            onClick={() => {
              if (window.confirm(`Reset ${scope} data? Export a backup first.`))
                run(() => {
                  resetWorkspace(localStorage, scope);
                  location.assign(location.pathname);
                });
            }}
          >
            Reset selected scope
          </button>
        </details>
        {error && <p role="alert">{error}</p>}
      </section>
    </>
  );
}
