import React, { Suspense, lazy, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  BrowserRouter,
  NavLink,
  Routes,
  Route,
  Navigate,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import {
  Activity,
  ArrowUpRight,
  ArrowDownToLine,
  Bell,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  Compass,
  Database,
  FileText,
  FlaskConical,
  Globe,
  Grid2X2,
  HelpCircle,
  History,
  Info,
  Layers,
  Map as MapIcon,
  Menu,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Target,
  Upload,
  Wind,
  X,
  Trash2,
  Copy,
  Save,
  Play,
  AlertTriangle,
  ExternalLink,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ScatterChart,
  Scatter,
} from 'recharts';
import Papa from 'papaparse';
import { Provider, useStore, type Dataset } from './store';
import {
  change,
  correlation,
  defaults,
  validCondition,
  download,
  incidence,
  normalize,
  performance,
  risk,
  toCSV,
  validate,
  type Issue,
  type Row,
} from './analytics';
import './styles.css';
import AdvancedEarlyWarning from './AdvancedEarlyWarning';
import { validateGeometry } from './geometry';
const MapView = lazy(() => import('./Map'));
const ForceHealthReadinessMatrix = lazy(() => import('./ForceHealthReadinessMatrix'));
const ScientificIntegrityCenter = lazy(() => import('./ScientificIntegrityCenter'));
const ExplainableRiskEngine = lazy(() => import('./ExplainableRiskEngine'));
const ForecastWorkbench = lazy(() => import('./ForecastWorkbench'));
const District360 = lazy(() => import('./DistrictIntelligence360'));
const SpatialLab = lazy(() => import('./SpatialLab'));
const modules: [string, string, React.ElementType][] = [
  ['dashboard', 'Command Dashboard', Grid2X2],
  ['risk-map', 'Geospatial Hotspot Intelligence', MapIcon],
  ['surveillance', 'Surveillance Center', Activity],
  ['district-intelligence', 'District Intelligence 360°', Target],
  ['climate', 'Climate Intelligence', Wind],
  ['forecasting', 'Forecasting Workbench Pro', Activity],
  ['model-benchmarking', 'Model Laboratory', FlaskConical],
  ['spatial-analysis', 'Spatial Analysis', Layers],
  ['early-warning', 'Early Warning Center', Bell],
  ['risk-intelligence', 'Explainable Risk Engine 2.0', ShieldCheck],
  ['force-health', 'Force Health Readiness Matrix', ShieldCheck],
  ['scenario', 'Scenario Explorer', SlidersHorizontal],
  ['data-center', 'Data Center', Database],
  ['data-quality', 'Scientific Integrity Center', Check],
  ['reports', 'Reports', FileText],
  ['alerts', 'Alert Center', Bell],
  ['audit', 'Audit & Activity Log', History],
  ['settings', 'System Settings', Settings],
  ['methodology', 'Methodology & Evidence', BookOpen],
  ['provenance', 'Data Provenance', Info],
  ['about', 'About MALARIASCOPE', Compass],
  ['presentation', 'Presentation Mode', Play],
];
const fmt = (n: number | null | undefined, d = 0) =>
  n === null || n === undefined ? '—' : n.toLocaleString('en-US', { maximumFractionDigits: d });
const safety =
  'Research Prototype — Retrospective Geospatial Risk Intelligence — Not for Autonomous Clinical Decision-Making or Operational Deployment';
function dialogKeys(e: React.KeyboardEvent<HTMLElement>, close: () => void) {
  if (e.key === 'Escape') {
    e.stopPropagation();
    close();
    return;
  }
  if (e.key !== 'Tab') return;
  const controls = Array.from(
    e.currentTarget.querySelectorAll<HTMLElement>(
      'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]',
    ),
  );
  const first = controls[0],
    last = controls.at(-1);
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last?.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first?.focus();
  }
}
function Button({
  children,
  onClick,
  primary = false,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  primary?: boolean;
}) {
  return (
    <button className={primary ? 'button primary' : 'button'} onClick={onClick}>
      {children}
    </button>
  );
}
function Empty({
  title = 'Data not available',
  detail = 'Connect a dataset to explore this analysis.',
}: {
  title?: string;
  detail?: string;
}) {
  return (
    <div className="empty">
      <Database size={25} />
      <strong>{title}</strong>
      <p>{detail}</p>
      <NavLink to="/data-center">
        Open Data Center <ArrowUpRight size={13} />
      </NavLink>
    </div>
  );
}
function Badge({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: string }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
function Panel({
  title,
  sub,
  children,
  action,
  className = '',
}: {
  title: string;
  sub?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      <div className="panel-head">
        <div>
          <h2>{title}</h2>
          {sub && <p>{sub}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
function useData() {
  const s = useStore();
  const scoped = s.rows.filter(
    (r) =>
      (s.district === 'All districts' || normalize(r.district) === normalize(s.district)) &&
      (!s.state.filters?.region ||
        s.state.filters.region === 'ALL' ||
        r.region === s.state.filters.region) &&
      (!s.state.filters?.risk ||
        s.state.filters.risk === 'ALL' ||
        risk(r, s.state.thresholds) === s.state.filters.risk),
  );
  return {
    ...s,
    scoped,
    filtered: scoped.filter((r) => r.year === s.year),
    districts: [...new Set(s.rows.map((r) => r.district))].sort(),
  };
}
function Provenance({ field = 'study aggregate' }: { field?: string }) {
  const { state, year, district } = useStore();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className="icon-btn"
        aria-label={`Inspect provenance: ${field}`}
        onClick={() => setOpen(true)}
      >
        <Info size={14} />
      </button>
      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Data provenance"
            onKeyDown={(e) => dialogKeys(e, () => setOpen(false))}
            onClick={(e) => e.stopPropagation()}
          >
            <button autoFocus className="close" onClick={() => setOpen(false)}>
              <X size={20} />
            </button>
            <h2>Evidence & provenance</h2>
            <dl>
              <dt>Source</dt>
              <dd>
                {state.datasets.find((d) => d.id === state.active)?.source ||
                  'User-supplied study specification'}
              </dd>
              <dt>Field</dt>
              <dd>{field}</dd>
              <dt>Scope</dt>
              <dd>
                {district} · {year}
              </dd>
              <dt>Transformation</dt>
              <dd>
                Totals sum loaded observations; incidence = cases / population × 1,000; changes
                compare adjacent years.
              </dd>
              <dt>Validation status</dt>
              <dd>
                {state.active
                  ? 'USER IMPORT · schema validated; independently unverified'
                  : 'SUPPLIED STUDY RESULT · underlying records not supplied'}
              </dd>
            </dl>
            <Button onClick={() => setOpen(false)}>Close inspector</Button>
          </div>
        </div>
      )}
    </>
  );
}
function Trend({ data, height = 220 }: { data: Record<string, any>[]; height?: number }) {
  return (
    <div
      style={{ height }}
      role="img"
      aria-label={`Annual series: ${data.map((r) => `${r.year}: ${r.cases ?? 'not available'}`).join('; ')}`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ left: 0, right: 18, top: 20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 4" vertical={false} stroke="#e9edee" />
          <XAxis
            dataKey="year"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: '#62777e' }}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: '#62777e' }}
            tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : v)}
          />
          <Tooltip />
          <Line
            type="linear"
            dataKey="cases"
            name="Observed cases"
            stroke="#168478"
            strokeWidth={2.5}
            dot={{ r: 4, fill: '#168478', stroke: 'white', strokeWidth: 2 }}
            connectNulls={false}
          />
          <Line
            type="linear"
            dataKey="prediction"
            name="Model prediction"
            stroke="#d59a48"
            strokeDasharray="5 4"
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
function Filters() {
  const { year, setYear, district, setDistrict, districts, model, setModel, state, update } =
    useData();
  const [advanced, setAdvanced] = useState(false);
  const f = state.filters || { risk: 'ALL', region: 'ALL', mode: 'observed' };
  return (
    <>
      <div className="filters">
        <label>
          Period{' '}
          <select aria-label="Global year" value={year} onChange={(e) => setYear(+e.target.value)}>
            {Array.from(
              new Set([
                2020,
                2021,
                2022,
                2023,
                2024,
                2025,
                ...state.datasets.flatMap((d) => d.rows.map((r) => r.year)),
              ]),
            )
              .sort()
              .map((y) => (
                <option key={y}>{y}</option>
              ))}
          </select>
        </label>
        <label>
          Geography{' '}
          <select
            aria-label="Global district"
            value={district}
            onChange={(e) => setDistrict(e.target.value)}
          >
            <option>All districts</option>
            {district !== 'All districts' && !districts.includes(district) && (
              <option value={district}>{district} (no observations)</option>
            )}
            {districts.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </label>
        <label>
          Model{' '}
          <select
            aria-label="Global model"
            value={model}
            onChange={(e) => setModel(e.target.value)}
          >
            {['Persistence', 'Ridge Regression', 'Random Forest', 'Gradient Boosting'].map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </label>
        <label>
          Source{' '}
          <select value={state.active} onChange={(e) => update({ active: e.target.value })}>
            <option value="">Supplied study summary</option>
            {state.datasets.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <button
          className="filter-state advanced-trigger"
          onClick={() => setAdvanced(!advanced)}
          aria-expanded={advanced}
        >
          <SlidersHorizontal size={12} /> More filters
        </button>
      </div>
      {advanced && (
        <div className="advanced-filters">
          <label>
            Observed risk
            <select
              aria-label="Global risk class"
              value={f.risk}
              onChange={(e) => update({ filters: { ...f, risk: e.target.value } })}
            >
              {['ALL', 'LOW', 'MODERATE', 'HIGH', 'VERY HIGH', 'INSUFFICIENT DATA'].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label>
            Region
            <select
              aria-label="Global region"
              value={f.region}
              onChange={(e) => update({ filters: { ...f, region: e.target.value } })}
            >
              <option value="ALL">All loaded regions</option>
              {Array.from(
                new Set(
                  state.datasets
                    .find((d) => d.id === state.active)
                    ?.rows.map((r) => r.region)
                    .filter(Boolean) || [],
                ),
              ).map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label>
            Dashboard mode
            <select
              aria-label="Observed or predicted mode"
              value={f.mode}
              onChange={(e) => update({ filters: { ...f, mode: e.target.value } })}
            >
              <option value="observed">Observed data</option>
              <option value="predicted">Model predictions</option>
            </select>
          </label>
          <label>
            Chart start year
            <input
              aria-label="Chart start year"
              type="number"
              value={f.start || 2020}
              onChange={(e) => update({ filters: { ...f, start: +e.target.value } })}
            />
          </label>
          <label>
            Chart end year
            <input
              aria-label="Chart end year"
              type="number"
              value={f.end || 2025}
              onChange={(e) => update({ filters: { ...f, end: +e.target.value } })}
            />
          </label>
          <button className="text-link" onClick={() => update({ filters: undefined })}>
            Reset filters
          </button>
        </div>
      )}
    </>
  );
}
function Dashboard({ summary, models }: { summary: any; models: any[] }) {
  const { filtered, scoped, rows, state, year, district, model, signals } = useData();
  const navigate = useNavigate();
  const alerts = signals.filter(
    (a) =>
      a.year === year &&
      (district === 'All districts' || normalize(a.district) === normalize(district)),
  );
  const predicted = state.filters?.mode === 'predicted';
  const aggregateAvailable =
    !state.active &&
    district === 'All districts' &&
    (!state.filters?.region || state.filters.region === 'ALL') &&
    (!state.filters?.risk || state.filters.risk === 'ALL');
  const value = (r: Row) => (predicted ? (r.model === model ? r.prediction : null) : r.cases);
  const total =
    filtered.length && filtered.every((r) => value(r) !== null && value(r) !== undefined)
      ? filtered.reduce((a, r) => a + value(r)!, 0)
      : aggregateAvailable && !predicted
        ? summary?.annual.find((r: any) => r.year === year)?.cases
        : null;
  const previous = filtered.map((r) =>
    scoped.find((p) => normalize(p.district) === normalize(r.district) && p.year === year - 1),
  );
  const prior =
    previous.length && previous.every((r) => r && value(r) !== null && value(r) !== undefined)
      ? previous.reduce((a, r) => a + value(r!)!, 0)
      : null;
  const yoy =
    prior && total !== null && total !== undefined ? ((total - prior) / prior) * 100 : null;
  const trends = (
    scoped.length
      ? Array.from(new Set(scoped.map((r) => r.year)))
          .sort()
          .map((y) => {
            const points = scoped.filter((r) => r.year === y);
            return {
              year: y,
              cases: points.reduce((a, r) => a + r.cases, 0),
              prediction: points.every((r) => r.prediction !== undefined && r.model === model)
                ? points.reduce((a, r) => a + r.prediction!, 0)
                : null,
            };
          })
      : Array.from({ length: 6 }, (_, i) => ({
          year: 2020 + i,
          cases: aggregateAvailable
            ? (summary?.annual.find((r: any) => r.year === 2020 + i)?.cases ?? null)
            : null,
        }))
  ).filter(
    (r) => r.year >= (state.filters?.start || 1900) && r.year <= (state.filters?.end || 2100),
  );
  const rank = [...filtered].sort((a, b) => (value(b) ?? -1) - (value(a) ?? -1));
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">REGIONAL SURVEILLANCE WORKSPACE</div>
          <h1>Command Dashboard</h1>
          <p>A connected view of malaria burden, spatial risk, and analytical signals.</p>
        </div>
        <div className="heading-actions">
          <Badge tone="teal">
            <span className="dot" /> Research workspace
          </Badge>
          <Button
            onClick={() => {
              download(`malariascope-${year}.json`, {
                year,
                source: state.active || 'Supplied study summary',
                observations: filtered,
                studySummary: state.active ? undefined : summary,
              });
            }}
          >
            {' '}
            <ArrowDownToLine size={15} /> Export overview
          </Button>
        </div>
      </div>
      <Filters />
      <div className="metrics">
        <Metric
          label={predicted ? 'TOTAL PREDICTED CASES' : 'TOTAL REPORTED CASES'}
          value={fmt(total)}
          hint={
            predicted
              ? 'MODEL PREDICTION · selected model'
              : state.active
                ? 'Loaded observations'
                : 'Supplied aggregate · selected year'
          }
          icon={Activity}
          onClick={() => navigate('/surveillance')}
        />
        <Metric
          label="ANNUAL CHANGE"
          value={yoy === null ? '—' : `${yoy > 0 ? '+' : ''}${fmt(yoy, 1)}%`}
          hint={
            yoy === null ? 'Prior-year records not connected' : 'Derived · versus previous year'
          }
          icon={ArrowUpRight}
          onClick={() => navigate('/surveillance')}
        />
        <Metric
          label="HIGH & VERY HIGH RISK"
          value={
            filtered.length
              ? `${filtered.filter((r) => ['HIGH', 'VERY HIGH'].includes(risk(r, state.thresholds))).length}`
              : '—'
          }
          hint={
            filtered.length
              ? 'Derived · configured incidence thresholds'
              : 'District risk dataset not connected'
          }
          icon={ShieldCheck}
          onClick={() => navigate('/risk-intelligence')}
        />
        <Metric
          label="ACTIVE ANALYTICAL ALERTS"
          value={String(
            alerts.filter((a) => state.alertStates[a.id]?.status !== 'RESOLVED').length,
          )}
          hint={rows.length ? 'From enabled analytical rules' : 'Connect data to evaluate rules'}
          icon={Bell}
          onClick={() => navigate('/alerts')}
        />
      </div>
      <div className="dashboard-grid">
        <Panel
          title="Geospatial risk overview"
          sub="Papua, Indonesia · retrospective regional intelligence"
          action={
            <NavLink className="text-link" to="/risk-map">
              Open GIS workspace <ArrowUpRight size={14} />
            </NavLink>
          }
          className="map-panel"
        >
          <Suspense fallback={<Empty title="Loading geographic workspace…" />}>
            <MapView />
          </Suspense>
          <div className="panel-foot">
            <span>
              <Info size={13} /> Public geographic context · district risk data not connected
            </span>
            <NavLink to="/provenance">
              View provenance <ChevronRight size={13} />
            </NavLink>
          </div>
        </Panel>
        <Panel
          title="Malaria burden over time"
          sub="Reported cases · 2020–2025"
          action={<Provenance field="annual cases" />}
        >
          <div className="chart-stat">
            {fmt(total)} <span>cases in {year}</span>
          </div>
          <Trend data={trends} />
          <div className="chart-note">
            <span className="dot" /> Observed aggregate{' '}
            <span>Missing years are left unconnected</span>
          </div>
        </Panel>
        <Panel
          title="District surveillance priorities"
          sub="Burden ranking for the selected period"
          action={
            <NavLink className="text-link" to="/district-intelligence">
              Explore districts <ArrowUpRight size={13} />
            </NavLink>
          }
        >
          {rank.length ? (
            <div className="ranking">
              {rank.slice(0, 5).map((r, i) => (
                <NavLink
                  to={`/district-intelligence?district=${encodeURIComponent(r.district)}&year=${year}`}
                  key={r.district}
                >
                  <span className="rank">{String(i + 1).padStart(2, '0')}</span>
                  <strong>{r.district}</strong>
                  <span>{fmt(value(r))}</span>
                  <Badge tone={risk(r, state.thresholds) === 'HIGH' ? 'amber' : 'neutral'}>
                    {risk(r, state.thresholds)}
                  </Badge>
                </NavLink>
              ))}
            </div>
          ) : (
            <Empty
              title="District surveillance not connected"
              detail="Import district-year observations to rank burden, incidence, and trends."
            />
          )}
        </Panel>
        <Panel
          title="Model validation snapshot"
          sub="Untouched temporal test · 2025"
          action={<Badge tone="teal">MAE comparison</Badge>}
        >
          <div className="model-comparison">
            {models
              .filter((m) => m.year === 2025 && m.mae !== null)
              .sort((a, b) => a.mae - b.mae)
              .map((m, i) => (
                <div key={m.model}>
                  <div>
                    <span>{m.model}</span>
                    <strong>
                      {fmt(m.mae)} <small>cases</small>
                    </strong>
                  </div>
                  <div className="bar-track">
                    <div
                      style={{
                        width: `${(m.mae / 15000) * 100}%`,
                        background: i === 0 ? '#218b7c' : '#b7c9c5',
                      }}
                    />
                  </div>
                </div>
              ))}
          </div>
          <div className="insight">
            <Info size={15} />
            <span>Persistence outperformed Random Forest on the primary 2025 error metric.</span>
          </div>
          <NavLink className="text-link bottom-link" to="/model-benchmarking">
            Explore model laboratory <ArrowUpRight size={14} />
          </NavLink>
        </Panel>
      </div>
      <div className="dashboard-bottom">
        <Panel title="Data connectivity" sub="Availability determines analytical confidence">
          <div className="connectivity">
            {[
              ['Surveillance', rows.length ? 'USER IMPORT' : 'SUMMARY ONLY'],
              ['Climate', rows.some((r) => r.rainfall !== undefined) ? 'PARTIAL' : 'NOT CONNECTED'],
              ['District boundaries', state.geometry ? 'USER IMPORT' : 'NOT CONNECTED'],
              [
                'Model predictions',
                rows.some((r) => r.prediction !== undefined) ? 'USER IMPORT' : 'NOT CONNECTED',
              ],
            ].map(([name, status]) => (
              <div key={name}>
                <Database size={15} />
                <span>{name}</span>
                <Badge tone={status === 'USER IMPORT' ? 'teal' : 'neutral'}>{status}</Badge>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Research notes" sub="Evidence that needs to travel with the analysis">
          <div className="notes">
            <div>
              <span className="note-icon">
                <Info size={17} />
              </span>
              <p>
                <strong>Different analytical populations</strong>
                <br />
                8-district forecasting panel; 9-district spatial assessment.
              </p>
            </div>
            <div>
              <span className="note-icon amber">
                <AlertTriangle size={17} />
              </span>
              <p>
                <strong>A known surveillance gap</strong>
                <br />
                Supiori’s 2024 outcome is unavailable. No value is imputed.
              </p>
            </div>
          </div>
        </Panel>
        <Panel title="Preparedness review" sub="Non-operational decision support">
          <div className="readiness-snapshot">
            <ShieldCheck size={32} />
            <div>
              <strong>
                {Object.values(state.checklist).filter((v) => v === 'AVAILABLE').length} checklist
                items reviewed
              </strong>
              <p>Resource availability requires human confirmation.</p>
            </div>
          </div>
          <NavLink className="text-link bottom-link" to="/force-health">
            Open readiness assessment <ArrowUpRight size={14} />
          </NavLink>
        </Panel>
      </div>
    </>
  );
}
function Metric({
  label,
  value,
  hint,
  icon: Icon,
  onClick,
}: {
  label: string;
  value: string;
  hint: string;
  icon: React.ElementType;
  onClick: () => void;
}) {
  return (
    <button className="metric" onClick={onClick}>
      <div className="metric-top">
        <span>{label}</span>
        <Icon size={17} />
      </div>
      <strong>{value}</strong>
      <div className="metric-hint">
        {hint}
        <ChevronRight size={13} />
      </div>
    </button>
  );
}
function Heading({
  title,
  sub,
  children,
}: {
  title: string;
  sub: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">MALARIASCOPE / ANALYTICAL WORKSPACE</div>
        <h1>{title}</h1>
        <p>{sub}</p>
      </div>
      <div className="heading-actions">{children}</div>
    </div>
  );
}
function Table({ rows, extra = false }: { rows: Row[]; extra?: boolean }) {
  const s = useStore();
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            {[
              'District',
              'Year',
              'Cases',
              'Population',
              'Incidence / 1,000',
              'Risk',
              ...(extra ? ['Annual change', 'Analytical flag'] : []),
            ].map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.district}-${r.year}-${i}`}>
              <td>
                <NavLink
                  to={`/district-intelligence?district=${encodeURIComponent(r.district)}&year=${r.year}`}
                >
                  {r.district}
                </NavLink>
              </td>
              <td>{r.year}</td>
              <td>{fmt(r.cases)}</td>
              <td>{fmt(r.population)}</td>
              <td>{fmt(incidence(r), 2)}</td>
              <td>
                <Badge
                  tone={
                    ['HIGH', 'VERY HIGH'].includes(risk(r, s.state.thresholds))
                      ? 'amber'
                      : 'neutral'
                  }
                >
                  {risk(r, s.state.thresholds)}
                </Badge>
              </td>
              {extra && (
                <>
                  <td>{fmt(change(r, s.rows), 1)}%</td>
                  <td>
                    {(change(r, s.rows) ?? 0) > 25 ? (
                      <span title="Year-over-year change > 25%">RAPID INCREASE</span>
                    ) : r.cases > 20000 ? (
                      <span title="Cases > 20,000">HIGH BURDEN</span>
                    ) : (
                      '—'
                    )}
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <Empty />}
    </div>
  );
}
function Surveillance() {
  const { filtered, rows, year } = useData();
  const [query, setQuery] = useState(''),
    [sort, setSort] = useState('cases'),
    [page, setPage] = useState(0);
  const data = filtered
    .filter((r) => normalize(r.district).includes(normalize(query)))
    .sort((a, b) => (sort === 'cases' ? b.cases - a.cases : a.district.localeCompare(b.district)));
  return (
    <>
      <Heading
        title="Surveillance Center"
        sub="Explore observed burden, identify trends, and inspect analytical flags."
      >
        <Button onClick={() => download('surveillance.csv', toCSV(data), true)}>
          <ArrowDownToLine size={15} /> Export CSV
        </Button>
      </Heading>
      <Filters />
      <Panel
        title={`Annual surveillance · ${year}`}
        sub={`${data.length} observations · ${rows.length} records in active dataset`}
        action={<Provenance field="district-year surveillance" />}
      >
        <div className="toolbar">
          <input
            placeholder="Search district…"
            aria-label="Search surveillance district"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
          />
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="cases">Sort by cases</option>
            <option value="district">Sort by district</option>
          </select>
        </div>
        <Table rows={data.slice(page * 10, page * 10 + 10)} extra />
        <div className="pagination">
          <Button onClick={() => setPage(Math.max(0, page - 1))}>Previous</Button>
          <span>
            Page {page + 1} · {data.length} records
          </span>
          <Button
            onClick={() =>
              setPage((p) => Math.min(Math.max(0, Math.ceil(data.length / 10) - 1), p + 1))
            }
          >
            Next
          </Button>
        </div>
      </Panel>
      <div className="notice">
        <Info size={16} /> Analytical flags: RAPID INCREASE = year-on-year change &gt; 25%; HIGH
        BURDEN = annual cases &gt; 20,000. These are configurable research thresholds, not clinical
        findings.
      </div>
    </>
  );
}
function District({ summary }: { summary: any }) {
  return (
    <Suspense fallback={<Empty title="Loading District Intelligence 360°…" />}>
      <District360 filters={<Filters />} summary={summary} />
    </Suspense>
  );
}
function Climate() {
  const { rows, district } = useData();
  const [variable, setVariable] = useState<'rainfall' | 'temperature' | 'humidity'>('rainfall'),
    [lag, setLag] = useState(0);
  const selected = rows.filter((r) => district === 'All districts' || r.district === district);
  const pairs: [number, number][] = selected.flatMap((r) => {
    const later = selected.find((x) => x.district === r.district && x.year === r.year + lag);
    return r[variable] !== undefined && later
      ? [[r[variable]!, later.cases] as [number, number]]
      : [];
  });
  const corr = correlation(pairs);
  return (
    <>
      <Heading
        title="Climate Intelligence"
        sub="Explore climate–malaria associations without making causal claims."
      />
      <Filters />
      <div className="toolbar">
        <select value={variable} onChange={(e) => setVariable(e.target.value as typeof variable)}>
          <option>rainfall</option>
          <option>temperature</option>
          <option>humidity</option>
        </select>
        <label>
          Annual lag{' '}
          <select value={lag} onChange={(e) => setLag(+e.target.value)}>
            {[0, 1, 2, 3].map((l) => (
              <option key={l} value={l}>
                {l} years
              </option>
            ))}
          </select>
        </label>
      </div>
      <Panel
        title="Exploratory relationship"
        sub={`Pearson r: ${fmt(corr, 3)} · ${pairs.length} matched observations · annual resolution`}
      >
        {pairs.length ? (
          <div
            style={{ height: 350 }}
            role="img"
            aria-label={`${variable} versus cases; correlation ${corr}`}
          >
            <ResponsiveContainer>
              <ScatterChart>
                <CartesianGrid />
                <XAxis type="number" dataKey="x" name={variable} />
                <YAxis type="number" dataKey="y" name="Cases" />
                <Tooltip />
                <Scatter data={pairs.map(([x, y]) => ({ x, y }))} fill="#168478" />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <Empty
            title="Climate observations not connected"
            detail="Import rainfall, temperature, or humidity alongside district-year records."
          />
        )}
      </Panel>
      <div className="notice">
        Observed association only. Annual data cannot support monthly seasonality or monthly lag
        inference.
      </div>
    </>
  );
}
function Models({ models, forecast = false }: { models: any[]; forecast?: boolean }) {
  return (
    <Suspense fallback={<Empty title="Loading forecasting workbench…" />}>
      <ForecastWorkbench study={models} filters={<Filters />} laboratory={!forecast} />
    </Suspense>
  );
}
function DataCenter() {
  const { state, update } = useStore();
  const [sourceRows, setSourceRows] = useState<Record<string, unknown>[]>([]);
  const [preview, setPreview] = useState<Row[]>([]),
    [issues, setIssues] = useState<Issue[]>([]),
    [name, setName] = useState(''),
    [checksum, setChecksum] = useState(''),
    [geo, setGeo] = useState<any>(null),
    [message, setMessage] = useState('');
  async function file(f: File) {
    setMessage('');
    setSourceRows([]);
    setPreview([]);
    setGeo(null);
    setIssues([]);
    setName(f.name.replace(/[^\w. -]/g, '_'));
    try {
      if (f.size > 20 * 1024 * 1024) throw Error('Maximum file size is 20 MB.');
      const text = await f.text();
      const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
      setChecksum(
        Array.from(new Uint8Array(hash))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join(''),
      );
      const json = /\.(geojson|json)$/i.test(f.name) ? JSON.parse(text) : null;
      if (/\.geojson$/i.test(f.name) || json?.type === 'FeatureCollection') {
        const g = json;
        validateGeometry(g);
        setGeo(g);
        setMessage(
          `${g.features.length} administrative features validated. Names require matching surveillance records.`,
        );
        return;
      }
      let input: Record<string, unknown>[];
      if (/\.json$/i.test(f.name)) {
        const x = json;
        input = Array.isArray(x) ? x : x.rows;
        if (!Array.isArray(input))
          throw Error('JSON must be an array of observations, or { rows: [...] }.');
      } else if (/\.csv$/i.test(f.name)) {
        const p = Papa.parse<Record<string, unknown>>(text, {
          header: true,
          skipEmptyLines: 'greedy',
        });
        if (p.errors.length) throw Error(p.errors[0].message);
        input = p.data;
      } else throw Error('Supported file types: CSV, JSON, GeoJSON.');
      if (!input.every((r) => r && typeof r === 'object' && !Array.isArray(r)))
        throw Error('Every observation must be an object.');
      const result = validate(input);
      setSourceRows(input);
      setPreview(result.rows);
      setIssues(result.issues);
      setMessage(`${result.rows.length} valid rows · ${result.issues.length} validation issues`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Import failed');
      setIssues([
        { row: 0, severity: 'ERROR', message: e instanceof Error ? e.message : 'Import failed' },
      ]);
    }
  }
  const blocked = issues.some((i) => i.severity === 'ERROR' || i.message.startsWith('Duplicate'));
  function commit() {
    if (geo) {
      update(
        {
          geometry: geo,
          geometrySource: {
            name,
            checksum,
            created: new Date().toISOString(),
            classification: 'USER IMPORT',
          },
        },
        'GIS boundaries imported',
        name,
      );
      setGeo(null);
      setMessage('Administrative geometry connected.');
      return;
    }
    if (!preview.length || blocked) return;
    const id = crypto.randomUUID();
    const dataset: Dataset = {
      id,
      name,
      rows: preview,
      sourceRows,
      checksum,
      source: 'User-selected local file · independently unverified',
      classification: 'USER IMPORT',
      created: new Date().toISOString(),
    };
    update(
      { datasets: [...state.datasets, dataset], active: id },
      'Dataset imported',
      `${name} · ${preview.length} observations`,
    );
    setPreview([]);
    setMessage('Dataset loaded. Existing datasets were preserved.');
  }
  return (
    <>
      <Heading title="Data Center" sub="Connect, validate, and manage local research datasets.">
        <Button
          onClick={() =>
            download(
              'district-template.csv',
              'district,year,cases,population,rainfall,temperature,prediction,model\n',
              true,
            )
          }
        >
          <ArrowDownToLine size={15} /> CSV template
        </Button>
      </Heading>
      <div className="two-col">
        <Panel title="Connect a dataset" sub="Select → preview → validate → load into session">
          <label className="upload">
            <Upload size={32} />
            <strong>Choose a local research file</strong>
            <span>CSV, JSON, or GeoJSON · up to 20 MB</span>
            <input
              aria-label="Import dataset"
              type="file"
              accept=".csv,.json,.geojson"
              onChange={(e) => {
                if (e.target.files?.[0]) void file(e.target.files[0]);
              }}
            />
          </label>
          <div className="body-copy">
            <strong>Required observation fields</strong>
            <code>district, year, cases</code>
            <p>
              Optional: population, rainfall, temperature, humidity, prediction, model,
              district_code. Administrative GeoJSON requires a district or name property.
            </p>
          </div>
          <Button
            onClick={() => {
              void fetch('/data/district-malaria.csv')
                .then((r) => r.blob())
                .then((b) => file(new File([b], 'district-malaria.csv')));
            }}
          >
            Inspect /public/data/ surveillance file
          </Button>
        </Panel>
        <Panel title="Validation review" sub={name || 'No file selected'}>
          {message && <div className="notice">{message}</div>}
          {issues.length ? (
            <div className="issue-list">
              {issues.map((i, n) => (
                <div key={n}>
                  <Badge tone={i.severity === 'ERROR' ? 'red' : 'amber'}>{i.severity}</Badge>
                  <span>
                    Row {i.row} · {i.message}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="body-copy">
              No validation issues detected. A file must be selected before loading.
            </p>
          )}
          {preview.length > 0 && <Table rows={preview.slice(0, 5)} />}
          <button
            className="button primary"
            disabled={blocked || (!preview.length && !geo)}
            onClick={commit}
          >
            <Check size={16} /> Load validated data
          </button>
          <p className="fine-print">
            Schema validation is not scientific verification. All local imports retain USER IMPORT
            status.
          </p>
        </Panel>
      </div>
      <Panel
        title="Dataset registry"
        sub="Session datasets are stored locally. Research aggregates remain separate."
      >
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Dataset</th>
                <th>Classification</th>
                <th>Records</th>
                <th>Date range</th>
                <th>Checksum / source</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Supplied study outputs</td>
                <td>
                  <Badge>SUPPLIED RESULTS</Badge>
                </td>
                <td>Aggregate only</td>
                <td>2020–2025</td>
                <td>User specification · license unspecified</td>
                <td>
                  <NavLink to="/provenance">Inspect</NavLink>
                </td>
              </tr>
              {state.datasets.map((d) => (
                <tr key={d.id}>
                  <td>
                    {d.name}
                    <small className="registry-detail">
                      Local import · license not supplied
                      <br />
                      {new Date(d.created).toLocaleDateString('en-GB')} ·{' '}
                      {new Set(d.rows.map((r) => r.district)).size} districts
                    </small>
                  </td>
                  <td>
                    <Badge tone={d.classification === 'VERIFIED' ? 'teal' : 'amber'}>
                      {d.classification || 'USER IMPORT'}
                    </Badge>
                  </td>
                  <td>
                    {d.rows.length}
                    <small className="registry-detail">
                      {new Set(d.rows.flatMap((r) => Object.keys(r))).size} columns
                    </small>
                  </td>
                  <td>
                    {Math.min(...d.rows.map((r) => r.year))}–
                    {Math.max(...d.rows.map((r) => r.year))}
                  </td>
                  <td title={d.checksum}>SHA-256 {d.checksum.slice(0, 12)}…</td>
                  <td>
                    <button className="text-link" onClick={() => update({ active: d.id })}>
                      Activate
                    </button>{' '}
                    <button
                      className="icon-btn"
                      aria-label={`Remove ${d.name}`}
                      onClick={() =>
                        update(
                          {
                            datasets: state.datasets.filter((x) => x.id !== d.id),
                            active: state.active === d.id ? '' : state.active,
                          },
                          'Dataset removed',
                          d.name,
                        )
                      }
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
function Quality() {
  return (
    <Suspense fallback={<Empty title="Inspecting scientific integrity…" />}>
      <ScientificIntegrityCenter />
    </Suspense>
  );
}
function EarlyWarning() {
  return <AdvancedEarlyWarning />;
}
function Alerts() {
  const { state, update, signals } = useStore();
  const [search, setSearch] = useState(''),
    [status, setStatus] = useState('ALL');
  const alerts = (
    state.alertLog || signals.map((a) => ({ ...a, timestamp: state.alertCreated?.[a.id] || '' }))
  )
    .filter((a) => a.sourceDataset.id === state.active)
    .filter(
      (a) =>
        normalize(a.district).includes(normalize(search)) &&
        (status === 'ALL' || (state.alertStates[a.id]?.status || 'NEW') === status),
    )
    .sort(
      (a, b) =>
        ['URGENT', 'HIGH', 'NORMAL', 'LOW'].indexOf(a.priority) -
          ['URGENT', 'HIGH', 'NORMAL', 'LOW'].indexOf(b.priority) ||
        ['CRITICAL ANALYTICAL SIGNAL', 'HIGH', 'MODERATE', 'WATCH', 'INFO'].indexOf(a.severity) -
          ['CRITICAL ANALYTICAL SIGNAL', 'HIGH', 'MODERATE', 'WATCH', 'INFO'].indexOf(b.severity),
    );
  function set(id: string, p: { status?: string; note?: string }) {
    update(
      {
        alertStates: {
          ...state.alertStates,
          [id]: { ...(state.alertStates[id] || { status: 'NEW', note: '' }), ...p },
        },
      },
      p.status ? 'Alert status changed' : 'Alert note updated',
      `${id} ${p.status || ''}`,
    );
  }
  return (
    <>
      <Heading
        title="Alert Center"
        sub="Review analytical signals, acknowledge findings, and retain local notes."
      >
        <Button
          onClick={() =>
            download(
              'analytical-alerts.json',
              alerts.map((a) => ({
                ...a,
                ...state.alertStates[a.id],
                source: a.sourceDataset,
                timestamp: a.timestamp,
              })),
            )
          }
        >
          Export alerts
        </Button>
      </Heading>
      <div className="toolbar">
        <input
          aria-label="Search alerts"
          placeholder="Search district…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          {['ALL', 'NEW', 'REVIEWED', 'ACKNOWLEDGED', 'RESOLVED'].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <NavLink className="text-link" to="/early-warning">
          Configure rules →
        </NavLink>
      </div>
      <Panel
        title={`${alerts.length} analytical signals`}
        sub="Status and notes persist on this browser."
      >
        {alerts.length ? (
          alerts.map((a) => (
            <div className="alert-row" key={a.id}>
              <div>
                <Badge tone={a.severity === 'HIGH' ? 'red' : 'amber'}>{a.severity}</Badge>
                <h3>
                  {a.district} · {a.year}
                </h3>
                <p>
                  Rule: {a.exactRule} · source {a.sourceDataset.name || 'Not connected'}
                  <br />
                  {a.timestamp
                    ? new Date(a.timestamp).toLocaleString('en-GB', {
                        timeZone: 'Asia/Bangkok',
                      }) + ' ICT'
                    : 'Timestamp unavailable'}
                </p>
                <p>
                  Priority: {a.priority} · Category: {a.category}
                </p>
                <p>{a.explanation}</p>
                {!signals.some((signal) => signal.id === a.id) && (
                  <p>
                    Retained historical alert; current rule or evidence no longer produces this
                    signal.
                  </p>
                )}
                <details>
                  <summary>Triggering data and source evidence</summary>
                  <p>{a.reason}</p>
                  <pre className="warning-evidence">
                    {JSON.stringify(
                      {
                        periods: a.triggeringData,
                        observations: a.observations,
                        dataset: a.sourceDataset,
                        model: a.model,
                        riskThresholds: a.riskThresholds,
                      },
                      null,
                      2,
                    )}
                  </pre>
                </details>
              </div>
              <select
                aria-label={`Status for ${a.district}`}
                value={state.alertStates[a.id]?.status || 'NEW'}
                onChange={(e) => set(a.id, { status: e.target.value })}
              >
                {['NEW', 'REVIEWED', 'ACKNOWLEDGED', 'RESOLVED'].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
              <input
                aria-label={`Note for ${a.district}`}
                placeholder="Add a local research note…"
                maxLength={500}
                value={state.alertStates[a.id]?.note || ''}
                onChange={(e) => set(a.id, { note: e.target.value })}
              />
            </div>
          ))
        ) : (
          <Empty
            title="No matching analytical alerts"
            detail="Load observations or configure an enabled threshold rule."
          />
        )}
      </Panel>
    </>
  );
}
function Risk() {
  return <ExplainableRiskEngine filters={<Filters />} />;
}
function ForceHealth() {
  return (
    <Suspense fallback={<Empty title="Loading readiness evidence…" />}>
      <ForceHealthReadinessMatrix />
    </Suspense>
  );
}
const AnalyticalScenarioSimulator = lazy(() => import('./AnalyticalScenarioSimulator'));
function Scenario() {
  return (
    <Suspense fallback={<p>Loading simulator…</p>}>
      <AnalyticalScenarioSimulator />
    </Suspense>
  );
}
function Reports({ models, summary, spatial }: { models: any[]; summary: any; spatial: any }) {
  const { state, update, filtered, rows, year, district, model, signals } = useData();
  const [type, setType] = useState('Regional Summary'),
    [generated, setGenerated] = useState(false),
    [sections, setSections] = useState(['Observations', 'Alerts', 'Readiness']);
  const preset: Record<string, string[]> = {
    'Regional Summary': ['Observations', 'Charts', 'Map', 'Alerts'],
    'District Intelligence Report': ['Observations', 'Charts', 'Risk table'],
    'Risk Intelligence Report': ['Risk table', 'Map', 'Alerts'],
    'Model Performance Report': ['Model metrics', 'Charts'],
    'Spatial Analysis Report': ['Spatial evidence', 'Map'],
    'Data Quality Report': ['Quality', 'Observations'],
    'Force Health Readiness Report': ['Readiness', 'Alerts'],
  };
  const report = {
    title: type,
    year,
    district,
    model,
    source: state.active || 'Supplied study summary',
    observations: sections.includes('Observations') ? filtered : undefined,
    alerts: sections.includes('Alerts')
      ? signals.filter(
          (a) =>
            a.year === year &&
            (district === 'All districts' || normalize(a.district) === normalize(district)),
        )
      : undefined,
    readiness: sections.includes('Readiness') ? state.checklist : undefined,
    classification: safety,
    suppliedSummary: state.active ? undefined : summary,
    modelMetrics: sections.includes('Model metrics')
      ? {
          study: models.filter((m) => m.year === year),
          loaded: performance(filtered.filter((r) => r.model === model)),
        }
      : undefined,
    spatialEvidence: sections.includes('Spatial evidence') ? spatial : undefined,
    risk: sections.includes('Risk table')
      ? filtered.map((r) => ({
          district: r.district,
          incidence: incidence(r),
          risk: risk(r, state.thresholds),
          thresholds: state.thresholds,
        }))
      : undefined,
    quality: sections.includes('Quality')
      ? validate(rows as unknown as Record<string, unknown>[]).issues
      : undefined,
  };
  return (
    <>
      <Heading
        title="Reports"
        sub="Generate transparent, print-friendly local analytical reports."
      />
      <Panel title="Report builder">
        <div className="toolbar">
          <select
            aria-label="Report type"
            value={type}
            onChange={(e) => {
              setType(e.target.value);
              setSections(preset[e.target.value] || []);
              setGenerated(false);
            }}
          >
            {[
              'Regional Summary',
              'District Intelligence Report',
              'Risk Intelligence Report',
              'Model Performance Report',
              'Spatial Analysis Report',
              'Data Quality Report',
              'Force Health Readiness Report',
            ].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
          {[
            'Observations',
            'Alerts',
            'Readiness',
            'Charts',
            'Map',
            'Risk table',
            'Model metrics',
            'Spatial evidence',
            'Quality',
          ].map((s) => (
            <label className="check" key={s}>
              <input
                type="checkbox"
                checked={sections.includes(s)}
                onChange={(e) =>
                  setSections(e.target.checked ? [...sections, s] : sections.filter((x) => x !== s))
                }
              />
              {s}
            </label>
          ))}
          <Button
            primary
            onClick={() => {
              setGenerated(true);
              update({}, 'Report generated', type);
            }}
          >
            Generate report
          </Button>
        </div>
        <Filters />
      </Panel>
      {generated && (
        <Panel title={type} sub={`${district} · ${year} · source: ${report.source}`}>
          <div className="toolbar no-print">
            <Button onClick={() => window.print()}>Print / Save as PDF</Button>
            <Button onClick={() => download('analytical-report.json', report)}>Export JSON</Button>
            <Button onClick={() => download('report-observations.csv', toCSV(filtered), true)}>
              Export CSV
            </Button>
          </div>
          <p className="report-safety">{safety}</p>
          {sections.includes('Observations') && <Table rows={filtered} />}
          <h3 className="body-copy">Evidence limitations</h3>
          <p className="body-copy">
            User imports are schema validated and not independently verified. Predictions are not
            observations. Missing data remain unavailable. Readiness entries reflect local checklist
            review.
          </p>
          {sections.includes('Alerts') && <pre>{JSON.stringify(report.alerts, null, 2)}</pre>}
          {sections.includes('Readiness') && <pre>{JSON.stringify(report.readiness, null, 2)}</pre>}
          {!state.active && (
            <div className="body-copy">
              <h3>Supplied study evidence · not district observations</h3>
              <p>
                {fmt(summary?.totalCases)} reported cases across {summary?.districtYears}{' '}
                district-years in the balanced panel. Annual aggregate for {year}:{' '}
                {fmt(summary?.annual.find((r: any) => r.year === year)?.cases)} cases. Underlying
                district records were not supplied.
              </p>
            </div>
          )}
          {sections.includes('Charts') && (
            <Trend
              data={rows
                .filter(
                  (r) =>
                    district === 'All districts' || normalize(r.district) === normalize(district),
                )
                .sort((a, b) => a.year - b.year)}
            />
          )}
          {sections.includes('Map') && (
            <Suspense fallback={<Empty title="Loading report map…" />}>
              <MapView />
            </Suspense>
          )}
          {sections.includes('Risk table') && <pre>{JSON.stringify(report.risk, null, 2)}</pre>}
          {sections.includes('Model metrics') && (
            <pre>{JSON.stringify(report.modelMetrics, null, 2)}</pre>
          )}
          {sections.includes('Spatial evidence') && (
            <pre>{JSON.stringify(report.spatialEvidence, null, 2)}</pre>
          )}
          {sections.includes('Quality') && <pre>{JSON.stringify(report.quality, null, 2)}</pre>}
        </Panel>
      )}
    </>
  );
}
function SettingsPage() {
  const { state, update, year, setYear, district, setDistrict, model, setModel, rows } = useStore();
  const [name, setName] = useState('Analytical snapshot');
  const [error, setError] = useState('');
  function snapshot() {
    update(
      {
        snapshots: [
          ...state.snapshots,
          {
            id: crypto.randomUUID(),
            name,
            year,
            district,
            model,
            layer: state.layer,
            date: new Date().toISOString(),
            dataset: state.active,
            filters: state.filters,
            thresholds: state.thresholds,
            risk: rows
              .filter((r) => r.year === year)
              .map((r) => ({ district: r.district, risk: risk(r, state.thresholds) })),
          },
        ],
      },
      'Snapshot created',
      name,
    );
  }
  return (
    <>
      <Heading title="System Settings" sub="Configure local behavior and save analytical states." />
      <div className="two-col">
        <Panel title="General & accessibility">
          <label className="form-row">
            Local interface profile
            <select
              value={state.profile}
              onChange={(e) => update({ profile: e.target.value }, 'Local profile changed')}
            >
              {['RESEARCHER', 'ANALYST', 'VIEWER', 'DEMO MODE'].map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
          <p className="fine-print">Local interface profile — not server-side authentication.</p>
          <label className="form-row">
            Default year
            <input type="number" value={year} onChange={(e) => setYear(+e.target.value)} />
          </label>
          <label className="check body-copy">
            <input
              type="checkbox"
              checked={state.reduced}
              onChange={(e) =>
                update({ reduced: e.target.checked }, 'Animation preference changed')
              }
            />
            Reduced motion
          </label>
          <div className="toolbar">
            <Button
              onClick={() =>
                download('malariascope-settings.json', {
                  thresholds: state.thresholds,
                  rules: state.rules,
                  profile: state.profile,
                  reduced: state.reduced,
                })
              }
            >
              Export settings
            </Button>
            <label className="button">
              Import settings
              <input
                type="file"
                accept=".json"
                className="small-file"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f)
                    void f.text().then((t) => {
                      try {
                        const p = JSON.parse(t);
                        if (
                          !Array.isArray(p.thresholds) ||
                          p.thresholds.length !== 3 ||
                          !p.thresholds.every(
                            (n: any, i: number) =>
                              Number.isFinite(n) && n >= 0 && (i === 0 || n > p.thresholds[i - 1]),
                          )
                        )
                          throw Error('Invalid risk thresholds');
                        if (
                          !Array.isArray(p.rules) ||
                          !p.rules.every(
                            (r: any) =>
                              typeof r.id === 'string' &&
                              validCondition(r) &&
                              (!r.secondary ||
                                (validCondition(r.secondary) && ['AND', 'OR'].includes(r.join))) &&
                              (!r.persistence || [1, 2, 3].includes(r.persistence)) &&
                              (r.suppress === undefined || typeof r.suppress === 'boolean') &&
                              (!r.priority ||
                                ['LOW', 'NORMAL', 'HIGH', 'URGENT'].includes(r.priority)) &&
                              typeof r.enabled === 'boolean' &&
                              [
                                'INFO',
                                'WATCH',
                                'MODERATE',
                                'HIGH',
                                'CRITICAL ANALYTICAL SIGNAL',
                              ].includes(r.severity),
                          )
                        )
                          throw Error('Invalid alert rules');
                        update(
                          {
                            thresholds: p.thresholds,
                            rules: p.rules.map((r: any) => ({
                              ...r,
                              revision:
                                Math.max(
                                  state.rules.find((old) => old.id === r.id)?.revision || 0,
                                  ...(state.alertLog || [])
                                    .filter((a) => a.rule === r.id)
                                    .map((a) => a.ruleSnapshot.revision || 0),
                                ) + 1,
                            })),
                            reduced: !!p.reduced,
                          },
                          'Settings imported',
                        );
                        setError('');
                      } catch (err) {
                        setError(String(err));
                      }
                    });
                }}
              />
            </label>
          </div>
          {error && <p className="notice">{error}</p>}
          <Button
            onClick={() =>
              update(
                {
                  thresholds: [100, 300, 500],
                  rules: defaults,
                  reduced: false,
                  profile: 'RESEARCHER',
                  riskScenario: undefined,
                },
                'Settings reset',
              )
            }
          >
            Reset settings
          </Button>
        </Panel>
        <Panel
          title="Save Analytical Snapshot"
          sub="Application state, not new scientific evidence."
        >
          <div className="toolbar">
            <input
              aria-label="Snapshot name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
            />
            <Button primary onClick={snapshot}>
              <Save size={15} /> Save snapshot
            </Button>
          </div>
          {state.snapshots.map((s) => (
            <div className="snapshot" key={s.id}>
              <input
                aria-label="Rename snapshot"
                value={s.name}
                onChange={(e) =>
                  update({
                    snapshots: state.snapshots.map((x) =>
                      x.id === s.id ? { ...x, name: e.target.value } : x,
                    ),
                  })
                }
              />
              <span>
                {s.year} · {s.model}
              </span>
              <button
                className="text-link"
                onClick={() => {
                  setYear(s.year);
                  setModel(s.model);
                  setDistrict(s.district);
                  update(
                    {
                      layer: s.layer,
                      active:
                        s.dataset && state.datasets.some((d) => d.id === s.dataset)
                          ? s.dataset
                          : '',
                      filters: s.filters,
                      thresholds: s.thresholds || state.thresholds,
                    },
                    'Snapshot loaded',
                    s.name,
                  );
                }}
              >
                Load
              </button>
              <button
                className="icon-btn"
                aria-label="Duplicate snapshot"
                onClick={() =>
                  update({
                    snapshots: [
                      ...state.snapshots,
                      { ...s, id: crypto.randomUUID(), name: s.name + ' copy' },
                    ],
                  })
                }
              >
                <Copy size={15} />
              </button>
              <button
                className="icon-btn"
                aria-label="Delete snapshot"
                onClick={() => update({ snapshots: state.snapshots.filter((x) => x.id !== s.id) })}
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </Panel>
      </div>
      <Panel title="Local storage">
        <p className="body-copy">
          No information is sent to a server. Export datasets, settings, and reports before clearing
          browser storage.
        </p>
        <Button
          onClick={() => {
            if (
              window.confirm(
                'Clear all local datasets, checklist entries, alerts, snapshots, and settings?',
              )
            ) {
              localStorage.removeItem('malariascope-v1');
              location.reload();
            }
          }}
        >
          Reset application data
        </Button>
      </Panel>
    </>
  );
}
function Audit() {
  const { state } = useStore();
  return (
    <>
      <Heading
        title="Audit & Activity Log"
        sub="Local application activity, retained for reproducibility."
      >
        <Button onClick={() => download('activity-log.json', state.audit)}>Export log</Button>
      </Heading>
      <Panel title={`${state.audit.length} recorded events`}>
        <table>
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Event</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {state.audit.map((a, i) => (
              <tr key={i}>
                <td>
                  {new Date(a.time).toLocaleString('en-GB', { timeZone: 'Asia/Bangkok' })} ICT
                </td>
                <td>{a.event}</td>
                <td>{a.details}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!state.audit.length && (
          <p className="body-copy">
            Import a dataset or change a setting to begin the local activity log.
          </p>
        )}
      </Panel>
    </>
  );
}
function Spatial({ spatial }: { spatial: any }) {
  return (
    <Suspense fallback={<Empty title="Loading spatial analysis…" />}>
      <SpatialLab evidence={spatial} />
    </Suspense>
  );
}
function Evidence({
  summary,
  provenance,
  about = false,
}: {
  summary: any;
  provenance: any;
  about?: boolean;
}) {
  const [query, setQuery] = useState('');
  return (
    <>
      <Heading
        title={about ? 'About MALARIASCOPE' : 'Methodology & Evidence'}
        sub="Retrospective geospatial risk intelligence with traceable evidence."
      />
      <Panel title="Study evidence explorer">
        <div className="toolbar">
          <input
            placeholder="Search study evidence…"
            aria-label="Search evidence"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <Button onClick={() => download('supplied-evidence.json', { summary, provenance })}>
            Export evidence
          </Button>
        </div>
        <dl>
          {Object.entries(summary || {})
            .filter(([key, value]) =>
              `${key} ${JSON.stringify(value)}`.toLowerCase().includes(query.toLowerCase()),
            )
            .map(([key, value]) => (
              <React.Fragment key={key}>
                <dt>{key}</dt>
                <dd>{typeof value === 'object' ? JSON.stringify(value) : String(value)}</dd>
              </React.Fragment>
            ))}
        </dl>
        <p className="body-copy">
          Study aggregates are supplied evidence, not a complete connected surveillance dataset.
          This browser-only research prototype is not validated for operational deployment. Climate
          associations do not establish causality.
        </p>
      </Panel>
    </>
  );
}
function ProvenancePage({ data }: { data: any }) {
  const { state } = useStore();
  return (
    <>
      <Heading
        title="Data Provenance"
        sub="Inspect source, classification, and transformation history."
      >
        <Button
          onClick={() =>
            download('provenance.json', {
              sources: data,
              imports: state.datasets.map(({ rows: _rows, ...d }) => d),
            })
          }
        >
          Export provenance
        </Button>
      </Heading>
      <Panel title="Source registry">
        <pre>{JSON.stringify(data, null, 2)}</pre>
        {state.datasets.map((d) => (
          <div className="body-copy" key={d.id}>
            <h3>{d.name}</h3>
            <p>
              {d.source} · {d.created}
            </p>
            <code>SHA-256: {d.checksum}</code>
          </div>
        ))}
      </Panel>
    </>
  );
}
function GIS() {
  const { filtered } = useData();
  return (
    <>
      <Heading
        title="Geospatial Hotspot Intelligence"
        sub="Compare district evidence through time, inspect spatial context, and explore traceable map layers."
      >
        <Button onClick={() => window.print()}>Print map view</Button>
      </Heading>
      <Filters />
      <Suspense fallback={<Empty />}>
        <MapView large />
      </Suspense>
      <Panel
        title="District layer observations"
        sub="Click a named administrative feature to select its district profile."
      >
        <Table rows={filtered} />
      </Panel>
    </>
  );
}
function Presentation({ models, spatial }: { models: any[]; spatial: any }) {
  const [slide, setSlide] = useState(0);
  const titles = [
    'Papua Malaria Risk Map',
    'Temporal & Climate Intelligence',
    'Forecasting and Model Benchmarking',
    'Spatial Analysis',
    'Risk Intelligence',
    'Force Health Readiness',
  ];
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setSlide((s) => Math.min(5, s + 1));
      if (e.key === 'ArrowLeft') setSlide((s) => Math.max(0, s - 1));
    };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, []);
  return (
    <div className="presentation">
      <Heading title={titles[slide]} sub={`AMMM 2026 · ${slide + 1} / 6`} />
      <div className="toolbar">
        <Button onClick={() => setSlide(Math.max(0, slide - 1))}>Previous</Button>
        <Button onClick={() => setSlide(Math.min(5, slide + 1))}>Next</Button>
        <Button
          onClick={() => {
            void document.documentElement.requestFullscreen();
          }}
        >
          Fullscreen
        </Button>
        <Button onClick={() => setSlide(0)}>Reset view</Button>
        <NavLink to="/dashboard">Exit presentation</NavLink>
      </div>
      {slide === 0 ? (
        <GIS />
      ) : slide === 1 ? (
        <Climate />
      ) : slide === 2 ? (
        <Models models={models} />
      ) : slide === 3 ? (
        <Spatial spatial={spatial} />
      ) : slide === 4 ? (
        <Risk />
      ) : (
        <ForceHealth />
      )}
    </div>
  );
}
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <main className="fatal">
        <h1>The workspace could not be rendered.</h1>
        <p>Your local datasets remain in browser storage. Reload to retry.</p>
        <Button onClick={() => location.reload()}>Reload workspace</Button>
      </main>
    ) : (
      this.props.children
    );
  }
}
function App() {
  const location = useLocation(),
    navigate = useNavigate();
  const { state, rows, signals } = useStore();
  const [mobile, setMobile] = useState(false),
    [search, setSearch] = useState(false),
    [q, setQ] = useState('');
  const [data, setData] = useState<{
      summary: any;
      models: any[];
      spatial: any;
      provenance: any;
    } | null>(null),
    [error, setError] = useState('');
  useEffect(() => {
    void Promise.all(
      ['research-summary', 'model-performance', 'spatial-analysis', 'data-provenance'].map((n) =>
        fetch(`/data/${n}.json`).then((r) => {
          if (!r.ok) throw Error(`Unable to load ${n}`);
          return r.json();
        }),
      ),
    )
      .then(([summary, models, spatial, provenance]) =>
        setData({ summary, models, spatial, provenance }),
      )
      .catch((e) => setError(String(e)));
  }, []);
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setSearch((s) => !s);
      }
      if (e.key === 'Escape') {
        setSearch(false);
        setMobile(false);
      }
    };
    document.addEventListener('keydown', f);
    return () => document.removeEventListener('keydown', f);
  }, []);
  const path = location.pathname.split('/')[1] || 'dashboard';
  const present = path === 'presentation';
  const count = signals.filter(
    (a) => !['RESOLVED', 'ACKNOWLEDGED'].includes(state.alertStates[a.id]?.status || 'NEW'),
  ).length;
  const results = modules.filter((m) => m[1].toLowerCase().includes(q.toLowerCase()));
  return (
    <div className={`${present ? 'presentation-shell' : ''} ${state.reduced ? 'reduced' : ''}`}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      {!present && (
        <>
          <aside className={`sidebar ${mobile ? 'mobile-open' : ''}`}>
            <NavLink to="/dashboard" className="brand">
              <span className="brand-symbol">
                <Compass size={27} />
              </span>
              <div>
                MALARIA<span>SCOPE</span>
                <small>GEOSPATIAL RISK INTELLIGENCE</small>
              </div>
            </NavLink>
            <div className="workspace-label">
              <span className="dot" /> Papua research workspace
              <ChevronDown size={13} />
            </div>
            <nav aria-label="Primary navigation">
              <div className="nav-group">INTELLIGENCE WORKSPACE</div>
              {modules
                .slice(0, 12)
                .filter(
                  ([route]) =>
                    state.profile !== 'VIEWER' ||
                    !['model-benchmarking', 'spatial-analysis', 'scenario'].includes(route),
                )
                .map(([route, label, Icon]) => (
                  <NavLink key={route} to={`/${route}`} onClick={() => setMobile(false)}>
                    <Icon size={17} />
                    <span>{label}</span>
                    {route === 'early-warning' && count > 0 && (
                      <span className="nav-count">{count}</span>
                    )}
                  </NavLink>
                ))}
              <div className="nav-group">DATA & ADMINISTRATION</div>
              {modules.slice(12, 18).map(([route, label, Icon]) => (
                <NavLink key={route} to={`/${route}`} onClick={() => setMobile(false)}>
                  <Icon size={17} />
                  <span>{label}</span>
                </NavLink>
              ))}
            </nav>
            <div className="sidebar-bottom">
              <NavLink to="/methodology">
                <BookOpen size={16} />
                Methodology & evidence
                <ExternalLink size={12} />
              </NavLink>
              <NavLink to="/presentation">
                <Play size={16} />
                Presentation mode
              </NavLink>
              <div className="local-user">
                <span>RA</span>
                <div>
                  {state.profile === 'VIEWER'
                    ? 'Viewer'
                    : state.profile === 'DEMO MODE'
                      ? 'Demo interface'
                      : 'Research analyst'}
                  <small>Local workspace · v1.0</small>
                </div>
                <Settings size={15} />
              </div>
            </div>
          </aside>
          <header className="topbar">
            <div className="breadcrumb">
              <button
                className="icon-btn hamburger"
                aria-label="Open navigation"
                onClick={() => setMobile(!mobile)}
              >
                <Menu size={20} />
              </button>
              <Globe size={16} />
              <span>Intelligence workspace</span>
              <ChevronRight size={13} />
              <strong>{modules.find((m) => m[0] === path)?.[1] || 'Dashboard'}</strong>
            </div>
            <div className="topbar-actions">
              <button className="search-trigger" onClick={() => setSearch(true)}>
                <Search size={15} />
                <span>Search workspace</span>
                <kbd>⌘ K</kbd>
              </button>
              <span className="top-divider" />
              <NavLink className="notification" to="/alerts" aria-label="Open alerts">
                <Bell size={18} />
                {count > 0 && <i />}
              </NavLink>
              <NavLink to="/about" aria-label="About MALARIASCOPE">
                <HelpCircle size={18} />
              </NavLink>
              <span className="avatar">RA</span>
            </div>
          </header>
        </>
      )}
      <main id="main" className="main">
        <div className="safety-banner">
          <ShieldCheck size={16} />
          <span>{safety}</span>
          <Badge>RESEARCH PROTOTYPE</Badge>
        </div>
        {error ? (
          <div className="notice">
            {error}
            <Button onClick={() => window.location.reload()}>Retry loading</Button>
          </div>
        ) : !data ? (
          <Empty title="Loading supplied research evidence…" />
        ) : (
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route
              path="/dashboard"
              element={<Dashboard summary={data.summary} models={data.models} />}
            />
            <Route path="/risk-map" element={<GIS />} />
            <Route path="/surveillance" element={<Surveillance />} />
            <Route path="/district-intelligence" element={<District summary={data.summary} />} />
            <Route path="/climate" element={<Climate />} />
            <Route path="/forecasting" element={<Models models={data.models} forecast />} />
            <Route path="/model-benchmarking" element={<Models models={data.models} />} />
            <Route path="/spatial-analysis" element={<Spatial spatial={data.spatial} />} />
            <Route path="/early-warning" element={<EarlyWarning />} />
            <Route path="/risk-intelligence" element={<Risk />} />
            <Route path="/force-health" element={<ForceHealth />} />
            <Route path="/scenario" element={<Scenario />} />
            <Route path="/data-center" element={<DataCenter />} />
            <Route path="/data-quality" element={<Quality />} />
            <Route
              path="/reports"
              element={
                <Reports models={data.models} summary={data.summary} spatial={data.spatial} />
              }
            />
            <Route path="/alerts" element={<Alerts />} />
            <Route path="/audit" element={<Audit />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route
              path="/methodology"
              element={<Evidence summary={data.summary} provenance={data.provenance} />}
            />
            <Route path="/provenance" element={<ProvenancePage data={data.provenance} />} />
            <Route
              path="/about"
              element={<Evidence summary={data.summary} provenance={data.provenance} about />}
            />
            <Route
              path="/presentation"
              element={<Presentation models={data.models} spatial={data.spatial} />}
            />
            <Route
              path="*"
              element={
                <>
                  <Heading title="Workspace not found" sub="Select a module from the navigation." />
                  <NavLink to="/dashboard">Return to dashboard</NavLink>
                </>
              }
            />
          </Routes>
        )}
        <footer>
          <span>
            MALARIASCOPE <span className="footer-divider">/</span> Evidence-led. Geographically
            informed.
          </span>
          <span>
            <span className="dot" style={{ background: error ? '#bd665e' : '#188b78' }} />{' '}
            {error ? 'Application error' : data ? 'Application ready' : 'Loading application'}{' '}
            <span className="footer-divider">·</span> Local research prototype
          </span>
        </footer>
      </main>
      {!present && (
        <nav className="mobile-nav" aria-label="Mobile navigation">
          {[
            ['dashboard', 'Dashboard', Grid2X2],
            ['risk-map', 'Map', MapIcon],
            ['alerts', 'Alerts', Bell],
            ['district-intelligence', 'District', Target],
          ].map(([r, l, I]: any) => (
            <NavLink key={r} to={`/${r}`}>
              <I size={19} />
              {l}
            </NavLink>
          ))}
          <button onClick={() => setMobile(!mobile)}>
            <Menu size={19} />
            More
          </button>
        </nav>
      )}
      {search && (
        <div className="modal-backdrop" onClick={() => setSearch(false)}>
          <div
            className="modal search-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Search workspace"
            onKeyDown={(e) => dialogKeys(e, () => setSearch(false))}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="search-box">
              <Search size={20} />
              <input
                autoFocus
                aria-label="Global search"
                placeholder="Search modules, districts, datasets…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              <button
                aria-label="Close search"
                className="icon-btn"
                onClick={() => setSearch(false)}
              >
                <X size={20} />
              </button>
            </div>
            {results.map(([r, l, I]) => (
              <button
                className="search-result"
                key={r}
                onClick={() => {
                  navigate(`/${r}`);
                  setSearch(false);
                }}
              >
                <I size={17} />
                {l}
                <ArrowUpRight size={14} />
              </button>
            ))}
            {Array.from(new Set(rows.map((r) => r.district)))
              .filter((d) => d.toLowerCase().includes(q.toLowerCase()))
              .map((d) => (
                <button
                  className="search-result"
                  key={d}
                  onClick={() => {
                    navigate(`/district-intelligence?district=${encodeURIComponent(d)}`);
                    setSearch(false);
                  }}
                >
                  <Target size={17} />
                  {d}
                </button>
              ))}
            {state.datasets
              .filter((d) => d.name.toLowerCase().includes(q.toLowerCase()))
              .map((d) => (
                <button
                  className="search-result"
                  key={d.id}
                  onClick={() => {
                    navigate('/data-center');
                    setSearch(false);
                  }}
                >
                  <Database size={17} />
                  {d.name}
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <Provider>
          <App />
        </Provider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
);
