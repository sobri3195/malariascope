import BrandMark from '../BrandMark';
import React, {
  createContext,
  lazy,
  Suspense,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Home, Map, Bell, Target, Menu, ArrowLeft } from 'lucide-react';
import { useStore } from '../store';
import { riskModes, type SpatialRiskInputs } from '../risk-engine';
import { validateGeometry } from '../geometry';
import { mobileEvidence, sourceStatus } from './mobile-engine';
import './mobile.css';
const Pages = lazy(() => import('./MobilePages'));
const MobileMap = lazy(() => import('./MobileMap'));
const MobileReport = lazy(() => import('./MobileReport'));
type Research = {
  summary: any;
  models: any[];
  spatial: any;
  provenance: Record<string, any>;
  cached: boolean;
  cachedAt?: string | null;
};
const Context = createContext<{
  data: Research | null;
  online: boolean;
  cached: boolean;
  evidence: ReturnType<typeof mobileEvidence>;
}>(null!);
export const useMobile = () => useContext(Context);
export const value = (n: number | null | undefined) =>
  n == null ? 'Data not available' : n.toLocaleString('en-GB', { maximumFractionDigits: 2 });
export const date = (s: string | undefined) =>
  s && Number.isFinite(Date.parse(s))
    ? new Date(s).toLocaleString('en-GB', { timeZone: 'Asia/Bangkok' }) + ' ICT'
    : 'Data not available';
