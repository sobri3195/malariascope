import { useMemo, useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  BarChart,
  Bar,
  LineChart,
  Line,
  Legend,
} from 'recharts';
import { useStore } from './store';
import { download, normalize } from './analytics';
import {
  forecastModels,
  primaryMetrics,
  loadedForecastEvidence,
  evaluateForecasts,
  studyEvaluations,
  scientificInterpretation,
  districtErrorRanking,
  modelFailureAnalysis,
  residualHistogram,
  type ForecastModel,
  type ForecastPair,
  type PrimaryMetric,
  type ModelEvaluation,
} from './forecasting';
import './forecast.css';
const modes = ['Model Comparison', 'District Forecast Inspection', 'Error Analysis'] as const;
const num = (n: number | null | undefined, digits = 2) =>
  n == null ? 'Data not available' : n.toLocaleString('en-GB', { maximumFractionDigits: digits });
function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="panel forecast-panel">
      <div className="panel-head">
        <h2>{title}</h2>
      </div>
      <div className="forecast-panel-body">{children}</div>
    </section>
  );
}
function ScatterPlot({
  pairs,
  residual = false,
  onInspect,
  selected,
}: {
  pairs: ForecastPair[];
  residual?: boolean;
  onInspect: (pair: ForecastPair) => void;
  selected: string;
}) {
  if (!pairs.length)
    return (
      <p>Paired district observations and predictions are not available for this selection.</p>
    );
  const max = Math.max(1, ...pairs.flatMap((p) => [p.observed, p.predicted])) * 1.05;
  return (
    <>
      <div
        className="forecast-chart"
        aria-label={residual ? 'Residual plot' : 'Observed-versus-predicted scatterplot'}
      >
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 14, right: 20, bottom: 26, left: 15 }}>
            <CartesianGrid strokeDasharray="3 4" />
            <XAxis
              type="number"
              dataKey="observed"
              name="Observed cases"
              domain={residual ? ['auto', 'auto'] : [0, max]}
              label={{ value: 'Observed cases', position: 'insideBottom', offset: -12 }}
              tick={{ fontSize: 10 }}
            />
            <YAxis
              type="number"
              dataKey={residual ? 'residual' : 'predicted'}
              name={residual ? 'Residual' : 'Predicted cases'}
              domain={residual ? ['auto', 'auto'] : [0, max]}
              label={{
                value: residual ? 'Prediction − observed' : 'Predicted cases',
                angle: -90,
                position: 'insideLeft',
              }}
              tick={{ fontSize: 10 }}
            />
            <Tooltip
              cursor={{ strokeDasharray: '3 3' }}
              formatter={(value: any) => num(Number(value))}
            />
            {residual ? (
              <ReferenceLine y={0} stroke="#8b9b9d" />
            ) : (
              <ReferenceLine
                segment={[
                  { x: 0, y: 0 },
                  { x: max, y: max },
                ]}
                stroke="#8b9b9d"
                strokeDasharray="5 3"
              />
            )}
            <Scatter
              data={pairs}
              name="District-year pairs"
              isAnimationActive={false}
              shape={(point: any) => {
                const pair = point.payload as ForecastPair;
                return (
                  <circle
                    cx={point.cx}
                    cy={point.cy}
                    r={selected === `${pair.model}:${pair.key}` ? 7 : 5}
                    fill={selected === `${pair.model}:${pair.key}` ? '#ba7650' : '#168478'}
                    stroke="white"
                    strokeWidth={1.5}
                    role="button"
                    tabIndex={0}
                    aria-label={`Inspect ${pair.district}, ${pair.year}${residual ? ', residual' : ''}`}
                    onClick={() => onInspect(pair)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onInspect(pair);
                      }
                    }}
                  >
                    <title>{`${pair.district} · ${pair.year} · observed ${pair.observed} · predicted ${pair.predicted} · residual ${pair.residual}`}</title>
                  </circle>
                );
              }}
            />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <p className="forecast-note">
        {residual
          ? 'Zero line indicates no signed error.'
          : 'Dashed diagonal indicates observed = predicted.'}{' '}
        Select a point, or use the equivalent paired-data table, to inspect its district and source.
      </p>
    </>
  );
}
function Distribution({ evaluation }: { evaluation: ModelEvaluation }) {
  const histogram = residualHistogram(evaluation.pairs);
  return histogram.length ? (
    <>
      <div className="forecast-histogram" aria-label={`${evaluation.model} residual distribution`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={histogram} margin={{ top: 12, right: 8, bottom: 8, left: 0 }}>
            <CartesianGrid strokeDasharray="3 4" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 8 }} interval="preserveStartEnd" />
            <YAxis allowDecimals={false} tick={{ fontSize: 9 }} width={30} />
            <Tooltip />
            <Bar
              dataKey="count"
              name="Paired observations"
              fill="#168478"
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <details>
        <summary>Residual distribution values</summary>
        <table>
          <thead>
            <tr>
              <th>Signed residual interval</th>
              <th>Count</th>
            </tr>
          </thead>
          <tbody>
            {histogram.map((bin, i) => (
              <tr key={i}>
                <td>{bin.label}</td>
                <td>{bin.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </>
  ) : (
    <p className="forecast-note">
      Residual distribution unavailable: district predictions are not connected.
    </p>
  );
}
export default function ForecastWorkbench({
  study,
  filters,
  laboratory = false,
}: {
  study: any[];
  filters: ReactNode;
  laboratory?: boolean;
}) {
  const { state, update, year, setYear, district, setDistrict, model, setModel } = useStore();
  const [mode, setMode] = useState<(typeof modes)[number]>('Model Comparison'),
    [metric, setMetric] = useState<PrimaryMetric>('mae'),
    [sourceChoice, setSourceChoice] = useState<'AUTO' | 'LOADED' | 'SUPPLIED'>('AUTO'),
    [scope, setScope] = useState('ALL'),
    [common, setCommon] = useState(true),
    [windowed, setWindowed] = useState(false),
    [startYear, setStartYear] = useState<number | null>(null),
    [included, setIncluded] = useState<ForecastModel[]>([...forecastModels]),
    [selection, setSelection] = useState<{ context: string; pair: ForecastPair } | null>(null);
  const datasets = useMemo(
    () =>
      scope === 'ACTIVE' ? state.datasets.filter((d) => d.id === state.active) : state.datasets,
    [scope, state.datasets, state.active],
  );
  const evidence = useMemo(
    () => loadedForecastEvidence(datasets, state.active),
    [datasets, state.active],
  );
  const source =
    sourceChoice === 'AUTO' ? (evidence.pairs.length ? 'LOADED' : 'SUPPLIED') : sourceChoice;
  const years = useMemo(
    () =>
      [
        ...new Set(
          source === 'LOADED' ? evidence.observations.map((r) => r.year) : study.map((r) => r.year),
        ),
      ].sort((a, b) => a - b),
    [source, evidence.observations, study],
  );
  const start =
    source === 'LOADED' && windowed ? Math.min(startYear ?? years[0] ?? year, year) : year;
  const loaded = useMemo(
    () => evaluateForecasts(evidence.pairs, included, start, year, metric, common),
    [evidence.pairs, included, start, year, metric, common],
  );
  const evaluations =
    source === 'LOADED' ? loaded.evaluations : studyEvaluations(study, year, included, metric);
  const primary = evaluations.find((e) => e.model === model),
    primaryPairs = primary?.pairs || [];
  const districts = [...new Set(evidence.observations.map((r) => r.district))].sort();
  const chosen =
    source === 'LOADED'
      ? evidence.pairs.filter(
          (p) =>
            p.model === model &&
            p.year >= start &&
            p.year <= year &&
            normalize(p.district) === normalize(district),
        )
      : [];
  const selectionContext = JSON.stringify([
    source,
    scope,
    state.active,
    datasets.map((d) => [d.id, d.checksum]),
    start,
    year,
    model,
    metric,
    common,
    included,
    mode,
    district,
  ]);
  const selectedPair = selection?.context === selectionContext ? selection.pair : null;
  const selectedKey = selectedPair ? `${selectedPair.model}:${selectedPair.key}` : '';
  const interpretation = scientificInterpretation(evaluations, metric, loaded.comparable);
  function inspect(pair: ForecastPair) {
    setSelection({ context: selectionContext, pair });
  }
  const history = evidence.observations
    .filter((r) => normalize(r.district) === normalize(district) && r.year <= year)
    .map((r) => ({
      year: r.year,
      observed: r.values.cases,
      predicted:
        evidence.pairs.find(
          (p) =>
            p.model === model &&
            p.key.endsWith(`:${r.year}`) &&
            normalize(p.district) === normalize(r.district),
        )?.predicted ?? null,
    }));
  const ranking = districtErrorRanking(primaryPairs);
  const pointDetail = selectedPair ? (
    <section className="forecast-point" aria-label="Selected forecast point" aria-live="polite">
      <h3>
        {selectedPair.district} · {selectedPair.year} · {selectedPair.model}
      </h3>
      <dl>
        <dt>Observed</dt>
        <dd>{num(selectedPair.observed)}</dd>
        <dt>Predicted</dt>
        <dd>{num(selectedPair.predicted)}</dd>
        <dt>Residual</dt>
        <dd>{num(selectedPair.residual)}</dd>
        <dt>Absolute error</dt>
        <dd>{num(selectedPair.absoluteError)}</dd>
      </dl>
      <p>Residual = predicted − observed.</p>
      <button
        className="text-link"
        onClick={() => {
          setDistrict(selectedPair.district);
          setMode('District Forecast Inspection');
        }}
      >
        Inspect this district →
      </button>
      <details>
        <summary>Exact point provenance</summary>
        <pre>{JSON.stringify(selectedPair.references, null, 2)}</pre>
      </details>
    </section>
  ) : (
    <p className="forecast-note">
      Select a scatterplot point or paired-data row for exact values and provenance.
    </p>
  );
  const pairTable = (pairs: ForecastPair[]) =>
    pairs.length ? (
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>District</th>
              <th>Year</th>
              <th>Observed</th>
              <th>Predicted</th>
              <th>Residual</th>
              <th>Absolute error</th>
            </tr>
          </thead>
          <tbody>
            {pairs.map((p) => (
              <tr key={`${p.model}:${p.key}`}>
                <td>
                  <button className="text-link" onClick={() => inspect(p)}>
                    {p.district}
                  </button>
                </td>
                <td>{p.year}</td>
                <td>{num(p.observed)}</td>
                <td>{num(p.predicted)}</td>
                <td>{num(p.residual)}</td>
                <td>{num(p.absoluteError)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : (
      <p>No paired records in this selection.</p>
    );
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">TRANSPARENT FORECAST VALIDATION</div>
          <h1>
            {laboratory ? 'Model Laboratory · Forecasting Workbench' : 'Forecasting Workbench Pro'}
          </h1>
          <p>
            Compare declared model outputs, inspect district predictions, and measure observed
            errors.
          </p>
        </div>
        <button
          className="button"
          onClick={() =>
            download('forecasting-workbench.json', {
              created: new Date().toISOString(),
              source,
              scope,
              primaryMetric: metric,
              selectedModel: model,
              startYear: start,
              endYear: year,
              commonCohort: common,
              comparable: loaded.comparable,
              evaluations,
              interpretation,
              failures: evaluations.map((e) => ({
                model: e.model,
                findings: modelFailureAnalysis(e),
              })),
              dataQualityIssues: evidence.issues,
              studyProvenance:
                source === 'SUPPLIED'
                  ? {
                      source: 'User-supplied study results; not independently verified',
                      underlyingPredictions: 'Not connected',
                    }
                  : null,
            })
          }
        >
          Export workbench
        </button>
      </div>
      {filters}
      <div className="forecast-controls">
        <label>
          Evidence basis
          <select
            aria-label="Forecast evidence basis"
            value={sourceChoice}
            onChange={(e) => setSourceChoice(e.target.value as typeof sourceChoice)}
          >
            <option value="AUTO">
              Automatic · {source === 'LOADED' ? 'loaded pairs' : 'supplied aggregates'}
            </option>
            <option value="LOADED">Loaded paired observations</option>
            <option value="SUPPLIED">Supplied study aggregates</option>
          </select>
        </label>
        <label>
          Primary metric
          <select
            aria-label="Forecast primary metric"
            value={metric}
            onChange={(e) => setMetric(e.target.value as PrimaryMetric)}
          >
            {primaryMetrics.map(([id, label]) => (
              <option value={id} key={id}>
                {label} · {id === 'r2' ? 'higher' : 'lower'} is better
              </option>
            ))}
          </select>
        </label>
        <label>
          Inspect model
          <select
            aria-label="Forecast model"
            value={model}
            onChange={(e) => setModel(e.target.value)}
          >
            {forecastModels.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </label>
        {source === 'LOADED' && (
          <>
            <label>
              Data scope
              <select
                aria-label="Forecast data scope"
                value={scope}
                onChange={(e) => setScope(e.target.value)}
              >
                <option value="ALL">All loaded datasets</option>
                <option value="ACTIVE">Active dataset only</option>
              </select>
            </label>
            <label>
              Comparison cohort
              <select
                aria-label="Forecast comparison cohort"
                value={common ? 'COMMON' : 'AVAILABLE'}
                onChange={(e) => setCommon(e.target.value === 'COMMON')}
              >
                <option value="COMMON">Common paired district-years</option>
                <option value="AVAILABLE">Available pairs per model</option>
              </select>
            </label>
            <label className="forecast-check">
              <input
                type="checkbox"
                aria-label="Multi-year evaluation"
                checked={windowed}
                onChange={(e) => setWindowed(e.target.checked)}
              />
              Multi-year evaluation
            </label>
            {windowed && (
              <label>
                Validation start
                <select
                  aria-label="Forecast validation start"
                  value={start}
                  onChange={(e) => setStartYear(+e.target.value)}
                >
                  {years
                    .filter((y) => y <= year)
                    .map((y) => (
                      <option key={y}>{y}</option>
                    ))}
                </select>
              </label>
            )}
          </>
        )}
        <label>
          Validation end year
          <select
            aria-label="Forecast validation end"
            value={year}
            onChange={(e) => setYear(+e.target.value)}
          >
            {[...new Set([...years, year])]
              .sort((a, b) => a - b)
              .map((y) => (
                <option key={y}>{y}</option>
              ))}
          </select>
        </label>
      </div>
      <fieldset className="forecast-models">
        <legend>Models in comparison</legend>
        {forecastModels.map((m) => (
          <label key={m}>
            <input
              type="checkbox"
              aria-label={`Compare ${m}`}
              checked={included.includes(m)}
              onChange={(e) =>
                setIncluded((prev) =>
                  e.target.checked ? [...prev, m] : prev.filter((x) => x !== m),
                )
              }
            />
            {m}
          </label>
        ))}
      </fieldset>
      <section className="forecast-interpretation" aria-label="Scientific interpretation">
        <div className="eyebrow">
          SCIENTIFIC INTERPRETATION · PRIMARY {primaryMetrics.find(([id]) => id === metric)?.[1]}
        </div>
        <h2>{interpretation}</h2>
        <p>
          {source === 'SUPPLIED'
            ? 'This statement summarizes supplied study aggregates, not independently verified results. Only models with available selected-metric values are ranked; no district-level errors or uncertainty intervals are inferred from aggregates.'
            : 'Computed from loaded paired observations. No statistical superiority or performance outside this evaluated cohort is established.'}
        </p>
      </section>
      <div className="notice">
        {source === 'SUPPLIED'
          ? `Supplied validation period ${year}. The stated study protocol uses 2021–2023 training, 2024 selection, refit through 2024, and a 2025 test; these labels are supplied, not independently audited.`
          : `Evaluation period ${start === year ? year : `${start}–${year}`} · ${loaded.participating.length} participating models with paired outputs · ${loaded.commonPairs} common district-years. Models without paired outputs remain unranked. Imported outputs do not establish an untouched test set or rule out training leakage.`}{' '}
        Observations remain separate from predictions. Forecasts are inspected from loaded outputs;
        this workbench does not train models or manufacture missing predictions.
      </div>
      <div className="tabs forecast-tabs" role="tablist" aria-label="Forecasting workbench modes">
        {modes.map((name, i) => (
          <button
            key={name}
            id={`forecast-tab-${i}`}
            role="tab"
            aria-selected={mode === name}
            aria-controls={`forecast-panel-${i}`}
            tabIndex={mode === name ? 0 : -1}
            className={mode === name ? 'active' : ''}
            onClick={() => setMode(name)}
            onKeyDown={(event) => {
              let index = i;
              if (event.key === 'ArrowRight') index = (i + 1) % modes.length;
              else if (event.key === 'ArrowLeft') index = (i + modes.length - 1) % modes.length;
              else if (event.key === 'Home') index = 0;
              else if (event.key === 'End') index = modes.length - 1;
              else return;
              event.preventDefault();
              setMode(modes[index]);
              document.getElementById(`forecast-tab-${index}`)?.focus();
            }}
          >
            {name}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`forecast-panel-${modes.indexOf(mode)}`}
        aria-labelledby={`forecast-tab-${modes.indexOf(mode)}`}
      >
        {mode === 'Model Comparison' ? (
          <>
            <Panel title="Dynamic model leaderboard">
              <p>
                Rank follows the selected primary metric. Ties share a rank; unavailable metrics are
                unranked.{' '}
                {source === 'LOADED'
                  ? 'Comparison covers all district-years in the chosen evaluation cohort, independent of the global district display selection.'
                  : ''}
              </p>
              <div className="table-scroll">
                <table aria-label="Forecast model leaderboard">
                  <thead>
                    <tr>
                      <th>Rank</th>
                      <th>Model</th>
                      <th>MAE</th>
                      <th>RMSE</th>
                      <th>R²</th>
                      <th>Median absolute error</th>
                      <th>Prediction bias</th>
                      <th>Paired n</th>
                      <th>Validation period</th>
                    </tr>
                  </thead>
                  <tbody>
                    {evaluations.map((e) => (
                      <tr key={e.model}>
                        <td>{e.rank ?? 'Unranked'}</td>
                        <td>
                          <button className="text-link" onClick={() => setModel(e.model)}>
                            {e.model}
                          </button>
                        </td>
                        <td>{num(e.metrics.mae)}</td>
                        <td>{num(e.metrics.rmse)}</td>
                        <td>{num(e.metrics.r2, 4)}</td>
                        <td>{num(e.metrics.medianAbsoluteError)}</td>
                        <td>{num(e.metrics.bias)}</td>
                        <td>{e.metrics.n ?? 'Not supplied'}</td>
                        <td>
                          {e.period} · {e.basis === 'SUPPLIED' ? 'supplied' : 'loaded evaluation'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
            <div className="forecast-grid">
              <Panel title={`${model} · observed versus predicted`}>
                <ScatterPlot pairs={primaryPairs} onInspect={inspect} selected={selectedKey} />
                {pointDetail}
              </Panel>
              <Panel title={`${model} · residual plot`}>
                <ScatterPlot
                  pairs={primaryPairs}
                  residual
                  onInspect={inspect}
                  selected={selectedKey}
                />
                <p>
                  Bias {num(primary?.metrics.bias)} cases · positive = overprediction, negative =
                  underprediction.
                </p>
              </Panel>
            </div>
            <div className="forecast-model-grid">
              {evaluations.map((e) => (
                <Panel key={e.model} title={e.model}>
                  <dl className="forecast-metrics">
                    <dt>MAE</dt>
                    <dd>{num(e.metrics.mae)}</dd>
                    <dt>RMSE</dt>
                    <dd>{num(e.metrics.rmse)}</dd>
                    <dt>R²</dt>
                    <dd>{num(e.metrics.r2, 4)}</dd>
                    <dt>Median absolute error</dt>
                    <dd>{num(e.metrics.medianAbsoluteError)}</dd>
                    <dt>Prediction bias</dt>
                    <dd>{num(e.metrics.bias)}</dd>
                    <dt>Validation period</dt>
                    <dd>{e.period}</dd>
                  </dl>
                  <Distribution evaluation={e} />
                  <details>
                    <summary>District-level errors</summary>
                    {pairTable(e.pairs)}
                  </details>
                </Panel>
              ))}
            </div>
          </>
        ) : mode === 'District Forecast Inspection' ? (
          <>
            <Panel title="District forecast inspection">
              <label>
                District
                <select
                  aria-label="Forecast district"
                  value={districts.includes(district) ? district : ''}
                  onChange={(e) => setDistrict(e.target.value)}
                >
                  <option value="" disabled>
                    Select a loaded district
                  </option>
                  {districts.map((d) => (
                    <option key={d}>{d}</option>
                  ))}
                </select>
              </label>
              {source === 'SUPPLIED' ? (
                <p>
                  Underlying district forecasts are not supplied. Select loaded evidence to inspect
                  actual predictions.
                </p>
              ) : district === 'All districts' ? (
                <p>Select a district to inspect its forecast history and model-specific errors.</p>
              ) : (
                <>
                  <h3>
                    {district} · {model}
                  </h3>
                  <p>
                    History through {year}; unavailable predictions remain gaps. Errors use only the
                    chosen evaluation period.
                  </p>
                  <div
                    className="forecast-chart"
                    aria-label="District observed and predicted history"
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={history}>
                        <CartesianGrid strokeDasharray="3 4" />
                        <XAxis dataKey="year" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} />
                        <Tooltip />
                        <Legend />
                        <Line
                          dataKey="observed"
                          name="Observed cases"
                          stroke="#168478"
                          connectNulls={false}
                          isAnimationActive={false}
                        />
                        <Line
                          dataKey="predicted"
                          name={`${model} prediction`}
                          stroke="#bb8255"
                          strokeDasharray="4 3"
                          connectNulls={false}
                          isAnimationActive={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Model</th>
                          <th>Paired n</th>
                          <th>MAE</th>
                          <th>RMSE</th>
                          <th>Bias</th>
                        </tr>
                      </thead>
                      <tbody>
                        {forecastModels.map((m) => {
                          const evaluation = evaluateForecasts(
                            evidence.pairs.filter(
                              (p) => normalize(p.district) === normalize(district),
                            ),
                            [m],
                            start,
                            year,
                            metric,
                            false,
                          ).evaluations[0];
                          return (
                            <tr key={m}>
                              <td>
                                <button className="text-link" onClick={() => setModel(m)}>
                                  {m}
                                </button>
                              </td>
                              <td>{evaluation.metrics.n}</td>
                              <td>{num(evaluation.metrics.mae)}</td>
                              <td>{num(evaluation.metrics.rmse)}</td>
                              <td>{num(evaluation.metrics.bias)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {pairTable(chosen)}
                  {pointDetail}
                  <NavLink
                    className="text-link"
                    to={`/district-intelligence?district=${encodeURIComponent(district)}&year=${year}`}
                  >
                    Open District Intelligence 360° →
                  </NavLink>
                </>
              )}
            </Panel>
          </>
        ) : (
          <>
            <div className="forecast-grid">
              <Panel title={`${model} · residual diagnostics`}>
                <ScatterPlot
                  pairs={primaryPairs}
                  residual
                  onInspect={inspect}
                  selected={selectedKey}
                />
                {pointDetail}
              </Panel>
              <Panel title={`${model} · residual distribution`}>
                {primary ? (
                  <Distribution evaluation={primary} />
                ) : (
                  <p>Selected model is excluded from the comparison.</p>
                )}
                <p>
                  Prediction bias: {num(primary?.metrics.bias)} cases. Opposite signed errors can
                  cancel in bias; MAE and RMSE remain separate error measures.
                </p>
              </Panel>
            </div>
            <Panel title="Error-by-district ranking">
              <p>
                {model} · highest mean absolute error first ·{' '}
                {start === year ? year : `${start}–${year}`} · current comparison cohort.
              </p>
              <div className="table-scroll">
                <table aria-label="District error ranking">
                  <thead>
                    <tr>
                      <th>Rank</th>
                      <th>District</th>
                      <th>Paired n</th>
                      <th>MAE</th>
                      <th>RMSE</th>
                      <th>Median absolute error</th>
                      <th>Bias</th>
                      <th>Worst year / absolute error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ranking.map((r, i) => (
                      <tr key={r.district}>
                        <td>{i + 1}</td>
                        <td>
                          <button
                            className="text-link"
                            onClick={() => {
                              setDistrict(r.district);
                              setMode('District Forecast Inspection');
                            }}
                          >
                            {r.district}
                          </button>
                        </td>
                        <td>{r.metrics.n}</td>
                        <td>{num(r.metrics.mae)}</td>
                        <td>{num(r.metrics.rmse)}</td>
                        <td>{num(r.metrics.medianAbsoluteError)}</td>
                        <td>{num(r.metrics.bias)}</td>
                        <td>
                          {r.worst.year} / {num(r.worst.absoluteError)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!ranking.length && (
                <p>District errors cannot be reconstructed from aggregate metrics.</p>
              )}
            </Panel>
            <Panel title="Paired error observations">{pairTable(primaryPairs)}</Panel>
          </>
        )}
      </div>
      <Panel title="Model Failure Analysis">
        <div className="forecast-model-grid">
          {evaluations.map((e) => (
            <article key={e.model}>
              <h3>{e.model}</h3>
              <ul>
                {modelFailureAnalysis(e).map((finding, i) => (
                  <li key={i}>{finding}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </Panel>
      <Panel title="Validation, provenance, and data quality">
        <p>
          MAE = mean |prediction − observed|; RMSE = square root of mean squared residual; R² = 1 −
          SSE/SST and is unavailable for constant observed outcomes. Median absolute error uses
          absolute errors, not the median signed residual. Bias = mean prediction − observed.
          Residual distributions show signed errors and observation counts.
        </p>
        <p>
          Source labels describe registry metadata rather than independent validation. No confidence
          intervals, unseen-district performance claims, feature-importance values, or retraining
          results are inferred from aggregate summaries.
        </p>
        {evidence.issues.length > 0 && (
          <details>
            <summary>{evidence.issues.length} source / pairing issues</summary>
            <ul>
              {evidence.issues.map((issue, i) => (
                <li key={i}>{issue}</li>
              ))}
            </ul>
          </details>
        )}
        <details>
          <summary>Loaded dataset provenance</summary>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Dataset</th>
                  <th>Source</th>
                  <th>Classification</th>
                  <th>Checksum</th>
                </tr>
              </thead>
              <tbody>
                {datasets.map((d) => (
                  <tr key={d.id}>
                    <td>{d.name}</td>
                    <td>{d.source}</td>
                    <td>{d.classification || 'USER IMPORT'}</td>
                    <td className="forecast-checksum">{d.checksum}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
        <button
          className="text-link"
          onClick={() =>
            update({}, 'Forecast validation reviewed', `${source} ${metric} ${start}–${year}`)
          }
        >
          Record local validation review
        </button>
      </Panel>
    </>
  );
}
