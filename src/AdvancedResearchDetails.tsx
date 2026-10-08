import { useRef, useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useStore } from './store';
import {
  evidenceCsv,
  evidenceDefinitions,
  methodologyEvidence,
  methodologyLimitations,
} from './methodology-evidence';
import './methodology.css';
const fmt = (n: number | null | undefined, digits = 0) =>
  n == null
    ? 'Not supplied'
    : n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const definitions: Record<string, string> = {
  API: 'Annual parasite incidence: reported episodes per 1,000 source-defined at-risk population.',
  MAE: 'Mean absolute error: average absolute difference between observed and predicted cases; lower is better.',
  RMSE: 'Root mean squared error: gives larger errors greater weight; lower is better.',
  'R²': 'Coefficient of determination: fit relative to mean observed outcomes; not a probability.',
  Persistence: 'Benchmark that uses the preceding-year malaria burden as the next-year forecast.',
  'Temporal test': 'Final evaluation on a later year held out from model selection.',
  Hindcast: 'Retrospective prediction of historical outcomes using preceding-period predictors.',
  'Moran’s I': 'Global measure of spatial autocorrelation under the specified spatial weights.',
  'Permutation test': 'Compares a statistic with rearranged data under the specified null model.',
  'Balanced panel': 'The same districts have an observation in every analytical year.',
  'Lagged target': 'An outcome paired with predictors from the preceding year.',
  'At-risk population':
    'Source-defined denominator for API; not automatically interchangeable with total resident population.',
  'Permutation importance':
    'Predictive contribution assessed by shuffling a feature; does not establish causality.',
};
function Term({ name }: { name: string }) {
  return (
    <span className="method-term">
      <button type="button" aria-label={`${name} definition`}>
        {name} ⓘ
      </button>
      <span role="tooltip">{definitions[name]}</span>
    </span>
  );
}
function Section({ title, children, id }: { title: string; children: ReactNode; id?: string }) {
  return (
    <section className="method-section" id={id}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}
function Metric({
  name,
  value,
  detail,
}: {
  name: ReactNode;
  value: ReactNode;
  detail?: ReactNode;
}) {
  return (
    <article className="method-card">
      <h3>{name}</h3>
      <strong className="method-value">{value}</strong>
      {detail && <p>{detail}</p>}
    </article>
  );
}
function Source() {
  return (
    <NavLink className="method-source" to="/provenance">
      View provenance →
    </NavLink>
  );
}
const tabs = [
  'Overview',
  'Surveillance',
  'Climate',
  'Forecasting',
  'Spatial',
  'Data Quality',
  'Provenance',
  'Limitations',
];
const supports = [
  'Retrospective malaria burden analysis',
  'Temporal benchmarking',
  'Comparison with persistence',
  'District-level forecast error inspection',
  'Observed 2025 API mapping',
  'Global Moran analysis',
  'Research risk visualization',
  'Data provenance review',
];
const unsupported = [
  'Prospective forecasting benefit',
  'Real-time early warning',
  'Individual infection risk',
  'Military attack rate',
  'Operational deployment decisions',
  'Clinical decision-making',
  'Automated resource allocation',
  'Confirmed local hotspot significance',
];
export default function AdvancedResearchDetails() {
  const {
    research: p,
    researchError,
    state,
    update,
    setYear,
    setDistrict,
    setModel,
    year,
    district,
    model,
  } = useStore();
  const [tab, setTab] = useState('Overview');
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [exportStatus, setExportStatus] = useState('');
  if (!p)
    return (
      <div className="methodology">
        <h2>Detailed research interpretation</h2>
        <p role={researchError ? 'alert' : 'status'}>
          {researchError || 'Loading checksummed research evidence…'}
        </p>
        <p>
          Scientific results are unavailable until the supplied package passes integrity checks.
        </p>
      </div>
    );
  const e = methodologyEvidence(p),
    districts = [...new Set(p.balanced.map((r) => r.district))];
  const rf = e.benchmark.find((r) => r.model === 'Random Forest'),
    u = p.uncertainty,
    s = p.spatialResult;
  const highestCases = [...p.spatial].sort((a, b) => b.cases - a.cases)[0],
    highestApi = [...p.spatial].sort((a, b) => b.observed_api - a.observed_api)[0];
  const active = state.datasets.find((d) => d.id === state.active);
  const statuses = [
    [
      'Malaria surveillance',
      'surveillance',
      '8 districts, 2020–2025',
      'Forecast panel',
      'Supiori incomplete longitudinally',
    ],
    [
      '2025 spatial snapshot',
      'spatialSnapshot',
      '9 districts',
      'Observed spatial assessment',
      'Single-year cross-section',
    ],
    [
      'Climate',
      'climate',
      '8 districts, 2020–2025',
      'Predictor archive',
      'Annual centroid summaries',
    ],
    [
      'Model predictions',
      'predictions',
      '8 districts, 2025',
      'Retrospective hindcast',
      'Not prospective',
    ],
    ['Model benchmark', 'modelBenchmark', '2024–2025', 'Temporal evaluation', 'Small test set'],
    [
      'Spatial statistic',
      'spatialStatistic',
      '9 districts, 2025',
      'Global spatial analysis',
      'Limited spatial resolution',
    ],
    [
      'Source quality ledger',
      'sourceLedger',
      'Multiple sources',
      'Scientific integrity',
      'Official reconciliation pending',
    ],
    [
      'Geometry',
      'geometry',
      'Nine public ADM2 geometries',
      'GIS context',
      'Not military operational geography',
    ],
    ['Facilities', 'facilities', 'Not connected', 'Context only', 'Optional; not required'],
    [
      'Prospective data',
      'prospective',
      'Not available',
      'Future validation',
      'No prospective evidence',
    ],
    ['IoT', 'iot', 'Not connected', 'Future research', 'No supplied sensor data'],
  ];
  const exportEvidence = (format: 'json' | 'csv') => {
    const payload = {
      ...e,
      statusMatrix: statuses.map(([dataset, key, coverage, role, limitation]) => ({
        dataset,
        status: p.status[key],
        coverage,
        role,
        limitation,
      })),
      selectedFilters: {
        year: year,
        district: district,
        model: model,
        riskMode: state.riskMode,
        dataset: state.active,
      },
      activeSource:
        state.researchMode === 'BUILTIN'
          ? 'Bundled study evidence'
          : { classification: 'USER IMPORT', name: active?.name || 'No active user dataset' },
    };
    const url = URL.createObjectURL(
      new Blob([format === 'json' ? JSON.stringify(payload, null, 2) : evidenceCsv(payload)], {
        type: format === 'json' ? 'application/json' : 'text/csv;charset=utf-8',
      }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = `malariascope-methodology-evidence.${format}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setExportStatus(`Evidence ${format.toUpperCase()} exported.`);
  };
  const annual = (
    <>
      <p>
        <span className="method-badge">OBSERVED</span> Balanced eight-district cohort. Population
        denominators are connected only for 2025; prior-year API is not reconstructed.
      </p>
      <svg
        className="method-chart"
        viewBox="0 0 660 220"
        role="img"
        aria-label="Balanced-panel annual malaria cases, 2020–2025; exact values in the following table"
      >
        <title>Balanced-panel annual malaria cases, 2020–2025</title>
        <desc>
          {e.annual.map((r) => `${r.year}: ${fmt(r.cases)} cases`).join('; ')}. Exact values and
          calculated percentage changes are in the table below.
        </desc>
        {[0, 100000, 200000, 300000].map((n) => (
          <g key={n}>
            <line x1="70" x2="625" y1={175 - n / 2000} y2={175 - n / 2000} stroke="#dce4eb" />
            <text x="5" y={180 - n / 2000}>
              {fmt(n)}
            </text>
          </g>
        ))}
        <polyline
          fill="none"
          stroke="#0b817e"
          strokeWidth="3"
          points={e.annual.map((r, i) => `${80 + i * 105},${175 - r.cases / 2000}`).join(' ')}
        />
        {e.annual.map((r, i) => (
          <g key={r.year}>
            <circle cx={80 + i * 105} cy={175 - r.cases / 2000} r="5" fill="#0b817e" />
            <text x={80 + i * 105} y="205" textAnchor="middle">
              {r.year}
            </text>
          </g>
        ))}
      </svg>
      <div className="method-table-wrap">
        <table>
          <caption>Full balanced-panel series — calculated year-over-year changes</caption>
          <thead>
            <tr>
              <th scope="col">Year</th>
              <th scope="col">Reported cases</th>
              <th scope="col">Change from previous year</th>
            </tr>
          </thead>
          <tbody>
            {e.annual.map((r) => (
              <tr key={r.year}>
                <th scope="row">{r.year}</th>
                <td>{fmt(r.cases)}</td>
                <td>
                  {r.changePercent === null
                    ? 'Not applicable'
                    : `${r.changePercent > 0 ? '+' : ''}${fmt(r.changePercent, 2)}%`}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Total</th>
              <td>{fmt(e.balancedTotal)}</td>
              <td>Eight districts; six years</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <Source />
    </>
  );
  const benchmark = (
    <>
      <h3>2025 test MAE</h3>
      <p>
        <Term name="MAE" /> is the primary metric. Persistence had the lowest primary 2025 MAE.
      </p>
      <div className="method-table-wrap">
        <table>
          <caption>Supplied full-precision metrics; display rounded to two decimals</caption>
          <thead>
            <tr>
              <th scope="col">Model</th>
              <th scope="col">MAE</th>
              <th scope="col">
                <Term name="RMSE" />
              </th>
              <th scope="col">
                <Term name="R²" />
              </th>
            </tr>
          </thead>
          <tbody>
            {e.benchmark.map((r, i) => (
              <tr key={r.model} className={i === 0 ? 'method-best' : ''}>
                <th scope="row">
                  {r.model}
                  {i === 0 ? ' · Lowest MAE' : ''}
                </th>
                <td>{fmt(r.mae, r.model === 'Persistence' ? 1 : 2)}</td>
                <td>{fmt(r.rmse)}</td>
                <td>{fmt(r.r2, 3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        2024 Random Forest validation MAE:{' '}
        {fmt(e.validation.find((r) => r.model === 'Random Forest')?.mae)}. Unreported metrics remain
        “Not supplied”.
      </p>
      <Source />
    </>
  );
  const climate = (
    <article className="method-card">
      <h3>Climate added value</h3>
      <p>
        Ridge without climate:{' '}
        {fmt(e.benchmark.find((r) => r.model.includes('no climate'))?.mae, 2)} MAE. Ridge with
        climate: {fmt(e.benchmark.find((r) => r.model === 'Ridge Regression — climate')?.mae, 2)}{' '}
        MAE.
      </p>
      <strong className="method-value">+{fmt(e.climateMaeDifference, 2)} MAE</strong>
      <p>
        The evaluated annual climate predictors did not improve the primary 2025 ridge-model MAE.
      </p>
      <p>
        This does not imply that climate is biologically unimportant for malaria. It indicates
        limited incremental predictive value from these specific annual district-level climate
        features in this dataset.
      </p>
      <Source />
    </article>
  );
  const uncertainty = (
    <article className="method-card">
      <h3>Model uncertainty</h3>
      <dl className="method-definitions">
        <dt>Persistence MAE / bootstrap interval</dt>
        <dd>
          {fmt(u.persistenceMae, 1)} / {fmt(u.persistenceInterval[0], 1)}–
          {fmt(u.persistenceInterval[1], 1)}
        </dd>
        <dt>Random Forest MAE / bootstrap interval</dt>
        <dd>
          {fmt(u.rfMae, 1)} / {fmt(u.rfInterval[0], 1)}–{fmt(u.rfInterval[1], 1)}
        </dd>
        <dt>RF minus Persistence / paired interval</dt>
        <dd>
          +{fmt(u.pairedDifference, 1)} / {fmt(u.pairedInterval[0], 1)} to +
          {fmt(u.pairedInterval[1], 1)}
        </dd>
      </dl>
      <p>
        The paired interval crosses zero; superiority of either approach was not statistically
        established under this conditional bootstrap analysis.
      </p>
      <Source />
    </article>
  );
  const importance = (
    <article className="method-card">
      <h3>What drove Random Forest predictions?</h3>
      <p>
        Leading <Term name="Permutation importance" /> predictor:{' '}
        <strong>prior malaria burden</strong> (supplied qualitative finding).
      </p>
      <p>
        Other features were available but lower / not numerically summarized here. Exact numeric
        importances were not supplied; no bar heights are invented.
      </p>
      <Source />
    </article>
  );
  const spatial = (
    <>
      <div className="method-grid">
        <Metric
          name="Districts / observed episodes"
          value={`9 / ${fmt(e.spatialEpisodes)}`}
          detail="2025 observed spatial snapshot; separate from the balanced cohort."
        />
        <Metric
          name="Highest episode count"
          value={fmt(highestCases.cases)}
          detail={highestCases.district}
        />
        <Metric
          name={
            <>
              Highest observed <Term name="API" />
            </>
          }
          value={fmt(highestApi.observed_api, 2)}
          detail={`${highestApi.district}; per 1,000 source-defined at-risk population`}
        />
        <Metric
          name={<Term name="Moran’s I" />}
          value={fmt(s.moranI, 3)}
          detail={`Expected I: ${fmt(s.expected_I, 3)}`}
        />
        <Metric
          name={<Term name="Permutation test" />}
          value={`p = ${fmt(s.pValue, 4)}`}
          detail={`${fmt(s.permutations)} permutations`}
        />
      </div>
      <p>Weights: symmetrised, row-standardised 3-nearest-neighbour centroid relationships.</p>
      <p className="method-callout">
        Global spatial clustering was not established at the 0.05 significance level. This is not
        confirmed local hotspot structure.
      </p>
      <div className="method-table-wrap">
        <table>
          <caption>2025 observed API — source-defined at-risk denominators</caption>
          <thead>
            <tr>
              <th scope="col">District</th>
              <th scope="col">Episodes</th>
              <th scope="col">At-risk population</th>
              <th scope="col">API / 1,000</th>
            </tr>
          </thead>
          <tbody>
            {p.spatial.map((r) => (
              <tr key={r.district}>
                <th scope="row">{r.district}</th>
                <td>{fmt(r.cases)}</td>
                <td>{fmt(r.at_risk_population)}</td>
                <td>{fmt(r.observed_api, 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <NavLink to="/spatial-analysis">Open Spatial Analysis →</NavLink>
      <Source />
    </>
  );
  const limitations = (
    <div className="method-grid">
      {methodologyLimitations.map(([name, detail]) => (
        <article className="method-card" key={name}>
          <h3>{name}</h3>
          <p>{detail}</p>
        </article>
      ))}
    </div>
  );
  const completeness = (
    <div className="method-table-wrap">
      <table>
        <caption>District × year completeness — missing is never zero</caption>
        <thead>
          <tr>
            <th scope="col">District</th>
            {e.annual.map((r) => (
              <th scope="col" key={r.year}>
                {r.year}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[...districts, 'Supiori'].map((d) => (
            <tr key={d}>
              <th scope="row">{d}</th>
              {e.annual.map((r) => (
                <td key={r.year}>
                  {d !== 'Supiori' || r.year === 2025
                    ? 'OBSERVED'
                    : r.year === 2024
                      ? 'MISSING'
                      : 'NOT SUPPLIED'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  const quality = (
    <>
      <div className="method-grid">
        {p.ledger.map((r) => (
          <article className="method-card method-unresolved" key={r.id}>
            <h3>{r.description}</h3>
            <span className="method-badge">UNRESOLVED SOURCE ISSUE</span>
            <dl>
              <dt>Analytical treatment / impact</dt>
              <dd>{r.impact}</dd>
              <dt>Resolution needed</dt>
              <dd>{r.resolution} Official source clarification required.</dd>
            </dl>
          </article>
        ))}
        <article className="method-card">
          <h3>Publication-time uncertainty</h3>
          <p>
            Status: not established. Historical inputs are used for hindcasts; prospective benefit
            is not claimed. Resolution requires documented source issue dates.
          </p>
        </article>
        <article className="method-card">
          <h3>Denominator differences</h3>
          <p>
            Source-defined at-risk populations are connected only for 2025 observed API. Earlier
            population estimates used for relative forecast intensity are not substituted into
            observed API. Harmonised denominator metadata is needed for longitudinal incidence
            comparisons.
          </p>
        </article>
      </div>
      <Source />
    </>
  );
  const provenance = (
    <>
      <p>
        {p.manifest.verification}. “Last verified” refers to package extraction / integrity
        metadata, not independent report auditing.
      </p>
      <div className="method-grid">
        {p.manifest.files.map((f: any) => (
          <article className="method-card method-provenance" key={f.name}>
            <h3>{f.name}</h3>
            <dl>
              <dt>Source classification</dt>
              <dd>{f.classification.replaceAll('_', ' ')}</dd>
              <dt>Version / rows / period</dt>
              <dd>
                {f.version} · {fmt(f.records)} records · {f.period}
              </dd>
              <dt>Geography / data type</dt>
              <dd>
                Papua study districts ·{' '}
                {f.name.startsWith('surveillance')
                  ? 'Observed'
                  : f.name.includes('predictions')
                    ? 'Predicted'
                    : f.name.includes('climate')
                      ? 'Derived climate aggregate'
                      : f.name.includes('geo')
                        ? 'Public geographic context'
                        : 'Supplied analytical evidence / metadata'}
              </dd>
              <dt>Source</dt>
              <dd>{f.source}</dd>
              <dt>License</dt>
              <dd>{f.license}</dd>
              <dt>Last verified date</dt>
              <dd>{f.last_verified}</dd>
              <dt>SHA-256</dt>
              <dd className="method-checksum">{f.sha256}</dd>
            </dl>
            <a href={`/data/verified/${f.name}`} download>
              Download source artifact
            </a>
          </article>
        ))}
      </div>
      <Source />
    </>
  );
  const overview = (
    <dl className="method-definitions">
      {[
        ['Study design', e.study.design],
        ['Study geography', 'Papua study districts; administrative ecological units'],
        [
          'Study period',
          '2020–2025 analytical; 2010–2019 historical context; 2026 partial context only',
        ],
        ['Forecasting cohort', 'Eight complete longitudinal districts'],
        ['Spatial cohort', 'Nine districts including Supiori, 2025 only'],
        ['Primary outcome', 'Reported malaria episodes'],
        ['Primary validation metric', '2025 temporal-test MAE'],
        ['Primary benchmark result', 'Persistence had the lowest primary 2025 MAE'],
        ['Primary spatial result', 'Global clustering not established (p = 0.1301)'],
        ['Primary predictor finding', 'Prior malaria burden led permutation prediction importance'],
        [
          'Main limitation',
          'Retrospective evaluation; operational publication-time availability and prospective benefit not established',
        ],
      ].map(([name, value]) => (
        <div key={name}>
          <dt>{name}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
  const content: Record<string, ReactNode> = {
    Overview: overview,
    Surveillance: (
      <>
        {annual}
        <h3>District-year completeness</h3>
        {completeness}
        <p>
          Forecasting districts: {districts.join(', ')}. Supiori 2024 is missing, 2020–2023
          extracted values were not supplied, and 2025 is observed. No missing values were imputed.
        </p>
        <h3>Separate nine-district 2025 snapshot</h3>
        {spatial}
      </>
    ),
    Climate: (
      <>
        <h3>NASA POWER annual climate archive</h3>
        <p>
          Rainfall (mm), mean temperature (°C), and relative humidity (%) are annual
          district-centroid aggregates: {p.climate.length} district-years, eight districts,
          2020–2025.
        </p>
        <p>
          Preceding-year predictors were used. 2025 climate observations were not used to predict
          2025 malaria outcomes. The 2025 archive is descriptive, not a contemporaneous hindcast
          input.
        </p>
        <p>
          Climate does not establish causality. Annual centroid summaries cannot resolve local
          exposure or shorter climate lags.
        </p>
        {climate}
        <Source />
      </>
    ),
    Forecasting: (
      <>
        <p>
          Training: 2021–2023 targets (24). Validation: 2024 (8). Final temporal test: 2025 (8).
          Selected models were refit through 2024 for the final test.
        </p>
        {benchmark}
        <div className="method-grid">
          {climate}
          {uncertainty}
          {importance}
        </div>
        <NavLink to="/forecasting/failure-analysis">Open Model Failure Analysis →</NavLink>
      </>
    ),
    Spatial: spatial,
    'Data Quality': quality,
    Provenance: provenance,
    Limitations: limitations,
  };
  return (
    <div className="methodology">
      <header className="method-header">
        <p className="method-eyebrow">Scientific evidence workspace</p>
        <h2>Detailed research interpretation</h2>
        <p>
          {p.manifest.version} · <span className="method-badge">VERIFIED RESEARCH EXTRACTION</span>
        </p>
        <p>
          Bundled supplied study evidence, extracted from study tables; not independently audited
          against underlying reports.
        </p>
        {state.researchMode !== 'BUILTIN' && (
          <p className="method-callout">
            Active analytical dataset:{' '}
            {active ? (
              <>
                <span className="method-badge">USER IMPORT</span> {active.name}
              </>
            ) : (
              'No user dataset selected'
            )}
            . This methodology describes the bundled study evidence, not imported results.
          </p>
        )}
      </header>
      <div className="method-callout">
        <strong>
          Research prototype · Retrospective hindcast — not prospective early warning.
        </strong>
        <p>
          Human-reviewed analytical research support. No prospective, clinical, usability or
          operational validation established.
        </p>
      </div>
      <Section title="Study at a Glance">
        <div className="method-grid">
          <Metric
            name="Study design"
            value="Retrospective ecological geospatial forecasting study"
          />
          <Metric name="Primary analytical period" value="2020–2025" />
          <Metric
            name="Historical context"
            value="2010–2019"
            detail="Context only; underlying records not supplied"
          />
          <Metric
            name="Contemporary context"
            value="2026 partial reporting"
            detail="Context only; no completed annual outcome"
          />
          <Metric
            name={<Term name="Balanced panel" />}
            value={`${districts.length} districts`}
            detail={`${p.balanced.length} balanced district-years`}
          />
          <Metric
            name={<Term name="Lagged target" />}
            value={p.coverage.laggedTargets.rows}
            detail="2021–2025 forecasting targets"
          />
          <Metric
            name="Training observations"
            value={p.coverage.training.rows}
            detail="2021–2023 targets"
          />
          <Metric name="Validation observations" value={p.coverage.validation.rows} detail="2024" />
          <Metric
            name={<Term name="Temporal test" />}
            value={p.coverage.test.rows}
            detail="2025 observations"
          />
          <Metric name="2025 spatial assessment" value={`${p.spatial.length} districts`} />
          <Metric
            name="Balanced-panel reported cases"
            value={fmt(e.balancedTotal)}
            detail="2020–2025; eight-district cohort"
          />
        </div>
        <Source />
      </Section>
      <Section title="Evidence Coverage Timeline">
        <ol className="method-timeline">
          {[
            ['2010–2019', 'Historical context only', true],
            ['2020', 'Verified surveillance panel begins', false],
            ['2021–2023', 'Model training targets', false],
            ['2024', 'Model validation', false],
            ['2025', 'Untouched temporal test + nine-district spatial assessment', false],
            ['2026', 'Partial programme context only', true],
          ].map(([year, description, context]) => (
            <li key={String(year)} className={context ? 'method-context' : ''}>
              <strong>{year}</strong>
              <span>{description}</span>
              <small>{context ? 'CONTEXTUAL EVIDENCE' : 'ANALYTICAL DATA'}</small>
            </li>
          ))}
        </ol>
      </Section>
      <Section title="Temporal Forecasting Design">
        <div className="method-workflow">
          {[2020, 2021, 2022, 2023, 2024].map((y) => (
            <article key={y}>
              <strong>{y} observations</strong>
              <span aria-hidden="true">↓</span>
              <strong>
                {y + 1} {y === 2023 ? 'validation' : y === 2024 ? 'test' : 'target'}
              </strong>
            </article>
          ))}
        </div>
        <p>Training: 2021–2023 targets · Validation: 2024 · Final temporal test: 2025.</p>
        <p className="method-callout">
          Preceding-year predictors were used. 2025 climate observations were not used to predict
          2025 malaria outcomes.
        </p>
        <p>
          This evaluation is retrospective <Term name="Hindcast" />
          ing because historical publication-time availability was not fully established.
        </p>
        <Source />
      </Section>
      <Section title="Why 8 Districts for Forecasting but 9 for Spatial Analysis?">
        <div className="method-two">
          <article className="method-card">
            <h3>Forecasting panel · 8 districts</h3>
            <ul>
              {districts.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
            <p>A complete 2020–2025 outcome sequence was required.</p>
          </article>
          <article className="method-card">
            <h3>2025 spatial assessment · 9 districts</h3>
            <p>
              The same eight districts + <strong>Supiori</strong>.
            </p>
            <p>
              Supiori was included because its 2025 observed data were available. It was excluded
              from forecasting because its 2024 outcome was unavailable.
            </p>
            <strong>Missing 2024 outcome ≠ zero cases.</strong>
          </article>
        </div>
      </Section>
      <Section title="Candidate Surveillance Record Accounting">
        <div className="method-grid">
          <Metric
            name="Potential district-years"
            value={p.coverage.candidatePanel.rows}
            detail="9 districts × 6 years"
          />
          <Metric
            name="Study reports observed outcomes"
            value={`${p.coverage.candidatePanel.observedOutcomesReported} / 54`}
            detail="Coverage metadata; Supiori 2024 unavailable"
          />
          <Metric
            name="Bundled unique outcomes"
            value={p.coverage.candidatePanel.availableBundledOutcomes}
            detail="48 balanced observations + Supiori 2025 = 49"
          />
        </div>
        <p>
          Supiori 2020–2023: reported in study coverage metadata, but underlying extracted values
          were not supplied to this application and were not reconstructed.
        </p>
        <p className="method-callout">No missing values were imputed or invented.</p>
      </Section>
      <Section title="System Evidence Status Matrix">
        <p>
          Statuses describe the bundled study package. Locally imported, prospective or simulated
          sensor records do not change its evidence status.
        </p>
        <div className="method-status-table">
          <table>
            <caption>Evidence availability, role and limitations</caption>
            <thead>
              <tr>
                {['Dataset / Evidence', 'Status', 'Coverage', 'Role', 'Limitation'].map((h) => (
                  <th scope="col" key={h}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {statuses.map(([name, key, coverage, role, limitation]) => (
                <tr key={key}>
                  {[
                    name,
                    String(p.status[key]).replaceAll('_', ' '),
                    coverage,
                    role,
                    limitation,
                  ].map((v, i) => (
                    <td
                      key={i}
                      data-label={
                        ['Dataset / Evidence', 'Status', 'Coverage', 'Role', 'Limitation'][i]
                      }
                    >
                      {i === 1 ? (
                        <span
                          className={`method-badge ${key === 'sourceLedger' ? 'method-unresolved' : ['facilities', 'prospective', 'iot'].includes(key) ? 'method-neutral' : ''}`}
                        >
                          {v}
                        </span>
                      ) : (
                        v
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
      <Section title="Study Evidence Explorer">
        <div className="method-tabs" role="tablist" aria-label="Study evidence sections">
          {tabs.map((name, i) => (
            <button
              key={name}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              id={`method-tab-${i}`}
              role="tab"
              aria-selected={tab === name}
              aria-controls="method-tabpanel"
              tabIndex={tab === name ? 0 : -1}
              onClick={() => setTab(name)}
              onKeyDown={(event) => {
                const next =
                  event.key === 'ArrowRight'
                    ? (i + 1) % tabs.length
                    : event.key === 'ArrowLeft'
                      ? (i + tabs.length - 1) % tabs.length
                      : event.key === 'Home'
                        ? 0
                        : event.key === 'End'
                          ? tabs.length - 1
                          : null;
                if (next !== null) {
                  event.preventDefault();
                  setTab(tabs[next]);
                  tabRefs.current[next]?.focus();
                }
              }}
            >
              {name}
            </button>
          ))}
        </div>
        <div
          id="method-tabpanel"
          role="tabpanel"
          tabIndex={0}
          aria-labelledby={`method-tab-${tabs.indexOf(tab)}`}
        >
          <h3>{tab}</h3>
          {content[tab]}
        </div>
        <h3>What each data type means</h3>
        <div className="method-grid">
          {Object.entries(evidenceDefinitions).map(([name, definition]) => (
            <article className="method-card" key={name}>
              <span className="method-badge">{name}</span>
              <p>{definition}</p>
            </article>
          ))}
        </div>
        <details className="method-developer">
          <summary>Raw package metadata</summary>
          <pre>{JSON.stringify({ coverage: p.coverage, status: p.status }, null, 2)}</pre>
        </details>
      </Section>
      <Section title="Key Scientific Findings">
        <h3>Full annual malaria series</h3>
        {annual}
        <h3>2025 observed spatial snapshot</h3>
        {spatial}
        {benchmark}
        <div className="method-grid">
          {climate}
          {uncertainty}
          {importance}
          <Metric
            name="Random Forest supplementary metrics"
            value={`RMSE ${fmt(rf?.rmse)}`}
            detail={`R² ${fmt(rf?.r2, 3)}; 2024 validation MAE ${fmt(e.validation.find((r) => r.model === 'Random Forest')?.mae)}`}
          />
        </div>
      </Section>
      <Section title="What This Study Supports">
        <div className="method-two">
          <article className="method-card">
            <h3>Supported</h3>
            <ul>
              {supports.map((v) => (
                <li key={v}>{v}</li>
              ))}
            </ul>
          </article>
          <article className="method-card method-context">
            <h3>Not established</h3>
            <ul>
              {unsupported.map((v) => (
                <li key={v}>{v}</li>
              ))}
            </ul>
          </article>
        </div>
      </Section>
      <Section title="Major Limitations">{limitations}</Section>
      <Section title="AMMM Demonstration Path">
        <p>
          Restore bundled research data before following the demonstration path. This explicitly
          changes global analytical filters.
        </p>
        <button
          className="button"
          onClick={() => {
            update({ active: 'study-balanced', researchMode: 'BUILTIN' });
            setYear(2025);
            setDistrict('All districts');
            setModel('Persistence');
          }}
        >
          Use bundled study evidence
        </button>
        <nav className="method-demo" aria-label="AMMM demonstration">
          {[
            ['surveillance', 'Surveillance evidence'],
            ['risk-map', 'GIS observed burden'],
            ['forecasting', 'Model benchmarking'],
            ['forecasting/failure-analysis', 'Forecast failure example'],
            ['risk-intelligence', 'Explainable risk'],
            ['force-health', 'Force-health readiness review'],
          ].map(([path, name], i) => (
            <NavLink key={path} to={'/' + path}>
              <span>{i + 1}</span>
              {name}
            </NavLink>
          ))}
        </nav>
      </Section>
      <Section title="Export Evidence & Provenance">
        <div className="method-actions">
          <button className="button" onClick={() => exportEvidence('json')}>
            Export evidence JSON
          </button>
          <button className="button" onClick={() => exportEvidence('csv')}>
            Export evidence CSV
          </button>
          <button className="button" onClick={() => window.print()}>
            Print-friendly evidence report / Save PDF
          </button>
          <Source />
        </div>
        <p role="status">{exportStatus}</p>
        <p>
          Exports include study metadata, coverage, evidence statuses, model metrics, uncertainty,
          spatial statistic, source issues, limitations, provenance and selected filters. No
          unsupported values are generated.
        </p>
        <details>
          <summary>Scientific glossary</summary>
          <div className="method-grid">
            {Object.entries(definitions).map(([name, definition]) => (
              <article className="method-card" key={name}>
                <h3>{name}</h3>
                <p>{definition}</p>
              </article>
            ))}
          </div>
        </details>
      </Section>
      <footer className="method-footer">
        Application functioning · Research prototype · Not operationally validated
      </footer>
      <div className="method-print-only">
        <h2>Additional evidence for print</h2>
        <h3>Source quality</h3>
        {quality}
        <h3>Climate archive</h3>
        <p>
          NASA POWER annual rainfall, temperature and relative humidity aggregates; preceding-year
          predictors only.
        </p>
        <h3>Provenance</h3>
        {provenance}
        <h3>Analysis date and selected filters</h3>
        <p>
          {e.study.generatedDate} · {year} · {district} · {model} · {state.riskMode} ·{' '}
          {state.active}
        </p>
      </div>
    </div>
  );
}
