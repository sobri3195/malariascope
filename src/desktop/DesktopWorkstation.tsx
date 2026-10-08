import AnalyticalDemoControls from '../AnalyticalDemoControls';
import BrandMark from '../BrandMark';
import { useMemo, useState, useEffect, Suspense } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { desktopViews as views } from '../DesktopApp';
import { useStore } from '../store';
import { aggregateEvidence, buildDistrict360 } from '../district-intelligence';
import { assessDistrictReadiness, readinessChecklistKey } from '../readiness-engine';
import { adjacencyGraph, hotspotContext } from '../hotspot-spatial';
import { riskModes } from '../risk-engine';
import { studyModels } from '../research-data/research';
import { ResearchForecastScience, SourceLedger } from '../research-data/EvidencePanels';
import { SnapshotManager, Modal } from '../WorkspaceUX';
import { textEntry } from '../workspace-context';
import './desktop.css';
const navigation = [
  ['COMMAND', 'Dashboard', 'GIS', 'District', 'Alerts'],
  ['ANALYTICS', 'Surveillance', 'Climate', 'Forecasting', 'Model Laboratory', 'Spatial', 'Risk'],
  ['READINESS', 'Readiness', 'Scenario'],
  ['DATA', 'Data Center', 'Integrity', 'Provenance'],
  ['OUTPUT', 'Reports', 'Presentation'],
  ['SYSTEM', 'Activity', 'Settings'],
] as const;
const presets = ['GIS', 'Surveillance', 'Forecasting', 'Risk', 'Integrity', 'Presentation'];
export default function DesktopWorkstation() {
  const store = useStore(),
    {
      state,
      research,
      rows,
      year,
      setYear,
      district,
      setDistrict,
      model,
      setModel,
      riskMode,
      setRiskMode,
      update,
    } = store;
  const location = useLocation(),
    navigate = useNavigate();
  const [layout, setLayout] = useState(() => {
    try {
      return (
        JSON.parse(localStorage.getItem('malariascope-desktop-layout') || 'null') || {
          left: true,
          right: true,
          filters: true,
          extra: true,
          max: false,
        }
      );
    } catch {
      return { left: true, right: true, filters: true, extra: true, max: false };
    }
  });
  const [palette, setPalette] = useState(false),
    [search, setSearch] = useState(''),
    [tab, setTab] = useState('OVERVIEW'),
    [compare, setCompare] = useState(false),
    [other, setOther] = useState(''),
    [yearB, setYearB] = useState(2024),
    [modelB, setModelB] = useState('Persistence');
  const view =
    new URLSearchParams(location.search).get('view') ||
    localStorage.getItem('malariascope-desktop-view') ||
    'Dashboard';
  const go = (name: string) => {
    const q = new URLSearchParams(location.search);
    q.set('view', name);
    navigate({ pathname: '/aplikasi-desktop', search: q.toString() });
    try {
      localStorage.setItem('malariascope-desktop-view', name);
    } catch {
      /* Session remains usable */
    }
    setPalette(false);
  };
  useEffect(() => {
    try {
      localStorage.setItem('malariascope-desktop-layout', JSON.stringify(layout));
    } catch {}
  }, [layout]);
  useEffect(() => {
    let pending = false;
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPalette(false);
        setLayout((v: typeof layout) => ({ ...v, max: false }));
        return;
      }
      if (textEntry(e.target)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPalette((v) => !v);
      }
      if (e.key === 'Escape') {
        setPalette(false);
        setLayout((v: typeof layout) => ({ ...v, max: false }));
      }
      if (pending) {
        const name = (
          { d: 'Dashboard', m: 'GIS', f: 'Forecasting', a: 'Alerts', r: 'Reports' } as Record<
            string,
            string
          >
        )[e.key.toLowerCase()];
        if (name) {
          e.preventDefault();
          go(name);
        }
        pending = false;
      } else if (!e.ctrlKey && !e.metaKey && e.key.toLowerCase() === 'g') pending = true;
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [location.search]);
  const joined = useMemo(
    () => aggregateEvidence(state.datasets, state.active, model),
    [state.datasets, state.active, model],
  );
  const info = useMemo(
    () =>
      buildDistrict360(
        joined.records,
        district,
        year,
        state.thresholds,
        state.rules,
        state.alertStates,
      ),
    [joined, district, year, state.thresholds, state.rules, state.alertStates],
  );
  const readiness = useMemo(
    () =>
      assessDistrictReadiness({
        district,
        year,
        current: info.current,
        previous: info.history.find((r) => r.year === year - 1),
        checklist: state.districtChecklists?.[readinessChecklistKey(district, year)],
        thresholds: state.thresholds,
      }),
    [district, year, info, state.districtChecklists, state.thresholds],
  );
  const spatialContext = useMemo(() => {
    const features = state.geometry?.features || [];
    return hotspotContext(
      features,
      adjacencyGraph(features),
      rows,
      year,
      district,
      state.thresholds,
    );
  }, [state.geometry, rows, year, district, state.thresholds]);
  const [storageReady] = useState(() => {
    try {
      localStorage.setItem('malariascope-desktop-check', '1');
      localStorage.removeItem('malariascope-desktop-check');
      return true;
    } catch {
      return false;
    }
  });
  const districts = [...new Set(joined.records.map((r) => r.district))].sort();
  const summary = research
    ? {
        annual: [2020, 2021, 2022, 2023, 2024, 2025].map((y) => ({
          year: y,
          cases: research.balanced.filter((r) => r.year === y).reduce((s, r) => s + r.cases, 0),
        })),
      }
    : { annual: [] };
  const models = research?.performance || [],
    spatial = research?.spatialResult || {};
  const content = () => {
    switch (view) {
      case 'GIS':
        return <views.GIS />;
      case 'District':
        return <views.District summary={summary} />;
      case 'Surveillance':
        return <views.Surveillance />;
      case 'Climate':
        return <views.Climate />;
      case 'Forecasting':
      case 'Model Laboratory':
        return (
          <>
            <ResearchForecastScience />
            <views.Models models={models} />
          </>
        );
      case 'Spatial':
        return <views.Spatial spatial={spatial} />;
      case 'Risk':
        return <views.Risk />;
      case 'Readiness':
        return <views.ForceHealth />;
      case 'Scenario':
        return <views.Scenario />;
      case 'Data Center':
        return <views.DataCenter />;
      case 'Integrity':
        return <views.Quality />;
      case 'Provenance':
        return (
          <>
            <SourceLedger />
            <views.ProvenancePage data={research?.manifest || {}} />
          </>
        );
      case 'Reports':
        return (
          <views.Reports
            models={models}
            summary={summary}
            spatial={spatial}
            provenance={research?.manifest || {}}
          />
        );
      case 'Presentation':
        return <views.Presentation models={models} spatial={spatial} />;
      case 'Alerts':
        return <views.Alerts />;
      case 'Activity':
        return <views.Audit />;
      case 'Settings':
        return <views.SettingsPage />;
      default:
        return <views.Dashboard summary={summary} models={models} />;
    }
  };
  const metric = (d: string, y: number, m: string) => {
    const r = joined.records.find((r) => r.district === d && r.year === y);
    const pred =
      research && y === 2025
        ? research.predictions.find((p) => p.district === d)?.[
            (
              {
                Persistence: 'persistence',
                'Random Forest': 'random_forest',
                'Ridge Regression': 'ridge_climate',
                'Ridge Regression — no climate': 'ridge_no_climate',
                'Gradient Boosting': 'gradient_boosting',
              } as Record<string, string>
            )[m]
          ]
        : r?.values.prediction;
    return {
      district: d,
      year: y,
      model: m,
      cases: r?.values.cases ?? null,
      prediction: pred ?? null,
      residual: pred != null && r?.values.cases != null ? pred - r.values.cases : null,
    };
  };
  return (
    <div className={'desktop-workstation' + (layout.max ? ' desk-max' : '')}>
      <AnalyticalDemoControls />
      <header className="desk-title">
        <h1 className="malariascope-brand-line">
          <BrandMark size={32} />
          <span>MALARIASCOPE Desktop Intelligence Workstation</span>
        </h1>
        <button onClick={() => setLayout({ ...layout, left: !layout.left })}>Navigation</button>
        <button onClick={() => setLayout({ ...layout, right: !layout.right })}>Inspector</button>
        <button onClick={() => setLayout({ ...layout, filters: !layout.filters })}>
          Context bar
        </button>
        <button onClick={() => setPalette(true)}>Search · Ctrl/Cmd K</button>
        <Link to="/dashboard">Web workspace</Link>
      </header>
      {layout.filters && (
        <div className="desk-filters">
          <label>
            Year
            <select
              aria-label="Desktop year"
              value={year}
              onChange={(e) => setYear(+e.target.value)}
            >
              {[...new Set([year, ...rows.map((r) => r.year)])].sort().map((y) => (
                <option key={y}>{y}</option>
              ))}
            </select>
          </label>
          <label>
            District
            <select
              aria-label="Desktop district"
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
            Dataset
            <select
              aria-label="Desktop dataset"
              value={state.active}
              onChange={(e) => update({ active: e.target.value })}
            >
              <option value="study-balanced">Verified MALARIASCOPE Study</option>
              {state.datasets
                .filter((d) => d.id !== 'study-balanced')
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Risk Mode
            <select
              value={riskMode}
              onChange={(e) => setRiskMode(e.target.value as typeof riskMode)}
            >
              {riskModes.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </label>
          <label>
            Model
            <select
              aria-label="Desktop model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
            >
              {studyModels.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </label>
          <label>
            Observed / Predicted
            <select
              value={state.filters?.mode || 'observed'}
              onChange={(e) =>
                update({
                  filters: { risk: 'ALL', region: 'ALL', ...state.filters, mode: e.target.value },
                })
              }
            >
              <option value="observed">Observed</option>
              <option value="predicted">Predicted</option>
            </select>
          </label>
          <span>
            {state.researchMode === 'BUILTIN' ? 'VERIFIED RESEARCH EXTRACTION' : 'USER IMPORT'} ·
            RETROSPECTIVE
          </span>
        </div>
      )}
      <div className="desk-body">
        {layout.left && (
          <nav className="desk-sidebar">
            {navigation.map(([group, ...items]) => (
              <section key={group}>
                <strong>{group}</strong>
                {items.map((name) => (
                  <button
                    key={name}
                    className={view === name ? 'selected' : ''}
                    onClick={() => go(name)}
                  >
                    {name}
                  </button>
                ))}
              </section>
            ))}
            <Link to="/iot">Environmental IoT</Link>
            <Link to="/prospective-registry">Prospective registry</Link>
            <Link to="/model-monitoring">Model monitoring</Link>
          </nav>
        )}
        <main className="desk-center">
          <div className="desk-panel-tools">
            <span>Workstation / {view}</span>
            <select
              aria-label="Workspace preset"
              value={presets.includes(view) ? view : ''}
              onChange={(e) => go(e.target.value)}
            >
              <option value="" disabled>
                Workspace presets
              </option>
              {presets.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
            <button onClick={() => setLayout({ ...layout, max: !layout.max })}>
              {layout.max ? 'Restore panels' : 'Maximize analysis'}
            </button>
            <button onClick={() => setLayout({ ...layout, extra: !layout.extra })}>
              Secondary panel
            </button>
            <button onClick={() => setCompare(!compare)}>Compare analyses</button>
          </div>
          <Suspense fallback={<p role="status">Loading analytical panel…</p>}>{content()}</Suspense>
          {compare && (
            <section className="panel research-evidence">
              <h2>Analytical Comparison</h2>
              <p>
                Same district/year/model selectors; observed values and saved predictions remain
                distinct. Experimental risk weights stay in Scenario Explorer.
              </p>
              <label>
                District B
                <select
                  aria-label="Compare district B"
                  value={other}
                  onChange={(e) => setOther(e.target.value)}
                >
                  <option value="">Select district</option>
                  {districts.map((d) => (
                    <option key={d}>{d}</option>
                  ))}
                </select>
              </label>
              <label>
                Year B
                <input
                  aria-label="Compare year B"
                  type="number"
                  value={yearB}
                  onChange={(e) => setYearB(+e.target.value)}
                />
              </label>
              <label>
                Model B
                <select
                  aria-label="Compare model B"
                  value={modelB}
                  onChange={(e) => setModelB(e.target.value)}
                >
                  {studyModels.map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              </label>
              <div className="evidence-grid">
                {[metric(district, year, model), metric(other, yearB, modelB)].map((value, i) => (
                  <article key={i}>
                    <h3>{i === 0 ? 'Analysis A' : 'Analysis B'}</h3>
                    <dl>
                      {Object.entries(value).map(([name, v]) => (
                        <div key={name}>
                          <dt>{name}</dt>
                          <dd>
                            {typeof v === 'number'
                              ? v.toLocaleString('en-GB', { maximumFractionDigits: 2 })
                              : (v ?? 'Not available')}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </article>
                ))}
              </div>
              <button onClick={() => go('GIS')}>Open linked map year comparison</button>
              <button onClick={() => go('Scenario')}>Compare risk configurations</button>
            </section>
          )}
          {layout.extra && (
            <details className="panel research-evidence">
              <summary>Analytical snapshots and secondary panel</summary>
              <SnapshotManager />
            </details>
          )}
        </main>
        {layout.right && (
          <aside className="desk-inspector" aria-label="Desktop district inspector">
            <h2>{district}</h2>
            <p>
              {year} · {model}
            </p>
            <div className="desk-tabs">
              {[
                'OVERVIEW',
                'TREND',
                'CLIMATE',
                'FORECAST',
                'SPATIAL',
                'RISK',
                'READINESS',
                'PROVENANCE',
              ].map((t) => (
                <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)}>
                  {t}
                </button>
              ))}
            </div>
            {tab === 'OVERVIEW' ? (
              <dl>
                {Object.entries({
                  Cases: info.current?.values.cases,
                  Population: info.current?.values.population,
                  Incidence: info.incidence,
                  Rank: info.rank,
                  Risk: info.riskLevel,
                  Prediction: info.current?.values.prediction,
                  Residual: info.residual,
                  Completeness: info.completeness,
                  Alerts: info.signals.length,
                }).map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>
                      {typeof v === 'number'
                        ? v.toLocaleString('en-GB', { maximumFractionDigits: 2 })
                        : (v ?? 'Not available')}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : tab === 'TREND' ? (
              info.history.map((r) => (
                <p key={r.year}>
                  {r.year}: {r.values.cases ?? 'Not available'}
                </p>
              ))
            ) : tab === 'CLIMATE' ? (
              <pre>
                {JSON.stringify(
                  {
                    values: info.current?.values,
                    rainfallAnomaly: info.rainfallAnomaly,
                    temperatureAnomaly: info.temperatureAnomaly,
                  },
                  null,
                  2,
                )}
              </pre>
            ) : tab === 'RISK' ? (
              <>
                <h3>Observed incidence rule explanation</h3>
                <p>{info.explanation}</p>
              </>
            ) : tab === 'PROVENANCE' ? (
              <pre>{JSON.stringify(info.current?.references, null, 2)}</pre>
            ) : tab === 'FORECAST' ? (
              <ResearchForecastScience failure />
            ) : (
              <div>
                {tab === 'SPATIAL' ? (
                  <>
                    <p>
                      Queen contiguity within the supplied geometry; separate from study
                      centroid-neighbor weights.
                    </p>
                    <p>
                      Relative burden {spatialContext.burdenRatio ?? 'Unavailable'}; relative
                      incidence {spatialContext.incidenceRatio ?? 'Unavailable'}; descriptive
                      category {spatialContext.spatialRisk}. No confirmed local hotspot.
                    </p>
                    {spatialContext.neighbors.map((n) => (
                      <p key={n.district}>
                        {n.district}: cases {n.cases ?? 'Unavailable'}, incidence{' '}
                        {n.incidence ?? 'Unavailable'}
                      </p>
                    ))}
                  </>
                ) : (
                  readiness.cells.map((c) => (
                    <article key={c.domain}>
                      <h3>
                        {c.label} · {c.state}
                      </h3>
                      <p>{c.reason}</p>
                    </article>
                  ))
                )}
              </div>
            )}
            <div className="desk-context-actions">
              {['District', 'Alerts', 'Provenance', 'Reports', 'GIS'].map((name) => (
                <button key={name} onClick={() => go(name)}>
                  {name}
                </button>
              ))}
              <button
                onClick={() => {
                  setOther(district);
                  setCompare(true);
                }}
              >
                Compare district
              </button>
            </div>
          </aside>
        )}
      </div>
      <footer className="desk-status">
        GIS {state.geometry ? 'READY' : 'NOT CONNECTED'} · DATA{' '}
        {rows.length ? 'READY' : 'NOT CONNECTED'} · MODEL{' '}
        {research ? 'READY — HINDCAST' : 'PARTIAL'} · ALERT ENGINE READY · LOCAL STORAGE{' '}
        {storageReady ? 'READY' : 'ERROR'}
      </footer>
      {palette && (
        <Modal label="Desktop command palette" onClose={() => setPalette(false)}>
          <button onClick={() => setPalette(false)}>Close</button>
          <input
            autoFocus
            aria-label="Desktop command search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {navigation
            .flatMap(([, ...items]) => items)
            .filter((n) => n.toLowerCase().includes(search.toLowerCase()))
            .map((n) => (
              <button key={n} onClick={() => go(n)}>
                {n}
              </button>
            ))}
        </Modal>
      )}
    </div>
  );
}
