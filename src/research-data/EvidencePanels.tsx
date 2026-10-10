import { Activity, Wind, Map, FlaskConical, CheckCircle, Target } from 'lucide-react';
import DataReadiness from '../DataReadiness';
import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useStore } from '../store';
import { getForecastIntensity, getSourceIssues, studyModels, forecastCutpoints } from './research';
export function EvidenceCoverage() {
  const {
    research: p,
    researchError,
    retryResearch,
    update,
    setYear,
    setModel,
    setDistrict,
  } = useStore();
  if (!p)
    return researchError ? (
      <section className="panel research-evidence" role="alert">
        <h2>Evidence coverage unavailable</h2>
        <p>{researchError}</p>
        <button className="button" onClick={retryResearch}>
          Retry evidence loading
        </button>
      </section>
    ) : (
      <p role="status">Loading checksummed study evidence…</p>
    );
  const candidate = p.coverage.candidatePanel.rows;
  const cards = [
    {
      title: 'Case surveillance',
      value: p.balanced.length,
      total: candidate,
      detail: 'Balanced district-year records',
      icon: Activity,
    },
    {
      title: 'Lagged targets',
      value: p.coverage.laggedTargets.rows,
      total: null,
      detail: 'Declared eligible targets · 2021–2025',
      icon: Target,
    },
    {
      title: 'Model training',
      value: p.coverage.training.rows,
      total: null,
      detail: 'Declared training rows · 2021–2023',
      icon: FlaskConical,
    },
    {
      title: 'Validation',
      value: p.coverage.validation.rows,
      total: null,
      detail: 'Declared selection rows · 2024',
      icon: CheckCircle,
    },
    {
      title: 'Spatial snapshot',
      value: p.spatial.length,
      total: p.registry.districts.length,
      detail: 'Districts with 2025 outcomes',
      icon: Map,
    },
    {
      title: 'Climate data',
      value: p.climate.length,
      total: p.balanced.length,
      detail: 'Annual records · balanced cohort',
      icon: Wind,
    },
  ];
  return (
    <section
      className="panel research-evidence coverage-cards"
      aria-label="Study evidence coverage"
    >
      <div className="panel-head">
        <div>
          <h2>Evidence coverage</h2>
          <p>MALARIASCOPE · Supplied study package · {p.manifest.version}</p>
        </div>
        <NavLink className="text-link" to="/methodology">
          View details →
        </NavLink>
      </div>
      <div className="evidence-grid">
        {cards.map(({ title, value, total, detail, icon: Icon }) => (
          <article className="evidence-card" key={title}>
            <div className="evidence-card-title">
              <span className="evidence-icon">
                <Icon size={16} />
              </span>
              <h3>{title}</h3>
            </div>
            <strong className="evidence-value">
              {value}
              {total !== null && <small> / {total}</small>}
            </strong>
            <p>{detail}</p>
            {total !== null ? (
              <progress value={value} max={total} aria-label={`${title}: ${value} of ${total}`} />
            ) : (
              <span className="evidence-declared">Supplied protocol count</span>
            )}
          </article>
        ))}
      </div>
      <p className="coverage-limitation">
        Package scope, independent of workspace filters. Extraction is not independently audited.{' '}
        {p.coverage.candidatePanel.availableBundledOutcomes} unique outcomes are bundled;{' '}
        {p.coverage.candidatePanel.observedOutcomesReported} are reported in metadata. Supiori’s
        missing records are not reconstructed.
      </p>
      <details className="evidence-technical">
        <summary>Advanced technical details · System evidence status</summary>
        <p>
          RETROSPECTIVE HINDCAST: preceding-year climate was used; historical source availability on
          an operational issue date is not established.
        </p>
        <pre>
          {JSON.stringify(
            {
              coverage: p.coverage,
              status: Object.fromEntries(
                Object.entries(p.status).filter(([name]) => name !== 'militaryMobility'),
              ),
            },
            null,
            2,
          )}
        </pre>
        <button
          className="button"
          onClick={() => {
            update({ active: 'study-balanced', researchMode: 'BUILTIN' });
            setYear(2025);
            setDistrict('All districts');
            setModel('Random Forest');
          }}
        >
          AMMM Demo Mode — use research data
        </button>
        <DataReadiness />
      </details>
    </section>
  );
}

