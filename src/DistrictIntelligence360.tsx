import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import {
  Bookmark,
  BookmarkCheck,
  FileText,
  ArrowDownToLine,
  MapPin,
  Info,
  AlertTriangle,
  ShieldCheck,
  Database,
  ChevronRight,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from 'recharts';
import { useStore } from './store';
import { normalize, download, toCSV, type Row } from './analytics';
import {
  aggregateEvidence,
  includeSuppliedIncidence,
  buildDistrict360,
  observed,
  incidence360,
  rollingMean,
  readinessDomains,
  readinessStatus,
  type Record360,
  type SpatialContext,
} from './district-intelligence';
import './district-360.css';
const tabs = [
  'Overview',
  'Malaria',
  'Climate',
  'Forecast',
  'Spatial',
  'Risk',
  'Readiness',
  'Data Quality',
  'Provenance',
];
const na = 'Data not available';
const number = (v: number | null | undefined, d = 0) =>
  v === null || v === undefined ? na : v.toLocaleString('en-US', { maximumFractionDigits: d });
function Panel({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <section className="panel d360-panel">
      <div className="panel-head">
        <div>
          <h2>{title}</h2>
          {sub && <p>{sub}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}
function Value({ label, value, note }: { label: string; value: ReactNode; note: string }) {
  return (
    <div className="d360-value">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  );
}
function Series({
  data,
  climate = false,
  forecast = false,
}: {
  data: Record360[];
  climate?: boolean;
  forecast?: boolean;
}) {
  const end = data.at(-1)?.year,
    start = data.at(0)?.year;
  const series =
    start === undefined || end === undefined
      ? []
      : Array.from({ length: end - start + 1 }, (_, i) => {
          const year = start + i,
            record = data.find((r) => r.year === year);
          return {
            year,
            cases: record?.values.cases ?? null,
            rolling: rollingMean(data, year),
            rainfall: record?.values.rainfall ?? null,
            temperature: record?.values.temperature ?? null,
            prediction: record?.values.prediction ?? null,
          };
        });
  if (!series.length)
    return (
      <div className="empty">
        <Database />
        <strong>{na}</strong>
        <p>No district observations are connected for this view.</p>
      </div>
    );
  return (
    <div
      className="d360-chart"
      role="img"
      aria-label={series
        .map(
          (r) =>
            `${r.year}: ${climate ? `rainfall ${number(r.rainfall)}, temperature ${number(r.temperature)}` : `cases ${number(r.cases)}${forecast ? `, prediction ${number(r.prediction)}` : ''}`}`,
        )
        .join('; ')}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={series} margin={{ left: 0, right: 15, top: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 4" vertical={false} />
          <XAxis dataKey="year" />
          <YAxis yAxisId="left" width={55} />
          {climate && <YAxis yAxisId="right" orientation="right" width={45} />}
          <Tooltip />
          <Legend wrapperStyle={{ fontSize: 10 }} />
          {climate ? (
            <>
              <Line
                yAxisId="left"
                dataKey="rainfall"
                name="Rainfall · left axis, supplied units"
                stroke="#168478"
                connectNulls={false}
              />
              <Line
                yAxisId="right"
                dataKey="temperature"
                name="Temperature · right axis, supplied units"
                stroke="#c58b48"
                connectNulls={false}
              />
            </>
          ) : (
            <>
              <Line
                yAxisId="left"
                dataKey="cases"
                name="Observed cases"
                stroke="#168478"
                strokeWidth={2}
                connectNulls={false}
              />
              <Line
                yAxisId="left"
                dataKey={forecast ? 'prediction' : 'rolling'}
                name={forecast ? 'Model prediction' : '3-year rolling mean · derived'}
                stroke="#c58b48"
                strokeDasharray="4 4"
                connectNulls={false}
              />
            </>
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
function RecordsTable({ records }: { records: Record360[] }) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Year</th>
            <th>Observed cases</th>
            <th>Population</th>
            <th>Incidence / 1,000</th>
            <th>Rainfall</th>
            <th>Temperature</th>
            <th>Model prediction</th>
          </tr>
        </thead>
        <tbody>
          {records.map((r) => (
            <tr key={`${r.district}-${r.year}`}>
              <td>{r.year}</td>
              <td>{number(r.values.cases)}</td>
              <td>{number(r.values.population)}</td>
              <td>{number(incidence360(r), 2)}</td>
              <td>{number(r.values.rainfall, 2)}</td>
              <td>{number(r.values.temperature, 2)}</td>
              <td>{number(r.values.prediction)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!records.length && <p className="body-copy">{na}. No missing values are imputed.</p>}
    </div>
  );
}
export default function DistrictIntelligence360({
  filters,
  summary,
}: {
  filters: ReactNode;
  summary: any;
}) {
  const { state, update, district, setDistrict, year, model } = useStore();
  const [tab, setTab] = useState('Overview'),
    [verifiedOnly, setVerifiedOnly] = useState(false),
    [neighbor, setNeighbor] = useState(''),
    [comp, setComp] = useState<string[]>([]),
    [report, setReport] = useState<any>(null);
  const joined = useMemo(() => {
    const data = aggregateEvidence(state.datasets, state.active, model, verifiedOnly);
    return {
      ...data,
      records: includeSuppliedIncidence(data.records, summary, model, verifiedOnly),
    };
  }, [state.datasets, state.active, model, verifiedOnly, summary]);
  const [spatialState, setSpatialState] = useState<{
    records: Record360[];
    geometry: any;
    district: string;
    year: number;
    thresholds: number[];
    context: SpatialContext;
  } | null>(null);
  const spatial =
    spatialState?.records === joined.records &&
    spatialState.geometry === state.geometry &&
    spatialState.district === district &&
    spatialState.year === year &&
    spatialState.thresholds === state.thresholds
      ? spatialState.context
      : undefined;
  useEffect(() => {
    let valid = true;
    void import('./district-spatial')
      .then(({ districtSpatialContext }) =>
        districtSpatialContext(state.geometry, joined.records, district, year, state.thresholds),
      )
      .then((context) => {
        if (valid)
          setSpatialState({
            records: joined.records,
            geometry: state.geometry,
            district,
            year,
            thresholds: state.thresholds,
            context,
          });
      })
      .catch((e) => {
        if (valid)
          setSpatialState({
            records: joined.records,
            geometry: state.geometry,
            district,
            year,
            thresholds: state.thresholds,
            context: {
              neighbors: null,
              quadrant: null,
              neighborIncidence: null,
              neighborRisk: 'INSUFFICIENT DATA',
              method: 'Geometry analysis unavailable',
              error: e instanceof Error ? e.message : String(e),
            },
          });
      });
    return () => {
      valid = false;
    };
  }, [joined.records, state.geometry, district, year, state.thresholds]);
  const data = useMemo(
    () =>
      buildDistrict360(
        joined.records,
        district,
        year,
        state.thresholds,
        state.rules,
        state.alertStates,
        spatial,
      ),
    [joined.records, district, year, state.thresholds, state.rules, state.alertStates, spatial],
  );
  const districts = [...new Set(joined.records.map((r) => r.district))].sort(),
    chosen = district !== 'All districts',
    bookmark = (state.districtBookmarks || []).some((d) => normalize(d) === normalize(district)),
    key = `${normalize(district)}:${year}`,
    checklist = state.districtChecklists?.[key] || {};
  const history = data.history.filter((r) => r.year <= year),
    current = data.current,
    sourceTrust =
      current?.references.filter((r) => r.selected).every((r) => r.classification === 'VERIFIED') &&
      current.references.some((r) => r.selected)
        ? 'VERIFIED SOURCE INPUTS'
        : verifiedOnly
          ? 'VERIFIED-ONLY VIEW'
          : 'LOADED EVIDENCE · NOT INDEPENDENTLY VERIFIED';
  const neighbors = spatial?.neighbors || [],
    selectedNeighbor = neighbors.includes(neighbor) ? neighbor : '',
    neighborRecord = data.cohort.find((r) => normalize(r.district) === normalize(selectedNeighbor));
  const comparisons = [
    {
      label: 'Selected district',
      district,
      year,
      cases: current?.values.cases,
      incidence: data.incidence,
      population: current?.values.population,
    },
    {
      label: 'Papua median · loaded cohort',
      district: `${data.cohortSize} loaded districts`,
      year,
      cases: data.papuaMedian.cases,
      incidence: data.papuaMedian.incidence,
      population: data.papuaMedian.population,
    },
    {
      label: 'Top-risk district · observed incidence',
      district: data.topDistrict?.district || na,
      year,
      cases: data.topDistrict?.values.cases,
      incidence: incidence360(data.topDistrict),
      population: data.topDistrict?.values.population,
    },
    {
      label: 'Previous year',
      district,
      year: year - 1,
      cases: data.previous?.values.cases,
      incidence: incidence360(data.previous),
      population: data.previous?.values.population,
    },
    {
      label: 'Selected neighboring district',
      district: selectedNeighbor || 'Select a neighbor',
      year,
      cases: neighborRecord?.values.cases,
      incidence: incidence360(neighborRecord),
      population: neighborRecord?.values.population,
    },
  ];
  function toggleBookmark() {
    update(
      {
        districtBookmarks: bookmark
          ? (state.districtBookmarks || []).filter((d) => normalize(d) !== normalize(district))
          : [...(state.districtBookmarks || []), district],
      },
      bookmark ? 'District bookmark removed' : 'District bookmarked',
      district,
    );
  }
  function generateReport() {
    setReport({
      title: 'District Intelligence 360° Report',
      generated: new Date().toISOString(),
      district,
      year,
      model,
      evidenceMode: verifiedOnly ? 'Verified only' : 'All loaded sources',
      sourceTrust,
      summary: {
        observedCases: current?.values.cases ?? null,
        incidence: data.incidence,
        population: current?.values.population ?? null,
        rainfall: current?.values.rainfall ?? null,
        temperature: current?.values.temperature ?? null,
        humidity: current?.values.humidity ?? null,
        risk: data.riskLevel,
        yoy: data.yoy,
        rollingMean: data.rolling,
        incidenceRank: data.rank,
        burdenRank: data.burdenRank,
        percentile: data.percentile,
        cohortSize: data.cohortSize,
        historicalBurden: data.historicalBurden,
        historicalPeriods: data.historicalPeriods,
        rainfallAnomaly: data.rainfallAnomaly,
        temperatureAnomaly: data.temperatureAnomaly,
        prediction: current?.values.prediction ?? null,
        residual: data.residual,
        absoluteError: data.absoluteError,
        completeness: data.completeness,
        temporalCompleteness: data.temporalCompleteness,
        activeAlerts: data.signals.length,
        spatialClassification: data.spatial.quadrant,
        latestSurveillanceYear: data.latestSurveillanceYear,
        latestClimateYear: data.latestClimateYear,
      },
      explanation: { summary: data.explanation, rules: data.reasons },
      spatial: data.spatial,
      comparisons,
      readiness: Object.entries(readinessDomains).map(([domain, items]) => ({
        domain,
        status: readinessStatus(domain, items, checklist, data.riskLevel),
        checklist: Object.fromEntries(items.map((i) => [i, checklist[i] || 'NOT REVIEWED'])),
      })),
      alerts: data.signals,
      history,
      provenance: data.history.flatMap((r) => r.references),
      quality: {
        gaps: data.gaps,
        sourceConflicts: data.history.flatMap((r) =>
          r.issues.map((issue) => ({ year: r.year, issue })),
        ),
        identityIssues: joined.identityIssues,
      },
      limitations: [
        'Research Prototype — Retrospective Geospatial Risk Intelligence — Not for Autonomous Clinical Decision-Making or Operational Deployment',
        'Decision Support — Not Autonomous Clinical or Operational Recommendations',
        'Loaded-cohort medians and ranks are not estimates for all Papua districts. Spatial quadrants are exploratory, not significant hotspot findings.',
      ],
    });
    update({}, 'District Intelligence report generated', `${district} · ${year} · ${model}`);
  }
  useEffect(() => {
    setReport(null);
    setComp([]);
    setNeighbor('');
  }, [district, year, model, verifiedOnly, state.active]);
  const why = (
    <Panel
      title="Why is this district high risk?"
      sub="Deterministic rules · no generated AI explanation"
    >
      <div className="d360-explanation">
        <span
          className={`badge ${['HIGH', 'VERY HIGH'].includes(data.riskLevel) ? 'amber' : 'neutral'}`}
        >
          {data.riskLevel}
        </span>
        <p>{data.explanation}</p>
        {data.reasons.length ? (
          <ol>
            {data.reasons.map((r) => (
              <li key={r.kind}>
                <strong>{r.finding}</strong>
                <small>Rule: {r.rule}</small>
              </li>
            ))}
          </ol>
        ) : (
          <p>No additional elevated-risk signals can be established from the loaded evidence.</p>
        )}
        <small>
          Classification uses derived or explicitly supplied incidence. Predictions, neighborhood indicators, and
          checklist interpretation remain separate. Inputs: {sourceTrust.toLowerCase()}.
        </small>
      </div>
    </Panel>
  );
  const compare = (
    <Panel
      title="Synchronized district comparison"
      sub="Same selected year and model; medians and ranks use all loaded districts, independently of global risk filters."
    >
      <div className="toolbar">
        <label>
          Neighbor comparison
          <select
            aria-label="Neighbor comparison"
            value={selectedNeighbor}
            disabled={!neighbors.length}
            onChange={(e) => setNeighbor(e.target.value)}
          >
            <option value="">
              {neighbors.length ? 'Select a neighboring district' : 'No connected neighbors'}
            </option>
            {neighbors.map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
        <small>
          Coverage: {data.rankPopulation} districts with incidence. Tied risk classes are ordered by
          observed incidence.
        </small>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Reference</th>
              <th>District / coverage</th>
              <th>Year</th>
              <th>Cases</th>
              <th>Incidence / 1,000</th>
              <th>Population</th>
            </tr>
          </thead>
          <tbody>
            {comparisons.map((r) => (
              <tr key={r.label}>
                <td>{r.label}</td>
                <td>{r.district}</td>
                <td>{r.year}</td>
                <td>{number(r.cases)}</td>
                <td>{number(r.incidence, 2)}</td>
                <td>{number(r.population)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="fine-print">
        Papua median means the median of available district values in this loaded Papua workspace;
        regional coverage has not been verified. Missing values are excluded per metric. Rank = 1 +
        districts with strictly greater incidence. Percentile = 100 × (lower values + half of equal
        values) / comparable districts.
      </p>
    </Panel>
  );
  return (
    <>
      <div className="page-heading d360-heading">
        <div>
          <div className="eyebrow">SYNCHRONIZED DISTRICT ANALYTICAL WORKSPACE</div>
          <h1>District Intelligence 360°</h1>
          <p>One district. Traceable evidence, transparent risk, and a connected research view.</p>
        </div>
        <div className="heading-actions">
          <button
            className="button"
            disabled={!chosen}
            aria-pressed={bookmark}
            onClick={toggleBookmark}
          >
            {bookmark ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}{' '}
            {bookmark ? 'Bookmarked' : 'Bookmark district'}
          </button>
          <button className="button primary" disabled={!chosen} onClick={generateReport}>
            <FileText size={16} />
            Generate District Intelligence Report
          </button>
        </div>
      </div>
      <div className="d360-workspace-controls">
        <label>
          360° district
          <select
            aria-label="360 district"
            value={district}
            onChange={(e) => setDistrict(e.target.value)}
          >
            <option>All districts</option>
            {chosen && !districts.includes(district) && <option>{district}</option>}
            {districts.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </label>
        <label>
          Evidence scope
          <select
            aria-label="District evidence scope"
            value={verifiedOnly ? 'verified' : 'loaded'}
            onChange={(e) => setVerifiedOnly(e.target.value === 'verified')}
          >
            <option value="loaded">All loaded evidence · source labels retained</option>
            <option value="verified">Verified datasets only</option>
          </select>
        </label>
        <label>
          Saved districts
          <select
            aria-label="Bookmarked districts"
            value=""
            onChange={(e) => {
              if (e.target.value) setDistrict(e.target.value);
            }}
          >
            <option value="">Open a local bookmark</option>
            {(state.districtBookmarks || []).map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </label>
        {chosen && (
          <NavLink
            className="text-link"
            to={`/risk-map?district=${encodeURIComponent(district)}&year=${year}&model=${encodeURIComponent(model)}`}
          >
            <MapPin size={14} />
            Locate district in GIS
            <ChevronRight size={13} />
          </NavLink>
        )}
      </div>
      {filters}
      {joined.identityIssues.length > 0 && (
        <div className="notice amber-notice">
          <AlertTriangle size={16} />
          {joined.identityIssues.join(' ')}
        </div>
      )}
      <div className="notice d360-source-note">
        <Info size={16} />
        <span>
          {sourceTrust}. {joined.datasets.length} eligible datasets connected. Active-source values
          take precedence; unresolved alternative-source conflicts are withheld. No missing values
          are generated.
        </span>
      </div>
      {!chosen ? (
        <Panel title="Select a district to begin">
          <div className="empty">
            <Database />
            <strong>Your district workspace is ready</strong>
            <p>Choose a district from loaded evidence or select one on the GIS map.</p>
            <NavLink to="/data-center">Connect district observations →</NavLink>
          </div>
        </Panel>
      ) : (
        <div className={`d360-workspace ${report ? 'has-report' : ''}`}>
          <div className="d360-hero">
            <div>
              <span className="eyebrow">DISTRICT PROFILE / {year}</span>
              <h2>{district}</h2>
              <p>
                {model} · {data.history.length} connected annual records
              </p>
            </div>
            <span
              className={`badge ${['HIGH', 'VERY HIGH'].includes(data.riskLevel) ? 'amber' : 'teal'}`}
            >
              {data.riskLevel}
            </span>
          </div>
          <div className="d360-primary-metrics">
            <Value
              label="OBSERVED CASES"
              value={number(current?.values.cases)}
              note={`${year} · observed input`}
            />
            <Value
              label="INCIDENCE / 1,000"
              value={number(data.incidence, 2)}
              note={
                current?.values.cases !== null && current?.values.population !== null
                  ? 'Derived · cases / population × 1,000'
                  : 'Supplied incidence ratio · underlying case/population records unavailable'
              }
            />
            <Value
              label="YEAR-OVER-YEAR CHANGE"
              value={data.yoy === null ? na : `${number(data.yoy, 1)}%`}
              note="Adjacent observed years only"
            />
            <Value
              label="INCIDENCE RANK"
              value={data.rank === null ? na : `${data.rank} / ${data.rankPopulation}`}
              note={`Midrank percentile: ${number(data.percentile, 1)}`}
            />
          </div>
          <div className="tabs d360-tabs" role="tablist" aria-label="District Intelligence tabs">
            {tabs.map((name, i) => (
              <button
                role="tab"
                aria-selected={tab === name}
                aria-controls="district-tab-panel"
                id={`district-tab-${i}`}
                tabIndex={tab === name ? 0 : -1}
                className={tab === name ? 'active' : ''}
                key={name}
                onClick={() => setTab(name)}
                onKeyDown={(e) => {
                  const index =
                    e.key === 'ArrowRight'
                      ? (i + 1) % tabs.length
                      : e.key === 'ArrowLeft'
                        ? (i + tabs.length - 1) % tabs.length
                        : e.key === 'Home'
                          ? 0
                          : e.key === 'End'
                            ? tabs.length - 1
                            : null;
                  if (index !== null) {
                    e.preventDefault();
                    setTab(tabs[index]);
                    document.getElementById(`district-tab-${index}`)?.focus();
                  }
                }}
              >
                {name}
              </button>
            ))}
          </div>
          <div
            role="tabpanel"
            id="district-tab-panel"
            aria-labelledby={`district-tab-${tabs.indexOf(tab)}`}
            tabIndex={0}
          >
            {tab === 'Overview' && (
              <>
                <div className="two-col">
                  <Panel title="Malaria history" sub="Observed burden and three-year rolling mean">
                    <Series data={history} />
                  </Panel>
                  {why}
                </div>
                <div className="d360-secondary-metrics">
                  <Value
                    label="POPULATION"
                    value={number(current?.values.population)}
                    note="Selected district-year input"
                  />
                  <Value
                    label="HISTORICAL BURDEN"
                    value={number(data.historicalBurden)}
                    note={`Sum of ${data.historicalPeriods} available periods through ${year}`}
                  />
                  <Value
                    label="3-YEAR ROLLING MEAN"
                    value={number(data.rolling, 1)}
                    note="Requires three contiguous observed years"
                  />
                  <Value
                    label="ANALYTICAL INPUT COVERAGE"
                    value={data.completeness === null ? na : `${number(data.completeness, 1)}%`}
                    note="Available cases, population, rain, temperature, humidity, prediction / 6"
                  />
                  <Value
                    label="LATEST SURVEILLANCE YEAR"
                    value={data.latestSurveillanceYear === null ? na : String(data.latestSurveillanceYear)}
                    note="Latest loaded year; does not enter earlier-year analysis"
                  />
                  <Value
                    label="LATEST CLIMATE PERIOD"
                    value={data.latestClimateYear === null ? na : String(data.latestClimateYear)}
                    note="Annual resolution · latest loaded climate record"
                  />
                  <Value
                    label="ACTIVE ANALYTICAL ALERTS"
                    value={data.signals.length}
                    note="Unresolved signals from merged inputs"
                  />
                  <Value
                    label="DISTRICT READINESS"
                    value={`Available items: ${Object.values(checklist).filter((v) => v === 'AVAILABLE').length}`}
                    note="District-year checklist; unreviewed resource availability unknown"
                  />
                </div>
                {compare}
                <Panel
                  title="Latest analytical signals"
                  sub="These are research flags, not autonomous clinical findings."
                >
                  {data.signals.length ? (
                    data.signals.map((a) => (
                      <div className="d360-signal" key={a.id}>
                        <span className="badge amber">{a.severity}</span>
                        <span>{a.reason}</span>
                        <span className="badge">{a.status}</span>
                      </div>
                    ))
                  ) : (
                    <p className="body-copy">
                      No enabled rule has generated an unresolved signal for the current
                      district-year.
                    </p>
                  )}
                </Panel>
              </>
            )}
            {tab === 'Malaria' && (
              <>
                <Panel
                  title="Observed malaria burden"
                  sub="Historical series excludes future observations from the selected analytical year."
                >
                  <Series data={history} />
                </Panel>
                <div className="d360-secondary-metrics">
                  <Value
                    label="BURDEN RANK"
                    value={number(data.burdenRank)}
                    note="1 + loaded districts with more cases"
                  />
                  <Value
                    label="CONSECUTIVE INCREASES"
                    value={data.sequence}
                    note="Strict increases in adjacent observed years"
                  />
                  <Value
                    label="ROLLING TREND"
                    value={number(data.rolling, 1)}
                    note="3-year trailing mean; gaps are not imputed"
                  />
                </div>
                <Panel title="Annual observed records">
                  <RecordsTable records={history} />
                  <button
                    className="button"
                    onClick={() =>
                      download(
                        `district-${district}-history.csv`,
                        toCSV(history.map(observed).filter((r): r is Row => r !== null)),
                        true,
                      )
                    }
                  >
                    <ArrowDownToLine size={14} />
                    Export observed history
                  </button>
                </Panel>
                {compare}
                <Panel
                  title="Compare additional districts"
                  sub="Select up to five districts at the same year."
                >
                  <div className="toolbar">
                    {districts.map((d) => (
                      <label className="check" key={d}>
                        <input
                          type="checkbox"
                          checked={comp.includes(d)}
                          disabled={comp.length >= 5 && !comp.includes(d)}
                          onChange={(e) =>
                            setComp(e.target.checked ? [...comp, d] : comp.filter((x) => x !== d))
                          }
                        />
                        {d}
                      </label>
                    ))}
                  </div>
                  <RecordsTable records={data.cohort.filter((r) => comp.includes(r.district))} />
                </Panel>
              </>
            )}
            {tab === 'Climate' && (
              <>
                <Panel
                  title="Annual climate history"
                  sub="Supplied climate units; axes are separate. Annual records do not support monthly seasonality."
                >
                  <Series data={history} climate />
                </Panel>
                <div className="d360-secondary-metrics">
                  <Value
                    label="RAINFALL"
                    value={number(current?.values.rainfall, 2)}
                    note="Loaded annual climate observation"
                  />
                  <Value
                    label="TEMPERATURE"
                    value={number(current?.values.temperature, 2)}
                    note="Loaded annual climate observation"
                  />
                  <Value
                    label="HUMIDITY"
                    value={number(current?.values.humidity, 2)}
                    note="Available only where supplied"
                  />
                  <Value
                    label="RAINFALL ANOMALY"
                    value={
                      data.rainfallAnomaly.value === null
                        ? na
                        : `${number(data.rainfallAnomaly.value, 2)} SD`
                    }
                    note={data.rainfallAnomaly.reason}
                  />
                  <Value
                    label="TEMPERATURE ANOMALY"
                    value={
                      data.temperatureAnomaly.value === null
                        ? na
                        : `${number(data.temperatureAnomaly.value, 2)} SD`
                    }
                    note={data.temperatureAnomaly.reason}
                  />
                </div>
                <Panel title="Climate anomaly baseline">
                  <dl>
                    <dt>Rainfall baseline</dt>
                    <dd>
                      {data.rainfallAnomaly.n} prior observations; mean{' '}
                      {number(data.rainfallAnomaly.mean, 2)}, sample SD{' '}
                      {number(data.rainfallAnomaly.sd, 2)}
                    </dd>
                    <dt>Temperature baseline</dt>
                    <dd>
                      {data.temperatureAnomaly.n} prior observations; mean{' '}
                      {number(data.temperatureAnomaly.mean, 2)}, sample SD{' '}
                      {number(data.temperatureAnomaly.sd, 2)}
                    </dd>
                    <dt>Method</dt>
                    <dd>
                      (Current observation − mean of prior available annual observations) / prior
                      sample SD. At least three prior observations and nonzero variance are
                      required. No future observations enter the baseline; climate associations are
                      not causal claims.
                    </dd>
                  </dl>
                </Panel>
              </>
            )}
            {tab === 'Forecast' && (
              <>
                <Panel
                  title="Observed versus predicted"
                  sub={`${model} · predictions remain distinct from observations`}
                >
                  <Series data={history} forecast />
                </Panel>
                <div className="d360-secondary-metrics">
                  <Value
                    label="MODEL PREDICTION"
                    value={number(current?.values.prediction)}
                    note={`${model} · imported model output`}
                  />
                  <Value
                    label="RESIDUAL"
                    value={number(data.residual)}
                    note="Prediction − observed cases"
                  />
                  <Value
                    label="ABSOLUTE PREDICTION ERROR"
                    value={number(data.absoluteError)}
                    note="|Prediction − observed cases|"
                  />
                </div>
                <Panel title="Forecast evidence">
                  <p className="body-copy">
                    Outputs are joined only for the selected model. No model is trained and no
                    missing prediction is generated by this workspace. A prediction’s existence does
                    not establish temporal validation or model reliability.
                  </p>
                  <RecordsTable records={history} />
                  <NavLink
                    className="text-link bottom-link"
                    to={`/model-benchmarking?year=${year}&model=${encodeURIComponent(model)}`}
                  >
                    Inspect model validation →
                  </NavLink>
                </Panel>
              </>
            )}
            {tab === 'Spatial' && (
              <>
                <Panel
                  title="Spatial context"
                  sub="Derived only from connected district administrative polygons."
                >
                  <dl>
                    <dt>Spatial classification</dt>
                    <dd>{spatial?.quadrant || na}</dd>
                    <dt>Neighboring districts</dt>
                    <dd>
                      {spatial?.neighbors === null || !spatial
                        ? na
                        : spatial.neighbors.length
                          ? spatial.neighbors.join(', ')
                          : 'No adjacent polygons under queen contiguity'}
                    </dd>
                    <dt>Mean neighbor incidence</dt>
                    <dd>{number(spatial?.neighborIncidence, 2)} per 1,000</dd>
                    <dt>Neighborhood research risk</dt>
                    <dd>{spatial?.neighborRisk || 'INSUFFICIENT DATA'}</dd>
                    <dt>Method</dt>
                    <dd>{spatial?.method || 'Inspecting available administrative geometry…'}</dd>
                  </dl>
                  {spatial?.error && <div className="notice amber-notice">{spatial.error}</div>}
                  <NavLink
                    className="text-link bottom-link"
                    to={`/risk-map?district=${encodeURIComponent(district)}&year=${year}`}
                  >
                    Open synchronized GIS map →
                  </NavLink>
                </Panel>
                {compare}
              </>
            )}
            {tab === 'Risk' && (
              <>
                {why}
                <Panel title="Risk calculation inputs">
                  <dl>
                    <dt>Observed cases</dt>
                    <dd>{number(current?.values.cases)}</dd>
                    <dt>Population</dt>
                    <dd>{number(current?.values.population)}</dd>
                    <dt>Incidence</dt>
                    <dd>{number(data.incidence, 2)} per 1,000</dd>
                    <dt>Thresholds</dt>
                    <dd>
                      MODERATE ≥ {state.thresholds[0]}, HIGH ≥ {state.thresholds[1]}, VERY HIGH ≥{' '}
                      {state.thresholds[2]} per 1,000; below moderate = LOW.
                    </dd>
                    <dt>Classification formula</dt>
                    <dd>
                      Observed cases / population × 1,000, followed by configured ascending cutoffs.
                      When case/population inputs are missing, an explicitly supplied per-1,000
                      incidence ratio may be used; its source remains visible. No available ratio =
                      INSUFFICIENT DATA. Percentiles and spatial indicators are additional
                      explanation signals, not hidden category weights.
                    </dd>
                  </dl>
                </Panel>
                {compare}
              </>
            )}
            {tab === 'Readiness' && (
              <>
                <div className="notice amber-notice">
                  <ShieldCheck size={16} />
                  Decision Support — Not Autonomous Clinical or Operational Recommendations
                </div>
                <p className="body-copy">
                  Checklist evidence is specific to {district} / {year}. The existing regional
                  checklist is not silently assigned to this district.
                </p>
                <div className="two-col">
                  {Object.entries(readinessDomains).map(([domain, items]) => (
                    <Panel
                      key={domain}
                      title={domain}
                      sub={readinessStatus(domain, items, checklist, data.riskLevel)}
                    >
                      {items.map((item) => (
                        <div className="checklist-row" key={item}>
                          <span>{item}</span>
                          <select
                            aria-label={`District readiness: ${item}`}
                            value={checklist[item] || 'NOT REVIEWED'}
                            onChange={(e) =>
                              update(
                                {
                                  districtChecklists: {
                                    ...state.districtChecklists,
                                    [key]: { ...checklist, [item]: e.target.value },
                                  },
                                },
                                'District readiness reviewed',
                                `${district} · ${year} · ${item}`,
                              )
                            }
                          >
                            {[
                              'NOT REVIEWED',
                              'AVAILABLE',
                              'LIMITED',
                              'UNAVAILABLE',
                              'NOT APPLICABLE',
                            ].map((s) => (
                              <option key={s}>{s}</option>
                            ))}
                          </select>
                        </div>
                      ))}
                      <p className="fine-print">
                        All applicable items available → READY. Limited/unavailable items →
                        ATTENTION. Elevated incidence with unconfirmed diagnostics → ATTENTION. No
                        reviewed evidence → INSUFFICIENT DATA; otherwise REVIEW.
                      </p>
                    </Panel>
                  ))}
                </div>
              </>
            )}
            {tab === 'Data Quality' && (
              <>
                <div className="d360-secondary-metrics">
                  <Value
                    label="CURRENT ANALYTICAL INPUT COVERAGE"
                    value={data.completeness === null ? na : `${number(data.completeness, 1)}%`}
                    note="6 selected-year analytical fields; not a source verification score"
                  />
                  <Value
                    label="OBSERVED TEMPORAL COMPLETENESS"
                    value={
                      data.temporalCompleteness === null
                        ? na
                        : `${number(data.temporalCompleteness, 1)}%`
                    }
                    note="Years with observed cases / annual span from first loaded year through selected year"
                  />
                  <Value
                    label="MISSING SURVEILLANCE PERIODS"
                    value={data.gaps.length}
                    note={
                      data.gaps.length
                        ? data.gaps.join(', ')
                        : 'No internal or trailing gaps in the loaded analytical span'
                    }
                  />
                </div>
                <Panel title="Source conflicts and missing inputs">
                  {data.history
                    .flatMap((r) => r.issues.map((issue) => ({ year: r.year, issue })))
                    .map((issue, i) => (
                      <div className="issue-row" key={i}>
                        <span className="badge amber">SOURCE CONFLICT</span>
                        {issue.year} · {issue.issue}
                      </div>
                    ))}
                  <p className="body-copy">
                    Selected-year missing fields:{' '}
                    {current
                      ? Object.entries(current.values)
                          .filter(([, v]) => v === null)
                          .map(([f]) => f)
                          .join(', ') || 'None'
                      : 'All district-year observations unavailable'}
                    . Source conflicts never silently merge contradictory values. Missing geometry
                    and incomplete neighbor incidence prevent corresponding spatial outputs.
                  </p>
                </Panel>
              </>
            )}
            {tab === 'Provenance' && (
              <Panel
                title="District evidence provenance"
                sub="Every selected numeric input retains its original dataset, field, year, transformation, and classification."
              >
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Year</th>
                        <th>Field</th>
                        <th>Value</th>
                        <th>Dataset</th>
                        <th>Classification</th>
                        <th>Selection</th>
                        <th>Checksum</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.history
                        .flatMap((r) => r.references)
                        .map((r, i) => (
                          <tr key={i}>
                            <td>{r.year}</td>
                            <td>{r.field}</td>
                            <td>{number(r.value, 2)}</td>
                            <td title={r.source}>{r.dataset}</td>
                            <td>{r.classification}</td>
                            <td>{r.selected ? 'Selected input' : 'Alternative · not used'}</td>
                            <td title={r.checksum}>
                              {r.checksum ? r.checksum.slice(0, 12) + '…' : 'Not supplied'}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                <p className="body-copy">
                  Raw cases, population, and climate variables are loaded observations. Incidence,
                  changes, rolling means, ranks, anomalies, and errors are derived. Predictions are
                  model outputs. Threshold risk, explanations, and readiness are research
                  decision-support interpretations. Geometry source:{' '}
                  {state.geometrySource?.name || 'District geometry not connected'}.
                </p>
                <button
                  className="button"
                  onClick={() =>
                    download(`district-${district}-provenance.json`, {
                      district,
                      year,
                      model,
                      inputs: data.history.flatMap((r) => r.references),
                      geometry: state.geometrySource,
                      formulas: data.reasons,
                    })
                  }
                >
                  Export district provenance
                </button>
              </Panel>
            )}
          </div>
        </div>
      )}
      {report && (
        <section className="panel d360-report" aria-label="Generated District Intelligence Report">
          <div className="panel-head">
            <div>
              <h2>{report.title}</h2>
              <p>
                {report.district} · {report.year} · {report.model} · captured{' '}
                {new Date(report.generated).toLocaleString('en-GB', { timeZone: 'Asia/Bangkok' })}{' '}
                ICT
              </p>
            </div>
          </div>
          <div className="toolbar no-print">
            <button className="button" onClick={() => window.print()}>
              Print / Save as PDF
            </button>
            <button
              className="button"
              onClick={() =>
                download(`district-${report.district}-${report.year}-intelligence.json`, report)
              }
            >
              Export District Report JSON
            </button>
            <button className="button" onClick={() => setReport(null)}>
              Close report
            </button>
          </div>
          <p className="report-safety">{report.limitations.join(' ')}</p>
          <h3 className="body-copy">Evidence summary · {report.sourceTrust}</h3>
          <dl>
            {Object.entries(report.summary)
              .filter(([, v]) => typeof v !== 'object' || v === null)
              .map(([k, v]) => (
                <div className="d360-report-item" key={k}>
                  <dt>{k}</dt>
                  <dd>{v === null ? na : String(v)}</dd>
                </div>
              ))}
          </dl>
          <h3 className="body-copy">Deterministic risk explanation</h3>
          <p className="body-copy">{report.explanation.summary}</p>
          {report.explanation.rules.map((r: any) => (
            <p className="body-copy" key={r.kind}>
              {r.finding} Rule: {r.rule}
            </p>
          ))}
          <h3 className="body-copy">Climate and spatial evidence</h3>
          <pre>
            {JSON.stringify(
              {
                rainfallAnomaly: report.summary.rainfallAnomaly,
                temperatureAnomaly: report.summary.temperatureAnomaly,
                spatial: report.spatial,
              },
              null,
              2,
            )}
          </pre>
          <h3 className="body-copy">Comparison, alerts, readiness, and provenance</h3>
          <pre>
            {JSON.stringify(
              {
                comparisons: report.comparisons,
                alerts: report.alerts,
                readiness: report.readiness,
                quality: report.quality,
                provenance: report.provenance,
              },
              null,
              2,
            )}
          </pre>
          <RecordsTable records={report.history} />
        </section>
      )}
    </>
  );
}
