import { captureBackup, backupSchema } from './workspace-backup';
import { useState } from 'react';
import { useStore } from './store';
import { usableWorkspace } from './workspace-storage';
import { download } from './analytics';
export default function ServiceConnection() {
  const { backupWorkspace } = useStore();
  const [status, setStatus] = useState('Not connected'),
    [user, setUser] = useState(''),
    [password, setPassword] = useState(''),
    [csrf, setCsrf] = useState(''),
    [revision, setRevision] = useState<number | null>(null),
    [remote, setRemote] = useState<Record<string, unknown> | null>(null),
    [log, setLog] = useState<unknown>(null);
  async function request(path: string, method = 'GET', body?: object) {
    const r = await fetch('/api/' + path, {
      method,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!r.ok)
      throw Error(
        r.status === 409
          ? 'Workspace changed remotely. Inspect latest revision before retrying.'
          : `Service request failed (${r.status}). Check optional service setup and sign-in.`,
      );
    return r.json();
  }
  const run = (fn: () => Promise<void>) => void fn().catch((e) => setStatus(String(e)));
  return (
    <section className="panel">
      <h2>Authenticated shared workspace service</h2>
      <p>
        The optional Python service supplies authenticated roles, revision conflicts, server audit,
        scheduled analytical evaluation and a notification outbox. It requires a same-origin service
        deployment; the static site alone cannot provide these capabilities.
      </p>
      <button
        className="button"
        onClick={() =>
          run(async () => {
            const h = await request('health');
            if (h.service !== 'malariascope-research-service')
              throw Error('Research service not connected');
            setStatus('Service available');
          })
        }
      >
        Check service health
      </button>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(async () => {
            const r = await request('login', 'POST', { username: user, password });
            setCsrf(r.csrf);
            setPassword('');
            setStatus(`Signed in: ${r.user} · ${r.role}`);
          });
        }}
      >
        <label>
          Username
          <input autoComplete="username" value={user} onChange={(e) => setUser(e.target.value)} />
        </label>
        <label>
          Password
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <button className="button">Sign in to service</button>
      </form>
      <p role="status">{status}</p>
      {csrf && (
        <>
          <button
            className="button"
            onClick={() =>
              run(async () => {
                const r = await request('workspace');
                setRevision(r.revision);
                setRemote(r.workspace);
                setStatus(`Remote revision ${r.revision} inspected`);
              })
            }
          >
            Inspect shared workspace
          </button>
          <button
            className="button"
            disabled={revision === null}
            onClick={() =>
              run(async () => {
                const r = await request('workspace', 'PUT', {
                  expectedRevision: revision,
                  workspace: {
                    ...backupWorkspace(),
                    __completeBackup: captureBackup(backupWorkspace(), localStorage),
                  },
                });
                setRevision(r.revision);
                setStatus(`Saved shared revision ${r.revision}`);
              })
            }
          >
            Save local workspace to inspected revision
          </button>
          <button
            className="button"
            disabled={!remote}
            onClick={() => {
              if (remote && usableWorkspace(remote))
                download(
                  'shared-workspace-backup.json',
                  remote.__completeBackup || {
                    schema: backupSchema,
                    created: new Date().toISOString(),
                    workspace: remote,
                    companions: {},
                    drafts: {},
                  },
                );
              else setStatus('Remote workspace schema invalid');
            }}
          >
            Export remote workspace
          </button>
          <label>
            Upload scheduled analytical job
            <input
              aria-label="Upload scheduled analytical job"
              type="file"
              accept=".json"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file)
                  run(async () => {
                    const job = JSON.parse(await file.text());
                    await request('jobs', 'POST', job);
                    setStatus(
                      'Scheduled job saved. Run the scheduler service to evaluate and queue notifications.',
                    );
                  });
              }}
            />
          </label>
          <button
            className="button"
            onClick={() =>
              run(async () => {
                setLog(await request('forecasts'));
              })
            }
          >
            Inspect server forecast registry
          </button>
          <label>
            Register future forecast on server
            <input
              aria-label="Register future forecast on server"
              type="file"
              accept=".json"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file)
                  run(async () => {
                    const record = JSON.parse(await file.text());
                    setLog(await request('forecasts', 'POST', record));
                    setStatus('Server-timestamped future forecast registered.');
                  });
              }}
            />
          </label>
          <button
            className="button"
            onClick={() =>
              run(async () => {
                setLog(await request('revisions'));
              })
            }
          >
            Inspect workspace revisions
          </button>
          <button
            className="button"
            onClick={() =>
              run(async () => {
                setLog(await request('audit'));
              })
            }
          >
            Inspect server audit
          </button>
          <button
            className="button"
            onClick={() =>
              run(async () => {
                setLog(await request('notifications'));
              })
            }
          >
            Inspect notification outbox
          </button>
          <button
            className="button"
            onClick={() =>
              run(async () => {
                await request('logout', 'POST');
                setCsrf('');
                setStatus('Signed out');
              })
            }
          >
            Sign out
          </button>
        </>
      )}
      {log !== null && (
        <details open>
          <summary>Server records</summary>
          <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
            {JSON.stringify(log, null, 2)}
          </pre>
        </details>
      )}
      <p>
        External email, push and webhook delivery must be configured and enabled by an authorized
        administrator. No messages are sent by opening this workspace.
      </p>
    </section>
  );
}
