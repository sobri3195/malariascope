import { lazy, Suspense, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { normalize } from '../analytics';
import { incidence360 } from '../district-intelligence';
import { Card, Sheet, useMobile, value, date, MobileDataStatus, MobileSkeleton } from './MobileApp';
import MobileSourceControls from './MobileSourceControls';
import {
  BarChart3,
  MapPin,
  TriangleAlert,
  Map,
  ChartLine,
  ChevronRight,
  Bell,
  Info,
} from 'lucide-react';
const PreviewMap = lazy(() => import('./MobileMap'));
import { districtMobileMetrics, mobileDistrictRisk } from './mobile-engine';
const ReadinessSummary = lazy(() =>
  import('./MobileAnalysis').then((m) => ({ default: m.ReadinessSummary })),
);
const Analysis = lazy(() => import('./MobileAnalysis'));
export function Indicators({ items }: { items: [string, unknown][] }) {
  return (
    <dl className="m-indicators">
      {items.map(([label, v]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{v == null ? 'Data not available' : String(v)}</dd>
        </div>
      ))}
    </dl>
  );
}
export function MobileDistrictSelect() {
  const { state, district, setDistrict } = useStore();
  const names = [...new Set(state.datasets.flatMap((d) => d.rows.map((r) => r.district)))].sort();
  return (
    <label>
      Selected district
      <select
        aria-label="Profile district"
        value={district}
        onChange={(e) => setDistrict(e.target.value)}
      >
        <option>All districts</option>
        {district !== 'All districts' && !names.includes(district) && <option>{district}</option>}
        {names.map((n) => (
          <option key={n}>{n}</option>
        ))}
      </select>
    </label>
  );
}
export function DistrictFacts({ name }: { name: string }) {
  const { year, state, signals } = useStore();
  const { evidence } = useMobile();
  const m = districtMobileMetrics(evidence.history, name, year),
    risk = mobileDistrictRisk(evidence.risks, name);
  return (
    <>
      <Indicators
        items={[
          ['Risk', risk?.category ?? 'Data not available'],
          ['Observed cases', value(m.cases)],
          ['Incidence / 1,000', value(m.incidence)],
          ['Annual change (%)', value(m.change)],
          ['Incidence change (%)', value(m.incidenceChange)],
          [
            'Active alerts',
            signals.filter(
              (a) =>
                a.year === year &&
                normalize(a.district) === normalize(name) &&
                !['ACKNOWLEDGED', 'RESOLVED'].includes(state.alertStates[a.id]?.status ?? 'NEW'),
            ).length,
          ],
          ['Prediction', value(m.predicted)],
          ['Rainfall anomaly (SD)', value(m.rainfall?.value)],
          ['Temperature anomaly (SD)', value(m.temperature?.value)],
          ['Input completeness (%)', value(m.completeness)],
        ]}
      />
      {risk && (
        <p>
          {risk.score === null
            ? risk.reasons.join(' ')
            : `Risk is ${risk.category} because the calculated score is ${value(risk.score)} under ${risk.mode}. ${risk.classificationThreshold}. ${risk.formula}.`}
        </p>
      )}
      <small>
        {risk?.dataVerification ?? 'No contributing records connected.'} · {state.datasets.length}{' '}
        registered dataset(s)
      </small>
    </>
  );
}
const actions = [
  ['map', 'Open Risk Map'],
  ['district', 'District Intelligence'],
  ['alerts', 'Alert Center'],
  ['models', 'Compare Models'],
  ['readiness', 'Readiness Review'],
  ['report', 'Generate Report'],
] as const;
function Home() {
  const { state, year, district, model, signals, setDistrict } = useStore();
  const { evidence, data } = useMobile();
  const ranked = evidence.records
    .filter(
      (r) =>
        (district === 'All districts' || normalize(r.district) === normalize(district)) &&
        incidence360(r) !== null,
    )
    .sort((a, b) => incidence360(b)! - incidence360(a)!);
  const alerts = signals.filter(
    (a) =>
      a.year === year &&
      (district === 'All districts' || normalize(a.district) === normalize(district)) &&
      !['ACKNOWLEDGED', 'RESOLVED'].includes(state.alertStates[a.id]?.status ?? 'NEW'),
  );
  const supplied = !state.datasets.length && district === 'All districts' ? data?.summary : null;
  const history = evidence.history.filter(
    (r) => district === 'All districts' || normalize(r.district) === normalize(district),
  );
  const availableYears = history.filter((r) => r.values.cases !== null).map((r) => r.year);
  const annuals = Array.isArray(supplied?.annual)
    ? supplied.annual.filter((a: any) => a.year <= year && Number.isFinite(a.cases) && a.cases >= 0)
    : [];
  const latestYear = availableYears.length
    ? Math.max(...availableYears)
    : annuals.length
      ? Math.max(...annuals.map((a: any) => a.year))
      : year;
  const latestRecords = history.filter((r) => r.year === latestYear),
    latestCases = latestRecords.map((r) => r.values.cases).filter((v): v is number => v !== null);
  const annual = annuals.find((a: any) => a.year === latestYear),
    inc = supplied?.incidence?.year === year ? supplied.incidence : null;
  const risks = evidence.risks.filter(
    (r) => district === 'All districts' || normalize(r.record.district) === normalize(district),
  );
  const years = [...new Set(history.map((r) => r.year))].sort((a, b) => a - b);
  const series = years.length
    ? years.map((period) => {
        const records = history.filter((r) => r.year === period);
        return {
          year: period,
          cases: records.every((r) => r.values.cases !== null)
            ? records.reduce((sum, r) => sum + r.values.cases!, 0)
            : null,
        };
      })
    : annuals
        .map((a: any) => ({ year: a.year, cases: a.cases }))
        .sort((a: any, b: any) => a.year - b.year);
  const topDistrict = ranked[0]?.district ?? inc?.district;
  return (
    <>
      <div className="m-section-title">
        <h1>Current Intelligence</h1>
        <p>Latest insights from malaria, climate and geospatial research data.</p>
      </div>
      <div className="m-card-grid m-home-kpis">
        <Card
          title={`Latest malaria burden · ${latestYear}`}
          icon={BarChart3}
          action={
            <Link
              className="m-card-chevron"
              to="/mobile/surveillance"
              aria-label="Inspect malaria burden"
            >
              <ChevronRight size={18} />
            </Link>
          }
        >
          <strong className="m-number">
            {value(latestCases.length ? latestCases.reduce((a, b) => a + b, 0) : annual?.cases)}
          </strong>
          {latestYear !== year && (
            <p className="m-warning">
              Historical evidence from {latestYear}; selected year {year} has no connected observed
              burden.
            </p>
          )}
          <p>
            {latestCases.length
              ? `${latestCases.length} / ${latestRecords.length} district records · observed cases. Available-record totals are not population estimates.`
              : annual
                ? 'Supplied study aggregate — not independently verified.'
                : 'Data not available'}
          </p>
          {latestCases.length > 0 && (
            <small>
              {state.researchMode === 'BUILTIN'
                ? 'Supplied study extraction — not independently audited.'
                : 'Loaded evidence · source verification is not inferred.'}
            </small>
          )}
        </Card>
        <Card
          title="Highest incidence district"
          icon={MapPin}
          className="m-incidence-kpi"
          action={
            <Link
              className="m-card-chevron"
              to="/mobile/district"
              onClick={() => {
                if (topDistrict) setDistrict(topDistrict);
              }}
              aria-label="Inspect highest incidence district"
            >
              <ChevronRight size={18} />
            </Link>
          }
        >
          <strong className="m-district-name">{topDistrict ?? 'Data not available'}</strong>
          <p className="m-incidence-value">
            {value(ranked.length ? incidence360(ranked[0]) : inc?.value)} per 1,000
          </p>
          <small>
            {inc && !ranked.length
              ? 'Supplied study aggregate — not independently verified.'
              : ranked.length
                ? 'Derived from loaded district cases and valid population. Source verification is not inferred.'
                : 'Data not available'}
          </small>
        </Card>
      </div>
      <Card
        title="Elevated research risk"
        icon={TriangleAlert}
        className="m-risk-card"
        action={
          <Link
            className="m-card-chevron"
            to="/mobile/surveillance"
            aria-label="Inspect district risk classifications"
          >
            <ChevronRight size={18} />
          </Link>
        }
      >
        <Indicators
          items={[
            [
              'HIGH',
              risks.length
                ? risks.filter((r) => r.calculation.category === 'HIGH').length
                : 'Data not available',
            ],
            [
              'VERY HIGH',
              risks.length
                ? risks.filter((r) => r.calculation.category === 'VERY HIGH').length
                : 'Data not available',
            ],
            [
              'Unclassified',
              risks.length
                ? risks.filter((r) => r.calculation.score === null).length
                : 'Data not available',
            ],
          ]}
        />
        <p>
          {risks.length} district(s) in selected scope. Counts reflect available research/model
          outputs in the selected scope. Selected risk mode retained.
        </p>
      </Card>
      <MobileDataStatus />
      <div className="m-home-analysis">
        <Card
          title="Geospatial Preview"
          icon={Map}
          className="m-preview-card"
          action={
            <Link className="m-card-chevron" to="/mobile/map" aria-label="View Map">
              <ChevronRight size={18} />
            </Link>
          }
        >
          <Suspense fallback={<MobileSkeleton label="Loading map preview" />}>
            <PreviewMap preview />
          </Suspense>
        </Card>
        <Card
          title="Recent Trend"
          icon={ChartLine}
          className="m-trend-card"
          action={
            <Link
              className="m-card-chevron"
              to="/mobile/surveillance"
              aria-label="Inspect recent trend"
            >
              <ChevronRight size={18} />
            </Link>
          }
        >
          <h3>Malaria burden trend</h3>
          <p>Selected scope · available observations only</p>
          <BurdenTrend series={series} />
          <small>
            {years.length
              ? 'Derived sums of loaded records. Incomplete periods and missing years remain unconnected; population estimates and uncertainty bands are not inferred.'
              : annuals.length
                ? 'Supplied study aggregates — not independently verified.'
                : 'Connect observations to inspect temporal change.'}
          </small>
        </Card>
      </div>
      {alerts.length ? (
        <Card title="Recent analytical signals" icon={Bell}>
          {[...alerts]
            .sort(
              (a, b) =>
                (Date.parse(state.alertCreated?.[b.id] ?? '') || 0) -
                (Date.parse(state.alertCreated?.[a.id] ?? '') || 0),
            )
            .slice(0, 2)
            .map((a) => (
              <div className="m-signal-preview" key={a.id}>
                <span className="m-badge">{a.severity}</span>
                <strong>{a.district}</strong>
                <p>{a.exactRule}</p>
                <small>{date(state.alertCreated?.[a.id])}</small>
              </div>
            ))}
          <Link className="m-card-link" to="/mobile/alerts">
            View all alerts <ChevronRight size={16} />
          </Link>
        </Card>
      ) : (
        <p className="m-quiet-status">
          <Bell size={16} />
          No active analytical signals.
        </p>
      )}
      <details className="m-home-details">
        <summary>Additional analytical context</summary>
        <Card title="Data quality status">
          <p>
            {state.datasets.length
              ? `${evidence.quality.reduce((sum, d) => sum + d.issues.length, 0)} schema validation issue(s) in ${state.datasets.length} loaded dataset(s). Validation does not establish scientific verification.`
              : 'Data not available'}
          </p>
          <Link to="/mobile/quality">Inspect scientific integrity</Link>
        </Card>
        <Card title="Selected model">
          <strong>{model}</strong>
          <Link to="/mobile/models">Inspect validation performance</Link>
        </Card>
        <Card title="Quick actions">
          <div className="m-actions">
            {actions.map(([path, label]) => (
              <Link key={path} to={'/mobile/' + path}>
                {label}
              </Link>
            ))}
          </div>
        </Card>
        {district === 'All districts' ? (
          <Card title="District signals">
            <p>Select a district to inspect its trend and evidence.</p>
            <MobileDistrictSelect />
          </Card>
        ) : (
          <Card title={district + ' · selected district'}>
            <DistrictFacts name={district} />
            <Link to="/mobile/district">Open full district profile</Link>
          </Card>
        )}
        <Card title="Scientific scope" icon={Info}>
          <p>
            All cards follow selected year and district, except explicitly labeled historical
            evidence. Missing values remain visible. Research thresholds are not validated clinical
            thresholds.
          </p>
        </Card>
      </details>
    </>
  );
}
function BurdenTrend({ series }: { series: { year: number; cases: number | null }[] }) {
  const known = series.filter((p) => p.cases !== null);
  if (known.length < 2)
    return (
      <div className="m-empty">
        <ChartLine size={24} />
        <strong>Trend data incomplete</strong>
        <p>At least two observed periods are needed. Missing periods are never filled.</p>
        <Link to="/data-center">Open Data Center</Link>
      </div>
    );
  const first = series[0].year,
    last = series.at(-1)!.year;
  const max = Math.max(...known.map((p) => p.cases!), 1);
  const x = (year: number) => 76 + ((year - first) / Math.max(last - first, 1)) * 178;
  const y = (cases: number) => 140 - (cases / max) * 112;
  return (
    <svg
      className="m-burden-chart"
      viewBox="0 0 280 174"
      role="img"
      aria-label={`Observed malaria burden: ${series.map((p) => `${p.year}: ${p.cases ?? 'not available'}`).join('; ')}`}
    >
      {[0, 0.5, 1].map((f) => (
        <g key={f}>
          <line x1="76" x2="254" y1={y(max * f)} y2={y(max * f)} stroke="var(--m-border)" />
          <text x="70" y={y(max * f) + 4} textAnchor="end">
            {max * f >= 1000 ? `${value((max * f) / 1000)}k` : value(max * f)}
          </text>
        </g>
      ))}
      {series.map(
        (p, i) =>
          p.cases !== null && (
            <g key={p.year}>
              {i > 0 && series[i - 1].cases !== null && p.year === series[i - 1].year + 1 && (
                <line
                  x1={x(series[i - 1].year)}
                  y1={y(series[i - 1].cases!)}
                  x2={x(p.year)}
                  y2={y(p.cases)}
                  stroke="var(--m-teal)"
                  strokeWidth="2.5"
                />
              )}
              <circle
                cx={x(p.year)}
                cy={y(p.cases)}
                r="3.5"
                fill="white"
                stroke="var(--m-teal)"
                strokeWidth="2"
              >
                <title>
                  {p.year}: {value(p.cases)} cases
                </title>
              </circle>
            </g>
          ),
      )}
      <text x="76" y="165">
        {first}
      </text>
      <text x="254" y="165" textAnchor="end">
        {last}
      </text>
    </svg>
  );
}

function District() {
  const { state, update, district, year, model, signals } = useStore(),
    { evidence } = useMobile();
  const m = districtMobileMetrics(evidence.history, district, year),
    calculation = mobileDistrictRisk(evidence.risks, district);
  const ranked = evidence.records
    .filter((r) => incidence360(r) !== null)
    .sort((a, b) => incidence360(b)! - incidence360(a)!);
  const selectedIncidence = incidence360(m.current);
  const rank =
    selectedIncidence === null
      ? -1
      : ranked.filter((r) => incidence360(r)! > selectedIncidence).length;
  const bookmarked = (state.districtBookmarks ?? []).includes(district);
  return (
    <>
      <h1>District Intelligence</h1>
      <MobileDistrictSelect />
      {district === 'All districts' ? (
        <Card title="Choose a district">
          <p>Data not available until a district is selected.</p>
        </Card>
      ) : (
        <>
          <div className="m-actions">
            <button
              onClick={() =>
                update(
                  {
                    districtBookmarks: bookmarked
                      ? (state.districtBookmarks ?? []).filter((d) => d !== district)
                      : [...(state.districtBookmarks ?? []), district],
                  },
                  'District bookmark updated',
                  district,
                )
              }
            >
              {bookmarked ? 'Remove bookmark' : 'Bookmark district'}
            </button>
            <Link to="/mobile/report">Generate district report</Link>
          </div>
          <Card title="Overview">
            {m.ambiguous && (
              <p className="m-warning">
                District name is ambiguous across district codes. Data not available until an
                authoritative identity is resolved.
              </p>
            )}
            <DistrictFacts name={district} />
            <Indicators
              items={[
                ['Population', value(m.current?.values.population)],
                [
                  'Incidence rank',
                  rank < 0 || m.ambiguous ? 'Data not available' : `${rank + 1} / ${ranked.length}`,
                ],
                [
                  'Latest surveillance year',
                  m.trend.filter((r) => r.values.cases !== null).at(-1)?.year,
                ],
                [
                  'Latest climate period',
                  m.trend
                    .filter((r) => r.values.rainfall !== null || r.values.temperature !== null)
                    .at(-1)?.year,
                ],
              ]}
            />
          </Card>
          <Card title="Malaria & incidence trend">
            {m.trend.length ? (
              <div className="m-trend">
                {m.trend.map((r) => (
                  <Indicators
                    key={r.year}
                    items={[
                      ['Year', r.year],
                      ['Observed cases', value(r.values.cases)],
                      ['Incidence / 1,000', value(incidence360(r))],
                    ]}
                  />
                ))}
              </div>
            ) : (
              <p>Data not available</p>
            )}
            <p>Annual change uses the immediately preceding year; gaps do not imply zero burden.</p>
          </Card>
          <Card title="Climate">
            <Indicators
              items={[
                ['Rainfall (source units)', value(m.current?.values.rainfall)],
                ['Temperature (°C)', value(m.current?.values.temperature)],
                ['Rainfall anomaly (SD)', value(m.rainfall?.value)],
                ['Temperature anomaly (SD)', value(m.temperature?.value)],
              ]}
            />
            <p>Anomalies require at least three historical observations and nonzero variance.</p>
          </Card>
          <Card title={'Forecast · ' + model}>
            <Indicators
              items={[
                ['Predicted cases', value(m.predicted)],
                ['Residual: predicted − observed', value(m.residual)],
                ['Absolute prediction error', value(m.absoluteError)],
              ]}
            />
            <Link to="/mobile/models">Model comparison</Link>
          </Card>
          <Card title="Risk explanation">
            {calculation ? (
              <>
                <p>{calculation.formula}</p>
                <Indicators
                  items={[
                    ['Score', value(calculation.score)],
                    ['Classification', calculation.category],
                    ['Threshold', calculation.classificationThreshold],
                  ]}
                />
                {calculation.components
                  .filter((c) => c.weight > 0)
                  .map((c) => (
                    <Indicators
                      key={c.id}
                      items={[
                        [c.label, value(c.value)],
                        ['Weight', c.weight],
                        ['Contribution', value(c.contribution)],
                      ]}
                    />
                  ))}
                <p>
                  {calculation.reasons.join(' ') ||
                    'All required values are available; the displayed formula and thresholds determine this category.'}
                </p>
                <p>{calculation.dataVerification}</p>
              </>
            ) : (
              <p>Data not available</p>
            )}
          </Card>
          <Card title="Alerts">
            <p>
              {
                signals.filter(
                  (a) => a.year === year && normalize(a.district) === normalize(district),
                ).length
              }{' '}
              analytical signal(s) in selected period.
            </p>
            {signals
              .filter((a) => a.year === year && normalize(a.district) === normalize(district))
              .slice(-3)
              .map((a) => (
                <div key={a.id}>
                  <span className="m-badge">
                    {a.severity} · {state.alertStates[a.id]?.status ?? 'NEW'}
                  </span>
                  <p>{a.exactRule}</p>
                  <small>{date(state.alertCreated?.[a.id])}</small>
                </div>
              ))}
            <Link to="/mobile/alerts">Review district alerts</Link>
          </Card>
          <Card title="Readiness">
            <Suspense fallback={<p role="status">Loading readiness evidence…</p>}>
              <ReadinessSummary />
            </Suspense>
            <Link to="/mobile/readiness">Open eight-domain readiness assessment</Link>
          </Card>
          <Card title="Quality & provenance">
            {evidence.identityIssues.map((issue, i) => (
              <p key={i} className="m-warning">
                {issue}
              </p>
            ))}
            <p>
              Input completeness: {value(m.completeness)}%. This measures six connected analytical
              fields; it is not a verification score.
            </p>
            {m.current?.issues.map((s, i) => (
              <p key={i}>{s}</p>
            ))}
            <Link to="/mobile/provenance">Open source evidence</Link>
            <Link to="/mobile/quality">Open integrity checks</Link>
          </Card>
        </>
      )}
    </>
  );
}
function Alerts() {
  const { state, update, signals, year, district, setDistrict } = useStore(),
    navigate = useNavigate();
  const [filter, setFilter] = useState('All'),
    [trigger, setTrigger] = useState<(typeof signals)[number] | null>(null);
  const all = signals.filter(
    (a) =>
      a.year === year &&
      (district === 'All districts' || normalize(a.district) === normalize(district)),
  );
  const list = all.filter(
    (a) =>
      filter === 'All' ||
      (filter === 'New' && (state.alertStates[a.id]?.status ?? 'NEW') === 'NEW') ||
      (filter === 'High' && ['HIGH', 'VERY HIGH', 'CRITICAL'].includes(a.severity)) ||
      (filter === 'Reviewed' &&
        ['REVIEWED', 'ACKNOWLEDGED', 'RESOLVED'].includes(state.alertStates[a.id]?.status)) ||
      (filter === 'Data Quality' && /data|gap|quality/i.test(a.category ?? '')),
  );
  const save = (id: string, status: string) =>
    update(
      {
        alertStates: {
          ...state.alertStates,
          [id]: { note: state.alertStates[id]?.note ?? '', status },
        },
      },
      'Alert ' + status.toLowerCase(),
      id,
    );
  return (
    <>
      <h1>Alert Center</h1>
      <label>
        Alert filter
        <select
          aria-label="Alert filter"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          {['All', 'New', 'High', 'Reviewed', 'Data Quality'].map((f) => (
            <option key={f}>{f}</option>
          ))}
        </select>
      </label>
      <p>
        {year} · {district} · {list.length} signals
      </p>
      {list.length ? (
        list.map((a) => (
          <Card key={a.id} title={a.district + ' · ' + a.severity}>
            <span className="m-badge">{a.category ?? 'Surveillance'}</span>
            <p>{a.exactRule}</p>
            <p>{a.explanation}</p>
            <Indicators
              items={[
                ['Observation year', a.year],
                ['Generated', date(state.alertCreated?.[a.id])],
                ['Review status', state.alertStates[a.id]?.status ?? 'NEW'],
                ['Source dataset', a.sourceDataset.name],
              ]}
            />
            <div className="m-actions">
              <button onClick={() => save(a.id, 'REVIEWED')}>Review</button>
              <button onClick={() => save(a.id, 'ACKNOWLEDGED')}>Acknowledge</button>
              <button
                onClick={() => {
                  setDistrict(a.district);
                  navigate('/mobile/district');
                }}
              >
                Open District
              </button>
              <button onClick={() => setTrigger(a)}>Trigger Data</button>
            </div>
          </Card>
        ))
      ) : (
        <Card title="No matching analytical alerts">
          <p>No rule-generated signals match the loaded evidence and selected filters.</p>
        </Card>
      )}
      {trigger && (
        <Sheet title="Alert triggering evidence" onClose={() => setTrigger(null)}>
          <p>{trigger.exactRule}</p>
          <p>{trigger.explanation}</p>
          <pre>
            {JSON.stringify(
              {
                observations: trigger.observations,
                evaluatedValues: trigger.triggeringData,
                source: trigger.sourceDataset,
              },
              null,
              2,
            )}
          </pre>
        </Sheet>
      )}
    </>
  );
}
function Surveillance() {
  const { state, year, district, setDistrict, signals } = useStore(),
    { evidence } = useMobile(),
    navigate = useNavigate();
  const [search, setSearch] = useState(''),
    [sort, setSort] = useState('Burden'),
    [alertOnly, setAlertOnly] = useState(false),
    [alertStatus, setAlertStatus] = useState('All');
  const rank = (name: string) =>
    ['LOW', 'MODERATE', 'HIGH', 'VERY HIGH'].indexOf(
      evidence.risks.find((r) => r.record.district === name)?.calculation.category ?? '',
    );
  const records = evidence.records
    .filter(
      (r) =>
        (district === 'All districts' || normalize(r.district) === normalize(district)) &&
        normalize(r.district).includes(normalize(search)) &&
        (!alertOnly ||
          signals.some(
            (a) => a.year === year && normalize(a.district) === normalize(r.district),
          )) &&
        (alertStatus === 'All' ||
          signals.some(
            (a) =>
              a.year === year &&
              normalize(a.district) === normalize(r.district) &&
              (alertStatus === 'Reviewed'
                ? ['REVIEWED', 'ACKNOWLEDGED', 'RESOLVED'].includes(
                    state.alertStates[a.id]?.status ?? 'NEW',
                  )
                : (state.alertStates[a.id]?.status ?? 'NEW') === alertStatus),
          )),
    )
    .sort((a, b) =>
      sort === 'Risk'
        ? rank(b.district) - rank(a.district)
        : sort === 'Incidence'
          ? (incidence360(b) ?? -1) - (incidence360(a) ?? -1)
          : (b.values.cases ?? -1) - (a.values.cases ?? -1),
    );
  return (
    <>
      <h1>Surveillance</h1>
      <label>
        Search districts
        <input
          aria-label="Search districts"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      <label>
        Sort cards
        <select
          aria-label="Sort surveillance"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          {['Burden', 'Incidence', 'Risk'].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </label>
      <label>
        Alert review status
        <select
          aria-label="Surveillance alert status"
          value={alertStatus}
          onChange={(e) => setAlertStatus(e.target.value)}
        >
          {['All', 'NEW', 'Reviewed', 'ACKNOWLEDGED'].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </label>
      <label className="m-check">
        <input
          type="checkbox"
          checked={alertOnly}
          onChange={(e) => setAlertOnly(e.target.checked)}
        />
        Only districts with alerts
      </label>
      <p>
        {year} · {records.length} districts
      </p>
      {records.map((r) => (
        <Card key={`${r.code ?? r.district}:${r.year}`} title={r.district}>
          <DistrictFacts name={r.district} />
          <button
            onClick={() => {
              setDistrict(r.district);
              navigate('/mobile/district');
            }}
          >
            Open district profile
          </button>
        </Card>
      ))}
      {!records.length && <p>Data not available</p>}
    </>
  );
}
function Provenance() {
  const { state, year, district } = useStore(),
    { data, evidence, cached } = useMobile();
  const selected = evidence.records.filter(
    (r) => district === 'All districts' || normalize(r.district) === normalize(district),
  );
  return (
    <>
      <h1>Data Provenance</h1>
      <p>
        {year} · {district} ·{' '}
        {cached
          ? 'Cached/local evidence; freshness not established'
          : 'Connected session; observation dates determine freshness'}
      </p>
      {state.datasets.map((d) => (
        <Card key={d.id} title={d.name}>
          <Indicators
            items={[
              ['Source', d.source],
              ['Classification', d.classification ?? 'USER IMPORT'],
              ['Checksum', d.checksum],
              ['Registered', date(d.created)],
              ['Records', d.rows.length],
            ]}
          />
        </Card>
      ))}
      {selected.map((r) => (
        <Card key={`${r.code ?? r.district}:${r.year}`} title={r.district + ' · ' + r.year}>
          {r.references
            .filter((ref) => ref.selected)
            .map((ref, i) => (
              <Indicators
                key={i}
                items={[
                  ['Field', ref.field],
                  ['Dataset', ref.dataset],
                  ['Source', ref.source],
                  ['Verification label', ref.classification],
                  ['Year', ref.year],
                ]}
              />
            ))}
        </Card>
      ))}
      <Card title="Supplied study source registry">
        <p>Supplied aggregate results are not independently verified district observations.</p>
        {Object.entries(data?.provenance ?? {}).map(([name, meta]) => (
          <details key={name}>
            <summary>{name}</summary>
            <pre>{JSON.stringify(meta, null, 2)}</pre>
          </details>
        ))}
      </Card>
    </>
  );
}
export default function MobilePages({ page }: { page: string }) {
  if (['models', 'readiness', 'quality'].includes(page))
    return (
      <Suspense fallback={<MobileSkeleton label="Loading analytical evidence" />}>
        <Analysis page={page} />
      </Suspense>
    );
  if (page === 'home') return <Home />;
  if (page === 'district') return <District />;
  if (page === 'alerts') return <Alerts />;
  if (page === 'surveillance') return <Surveillance />;
  if (page === 'provenance') return <Provenance />;
  return (
    <>
      <h1>More research tools</h1>
      <MobileSourceControls expanded />
      <MobileDataStatus />
      <Card title="Research">
        <div className="m-menu-list">
          {[
            ...actions.filter(([path]) => path !== 'report'),
            ['surveillance', 'Surveillance Cards'],
          ].map(([path, label]) => (
            <Link key={path} to={'/mobile/' + path}>
              {label}
              <ChevronRight size={18} />
            </Link>
          ))}
          <Link to="/climate">
            Climate intelligence · desktop <ChevronRight size={18} />
          </Link>
        </div>
      </Card>
      <Card title="Data">
        <div className="m-menu-list">
          <Link to="/mobile/quality">
            Scientific Integrity <ChevronRight size={18} />
          </Link>
          <Link to="/mobile/provenance">
            Data Provenance <ChevronRight size={18} />
          </Link>
          <Link to="/mobile/report">
            Generate Report <ChevronRight size={18} />
          </Link>
          <Link to="/data-center">
            Data Center · desktop <ChevronRight size={18} />
          </Link>
        </div>
      </Card>
      <Card title="Saved districts">
        <Bookmarks />
      </Card>
      <Card title="System">
        <div className="m-menu-list">
          <Link to="/dashboard">
            Open full desktop application <ChevronRight size={18} />
          </Link>
          <Link to="/settings">
            Settings <ChevronRight size={18} />
          </Link>
          <Link to="/about">
            About MALARIASCOPE <ChevronRight size={18} />
          </Link>
        </div>
      </Card>
    </>
  );
}
function Bookmarks() {
  const { state, setDistrict } = useStore();
  return (
    <>
      {(state.districtBookmarks ?? []).length ? (
        state.districtBookmarks?.map((d) => (
          <Link key={d} to="/mobile/district" onClick={() => setDistrict(d)}>
            {d}
          </Link>
        ))
      ) : (
        <p>No district bookmarks saved locally.</p>
      )}
    </>
  );
}