export function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="m-card">
      <h2>{title}</h2>
      {children}
    </section>
  );
}
export function Sheet({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement,
      overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.querySelector<HTMLElement>('button,input,select')?.focus();
    return () => {
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return (
    <div className="m-sheet-backdrop" onClick={onClose}>
      <section
        ref={ref}
        className="m-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
          if (e.key === 'Tab') {
            const nodes = [
              ...ref.current!.querySelectorAll<HTMLElement>('button,input,select,a[href],textarea'),
            ].filter((n) => !n.hasAttribute('disabled'));
            if (e.shiftKey && document.activeElement === nodes[0]) {
              e.preventDefault();
              nodes.at(-1)?.focus();
            } else if (!e.shiftKey && document.activeElement === nodes.at(-1)) {
              e.preventDefault();
              nodes[0]?.focus();
            }
          }
        }}
      >
        <header>
          <h2>{title}</h2>
          <button aria-label="Close panel" onClick={onClose}>
            ×
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
class MobileBoundary extends React.Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <Card title="Mobile module unavailable">
        <p>
          A module may not be cached yet, or it could not be loaded. Reconnect and retry. Your local
          review state remains saved.
        </p>
        <button onClick={() => location.reload()}>Retry mobile module</button>
      </Card>
    ) : (
      this.props.children
    );
  }
}
export default function MobileApp() {
  const {
    state,
    research,
    update,
    year,
    setYear,
    district,
    setDistrict,
    model,
    riskMode,
    setRiskMode,
  } = useStore();
  const route = useLocation(),
    navigate = useNavigate();
  const [data, setData] = useState<Research | null>(null),
    [error, setError] = useState(''),
    [online, setOnline] = useState(navigator.onLine),
    [cacheStatus, setCacheStatus] = useState(false),
    [filters, setFilters] = useState(false),
    [retry, setRetry] = useState(0),
    [notice, setNotice] = useState('');
  const [spatial, setSpatial] = useState<{
    geometry: any;
    datasets: typeof state.datasets;
    active: string;
    year: number;
    model: string;
    inputs: SpatialRiskInputs;
  } | null>(null);
  const baseEvidence = useMemo(
    () => mobileEvidence(state, year, model),
    [state.datasets, state.active, state.riskMode, state.riskScenario, year, model],
  );
  useEffect(() => {
    let live = true;
    if (!state.geometry || !['SPATIAL RISK', 'COMPOSITE RESEARCH RISK'].includes(riskMode)) {
      setSpatial(null);
      return;
    }
    void import('../risk-spatial')
      .then((m) => {
        if (live)
          setSpatial({
            geometry: state.geometry,
            datasets: state.datasets,
            active: state.active,
            year,
            model,
            inputs: m.spatialRiskInputs(
              state.geometry,
              baseEvidence.risks.map((r) => r.record),
            ),
          });
      })
      .catch(() => {
        if (live) setSpatial(null);
      });
    return () => {
      live = false;
    };
  }, [state.geometry, state.datasets, year, model, riskMode, baseEvidence]);
  const inputs =
    spatial &&
    spatial.geometry === state.geometry &&
    spatial.datasets === state.datasets &&
    spatial.active === state.active &&
    spatial.year === year &&
    spatial.model === model
      ? spatial.inputs
      : {};
  const evidence = useMemo(
    () => (Object.keys(inputs).length ? mobileEvidence(state, year, model, inputs) : baseEvidence),
    [state, year, model, inputs, baseEvidence],
  );
  useEffect(() => {
    const controller = new AbortController();
    setError('');
    const names = ['research-summary', 'model-performance', 'spatial-analysis', 'data-provenance'];
    void Promise.allSettled(
      names.map(async (name) => {
        const response = await fetch(`/data/${name}.json`, { signal: controller.signal });
        if (!response.ok) throw Error(`Unable to load ${name}`);
        return {
          value: await response.json(),
          cached: response.headers.get('X-Malariascope-Cached') === 'true',
          cachedAt: response.headers.get('X-Malariascope-Cached-At'),
        };
      }),
    ).then((results) => {
      if (controller.signal.aborted) return;
      const values = results.map((r) => (r.status === 'fulfilled' ? r.value : null));
      setData({
        summary: values[0]?.value ?? null,
        models: Array.isArray(values[1]?.value) ? values[1].value : [],
        spatial: values[2]?.value ?? {},
        provenance: values[3]?.value ?? {},
        cached: values.some((r) => r?.cached),
        cachedAt: values.find((r) => r?.cached)?.cachedAt,
      });
      const missing = names.filter((_, i) => results[i].status === 'rejected');
      if (missing.length)
        setError(
          `Public research files unavailable: ${missing.join(', ')}. Loaded local datasets remain available.`,
        );
    });
    return () => controller.abort();
  }, [retry]);
  useEffect(() => {
    const viewport = document.querySelector<HTMLMetaElement>('meta[name="viewport"]'),
      previous = viewport?.content;
    if (viewport) viewport.content = 'width=device-width, initial-scale=1.0, viewport-fit=cover';
    const warning = (e: Event) => setNotice(String((e as CustomEvent).detail));
    window.addEventListener('malariascope-notice', warning);
    return () => {
      if (viewport && previous) viewport.content = previous;
      window.removeEventListener('malariascope-notice', warning);
    };
  }, []);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine),
      message = (e: MessageEvent) => {
        if (e.data?.type === 'MALARIASCOPE_CACHE_READY') setCacheStatus(true);
      };
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    navigator.serviceWorker?.addEventListener('message', message);
    if ('serviceWorker' in navigator && import.meta.env.PROD)
      void navigator.serviceWorker
        .register('/mobile-sw.js', { scope: '/mobile' })
        .then(async (registration) => {
          await navigator.serviceWorker.ready;
          const worker = registration.active;
          worker?.postMessage({
            type: 'CACHE_VISITED',
            urls: performance.getEntriesByType('resource').map((e) => e.name),
          });
        })
        .catch(() => setCacheStatus(false));
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
      navigator.serviceWorker?.removeEventListener('message', message);
    };
  }, []);
  const validGIS = useMemo(() => {
    try {
      validateGeometry(state.geometry);
      return true;
    } catch {
      return false;
    }
  }, [state.geometry]);
  const cached = !online || !!data?.cached;
  const years = [
    ...new Set([year, 2020, 2025, ...state.datasets.flatMap((d) => d.rows.map((r) => r.year))]),
  ].sort((a, b) => a - b);
  const districts = [
    ...new Set(state.datasets.flatMap((d) => d.rows.map((r) => r.district))),
  ].sort();
  return (
    <Context.Provider
      value={{
        data:
          data && research
            ? {
                ...data,
                models: research.performance,
                spatial: research.spatialResult,
                provenance: research.manifest,
              }
            : data,
        online,
        cached,
        evidence,
      }}
    >
      <div className="mobile-app">
        <header className="m-header">
          <div>
            <NavLink to="/mobile" className="malariascope-brand-line">
              <BrandMark size={28} />
              MALARIASCOPE
            </NavLink>
            <p>Malaria Spatial Early-Warning &amp; Risk Intelligence</p>
          </div>
          <button onClick={() => setFilters(true)} aria-label="Mobile context filters">
            Filters
          </button>
          <div className="m-context-line">
            {year} · {district} · {riskMode}
          </div>
          <div className="m-connectivity">
            <strong>{online && !data?.cached ? 'ONLINE' : 'OFFLINE / CACHED FALLBACK'}</strong>
            {cacheStatus && <span>DATA CACHED</span>}
          </div>
          {cached && (
            <p className="m-warning">
              Cached/local evidence — freshness is not established. Check observation periods and
              source registration dates.{' '}
              {data?.cachedAt && `Public assets cached: ${date(data.cachedAt)}.`}
              <button onClick={() => setRetry((n) => n + 1)}>Refresh public evidence</button>
            </p>
          )}
          <div className="m-source-status" aria-label="Mobile data status">
            {[
              ['Malaria Data', sourceStatus(evidence.records, ['cases'], cached)],
              ['Climate Data', sourceStatus(evidence.records, ['rainfall', 'temperature'], cached)],
              ['GIS Data', validGIS ? (cached ? 'Cached' : 'Connected') : 'Not Connected'],
              ['Model Output', sourceStatus(evidence.records, ['prediction'], cached)],
            ].map(([label, status]) => (
              <span key={label}>
                {label}
                <b>{status}</b>
              </span>
            ))}
          </div>
        </header>
        <main className="m-main" id="mobile-main">
          <p className="m-disclaimer">
            RETROSPECTIVE RESEARCH DATA · Research prototype · Decision Support — Not Autonomous
            Clinical or Operational Recommendations
          </p>
          {evidence.configuration.experimental && (
            <p className="m-warning">
              EXPERIMENTAL RISK CONFIGURATION — NOT VERIFIED RESEARCH OUTPUT.
            </p>
          )}
          {notice && (
            <p className="m-warning" role="alert">
              {notice}
            </p>
          )}
          {error && (
            <Card title="Research files unavailable">
              <p role="alert">{error}</p>
              <button onClick={() => setRetry(retry + 1)}>Retry research files</button>
            </Card>
          )}
          {!data ? (
            <div className="m-loading" role="status">
              Loading existing research evidence…
            </div>
          ) : (
            <MobileBoundary key={route.pathname}>
              <Suspense
                fallback={
                  <div className="m-loading" role="status">
                    Loading mobile module…
                  </div>
                }
              >
                <Routes>
                  <Route path="/mobile" element={<Pages page="home" />} />
                  <Route path="/mobile/map" element={<MobileMap />} />
                  <Route path="/mobile/report" element={<MobileReport />} />
                  {[
                    'district',
                    'alerts',
                    'surveillance',
                    'models',
                    'readiness',
                    'more',
                    'provenance',
                    'quality',
                  ].map((page) => (
                    <Route key={page} path={'/mobile/' + page} element={<Pages page={page} />} />
                  ))}
                  <Route
                    path="*"
                    element={
                      <Card title="Mobile page not found">
                        <NavLink to="/mobile">Return to Home</NavLink>
                      </Card>
                    }
                  />
                </Routes>
              </Suspense>
            </MobileBoundary>
          )}
        </main>
        <nav className="m-bottom" aria-label="Mobile application navigation">
          {[
            ['/mobile', 'Home', Home],
            ['/mobile/map', 'Map', Map],
            ['/mobile/alerts', 'Alerts', Bell],
            ['/mobile/district', 'District', Target],
            ['/mobile/more', 'More', Menu],
          ].map(([path, label, Icon]: any) => (
            <NavLink end={path === '/mobile'} key={path} to={path}>
              <Icon size={22} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        {filters && (
          <Sheet title="Mobile context" onClose={() => setFilters(false)}>
            <label>
              Year
              <select
                aria-label="Mobile year"
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
              >
                {years.map((y) => (
                  <option key={y}>{y}</option>
                ))}
              </select>
            </label>
            <label>
              District
              <select
                aria-label="Mobile district"
                value={district}
                onChange={(e) => setDistrict(e.target.value)}
              >
                <option>All districts</option>
                {!districts.includes(district) && district !== 'All districts' && (
                  <option>{district}</option>
                )}
                {districts.map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </label>
            <label>
              Risk mode
              <select
                aria-label="Mobile risk mode"
                value={riskMode}
                onChange={(e) => setRiskMode(e.target.value as typeof riskMode)}
              >
                {riskModes.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </label>
            <label>
              Dataset
              <select
                aria-label="Mobile dataset"
                value={state.active}
                onChange={(e) =>
                  update({ active: e.target.value }, 'Dataset selected', e.target.value)
                }
              >
                <option value="">No primary dataset</option>
                {!state.datasets.some((d) => d.id === 'study-balanced') && research && (
                  <option value="study-balanced">Verified MALARIASCOPE Study</option>
                )}
                {state.datasets.map((d) => (
                  <option value={d.id} key={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
            <button onClick={() => setFilters(false)}>Apply / close</button>
            <button
              onClick={() => {
                setFilters(false);
                navigate('/dashboard');
              }}
            >
              <ArrowLeft size={18} />
              Open desktop workspace
            </button>
          </Sheet>
        )}
      </div>
    </Context.Provider>
  );
}
