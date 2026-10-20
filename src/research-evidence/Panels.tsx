import { useMemo, useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useStore } from '../store';
import { download } from '../analytics';
import {
  climateAssociations,
  diagnostics,
  finite,
  rankBenchmarks,
  referenceDifferences,
  scopeSummary,
} from './engine';
import {
  benchmarkReferences,
  climateMethod,
  modelKeys,
  primaryDocuments,
  reconciliationTasks,
  referenceStatus,
  referenceCitation,
  referenceVersion,
  scopes,
  type Metric,
  type ScopeId,
  type StudyModel,
} from './contract';
import './research-evidence.css';
export const number = (v: number | null | undefined, digits = 2) =>
  v === null || v === undefined
    ? 'Unavailable'
    : v.toLocaleString('en-GB', { maximumFractionDigits: digits });
export function EvidenceSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="evidence-section" aria-label={title}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}
export function ScopePanel({ scope }: { scope: ScopeId }) {
  const { research: p, year, district } = useStore();
  if (!p) return <p role="status">Study package is unavailable.</p>;
  const selected = scopes.find((s) => s.id === scope)!,
    summary = scopeSummary(p, scope, year, district);
  return (
    <EvidenceSection title="Selected analytical cohort">
      <p>
        <strong>{selected.name}</strong> · {selected.level} · {selected.period}
      </p>
      <p>{selected.definition}</p>
      {!selected.available ? (
        <div className="evidence-warning" role="status">
          No compatible observation table is connected for this scope. Counts, denominators and
          model outputs remain unavailable.{' '}
          {scope === 'asean' && (
            <NavLink to="/asean-map">Explore the eleven country boundaries</NavLink>
          )}
        </div>
      ) : (
        <>
          <div className="evidence-metrics">
            <div>
              <strong>{number(summary.cases, 0)}</strong>
              <span>
                {summary.partial ? 'Partial recorded episodes' : 'Recorded episodes'} · {year}
              </span>
            </div>
            <div>
              <strong>
                {summary.available} / {summary.expected}
              </strong>
              <span>District outcomes present · {number(summary.coverage)}%</span>
            </div>
            <div>
              <strong>{summary.records}</strong>
              <span>Records in this cohort · {summary.periods.join(', ')}</span>
            </div>
            <div>
              <strong>
                {summary.denominators} / {summary.expected}
              </strong>
              <span>Selected district-year at-risk denominators</span>
            </div>
          </div>
          <p>
            Outcome coverage = districts with a recorded outcome / expected cohort districts. It is
            not a scientific quality score. Missing denominators are not replaced with
            preceding-year populations.{' '}
            {scope === 'panel'
              ? 'Supiori is outside this balanced cohort.'
              : 'This independent snapshot exists only in 2025.'}
          </p>
          {!summary.selected.length && (
            <p role="status">
              No matching district-year records. A missing observation is not zero.
            </p>
          )}
          <div className="evidence-table-scroll">
            <table>
              <caption>
                Observed district records · {year} · {district}
              </caption>
              <thead>
                <tr>
                  <th>District</th>
                  <th>Episodes</th>
                  <th>Reported observed API / 1,000 at risk</th>
                  <th>At-risk population</th>
                  <th>Inspect</th>
                </tr>
              </thead>
              <tbody>
                {summary.selected.map((r) => (
                  <tr key={r.district}>
                    <th scope="row">{r.district}</th>
                    <td>{number(r.cases, 0)}</td>
                    <td>{number(r.observedApi)}</td>
                    <td>{number(r.population, 0)}</td>
                    <td>
                      <NavLink
                        to={`/asean-map?aArea=papua&aCountries=IDN&aDistrict=${encodeURIComponent(r.district)}&aYear=${r.year}&aIndicator=cases`}
                      >
                        Map {r.district}
                      </NavLink>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <details className="evidence-disclosure">
            <summary>Annual trend and underlying records</summary>
            <div className="evidence-table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Year</th>
                    <th>Recorded episodes</th>
                    <th>Matched districts</th>
                    <th>Annual change</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.annual.map((r, i) => {
                    const previous = summary.annual[i - 1];
                    const change =
                      previous?.cases &&
                      r.cases !== null &&
                      r.year === previous.year + 1 &&
                      r.records === previous.records
                        ? ((r.cases - previous.cases) / previous.cases) * 100
                        : null;
                    return (
                      <tr key={r.year}>
                        <th scope="row">{r.year}</th>
                        <td>{number(r.cases, 0)}</td>
                        <td>{r.records}</td>
                        <td>
                          {number(change)}
                          {change === null ? '' : '%'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
      <p className="evidence-source">
        Source: {selected.source || 'No connected observation source'} · {p.manifest.version} ·
        supplied extraction, not independent verification.
      </p>
      {selected.available && (
        <p className="evidence-source">
          Population/API, where available, come from the separate 2025 snapshot joined by
          district/year and agreement on recorded episodes; climate comes from the annual climate
          artifact. These field joins do not append snapshot outcomes to the balanced panel.
        </p>
      )}
      {summary.selected.some((r) => r.denominatorConflict) && (
        <p role="alert" className="evidence-warning">
          Conflicting same-year episode counts prevent the snapshot API/denominator join. Original
          values remain in their own source tables; no canonical value was inferred.
        </p>
      )}
    </EvidenceSection>
  );
}
export function StudyBenchmarkPanel() {
  const { research: p } = useStore();
  const [source, setSource] = useState<'brief' | 'artifact'>('brief'),
    [split, setSplit] = useState<'validation' | 'test'>('test'),
    [metric, setMetric] = useState<Metric>('mae');
  if (!p) return <p role="status">Loading study benchmarks…</p>;
  const ranked = rankBenchmarks(p, source, split, metric),
    winner = ranked.find((r) => r.rank === 1);
  return (
    <div className="research-evidence-workspace">
      <EvidenceSection title="Temporal benchmark evidence">
        <p>
          {source === 'brief'
            ? referenceStatus
            : 'ORIGINAL SUPPLIED ARTIFACT · not independently audited'}{' '}
          · version {source === 'brief' ? referenceVersion : p.manifest.version}
        </p>
        <div className="evidence-controls">
          <label>
            Benchmark source
            <select
              aria-label="Benchmark source"
              value={source}
              onChange={(e) => setSource(e.target.value as typeof source)}
            >
              <option value="brief">New brief-reported manuscript references</option>
              <option value="artifact">Original checksummed study metrics</option>
            </select>
          </label>
          <label>
            Evaluation split
            <select
              aria-label="Evaluation split"
              value={split}
              onChange={(e) => setSplit(e.target.value as typeof split)}
            >
              <option value="test">2025 held-out test · n=8</option>
              <option value="validation">2024 validation · n=8</option>
            </select>
          </label>
          <label>
            Ranking metric
            <select
              aria-label="Evidence ranking metric"
              value={metric}
              onChange={(e) => setMetric(e.target.value as Metric)}
            >
              <option value="mae">MAE · primary criterion</option>
              <option value="rmse">RMSE · secondary criterion</option>
              <option value="r2">R² · secondary criterion</option>
            </select>
          </label>
        </div>
        <p>
          Training targets: 2021–2023 (24). Validation targets: 2024 (8). Held-out test: 2025 (8).
          Design is brief-reported; results are retrospective, not new training or prospective
          forecasts. These fixed cohort metrics do not change with the global district/year filter.
        </p>
        <p className="evidence-finding" data-testid="benchmark-winner">
          {winner
            ? `${winner.model} ranks first by ${metric.toUpperCase()} among the available values for this source and split.`
            : 'No supplied values for this metric and split; ranking unavailable.'}{' '}
          {metric === 'r2' ? 'Higher R² ranks first.' : 'Lower error ranks first.'}
        </p>
        <div className="evidence-table-scroll">
          <table>
            <caption>
              {split === 'test' ? '2025 test' : '2024 validation'} metrics · eight-district cohort ·{' '}
              {source === 'brief' ? 'brief references' : 'original artifact'}
            </caption>
            <thead>
              <tr>
                <th>Rank</th>
                <th>Model</th>
                <th>MAE (episodes)</th>
                <th>RMSE (episodes)</th>
                <th>R²</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((r) => (
                <tr key={r.model}>
                  <td>{r.rank ?? 'Unavailable'}</td>
                  <th scope="row">
                    {r.model === 'Ridge Regression' ? 'Ridge Regression — climate' : r.model}
                  </th>
                  <td>{number(r.mae, 1)}</td>
                  <td>{number(r.rmse, 1)}</td>
                  <td>{number(r.r2, 3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>Brief-reported interpretation; the primary paper has not been reviewed:</p>
        <ul>
          <li>
            Random forest has the lowest validation MAE among fitted models; Persistence has the
            lowest primary held-out test MAE.
          </li>
          <li>
            Ridge with climate has the lowest test RMSE and highest test R² in the brief references.
            The preferred approach depends on the metric.
          </li>
          <li>
            Eight test outcomes in one year do not establish universal superiority or ASEAN-wide
            external validation.
          </li>
        </ul>
        <button
          className="button"
          onClick={() =>
            download('research-benchmark-evidence.json', {
              source,
              sourceStatus: source === 'brief' ? referenceStatus : p.manifest.verification,
              version: source === 'brief' ? referenceVersion : p.manifest.version,
              split,
              metric,
              sampleSize: 8,
              referenceCitation,
              ranked,
            })
          }
        >
          Export selected benchmark evidence
        </button>
        <details className="evidence-disclosure">
          <summary>Complete brief-reported validation and test table</summary>
          <div className="evidence-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Model</th>
                  <th>Validation MAE</th>
                  <th>Validation RMSE</th>
                  <th>Test MAE</th>
                  <th>Test RMSE</th>
                  <th>Test R²</th>
                </tr>
              </thead>
              <tbody>
                {benchmarkReferences.map((r) => (
                  <tr key={r.model}>
                    <th scope="row">{r.model}</th>
                    <td>{number(r.validation.mae, 1)}</td>
                    <td>{number(r.validation.rmse, 1)}</td>
                    <td>{number(r.test.mae, 1)}</td>
                    <td>{number(r.test.rmse, 1)}</td>
                    <td>{number(r.test.r2, 3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            Missing original-artifact metrics are never backfilled from this table. Random-forest
            validation MAE is 11,060 in the existing artifact versus 11,059.8 in the new brief; that
            discrepancy remains unresolved.
          </p>
        </details>
      </EvidenceSection>
    </div>
  );
}
export function StudyDiagnosticsPanel({ scope }: { scope: ScopeId }) {
  const { research: p, year, district, model } = useStore();
  if (!p) return null;
  const supported = Object.hasOwn(modelKeys, model),
    result = diagnostics(
      p,
      scope,
      year,
      district,
      supported ? (model as StudyModel) : 'Random Forest',
    );
  if (!supported) return <p>Selected model has no supplied study adapter.</p>;
  return (
    <EvidenceSection title="Observed outcomes and prediction diagnostics">
      <p>
        {model} · {year} · {district} · source rounded point outputs, not full-precision published
        metrics. Retrospective hindcast, not an outbreak probability.
      </p>
      <div className="evidence-metrics">
        <div>
          <strong>{number(result.observed, 0)}</strong>
          <span>Observed episodes in {result.matched} matched districts</span>
        </div>
        <div>
          <strong>{number(result.predicted, 1)}</strong>
          <span>Predicted episodes in the same matched districts</span>
        </div>
        <div>
          <strong>{number(result.shortfall, 1)}</strong>
          <span>Observed − predicted · positive means aggregate shortfall</span>
        </div>
        <div>
          <strong>{result.missing}</strong>
          <span>Selected outcomes without predictions · excluded from paired totals</span>
        </div>
      </div>
      {!result.rows.length && (
        <p role="status">
          No matching outcomes or model outputs for this scope and period. Supplied predictions
          target 2025 only.
        </p>
      )}
      {scope === 'snapshot' && (
        <p className="evidence-warning">
          Supiori has no supplied model prediction. Its observed outcome is not silently included in
          a paired prediction total or treated as a zero prediction.
        </p>
      )}
      <div className="evidence-table-scroll">
        <table>
          <caption>
            Signed error = prediction − observed; shares use absolute error in this selected cohort
          </caption>
          <thead>
            <tr>
              <th>District</th>
              <th>Observed</th>
              <th>Predicted</th>
              <th>Signed error</th>
              <th>Absolute error</th>
              <th>Relative error</th>
              <th>Share of selected absolute error</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.map((r) => (
              <tr key={r.district}>
                <th scope="row">{r.district}</th>
                <td>{number(r.cases, 0)}</td>
                <td>{number(r.predicted, 1)}</td>
                <td>
                  {number(r.signed, 1)}
                  {r.signed === null
                    ? ''
                    : r.signed < 0
                      ? ' · underprediction'
                      : r.signed > 0
                        ? ' · overprediction'
                        : ' · exact'}
                </td>
                <td>{number(r.absolute, 1)}</td>
                <td>
                  {number(r.relativeError)}
                  {r.relativeError === null ? '' : '%'}
                </td>
                <td>
                  {number(r.errorShare)}
                  {r.errorShare === null ? '' : '%'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="evidence-finding">
        Brief-reported reference: Jayapura City (Kota Jayapura) had 69,944 observed episodes versus
        RF 29,003.7, a 40,940.3 shortfall and 40.33% of full eight-district RF absolute error.{' '}
        {referenceStatus}.
      </p>
      <details className="evidence-disclosure">
        <summary>Observed API versus predicted relative intensity</summary>
        <p>
          Observed API uses source-defined 2025 at-risk residents. Supplied RF intensity uses
          preceding-year population (2024 per the brief), not the observed API denominator. Saved
          research categories and cutpoints are not clinical or operational thresholds; original
          method review remains required. There is no calibrated epidemic-warning probability or
          district prediction interval.
        </p>
        <div className="evidence-table-scroll">
          <table>
            <thead>
              <tr>
                <th>District</th>
                <th>Observed API / 1,000 at risk</th>
                <th>2025 at-risk population</th>
                <th>RF intensity / 1,000 preceding-year residents</th>
                <th>Preceding-year population</th>
                <th>Supplied research category</th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((r) => (
                <tr key={r.district}>
                  <th scope="row">{r.district}</th>
                  <td>{number(r.observedApi)}</td>
                  <td>{number(r.population, 0)}</td>
                  <td>{number(r.projectedIntensity)}</td>
                  <td>{number(r.priorPopulation, 0)}</td>
                  <td>{r.suppliedCategory ?? 'Unavailable'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <button
        className="button"
        onClick={() =>
          download('selected-prediction-diagnostics.json', {
            scope,
            year,
            district,
            model,
            version: p.manifest.version,
            method: 'Paired outcomes and rounded saved point predictions only',
            result,
          })
        }
      >
        Export selected diagnostics
      </button>
    </EvidenceSection>
  );
}
export function StudyClimatePanel() {
  const { research: p, year, district } = useStore();
  const [period, setPeriod] = useState<'panel' | 'year'>('panel');
  const results = useMemo(
    () => (p ? climateAssociations(p, district, period === 'year' ? year : null) : []),
    [p, district, period, year],
  );
  if (!p) return <p role="status">Loading annual climate evidence…</p>;
  return (
    <div className="research-evidence-workspace">
      <EvidenceSection title="Annual climate research evidence">
        <label>
          Climate analytical period
          <select
            aria-label="Climate analytical period"
            value={period}
            onChange={(e) => setPeriod(e.target.value as typeof period)}
          >
            <option value="panel">Complete 2020–2025 panel</option>
            <option value="year">Selected shared year only</option>
          </select>
        </label>
        <p>
          Recomputed Spearman uses paired annual climate/outcome records from the balanced
          eight-district cohort and average ranks for ties. District: {district}. Period:{' '}
          {period === 'year' ? year : '2020–2025'}. Missing values are excluded; fewer than three
          pairs or no variation makes correlation unavailable.
        </p>
        <div className="evidence-table-scroll">
          <table>
            <thead>
              <tr>
                <th>Annual variable</th>
                <th>Calculated Spearman ρ</th>
                <th>Matched n</th>
                <th>Brief-reported ρ</th>
                <th>Brief-reported interval</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.variable}>
                  <th scope="row">
                    {r.variable} ({r.reference.unit})
                  </th>
                  <td>{number(r.rho, 3)}</td>
                  <td>{r.n}</td>
                  <td>{number(r.reference.rho, 3)}</td>
                  <td>
                    {r.reference.interval
                      ? r.reference.interval.join(' to ') + ' · district-block bootstrap'
                      : 'Not supplied'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="evidence-warning">
          Brief references describe the original ecological study, not the current subset. Primary
          sample definitions and raw extraction are unreviewed; calculated values are not
          substituted for reported references. The reported rainfall interval is not a new
          calculation or a prediction interval. Associations do not establish causality.
        </p>
        <details className="evidence-disclosure">
          <summary>NASA POWER preprocessing and missing raw inputs</summary>
          <dl>
            <dt>Source</dt>
            <dd>{climateMethod.provider}</dd>
            <dt>Raw versus connected period</dt>
            <dd>
              {climateMethod.rawPeriod}; connected: {climateMethod.connectedPeriod}
            </dd>
            <dt>Rainfall method described by the brief</dt>
            <dd>{climateMethod.precipitation}</dd>
            <dt>Temperature / humidity method</dt>
            <dd>{climateMethod.temperatureHumidity}</dd>
          </dl>
          <p>
            {climateMethod.limitation} No monthly malaria outcome is generated, and no conversion of
            unknown source units is attempted.
          </p>
        </details>
        <button
          className="button"
          onClick={() =>
            download('annual-climate-evidence.json', {
              district,
              selectedYear: period === 'year' ? year : null,
              cohort: 'balanced eight-district panel',
              version: p.manifest.version,
              referenceVersion,
              referenceStatus,
              referenceCitation,
              method: 'Spearman with average-rank ties; complete annual pairs only',
              results,
              climateMethod,
            })
          }
        >
          Export climate evidence
        </button>
      </EvidenceSection>
    </div>
  );
}
export function StudyProvenancePanel() {
  const { research: p } = useStore();
  if (!p) return null;
  const differences = referenceDifferences(p);
  return (
    <EvidenceSection title="Research source contract and reconciliation">
      <p>
        Full paper is the intended primary authority; abstract and presentation are supporting
        materials. No source has been silently promoted or reconciled. Original checksummed
        artifacts remain unchanged.
      </p>
      <ul>
        {primaryDocuments.map((name) => (
          <li key={name}>{name} — not supplied / not reviewed</li>
        ))}
      </ul>
      <div className="evidence-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Open issue</th>
              <th>Evidence / impact</th>
              <th>Required resolution</th>
            </tr>
          </thead>
          <tbody>
            {reconciliationTasks.map((r) => (
              <tr key={r.id}>
                <th scope="row">{r.id}</th>
                <td>
                  {r.issue} {r.impact}
                </td>
                <td>{r.required}</td>
              </tr>
            ))}
            {p.ledger.map((r) => (
              <tr key={r.id}>
                <th scope="row">{r.id}</th>
                <td>
                  {r.description} {r.impact}
                </td>
                <td>{r.resolution}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3>Original artifact versus new brief</h3>
      <div className="evidence-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Model / split / metric</th>
              <th>Original value retained</th>
              <th>New reference</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {differences.map((r) => (
              <tr key={r.model + r.split + r.metric}>
                <th scope="row">
                  {r.model} / {r.split} / {r.metric}
                </th>
                <td>{r.original}</td>
                <td>{r.reference}</td>
                <td>{r.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        Comparison allows 0.051 episodes for displayed one-decimal rounding (0.0005 for R²); this
        tolerance does not resolve source provenance. Missing original metrics stay missing.
      </p>
      <details className="evidence-disclosure">
        <summary>Dataset and indicator registry</summary>
        <p>
          Case episodes: annual source-reported outcomes. Observed API: episodes per 1,000
          source-defined at-risk residents. Climate: annual centroid aggregates. Prediction: saved
          2025 hindcast. Intensity: predicted episodes / preceding-year population, not observed
          API. All retain district/year, scope, version, source and evidence class; missing
          denominators remain unavailable.
        </p>
        <div className="evidence-table-scroll">
          <table>
            <thead>
              <tr>
                <th>Artifact / source</th>
                <th>Reference period / records</th>
                <th>Version / license / validation</th>
              </tr>
            </thead>
            <tbody>
              {p.manifest.files.map((f: any) => (
                <tr key={f.name}>
                  <th scope="row">
                    <a href={'/data/verified/' + f.name}>{f.name}</a>
                  </th>
                  <td>
                    {f.period || 'Not supplied'} · {finite(f.records) ?? 'Not specified'} records
                  </td>
                  <td>
                    {f.version || p.manifest.version} · {f.license || 'License not specified'} ·{' '}
                    {f.classification || 'Supplied extraction'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          Original publication/retrieval dates and denominator definitions are not invented when
          metadata is absent. The manifest’s extraction/verification labels do not establish
          independent auditing.
        </p>
      </details>
      <NavLink to="/research-operations">Open the existing source-review workflow</NavLink>
      {' · '}
      <NavLink to="/provenance">Source provenance</NavLink>
    </EvidenceSection>
  );
}
export function StudyScopeLinks() {
  const { research: p, state, year, district } = useStore();
  if (!p || state.researchMode !== 'BUILTIN') return null;
  return (
    <div className="research-evidence-workspace evidence-dashboard-link">
      <strong>Research scopes remain separate</strong>
      <div>
        {(['panel', 'snapshot'] as const).map((scope) => {
          const summary = scopeSummary(p, scope, year, district);
          return (
            <NavLink
              key={scope}
              to={`/research-intelligence?researchScope=${scope}&year=${year}&district=${encodeURIComponent(district)}`}
            >
              {scope === 'panel' ? 'Eight-district panel' : 'Nine-unit snapshot'} · {year} ·{' '}
              {number(summary.cases, 0)} episodes
            </NavLink>
          );
        })}
      </div>
      <p>Inspect the underlying cohort, denominator, benchmark evidence and unresolved sources.</p>
    </div>
  );
}
