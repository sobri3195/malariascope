import { lazy, Suspense, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useStore } from './store';
import { builtin } from './research-data/research';
import {
  loadedCoverage,
  friendlyEvidenceNames,
  evidenceCsv,
  methodologyLimitations,
} from './methodology-evidence';
import './methodology.css';
import './coverage-summary.css';
const AdvancedResearchDetails = lazy(() => import('./AdvancedResearchDetails'));
const SyntheticDemoExplorer = lazy(() => import('./SyntheticDemoExplorer'));
const number = (n: number | null, digits = 0) =>
  n === null
    ? 'Not available'
    : n.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits });
function save(name: string, value: string, type: string) {
  const url = URL.createObjectURL(new Blob([value], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function MethodologyEvidence() {
  const { research: p, researchError, state, year, district, model, riskMode } = useStore();
  const [query, setQuery] = useState(''),
    [kind, setKind] = useState('All evidence'),
    [status, setStatus] = useState('All statuses'),
    [scope, setScope] = useState('Global context'),
    [advanced, setAdvanced] = useState(false),
    [demo, setDemo] = useState(false),
    [notice, setNotice] = useState('');
  if (!p)
    return (
      <div className="methodology method-dashboard">
        <h1>Methodology &amp; Evidence</h1>
        <div role={researchError ? 'alert' : 'status'} className="method-callout">
          {researchError || 'Loading and checking research datasets…'}
        </div>
        <p>Figures and visualizations remain unavailable until source integrity checks complete.</p>
        {!researchError && <div className="coverage-loading" aria-hidden="true" />}
      </div>
    );
  const active = state.datasets.find((d) => d.id === state.active),
    rows = active?.rows || [],
    c = loadedCoverage(rows, year, district);
  const studyRows = [
    ...p.balanced,
    ...p.spatial.filter(
      (r) => !p.balanced.some((b) => b.district === r.district && b.year === r.year),
    ),
  ];
  const expected = p.registry.districts.length * new Set(p.balanced.map((r) => r.year)).size;
  const packageCompleteness = (studyRows.length / expected) * 100;
  const metadataRows = p.manifest.files
    .filter((f: any) => friendlyEvidenceNames[f.name])
    .map((f: any) => {
      const data: Record<string, any[]> = {
        'surveillance-balanced-2020-2025.csv': p.balanced,
        'surveillance-2025-all-nine.csv': p.spatial,
        'climate-annual-2020-2025.csv': p.climate,
        'model-predictions-2025.csv': p.predictions.map((r) => ({ ...r, year: 2025 })),
        'model-errors-2025.csv': p.errors.map((r) => ({ ...r, year: 2025 })),
        'forecast-risk-2025.csv': p.intensity.map((r) => ({ ...r, year: 2025 })),
        'model-performance.json': p.performance,
      };
      const entries = data[f.name],
        isClimate = f.name.includes('climate'),
        isModel = /model|forecast|uncertainty/.test(f.name),
        isQuality = f.name.includes('ledger');
      const category = isClimate
        ? 'Climate'
        : isQuality
          ? 'Data quality'
          : isModel
            ? 'Forecasting'
            : f.name.includes('spatial-analysis')
              ? 'Spatial'
              : 'Surveillance';
      const match = entries?.filter(
        (r) =>
          (scope !== 'Global context' || r.year === year) &&
          (scope !== 'Global context' ||
            district === 'All districts' ||
            !r.district ||
            r.district === district),
      );
      const years = entries ? [...new Set(entries.map((r) => r.year))].sort() : null;
      return {
        name: friendlyEvidenceNames[f.name],
        category,
        source: f.source.replace(
          'User-supplied MALARIASCOPE study extraction, October 2026; underlying source reports not independently audited',
          'Supplied study extraction; underlying reports not independently audited',
        ),
        period: years ? years.join(', ') : 'Study summary',
        records: match ? match.length : null,
        status: f.classification.replaceAll('_', ' '),
        file: f.name,
        checksum: f.sha256,
        eligible: !match || match.length > 0,
      };
    });
  if (active && !builtin(active.id) && active.classification !== 'SYNTHETIC')
    metadataRows.push({
      name: active.name,
      category: 'User import',
      source: active.source,
      period: c.years.join(', '),
      records: scope === 'Global context' ? c.selected.length : rows.length,
      status: 'USER IMPORT — NOT INDEPENDENTLY VERIFIED',
      file: '',
      checksum: active.checksum,
      eligible: scope !== 'Global context' || c.selected.length > 0,
    });
  const evidence = metadataRows.filter(
    (r: any) =>
      r.eligible &&
      (kind === 'All evidence' || r.category === kind) &&
      (status === 'All statuses' || r.status === status) &&
      `${r.name} ${r.source} ${r.period} ${r.status}`.toLowerCase().includes(query.toLowerCase()),
  );
  const filteredExport = {
    classification: 'Loaded evidence catalog; synthetic demo excluded',
    analysisDate: new Date().toISOString(),
    filters: {
      year,
      district,
      model,
      riskMode,
      dataset: state.active,
      search: query,
      category: kind,
      status,
      scope,
    },
    evidence,
  };
  const exportTable = (format: 'json' | 'csv') => {
    save(
      `evidence-catalog.${format}`,
      format === 'json' ? JSON.stringify(filteredExport, null, 2) : evidenceCsv(filteredExport),
      format === 'json' ? 'application/json' : 'text/csv;charset=utf-8',
    );
    setNotice(`${evidence.length} matching evidence sources exported as ${format.toUpperCase()}.`);
  };
  return (
    <div className="methodology method-dashboard">
      <header className="method-header">
        <p className="method-eyebrow">Epidemiological research workspace</p>
        <h1>Methodology &amp; Evidence</h1>
        <p>
          Retrospective ecological geospatial forecasting study · supplied study extraction, not an
          independent audit of underlying reports.
        </p>
      </header>
      <aside className="method-callout">
        <strong>Research prototype · Retrospective hindcast, not prospective early warning.</strong>
        <p>
          Missing data remain missing. Prospective, clinical and operational utility have not been
          established.
        </p>
      </aside>
      <section className="method-section">
        <h2>Data Coverage &amp; Research Summary</h2>
        <p className="coverage-context">
          {active?.name || 'No dataset selected'} · {year} · {district} · {model} · {riskMode}
        </p>
        <p>
          <span className="method-badge">
            {active
              ? builtin(active.id)
                ? 'VERIFIED RESEARCH EXTRACTION'
                : state.researchMode === 'DEMO'
                  ? 'SYNTHETIC — NOT OBSERVED DATA'
                  : 'USER IMPORT — NOT INDEPENDENTLY VERIFIED'
              : 'NO DATA'}
          </span>
        </p>
        <div className="coverage-metrics">
          {[
            [
              'District coverage',
              `${new Set(c.selected.map((r) => r.district)).size}`,
              `Districts with records in ${year}`,
            ],
            [
              'Source period',
              c.years.length
                ? c.years.length === 1
                  ? String(c.years[0])
                  : `${c.years[0]}–${c.years.at(-1)}`
                : 'Not available',
              'Period present in the selected source',
            ],
            [
              'Available observations',
              number(c.selected.length),
              `${number(rows.length)} records in the loaded source`,
            ],
            [
              'Reported cases',
              number(c.cases),
              'Sum of available nonnegative case values in the selected context',
            ],
            [
              'Case-field completeness',
              c.completeness === null ? 'Not available' : `${number(c.completeness, 1)}%`,
              'Valid case values / selected records; not overall study completeness',
            ],
            [
              'Validation status',
              active
                ? builtin(active.id)
                  ? 'Integrity checked'
                  : 'Not independently verified'
                : 'No active source',
              builtin(active?.id || '')
                ? 'Package checksums passed; source reports not independently audited'
                : 'Locally imported values are not verified research results',
            ],
          ].map(([name, value, detail]) => (
            <article className="method-card" key={name}>
              <h3>{name}</h3>
              <strong className="method-value">{value}</strong>
              <p>{detail}</p>
            </article>
          ))}
        </div>
        {!c.selected.length && (
          <p role="status" className="method-callout">
            No records match {district} in {year}. No cases, incidence or quality percentage is
            imputed.
          </p>
        )}
        <p>
          Archive accounting:{' '}
          <strong>
            {studyRows.length} / {expected} unique district-years ({number(packageCompleteness, 1)}
            %) are actually bundled
          </strong>
          . The study reports 53 / 54; four Supiori 2020–2023 values were not supplied, and Supiori
          2024 is missing. 48 complete balanced observations + Supiori 2025 = 49 bundled outcomes.
          Missing ≠ zero.
        </p>
        <NavLink to="/provenance">Trace source provenance →</NavLink>
      </section>
      <section className="method-section">
        <h2>Data Availability Timeline</h2>
        <p>
          Study archive context. Solid entries are analytical periods; outlined entries are
          contextual evidence only.
        </p>
        <ol className="method-timeline">
          {[
            ['2010–2019', 'Historical context only', true],
            ['2020', 'Balanced panel begins', false],
            ['2021–2023', 'Training targets', false],
            ['2024', 'Validation; Supiori outcome missing', false],
            ['2025', 'Temporal test; nine-district observed snapshot', false],
            ['2026', 'Partial context; no annual test outcome', true],
          ].map(([period, label, context]) => (
            <li className={context ? 'method-context' : ''} key={String(period)}>
              <strong>{period}</strong>
              <span>{label}</span>
              <small>{context ? 'CONTEXT ONLY' : 'ANALYTICAL DATA'}</small>
            </li>
          ))}
        </ol>
        <p>
          Preceding-year predictors were used. 2025 climate observations were not used to predict
          2025 malaria outcomes.
        </p>
      </section>
      <section className="method-section">
        <h2>District Data Coverage</h2>
        <p>
          Selected source archive across its {c.years.length} available years; the global district
          filter applies. A filled bar counts unique district-years. The current year ({year}) is
          labeled separately.
        </p>
        {!c.districtCoverage.length ? (
          <p role="status">No district coverage data are available for these filters.</p>
        ) : (
          <div className="coverage-bars">
            {c.districtCoverage.map((r) => (
              <div key={r.name} className="coverage-bar">
                <span>{r.name}</span>
                <meter
                  min={0}
                  max={Math.max(1, r.expected)}
                  value={r.available}
                  aria-label={`${r.name}: ${r.available} of ${r.expected} source years`}
                />
                <span>
                  {r.available} / {r.expected} years · {r.selected ? 'Available' : 'No record'} in{' '}
                  {year}
                </span>
              </div>
            ))}
          </div>
        )}
        <NavLink to="/provenance">View coverage source →</NavLink>
      </section>
      <section className="method-section">
        <h2>Dataset Quality Indicators</h2>
        <div className="coverage-metrics">
          <article className="method-card">
            <h3>Supplied research outcomes</h3>
            <progress
              max={expected}
              value={studyRows.length}
              aria-label={`${studyRows.length} of ${expected} research outcomes bundled`}
            />
            <p>
              {studyRows.length} / {expected} bundled; missing and unsupplied values are included in
              the denominator.
            </p>
          </article>
          <article className="method-card">
            <h3>Source issues</h3>
            <strong className="method-value">{p.ledger.length} unresolved</strong>
            <p>
              Includes repeated Biak Numfor totals and conflicting 2024/2025 reports. Source issues
              are retained, not concealed.
            </p>
          </article>
          <article className="method-card">
            <h3>Selected-context duplicate district-years</h3>
            <strong className="method-value">
              {c.selected.length ? c.duplicates : 'Not available'}
            </strong>
            <p>
              {c.duplicates
                ? 'Review required: duplicates must be reconciled before aggregation.'
                : 'Distinct district/year keys checked in the selected context.'}
            </p>
          </article>
        </div>
        <p>
          No combined “quality score” is claimed. These indicators describe separate checks and do
          not establish scientific or operational validation.
        </p>
        <NavLink to="/data-quality">Open Scientific Integrity Center →</NavLink>
      </section>
      <section className="method-section">
        <h2>Study Evidence Explorer</h2>
        <p>
          Evidence sources matched to the global year/district where row-level data support
          filtering. Study-wide summaries are explicitly labeled; synthetic demo records are
          excluded.
        </p>
        <div className="coverage-filters">
          <label>
            Search evidence sources
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Dataset, source or verification status…"
            />
          </label>
          <label>
            Evidence category
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              {[
                'All evidence',
                'Surveillance',
                'Climate',
                'Forecasting',
                'Spatial',
                'Data quality',
                'User import',
              ].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label>
            Verification status
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option>All statuses</option>
              {[...new Set<string>(metadataRows.map((r: any) => String(r.status)))].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label>
            Evidence period scope
            <select value={scope} onChange={(e) => setScope(e.target.value)}>
              <option>Global context</option>
              <option>Full source archive</option>
            </select>
          </label>
        </div>
        <div className="method-actions">
          <button className="button" onClick={() => exportTable('csv')}>
            Export filtered evidence CSV
          </button>
          <button className="button" onClick={() => exportTable('json')}>
            Export filtered evidence JSON
          </button>
          <button className="button" onClick={() => window.print()}>
            Print summary / Save PDF
          </button>
          <button
            className="button"
            onClick={() => {
              setQuery('');
              setKind('All evidence');
              setStatus('All statuses');
              setScope('Global context');
            }}
          >
            Reset evidence filters
          </button>
        </div>
        <p role="status">{notice || `${evidence.length} matching evidence sources`}</p>
        {!evidence.length ? (
          <p className="method-callout">
            No evidence sources match these filters. Reset filters to review available sources.
          </p>
        ) : (
          <div className="method-table-wrap">
            <table className="coverage-explorer">
              <caption>
                Loaded evidence catalog · {scope} · {year} · {district}
              </caption>
              <thead>
                <tr>
                  {[
                    'Dataset',
                    'Source',
                    'Period',
                    'Available records',
                    'Verification status',
                    'Traceability',
                  ].map((h) => (
                    <th scope="col" key={h}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {evidence.map((r: any) => (
                  <tr key={r.name}>
                    <th scope="row">
                      {r.name}
                      <small>{r.category}</small>
                    </th>
                    <td>{r.source}</td>
                    <td>{r.period}</td>
                    <td>{r.records === null ? 'Study summary' : number(r.records)}</td>
                    <td>
                      <span className="method-badge">{r.status}</span>
                    </td>
                    <td>
                      <NavLink to="/provenance">View provenance</NavLink>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="method-section">
        <h2>Research Findings &amp; Limitations</h2>
        <div className="method-two">
          <article className="method-card">
            <h3>What the study supports</h3>
            <p>
              Retrospective district burden analysis, temporal benchmarking, forecast-error
              inspection and observed 2025 API mapping.
            </p>
            <p>
              Persistence had the lowest primary 2025 MAE. The ridge climate features did not
              improve the primary MAE. Global clustering was not established (Moran permutation p ={' '}
              {p.spatialResult.pValue}).
            </p>
          </article>
          <article className="method-card">
            <h3>What remains unestablished</h3>
            <ul>
              {methodologyLimitations.map(([title, detail]) => (
                <li key={title}>
                  <strong>{title}:</strong> {detail}
                </li>
              ))}
            </ul>
          </article>
        </div>
        <p>
          Forecasting: eight complete longitudinal districts. Spatial assessment: nine districts
          including Supiori in 2025. The supplied package contains no prospective outcomes or sensor
          evidence.
        </p>
      </section>
      <details
        className="method-section coverage-advanced"
        onToggle={(e) => setAdvanced(e.currentTarget.open)}
      >
        <summary>Advanced Technical Details</summary>
        <p>
          Research metadata, model splits, preprocessing decisions, full provenance, checksums and
          source-quality treatments. These describe the supplied study archive, independently of the
          active imported source.
        </p>
        {advanced && (
          <Suspense fallback={<p role="status">Loading technical research details…</p>}>
            <AdvancedResearchDetails />
          </Suspense>
        )}
      </details>
      <details
        className="method-section coverage-demo-disclosure"
        onToggle={(e) => setDemo(e.currentTarget.open)}
      >
        <summary>Synthetic Demo — 100,000 Records</summary>
        {demo && (
          <Suspense fallback={<p role="status">Loading synthetic demo controls…</p>}>
            <SyntheticDemoExplorer />
          </Suspense>
        )}
      </details>
      <footer className="method-footer">
        Application functioning · Research prototype · Not operationally validated
      </footer>
    </div>
  );
}