export function SourceLedger() {
  const { research: p } = useStore();
  if (!p) return null;
  return (
    <details className="panel research-evidence">
      <summary>Source Quality Ledger — UNRESOLVED SOURCE ISSUES</summary>
      {p.ledger.map((r) => (
        <article key={r.id}>
          <strong>{r.id}</strong>
          <p>{r.description}</p>
          <p>
            {r.impact} {r.resolution}
          </p>
        </article>
      ))}
      <h3>District × Year outcome completeness</h3>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>District</th>
              {[2020, 2021, 2022, 2023, 2024, 2025].map((y) => (
                <th key={y}>{y}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {p.registry.districts.map((d: any) => (
              <tr key={d.canonicalName}>
                <td>{d.canonicalName}</td>
                {[2020, 2021, 2022, 2023, 2024, 2025].map((y) => (
                  <td key={y}>
                    {p.balanced.some((r) => r.district === d.canonicalName && r.year === y) ||
                    (y === 2025 && p.spatial.some((r) => r.district === d.canonicalName))
                      ? 'OBSERVED'
                      : d.canonicalName === 'Supiori' && y === 2024
                        ? 'MISSING'
                        : 'NOT SUPPLIED'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        Population denominators are connected only for 2025 observed API; prior populations belong
        to forecast intensity and are not substituted into observed incidence.
      </p>
    </details>
  );
}
export function ResearchForecastScience({ failure = false }: { failure?: boolean }) {
  const { research: p, district, year } = useStore();
  const [model, setModel] = useState('Random Forest');
  if (!p) return null;
  const perf = p.performance.filter((r) => r.year === 2025).sort((a, b) => a.mae - b.mae);
  const key = (
    {
      Persistence: 'persistence',
      'Ridge Regression — no climate': 'ridge_no_climate',
      'Ridge Regression': 'ridge_climate',
      'Random Forest': 'random_forest',
      'Gradient Boosting': 'gradient_boosting',
    } as Record<string, string>
  )[model];
  const rows = p.predictions.filter((r) => district === 'All districts' || r.district === district);
  const total = p.errors.reduce((s, r) => s + r.rf_absolute_error, 0);
  const kota = p.predictions.find((r) => r.district === 'Kota Jayapura'),
    kotaError = kota.random_forest - kota.observed;
  return (
    <section className="panel research-evidence">
      <h2>{failure ? 'Forecast Failure Inspector' : '2025 scientific interpretation'}</h2>
      <strong>RETROSPECTIVE HINDCAST · NOT LIVE FORECAST</strong>
      <p>
        Persistence had the lowest primary 2025 MAE. Model superiority is not established: the
        paired RF minus Persistence interval [{p.uncertainty.pairedInterval.join(', ')}] crosses
        zero.
      </p>
      <p>
        Persistence MAE 95% bootstrap interval {p.uncertainty.persistenceInterval.join(' – ')}; RF{' '}
        {p.uncertainty.rfInterval.join(' – ')}. Supplied uncertainty, not recomputed from rounded
        rows.
      </p>
      <h3>Does climate improve prediction?</h3>
      <p>
        Ridge no climate{' '}
        {p.performance.find((r) => r.model === 'Ridge Regression — no climate').mae.toFixed(2)};
        full climate {p.performance.find((r) => r.model === 'Ridge Regression').mae.toFixed(2)}.
        Adding the evaluated annual climate predictors did not improve 2025 MAE in this ridge
        comparison.
      </p>
      <details>
        <summary>Interpretation and provenance</summary>
        <p>
          This finding concerns predictive added value of the tested annual centroid climate
          features, not malaria biology. {p.manifest.verification}. Saved point predictions are
          rounded; full-precision reported metrics remain separate from recalculated row metrics.
          Leading permutation predictor: prior malaria burden; numeric importance scores were not
          supplied.
        </p>
      </details>
      <label>
        Saved hindcast model
        <select value={model} onChange={(e) => setModel(e.target.value)}>
          {studyModels.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
      </label>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Rank</th>
              <th>Model</th>
              <th>Supplied MAE</th>
              <th>RMSE</th>
              <th>R²</th>
            </tr>
          </thead>
          <tbody>
            {perf.map((r, i) => (
              <tr key={r.model}>
                <td>{i + 1}</td>
                <td>{r.model === 'Ridge Regression' ? 'Ridge — climate/full' : r.model}</td>
                <td>{r.mae}</td>
                <td>{r.rmse ?? 'Metric not available'}</td>
                <td>{r.r2 ?? 'Metric not available'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {year !== 2025 && (
        <p>Saved forecasts below are for 2025, independent of selected observation year {year}.</p>
      )}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>District</th>
              <th>Observed</th>
              <th>Saved prediction</th>
              <th>Signed error</th>
              <th>Absolute error</th>
              <th>Relative RF intensity</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.district}>
                <td>{r.district}</td>
                <td>{r.observed.toLocaleString()}</td>
                <td>{r[key]}</td>
                <td>{(r[key] - r.observed).toFixed(1)}</td>
                <td>{Math.abs(r[key] - r.observed).toFixed(1)}</td>
                <td>{getForecastIntensity(p, r.district)?.category ?? 'NO FORECAST'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        Kota Jayapura: observed {kota.observed.toLocaleString()}, RF{' '}
        {kota.random_forest.toLocaleString()}, signed error {kotaError.toLocaleString()};{' '}
        {((Math.abs(kotaError) / total) * 100).toFixed(2)}% of total RF absolute error. A low
        model-derived relative category can coexist with large observed burden and substantial
        forecast error.
      </p>
      <p>
        Relative forecast intensity cutpoints: {forecastCutpoints.join(', ')}. These are
        training-derived relative categories, not clinical thresholds, confirmed hotspots or
        individual probabilities. Supiori: NO FORECAST.
      </p>
    </section>
  );
}
export function DistrictResearchContext() {
  const { research: p, district, state } = useStore();
  if (!p || district === 'All districts' || state.researchMode !== 'BUILTIN') return null;
  const intensity = getForecastIntensity(p, district);
  return (
    <section className="notice research-evidence">
      <strong>{district} · study context</strong>
      <p>
        Relative RF forecast intensity:{' '}
        {intensity
          ? `${intensity.projected_per_1000} per 1,000 prior population · ${intensity.category}`
          : 'NO FORECAST'}
        . Prior denominator is not the observed 2025 at-risk population.
      </p>
      {getSourceIssues(p, district).map((i) => (
        <p key={i.id}>
          {i.id}: {i.description}
        </p>
      ))}
    </section>
  );
}
