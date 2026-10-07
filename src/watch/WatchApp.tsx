import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ChevronLeft,
  ChevronRight,
  Compass,
  Info,
  RefreshCw,
  Bell,
  Activity,
  CloudSun,
  ShieldCheck,
  Database,
  Play,
  Pause,
} from 'lucide-react';
import { useStore } from '../store';
import { riskModes } from '../risk-engine';
import { forecastModels } from '../forecasting';
import {
  buildWatchSummary,
  watchEvidence,
  watchScreens,
  watchNumber,
  watchTimestamp,
  watchCategory,
  type WatchScreen,
  type WatchSummary,
  type WatchAlert,
} from './watch-selectors';
import './watch.css';
const icons = {
  Risk: Compass,
  Surveillance: Activity,
  Climate: CloudSun,
  Forecast: Activity,
  Alerts: Bell,
  Readiness: ShieldCheck,
  Sync: RefreshCw,
  Data: Database,
  District: Compass,
};
const safety =
  'Research Prototype — Aggregated Malaria Risk Intelligence — Not for Autonomous Clinical or Operational Decision-Making';
function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="w-detail">
      <span>{label}</span>
      <strong>{children}</strong>
    </div>
  );
}
function Ring({ summary }: { summary: WatchSummary }) {
  const category = watchCategory(summary.risk),
    step = ['LOW', 'MODERATE', 'HIGH', 'VERY HIGH'].indexOf(category),
    portion = step < 0 ? 0 : (step + 1) / 4;
  return (
    <div className="w-risk-ring" aria-label={`Research risk: ${category}`}>
      <svg viewBox="0 0 160 160" aria-hidden="true">
        <circle cx="80" cy="80" r="68" className="w-ring-track" />
        <circle
          cx="80"
          cy="80"
          r="68"
          className="w-ring-value"
          strokeDasharray={`${portion * 427.26} 427.26`}
        />
      </svg>
      <div>
        <Compass size={20} />
        <strong>{category}</strong>
        <span>RESEARCH RISK</span>
      </div>
    </div>
  );
}
function Screen({
  screen,
  summary,
  notify,
}: {
  screen: WatchScreen;
  summary: WatchSummary;
  notify: () => void;
}) {
  const r = summary.risk;
  switch (screen) {
    case 'Risk':
      return (
        <>
          <Ring summary={summary} />
          <p className="w-district">
            {r.district === 'All districts' ? 'Select district' : r.district}
          </p>
          <div className="w-inline">
            <span>{r.year}</span>
            <span>{watchNumber(r.incidence)} / 1k</span>
          </div>
          <p className="w-mini">{r.trend}</p>
        </>
      );
    case 'Surveillance':
      return (
        <>
          <p className="w-screen-label">OBSERVED CASES</p>
          <strong className="w-large">{watchNumber(r.cases)}</strong>
          <Detail label="Annual change">{watchNumber(r.change, '%')}</Detail>
          <Detail label="Current trend">{r.trend}</Detail>
          <p className="w-mini">Adjacent years only · {r.year}</p>
        </>
      );
    case 'Climate':
      return (
        <>
          <Detail label="Rainfall signal">{watchNumber(summary.climate.rainfall, ' SD')}</Detail>
          <Detail label="Temperature signal">
            {watchNumber(summary.climate.temperature, ' SD')}
          </Detail>
          <Detail label="Climate data">{summary.climate.status}</Detail>
          <p className="w-mini">Historical anomaly · ≥3 prior periods</p>
        </>
      );
    case 'Forecast':
      return (
        <>
          <p className="w-screen-label">SELECTED MODEL</p>
          <strong className="w-model">{summary.forecast.model}</strong>
          <Detail label="Predicted cases">{watchNumber(summary.forecast.prediction)}</Detail>
          <p className="w-mini">{summary.forecast.status}</p>
          <p className="w-mini">No validated confidence interval</p>
        </>
      );
    case 'Alerts':
      return (
        <>
          <div className="w-inline">
            <Detail label="New">{watchNumber(summary.alerts.newCount)}</Detail>
            <Detail label="Active">{watchNumber(summary.alerts.activeCount)}</Detail>
          </div>
          <p className="w-alert-severity">{summary.alerts.highestSeverity ?? 'No Data'}</p>
          <p className="w-trigger">
            {summary.alerts.latest?.trigger ?? 'No analytical trigger connected'}
          </p>
          {summary.alerts.latest && (
            <button className="w-screen-button" onClick={notify}>
              VIEW SIGNAL
            </button>
          )}
        </>
      );
    case 'Readiness':
      return (
        <>
          <div className="w-readiness">
            {summary.readiness.map((d) => (
              <div key={d.domain} data-state={d.status}>
                <span>{d.label}</span>
                <strong>{d.status}</strong>
              </div>
            ))}
          </div>
          <p className="w-mini">Derived / local review · no resource feed</p>
        </>
      );
    case 'Sync':
      return (
        <>
          <Detail label="Malaria data">{summary.sync.malaria}</Detail>
          <Detail label="Climate data">{summary.sync.climate}</Detail>
          <Detail label="Risk engine">{summary.sync.risk}</Detail>
          <p className="w-mini">
            Last update
            <br />
            {watchTimestamp(summary.sync.lastUpdate, true)}
          </p>
          <p className="w-mini">Local application state</p>
        </>
      );
    case 'Data':
      return (
        <>
          <Detail label="Data year">{summary.provenance.year}</Detail>
          <p className="w-source-label">{summary.provenance.status}</p>
          <p className="w-mini">
            {summary.provenance.derived ? 'Derived research risk' : 'No derived risk'} ·{' '}
            {summary.provenance.cached ? 'Cached source' : 'Local / supplied source'}
          </p>
          <p className="w-mini">
            Last loaded
            <br />
            {watchTimestamp(summary.provenance.lastLoaded, true)}
          </p>
          <Link className="w-screen-button" to="/provenance">
            Open full provenance
          </Link>
        </>
      );
    case 'District':
      return (
        <>
          <p className="w-district">
            {r.district === 'All districts' ? 'Select district' : r.district}
          </p>
          <Detail label="Risk">{watchCategory(r)}</Detail>
          <Detail label="Cases / incidence per 1k">
            {watchNumber(r.cases)} / {watchNumber(r.incidence)}
          </Detail>
          <Detail label="Trend / active alerts">
            {r.trend} / {watchNumber(summary.alerts.activeCount)}
          </Detail>
        </>
      );
  }
}
function Notification({
  alert,
  view,
  dismiss,
}: {
  alert: WatchAlert;
  view: () => void;
  dismiss: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    ref.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => {
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return (
    <div
      className="w-notification"
      data-new={alert.status === 'NEW'}
      role="dialog"
      aria-modal="false"
      aria-label="Watch analytical notification"
      ref={ref}
      onKeyDown={(e) => {
        if (e.key === 'Escape') dismiss();
      }}
    >
      <Bell size={22} />
      <strong>{alert.severity} SURVEILLANCE SIGNAL</strong>
      <p>{alert.district}</p>
      <p className="w-trigger">{alert.trigger}</p>
      <div>
        <button onClick={view}>VIEW</button>
        <button onClick={dismiss}>DISMISS</button>
      </div>
    </div>
  );
}
export default function WatchApp() {
  const {
    state,
    year,
    setYear,
    district,
    setDistrict,
    model,
    setModel,
    riskMode,
    setRiskMode,
    signals,
  } = useStore();
  const [study, setStudy] = useState<unknown>(null),
    [studyError, setStudyError] = useState(''),
    [cached, setCached] = useState(false),
    [retry, setRetry] = useState(0),
    [loadedAt, setLoadedAt] = useState<string | null>(null),
    [notice, setNotice] = useState('');
  const [screen, setScreen] = useState<WatchScreen>(() => {
      try {
        const s = localStorage.getItem('malariascope-watch-screen');
        return watchScreens.includes(s as WatchScreen) ? (s as WatchScreen) : 'Risk';
      } catch {
        return 'Risk';
      }
    }),
    [autoplay, setAutoplay] = useState(false),
    [reduced, setReduced] = useState(window.matchMedia('(prefers-reduced-motion: reduce)').matches),
    [paused, setPaused] = useState(false),
    [visible, setVisible] = useState(document.visibilityState === 'visible'),
    [notification, setNotification] = useState<WatchAlert | null>(null);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    setLoadedAt(new Date().toISOString());
  }, [state.datasets, state.active, state.geometry]);
  useEffect(() => {
    const controller = new AbortController();
    setStudyError('');
    void fetch('/data/research-summary.json', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok)
          throw Error(
            'Existing study summary could not be loaded. Local datasets remain available.',
          );
        setCached(response.headers.get('X-Malariascope-Cached') === 'true');
        return response.json();
      })
      .then((value) => {
        if (!controller.signal.aborted) {
          setStudy(value);
          setLoadedAt(new Date().toISOString());
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setStudyError(String(e));
      });
    return () => controller.abort();
  }, [retry]);
  const summary = useMemo(
    () =>
      buildWatchSummary({ state, year, district, model, alerts: signals, study, loadedAt, cached }),
    [state, year, district, model, signals, study, loadedAt, cached],
  );
  const evidence = useMemo(
    () => watchEvidence(state, model, study),
    [state.datasets, state.active, model, study],
  );
  const districts = [
    ...new Set([
      ...state.datasets.flatMap((d) => d.rows.map((r) => r.district)),
      ...evidence.records.map((r) => r.district),
    ]),
  ].sort();
  const years = [
    ...new Set([
      year,
      ...state.datasets.flatMap((d) => d.rows.map((r) => r.year)),
      ...evidence.records.map((r) => r.year),
    ]),
  ].sort((a, b) => a - b);
  const navigate = (delta: number) => {
    setNotification(null);
    setScreen(
      (previous) =>
        watchScreens[
          (watchScreens.indexOf(previous) + delta + watchScreens.length) % watchScreens.length
        ],
    );
  };
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)'),
      motion = () => {
        setReduced(media.matches);
        if (media.matches) setAutoplay(false);
      },
      visibility = () => setVisible(document.visibilityState === 'visible'),
      warning = (e: Event) => setNotice(String((e as CustomEvent).detail));
    media.addEventListener('change', motion);
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('malariascope-notice', warning);
    return () => {
      media.removeEventListener('change', motion);
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('malariascope-notice', warning);
    };
  }, []);
  useEffect(() => {
    if (!autoplay || reduced || paused || !visible || notification) return;
    const timer = window.setInterval(
      () =>
        setScreen(
          (previous) => watchScreens[(watchScreens.indexOf(previous) + 1) % watchScreens.length],
        ),
      6500,
    );
    return () => clearInterval(timer);
  }, [autoplay, reduced, paused, visible, notification, screen]);
  useEffect(() => {
    try {
      localStorage.setItem('malariascope-watch-screen', screen);
    } catch {
      setNotice('Screen preference could not be saved in this browser.');
    }
  }, [screen]);
  useEffect(() => setNotification(null), [district, year, model, riskMode, state.active]);
  const selectedAlert = notification
    ? summary.alerts.items.find((a) => a.id === notification.id)
    : null;
  const Icon = icons[screen],
    category = watchCategory(summary.risk),
    newAlert = summary.alerts.items.find((a) => a.status === 'NEW') ?? summary.alerts.latest;
  return (
    <div className="watch-demo">
      <header className="w-page-header">
        <Link to="/dashboard" className="w-brand">
          <Compass size={24} /> MALARIASCOPE
        </Link>
        <Link to="/mobile">Mobile workspace</Link>
      </header>
      <main>
        <div className="w-intro">
          <p className="w-eyebrow">AGGREGATED RESEARCH COMPANION</p>
          <h1>MALARIASCOPE Watch</h1>
          <p>Spatial Malaria Risk Intelligence</p>
          <p className="w-description">
            A wearable demonstration of district awareness, analytical signals and readiness review.
            Local application data only; no physical smartwatch connection.
          </p>
        </div>
        <div className="w-layout">
          <section className="w-presentation" aria-label="Smartwatch presentation">
            <div className="w-hardware">
              <div className="w-strap w-strap-top" />
              <div className="w-crown" aria-hidden="true" />
              <div className="w-case" data-risk={category}>
                <div
                  className="w-display"
                  data-screen={screen}
                  data-synced={summary.sync.malaria === 'Synced'}
                  role="region"
                  aria-label="MALARIASCOPE watch display"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.target !== e.currentTarget) return;
                    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                      e.preventDefault();
                      navigate(e.key === 'ArrowRight' ? 1 : -1);
                    }
                  }}
                  onFocusCapture={() => setPaused(true)}
                  onBlurCapture={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget)) setPaused(false);
                  }}
                  onPointerDown={(e) => {
                    if ((e.target as Element).closest('button,a')) return;
                    pointer.current = { x: e.clientX, y: e.clientY };
                  }}
                  onPointerCancel={() => {
                    pointer.current = null;
                  }}
                  onPointerUp={(e) => {
                    const start = pointer.current;
                    pointer.current = null;
                    if (
                      start &&
                      Math.abs(e.clientX - start.x) > 45 &&
                      Math.abs(e.clientX - start.x) > Math.abs(e.clientY - start.y) * 1.4
                    )
                      navigate(e.clientX < start.x ? 1 : -1);
                  }}
                >
                  <div className="w-face">
                    <div className="w-face-brand">MALARIASCOPE</div>
                    <div className="w-face-title">
                      <Icon size={14} />
                      <h2>{screen === 'Data' ? 'ⓘ DATA' : screen}</h2>
                    </div>
                    <div className="w-face-content" key={screen}>
                      <Screen
                        screen={screen}
                        summary={summary}
                        notify={() => {
                          if (newAlert) setNotification(newAlert);
                        }}
                      />
                    </div>
                    <div className="w-face-footer">
                      <span>{year}</span>
                      <span>
                        {watchScreens.indexOf(screen) + 1} / {watchScreens.length}
                      </span>
                      {summary.risk.experimental && <span>EXP</span>}
                    </div>
                  </div>
                  {selectedAlert && (
                    <Notification
                      alert={selectedAlert}
                      view={() => {
                        setScreen('Alerts');
                        setNotification(null);
                      }}
                      dismiss={() => setNotification(null)}
                    />
                  )}
                </div>
              </div>
              <div className="w-strap w-strap-bottom" />
            </div>
            <p className="w-screen-caption" aria-live="polite">
              Current screen: <b>{screen}</b>
            </p>
            <div className="w-navigation">
              <button aria-label="Previous watch screen" onClick={() => navigate(-1)}>
                <ChevronLeft size={20} />
                Previous
              </button>
              <button aria-label="Next watch screen" onClick={() => navigate(1)}>
                Next
                <ChevronRight size={20} />
              </button>
            </div>
          </section>
          <aside className="w-controls" aria-label="Watch demonstration controls">
            <h2>Presentation controls</h2>
            <label>
              Watch screen
              <select
                aria-label="Watch screen"
                value={screen}
                onChange={(e) => {
                  setScreen(e.target.value as WatchScreen);
                  setNotification(null);
                }}
              >
                {watchScreens.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <div className="w-select-row">
              <label>
                Data year
                <select
                  aria-label="Watch year"
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
                  aria-label="Watch district"
                  value={district}
                  onChange={(e) => setDistrict(e.target.value)}
                >
                  <option value="All districts">Select a district</option>
                  {district !== 'All districts' && !districts.includes(district) && (
                    <option>{district}</option>
                  )}
                  {districts.map((d) => (
                    <option key={d}>{d}</option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              Risk mode
              <select
                aria-label="Watch risk mode"
                value={riskMode}
                onChange={(e) => setRiskMode(e.target.value as typeof riskMode)}
              >
                {riskModes.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </label>
            <label>
              Forecasting model
              <select
                aria-label="Watch model"
                value={model}
                onChange={(e) => setModel(e.target.value)}
              >
                {forecastModels.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </label>
            <div className="w-control-actions">
              <button
                disabled={reduced}
                aria-pressed={autoplay}
                onClick={() => setAutoplay(!autoplay)}
              >
                {autoplay ? <Pause size={16} /> : <Play size={16} />}{' '}
                {autoplay ? 'Stop autoplay' : 'Start autoplay'}
              </button>
              <button
                disabled={!newAlert}
                onClick={() => {
                  if (newAlert) setNotification(newAlert);
                }}
              >
                <Bell size={16} />
                Preview latest alert
              </button>
            </div>
            <p className="w-help">
              Swipe horizontally or use arrow keys on the watch. Scroll inside compact screens.{' '}
              {reduced
                ? 'Reduced motion is active; autoplay is disabled.'
                : 'Autoplay pauses while the watch is focused or a notification is open.'}
            </p>
            {summary.risk.experimental && (
              <p className="w-warning">
                EXPERIMENTAL RISK CONFIGURATION — NOT VERIFIED RESEARCH OUTPUT.
              </p>
            )}
            {summary.identityIssues && (
              <p className="w-warning">
                Ambiguous district identities require review. No district observation is
                substituted.
              </p>
            )}
            {studyError && (
              <p role="alert" className="w-warning">
                {studyError}
                <button onClick={() => setRetry((n) => n + 1)}>Retry public summary</button>
              </p>
            )}
            {notice && (
              <p role="alert" className="w-warning">
                {notice}
              </p>
            )}
            <div className="w-evidence">
              <h3>
                <Info size={16} />
                Evidence note
              </h3>
              <p>{summary.risk.explanation}</p>
              <p>
                {summary.provenance.status}. Source labels do not establish independent
                verification.
              </p>
              <p>{summary.forecast.limitation}</p>
              <p>
                Sync means loaded local application evidence, not a live surveillance feed. Last
                loaded: {watchTimestamp(summary.provenance.lastLoaded)}.
              </p>
              {cached && (
                <p className="w-warning">Cached source — current freshness is not established.</p>
              )}
              <Link to="/provenance">Open MALARIASCOPE for full provenance.</Link>
              <Link to="/district-intelligence">Open full district intelligence</Link>
              <Link to="/force-health">Open full readiness evidence</Link>
            </div>
            <p className="w-help">
              Dismiss closes the watch notification preview; the shared analytical alert review
              status is unchanged.
            </p>
          </aside>
        </div>
        <p className="w-safety">{safety}</p>
      </main>
    </div>
  );
}
