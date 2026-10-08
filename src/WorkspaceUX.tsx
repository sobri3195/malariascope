import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate, NavLink } from 'react-router-dom';
import { useStore } from './store';
import {
  riskModes,
  riskEvidence,
  calculateRisk,
  riskConfiguration,
  readRiskScenario,
  recordIdentity,
} from './risk-engine';
import { spatialRiskInputs } from './risk-spatial';
import { forecastModels } from './forecasting';
import { inspectScientificIntegrity } from './scientific-integrity';
import {
  captureWorkspaceSnapshot,
  restoreWorkspaceSnapshot,
  routeCommands,
  chordRoutes,
  textEntry,
  activityNotification,
} from './workspace-context';
import './workspace-ux.css';
const number = (n: number | null | undefined) =>
  n == null ? 'Unavailable' : n.toLocaleString('en-GB', { maximumFractionDigits: 3 });
const time = (s: string) =>
  new Date(s).toLocaleString('en-GB', { timeZone: 'Asia/Bangkok' }) + ' ICT';
const panels = [
  'Data Provenance',
  'Calculation Details',
  'Selected District',
  'Risk Explanation',
  'Model Metadata',
  'Data Quality',
  'Recent Activity',
  'Analytical Snapshots',
] as const;
export function Modal({
  label,
  children,
  onClose,
  side = false,
}: {
  label: string;
  children: ReactNode;
  onClose: () => void;
  side?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null),
    close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement,
      overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    (
      ref.current?.querySelector<HTMLElement>('input') ??
      ref.current?.querySelector<HTMLElement>('button,select')
    )?.focus();
    return () => {
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus();
      else document.getElementById('main')?.focus();
    };
  }, []);
  return (
    <div className="ux-backdrop no-print" onClick={() => close.current()}>
      <div
        ref={ref}
        className={side ? 'ux-inspector' : 'ux-command'}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            close.current();
          }
          if (e.key === 'Tab') {
            const nodes = [
              ...ref.current!.querySelectorAll<HTMLElement>(
                'button,input,select,a[href],textarea,[tabindex="0"]',
              ),
            ].filter((n) => !n.hasAttribute('disabled') && n.getClientRects().length);
            const first = nodes[0],
              last = nodes.at(-1);
            if (e.shiftKey && document.activeElement === first) {
              e.preventDefault();
              last?.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first?.focus();
            }
          }
        }}
      >
        {children}
      </div>
    </div>
  );
}
export function WorkspaceSkeleton({ label = 'Loading analytical workspace' }: { label?: string }) {
  return (
    <div className="ux-skeleton" role="status" aria-label={label}>
      <p>{label}…</p>
      <div />
      <div />
      <div />
    </div>
  );
}
export function SnapshotManager() {
  const { state, update, year, setYear, district, setDistrict, model, setModel, riskMode } =
    useStore();
  const route = useLocation(),
    navigate = useNavigate();
  const [name, setName] = useState('Analytical snapshot'),
    [message, setMessage] = useState('');
  return (
    <section className="ux-snapshot-manager">
      <h2>Analytical snapshots</h2>
      <p>Local view configuration, not a backup of source datasets or new scientific evidence.</p>
      <label>
        Snapshot name
        <input
          aria-label="Snapshot name"
          maxLength={100}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <button
        className="button primary"
        onClick={() => {
          const snapshot = captureWorkspaceSnapshot(
            state,
            { year, district, model, riskMode, view: route.pathname },
            name,
            crypto.randomUUID(),
            new Date().toISOString(),
          );
          update({ snapshots: [...state.snapshots, snapshot] }, 'Snapshot saved', snapshot.name);
          setMessage('Snapshot saved locally.');
        }}
      >
        Save snapshot
      </button>
      <p role="status">{message}</p>
      {state.snapshots.length === 0 && (
        <p>No snapshots yet. Save a view to return to its analytical context.</p>
      )}
      {state.snapshots.map((s) => (
        <article key={s.id} className="ux-snapshot">
          <label>
            Rename snapshot
            <input
              aria-label="Rename snapshot"
              value={s.name}
              maxLength={100}
              onChange={(e) =>
                update({
                  snapshots: state.snapshots.map((v) =>
                    v.id === s.id ? { ...v, name: e.target.value } : v,
                  ),
                })
              }
              onBlur={() => update({}, 'Snapshot renamed', s.name)}
            />
          </label>
          <p>
            {s.district} · {s.year} · {s.model} · {s.riskMode ?? 'Legacy observed risk'} ·{' '}
            {s.view ?? 'Legacy view'} · {time(s.date)}
          </p>
          <div className="ux-actions">
            <button
              className="button"
              aria-label={`Load snapshot ${s.name}`}
              onClick={() => {
                const result = restoreWorkspaceSnapshot(s, state);
                if ('error' in result) {
                  setMessage(result.error ?? 'Unable to restore snapshot.');
                  return;
                }
                setYear(result.year);
                setDistrict(result.district);
                setModel(result.model);
                update({ ...result.patch, riskMode: result.riskMode }, 'Snapshot loaded', s.name);
                const params = new URLSearchParams({
                  year: String(result.year),
                  district: result.district,
                  model: result.model,
                  riskMode: result.riskMode,
                  dataset: result.patch.active,
                });
                navigate(`${result.view}?${params}`);
                setMessage(result.warning ?? 'Snapshot restored.');
              }}
            >
              Load Snapshot
            </button>
            <button
              className="button"
              aria-label="Duplicate snapshot"
              onClick={() => {
                update(
                  {
                    snapshots: [
                      ...state.snapshots,
                      {
                        ...structuredClone(s),
                        id: crypto.randomUUID(),
                        name: s.name + ' copy',
                        date: new Date().toISOString(),
                      },
                    ],
                  },
                  'Snapshot duplicated',
                  s.name,
                );
                setMessage('Snapshot duplicated.');
              }}
            >
              Duplicate Snapshot
            </button>
            <button
              className="button"
              aria-label="Delete snapshot"
              onClick={() => {
                update(
                  { snapshots: state.snapshots.filter((v) => v.id !== s.id) },
                  'Snapshot deleted',
                  s.name,
                );
                setMessage('Snapshot deleted locally.');
              }}
            >
              Delete Snapshot
            </button>
          </div>
        </article>
      ))}
    </section>
  );
}
export default function WorkspaceUX({
  modules,
  models,
  provenance,
}: {
  modules: [string, string, any][];
  models: any[];
  provenance: Record<string, any>;
}) {
  const {
    state,
    update,
    year,
    setYear,
    district,
    setDistrict,
    model,
    setModel,
    riskMode,
    setRiskMode,
  } = useStore();
  const route = useLocation(),
    navigate = useNavigate();
  const [palette, setPalette] = useState(false),
    [query, setQuery] = useState(''),
    [active, setActive] = useState(0),
    [panel, setPanel] = useState<(typeof panels)[number] | null>(null);
  const [toasts, setToasts] = useState<{ id: string; title: string; details: string }[]>([]);
  const seen = useRef(new Set(state.audit.map((a) => a.time + ':' + a.event + ':' + a.details)));
  const years = [
    ...new Set([
      year,
      2020,
      2021,
      2022,
      2023,
      2024,
      2025,
      ...state.datasets.flatMap((d) => d.rows.map((r) => r.year)),
    ]),
  ]
    .filter((y) => Number.isInteger(y) && y >= 1900 && y <= 2100)
    .sort((a, b) => a - b);
  const districts = [
    ...new Set([district, ...state.datasets.flatMap((d) => d.rows.map((r) => r.district))]),
  ]
    .filter((d) => d !== 'All districts')
    .sort();
  useEffect(() => {
    let pending = 0;
    const listener = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPanel(null);
        setQuery('');
        setActive(0);
        setPalette((v) => !v);
        return;
      }
      if (
        textEntry(e.target) ||
        document.querySelector('[aria-modal="true"]') ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        e.repeat
      ) {
        pending = 0;
        return;
      }
      const key = e.key.toLowerCase();
      if (pending && Date.now() - pending < 1200 && chordRoutes[key]) {
        e.preventDefault();
        navigate('/' + chordRoutes[key]);
        pending = 0;
      } else pending = key === 'g' ? Date.now() : 0;
    };
    const open = () => {
      setPanel(null);
      setQuery('');
      setActive(0);
      setPalette(true);
    };
    document.addEventListener('keydown', listener);
    window.addEventListener('malariascope-command', open);
    return () => {
      document.removeEventListener('keydown', listener);
      window.removeEventListener('malariascope-command', open);
    };
  }, [navigate]);
  useEffect(() => {
    const additions = state.audit.filter(
      (a) => !seen.current.has(a.time + ':' + a.event + ':' + a.details),
    );
    for (const a of additions) seen.current.add(a.time + ':' + a.event + ':' + a.details);
    if (additions.length)
      setToasts((old) =>
        [
          ...additions.slice(0, 3).map((a) => ({
            id: a.time + ':' + a.event + ':' + a.details,
            title: activityNotification(a.event),
            details: a.details,
          })),
          ...old,
        ].slice(0, 4),
      );
  }, [state.audit]);
  useEffect(() => {
    if (!toasts.length) return;
    const timer = setTimeout(() => setToasts((old) => old.slice(0, -1)), 6000);
    return () => clearTimeout(timer);
  }, [toasts]);
  useEffect(() => {
    const listener = (e: Event) =>
      setToasts((old) =>
        [
          {
            id: crypto.randomUUID(),
            title: 'Workspace notice',
            details: String((e as CustomEvent).detail),
          },
          ...old,
        ].slice(0, 4),
      );
    window.addEventListener('malariascope-notice', listener);
    return () => window.removeEventListener('malariascope-notice', listener);
  }, []);
  useEffect(() => {
    const heading = document.querySelector<HTMLElement>('main h1');
    if (heading) {
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [route.pathname]);
  const actions = [
    ...routeCommands.map(([label, path]) => ({
      id: path,
      label,
      kind: 'Command',
      run: () => navigate('/' + path),
    })),
    ...modules
      .filter(([path]) => !routeCommands.some(([, p]) => p === path))
      .map(([path, label]) => ({
        id: 'view-' + path,
        label,
        kind: 'Module',
        run: () => navigate('/' + path),
      })),
    ...districts.map((d) => ({
      id: 'district-' + encodeURIComponent(d),
      label: d,
      kind: 'District',
      run: () => {
        setDistrict(d);
        navigate('/district-intelligence');
      },
    })),
    ...state.datasets.map((d) => ({
      id: 'dataset-' + d.id,
      label: d.name,
      kind: 'Dataset',
      run: () => {
        update({ active: d.id }, 'Dataset selected', d.name);
        navigate('/data-center');
      },
    })),
  ]
    .filter((a) => (a.label + ' ' + a.kind).toLowerCase().includes(query.toLowerCase()))
    .slice(0, 50);
  const selectionIndex = Math.min(active, Math.max(0, actions.length - 1));
  useEffect(() => {
    if (palette)
      document
        .getElementById('command-' + actions[selectionIndex]?.id)
        ?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
  }, [palette, selectionIndex, query]);
  const execute = (index: number) => {
    actions[index]?.run();
    setPalette(false);
  };
  const name = modules.find(([path]) => '/' + path === route.pathname)?.[1] ?? 'Workspace';
  return (
    <>
      <section className="ux-context no-print" aria-label="Global analytical context">
        <div className="ux-context-grid">
          <label>
            YEAR
            <select
              aria-label="Context year"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            >
              {years.map((y) => (
                <option key={y}>{y}</option>
              ))}
            </select>
          </label>
          <label>
            DISTRICT
            <select
              aria-label="Context district"
              value={district}
              onChange={(e) => setDistrict(e.target.value)}
            >
              <option>All districts</option>
              {districts.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </label>
          <label>
            RISK MODE
            <select
              aria-label="Context risk configuration"
              value={riskMode}
              onChange={(e) => setRiskMode(e.target.value as typeof riskMode)}
            >
              {riskModes.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </label>
          <label>
            MODEL
            <select
              aria-label="Context model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
            >
              {forecastModels.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </label>
          <label>
            DATASET
            <select
              aria-label="Context dataset"
              value={state.active}
              onChange={(e) =>
                update(
                  { active: e.target.value },
                  'Dataset selected',
                  state.datasets.find((d) => d.id === e.target.value)?.name ?? 'No primary dataset',
                )
              }
            >
              <option value="">No primary dataset</option>
              {state.datasets.map((d) => (
                <option value={d.id} key={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="ux-context-footer">
          <nav aria-label="Contextual breadcrumbs">
            <NavLink to="/dashboard">Workspace</NavLink>
            <span>
              {' '}
              / {name} / {year} / {district}
            </span>
          </nav>
          <div className="ux-actions">
            <button
              onClick={() => {
                setPalette(false);
                setPanel('Data Provenance');
              }}
            >
              Inspector
            </button>
            <button
              onClick={() => {
                setPalette(false);
                setPanel('Recent Activity');
              }}
            >
              Recent Activity
            </button>
            <button
              onClick={() => {
                setPalette(false);
                setPanel('Analytical Snapshots');
              }}
            >
              Snapshots
            </button>
            <button onClick={() => window.dispatchEvent(new Event('malariascope-command'))}>
              Commands <kbd>Ctrl/⌘ K</kbd>
            </button>
          </div>
        </div>
        <p className="ux-scope-note">
          Shared context. Dataset selects the primary source; compatible joins are labeled in each
          module. Risk calculations use the selected risk mode; observed burden, model validation,
          readiness and exploratory scenarios retain their explicitly stated scientific basis.
        </p>
      </section>
      <div
        className="ux-notifications no-print"
        aria-live="polite"
        aria-label="Workspace notifications"
      >
        {toasts.map((t) => (
          <div className="ux-toast" key={t.id}>
            <div>
              <strong>{t.title}</strong>
              <p>{t.details}</p>
            </div>
            <button
              aria-label={`Dismiss ${t.title}`}
              onClick={() => setToasts(toasts.filter((v) => v.id !== t.id))}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      {palette && (
        <Modal label="Command palette" onClose={() => setPalette(false)}>
          <header>
            <h2>Command palette</h2>
            <button aria-label="Close command palette" onClick={() => setPalette(false)}>
              ×
            </button>
          </header>
          <input
            autoFocus
            aria-label="Command search"
            aria-controls="workspace-command-results"
            aria-activedescendant={
              actions.length ? 'command-' + actions[selectionIndex].id : undefined
            }
            placeholder="Commands, districts, datasets…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (['ArrowDown', 'ArrowUp'].includes(e.key)) {
                e.preventDefault();
                setActive(
                  actions.length
                    ? (selectionIndex + (e.key === 'ArrowDown' ? 1 : -1) + actions.length) %
                        actions.length
                    : 0,
                );
              }
              if (e.key === 'Enter') {
                e.preventDefault();
                execute(selectionIndex);
              }
            }}
          />
          <div role="listbox" id="workspace-command-results" aria-label="Workspace commands">
            {actions.map((a, i) => (
              <button
                role="option"
                id={'command-' + a.id}
                aria-selected={i === selectionIndex}
                key={a.id}
                onClick={() => execute(i)}
              >
                <span>{a.label}</span>
                <small>{a.kind}</small>
              </button>
            ))}
            {!actions.length && (
              <p>
                No matching command, district or dataset. Try a module name or clear your search.
              </p>
            )}
          </div>
          <p>
            ↑ ↓ to select · Enter to open · Escape to close. Navigation: G then D / M / A / F / R
            outside text fields.
          </p>
        </Modal>
      )}
      {panel && (
        <Modal side label="Universal side inspector" onClose={() => setPanel(null)}>
          <header>
            <h2>Workspace inspector</h2>
            <button aria-label="Close inspector" onClick={() => setPanel(null)}>
              ×
            </button>
          </header>
          <label>
            Inspector panel
            <select
              aria-label="Inspector panel"
              value={panel}
              onChange={(e) => setPanel(e.target.value as (typeof panels)[number])}
            >
              {panels.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
          <p>
            {district} · {year} · {model} · {riskMode}
          </p>
          {panel === 'Analytical Snapshots' ? (
            <SnapshotManager />
          ) : panel === 'Recent Activity' ? (
            <section>
              <h2>Recent Activity</h2>
              {!state.audit.length && <p>No local activity recorded yet.</p>}
              <ol className="ux-activity">
                {state.audit.slice(0, 40).map((a, i) => (
                  <li key={i}>
                    <strong>{a.event}</strong>
                    <p>{a.details}</p>
                    <time dateTime={a.time}>{time(a.time)}</time>
                  </li>
                ))}
              </ol>
            </section>
          ) : (
            <EvidenceInspector panel={panel} models={models} provenance={provenance} />
          )}
        </Modal>
      )}
    </>
  );
}
function EvidenceInspector({
  panel,
  models,
  provenance,
}: {
  panel: (typeof panels)[number];
  models: any[];
  provenance: Record<string, any>;
}) {
  const { state, year, district, model, riskMode, update } = useStore();
  const evidence = useMemo(
    () => riskEvidence(state.datasets, state.active, model, year),
    [state.datasets, state.active, model, year],
  );
  const record = evidence.records.find((r) => r.district === district);
  const calculation = useMemo(() => {
    if (!record) return null;
    const config = riskConfiguration(readRiskScenario(state.riskScenario));
    const spatial =
      riskMode === 'SPATIAL RISK' || riskMode === 'COMPOSITE RESEARCH RISK'
        ? spatialRiskInputs(state.geometry, evidence.records)
        : {};
    return calculateRisk(record, riskMode, config, spatial[recordIdentity(record)]);
  }, [record, state.riskScenario, state.geometry, evidence.records, riskMode]);
  const quality = useMemo(
    () =>
      panel === 'Data Quality'
        ? inspectScientificIntegrity(state.datasets, state.geometry, {
            year,
            model,
            now: new Date().toISOString(),
          })
        : [],
    [panel, state.datasets, state.geometry, year, model],
  );
  if (panel === 'Data Provenance')
    return (
      <section>
        <h2>Data Provenance</h2>
        {state.datasets.map((d) => (
          <article key={d.id}>
            <h3>
              {d.name}
              {d.id === state.active ? ' · active source' : ''}
            </h3>
            <dl>
              <dt>Source</dt>
              <dd>{d.source}</dd>
              <dt>Verification</dt>
              <dd>{d.classification ?? 'USER IMPORT'}</dd>
              <dt>Checksum</dt>
              <dd>{d.checksum}</dd>
              <dt>Registered</dt>
              <dd>{time(d.created)}</dd>
              <dt>Loaded rows</dt>
              <dd>{d.rows.length}</dd>
            </dl>
          </article>
        ))}
        {state.geometrySource && (
          <article>
            <h3>Administrative geometry</h3>
            <p>
              {state.geometrySource.name} · {state.geometrySource.classification}
            </p>
            <p>Checksum: {state.geometrySource.checksum}</p>
            <p>Registered {time(state.geometrySource.created)}</p>
          </article>
        )}
        {!state.datasets.length && (
          <p>
            No district dataset connected. Supplied study outputs are separate, independently
            unverified aggregates.
          </p>
        )}
        <details>
          <summary>Supplied study provenance</summary>
          {Object.entries(provenance ?? {}).map(([file, p]) => (
            <p key={file}>
              <strong>{file}</strong> · {p.source} · {p.classification} · {p.sha256}
            </p>
          ))}
        </details>
      </section>
    );
  if (panel === 'Model Metadata')
    return (
      <section>
        <h2>Model Metadata</h2>
        <p>
          {evidence.records.filter((r) => r.values.prediction !== null).length} compatible loaded
          district predictions in the selected year.
        </p>
        <p>
          {model} · {year}. No trained inference artifact, hyperparameter registry, or independent
          validation-design record is connected. Loaded predictions are not new forecasts.
        </p>
        {models
          .filter((m) => m.model === model && m.year === year)
          .map((m, i) => (
            <article key={i}>
              <h3>Separate supplied study metrics — not independently verified</h3>
              <p>
                MAE: {number(m.mae)} · RMSE: {number(m.rmse)} · R²: {number(m.r2)}
              </p>
            </article>
          ))}
      </section>
    );
  if (panel === 'Data Quality')
    return (
      <section>
        <h2>Data Quality</h2>
        <p>
          Whole-registry audit. Global district and year filters do not remove original source rows
          from quality-score denominators.
        </p>
        {!quality.length && <p>No loaded dataset to validate.</p>}
        {quality.map((q) => (
          <article key={q.dataset.id}>
            <h3>{q.dataset.name}</h3>
            <p>
              {q.status} · score {number(q.score)} / 100 · {q.rowCount} audited source rows ·{' '}
              {q.issues.length} issues.
            </p>
            <p>{q.scoreFormula}</p>
            {q.scoreComponents.map((c) => (
              <p key={c.name}>
                {c.name}: {c.numerator}/{c.denominator} × {c.weight} = {number(c.contribution)}
              </p>
            ))}
            {q.eligibility.map((e) => (
              <p key={e.analysis}>
                {e.analysis}: {e.eligible ? 'YES' : 'NO'} · {e.reasons.join('; ')}
              </p>
            ))}
          </article>
        ))}
        <button
          disabled={!quality.length}
          className="button"
          onClick={() =>
            update(
              {},
              'Validation completed',
              `${quality.length} dataset(s) inspected; ${quality.reduce((sum, q) => sum + q.issues.length, 0)} issue(s), none hidden`,
            )
          }
        >
          Record validation review
        </button>
      </section>
    );
  if (!record || !calculation)
    return (
      <section>
        <h2>{panel}</h2>
        <p>
          Select a district with connected evidence to inspect its calculation. Missing evidence is
          never replaced with an invented result.
        </p>
      </section>
    );
  return (
    <section>
      <h2>{panel}</h2>
      {calculation.configuration.experimental && (
        <p className="notice amber-notice">
          EXPERIMENTAL RISK CONFIGURATION — NOT VERIFIED RESEARCH OUTPUT.
        </p>
      )}
      <p>
        {record.district} · {record.year} · {calculation.mode}
      </p>
      {panel === 'Selected District' ? (
        <dl>
          {Object.entries(record.values).map(([key, value]) => (
            <div key={key}>
              <dt>{key}</dt>
              <dd>{number(value)}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <>
          <p>
            <strong>
              {calculation.category} · score {number(calculation.score)}
            </strong>
          </p>
          <p>{calculation.formula}</p>
          <p>{calculation.normalization}</p>
          <p>Classification threshold: {calculation.classificationThreshold}</p>
          {calculation.components.map((c) => (
            <p key={c.id}>
              {c.label}: value {number(c.value)} · weight {number(c.weight)} · contribution{' '}
              {number(c.contribution)}
            </p>
          ))}
          {calculation.reasons.map((r, i) => (
            <p key={i}>{r}</p>
          ))}
        </>
      )}
      <p>{calculation.dataVerification}</p>
      {calculation.references.map((r, i) => (
        <p key={i}>
          {r.dataset} · {r.field}: {r.value} · {r.year} · {r.classification} · {r.checksum}
        </p>
      ))}
    </section>
  );
}
