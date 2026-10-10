import { useLocation } from 'react-router-dom';
import { useStore } from './store';
import { download } from './analytics';
import './workspace-storage.css';
export default function WorkspaceStorageStatus() {
  const { storageIssue, storedBackup, storageRecoveryRequired, retryStorage, backupWorkspace } =
    useStore();
  const { pathname } = useLocation();
  const mainShell = !['/mobile', '/iot', '/aplikasi-desktop', '/smartwatch', '/presentation'].some(
    (path) => pathname === path || pathname.startsWith(path + '/'),
  );
  if (!storageIssue) return null;
  // Failed retries must retain the original recovery decision and backup.
  const recovery = storageRecoveryRequired;
  return (
    <section
      className={`workspace-storage-status ${mainShell ? 'workspace-storage-main' : ''}`}
      aria-label="Workspace storage status"
      role="alert"
    >
      <strong>
        {storageIssue === 'conflict'
          ? 'Workspace changed in another tab'
          : recovery
            ? 'Saved workspace needs recovery'
            : 'Workspace changes are not saved'}
      </strong>
      <p>
        {storageIssue === 'conflict'
          ? 'Automatic saving is paused to prevent overwriting another tab. Export this session, then choose which version to keep.'
          : recovery
            ? 'The saved workspace could not be read safely. Its original contents have not been overwritten. You can continue in this session and download a backup before replacing it.'
            : 'Browser storage is unavailable or full. Current changes remain in memory; export a backup before leaving or reloading.'}
      </p>
      <div>
        <button onClick={() => download('workspace-session-backup.json', backupWorkspace())}>
          Export current workspace
        </button>
        {storedBackup !== null && (
          <button
            onClick={() => {
              const url = URL.createObjectURL(new Blob([storedBackup], { type: 'text/plain' }));
              const a = document.createElement('a');
              a.href = url;
              a.download = 'workspace-original-backup.txt';
              a.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            }}
          >
            Download original saved workspace
          </button>
        )}
        {storageIssue === 'conflict' && (
          <button onClick={() => location.reload()}>Load latest saved workspace</button>
        )}
        <button onClick={retryStorage}>
          {storageIssue === 'conflict'
            ? 'Keep this session and replace saved version'
            : recovery
              ? 'Replace saved workspace with current session'
              : 'Retry saving workspace'}
        </button>
      </div>
    </section>
  );
}
