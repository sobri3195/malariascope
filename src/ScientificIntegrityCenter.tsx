import { EvidenceCoverage, SourceLedger } from './research-data/EvidencePanels';
import DataReadiness from './DataReadiness';
import { useMemo, useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useStore } from './store';
import { download } from './analytics';
import {
  inspectScientificIntegrity,
  integrityFields,
  severities,
  type IntegrityReport,
} from './scientific-integrity';
import './scientific-integrity.css';
const tabs = [
  'Dataset Health',
  'Issue Register',
  'Analysis Eligibility',
  'Score Inspector',
] as const;
const fmt = (value: number | null) =>
  value === null ? 'Unavailable' : value.toLocaleString('en-GB', { maximumFractionDigits: 2 });
function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="panel integrity-panel">
      <div className="panel-head">
        <h2>{title}</h2>
      </div>
      <div className="integrity-panel-body">{children}</div>
    </section>
  );
}
function ScoreInspector({ report }: { report: IntegrityReport }) {
  return (
    <Panel title="Transparent Data Quality Score">
      <p>{report.scoreFormula}</p>
      <div className="integrity-formula" aria-label="Quality score calculation">
        {report.scoreComponents
          .map((c) => `${c.weight} × (${c.numerator} / ${c.denominator || 'unavailable'})`)
          .join(' + ')}{' '}
        = {fmt(report.score)} / 100
      </div>
      <div className="table-scroll">
        <table aria-label="Quality score components">
          <thead>
            <tr>
              <th>Component</th>
              <th>Numerator</th>
              <th>Denominator</th>
              <th>Percent</th>
              <th>Fixed weight</th>
              <th>Score contribution</th>
              <th>Definition</th>
            </tr>
          </thead>
          <tbody>
            {report.scoreComponents.map((c) => (
              <tr key={c.name}>
                <td>{c.name}</td>
                <td>{c.numerator}</td>
                <td>{c.denominator || 'Unavailable'}</td>
                <td>
                  {fmt(c.percent)}
                  {c.percent !== null ? '%' : ''}
                </td>
                <td>{c.weight}%</td>
                <td>{fmt(c.contribution)}</td>
                <td>{c.definition}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        The score includes all {report.rowCount} audited source rows. Filters never change
        denominators. Missing or invalid cells remain visible; a present but invalid value earns
        presence only, and loses record-validity credit. The fixed broad-research field set includes
        climate and model outputs even when those optional fields are not needed for a particular
        analysis.
      </p>
      <p>
        Fixed fields: {integrityFields.join(', ')}. Unknown GIS coverage receives no credit;
        remaining weights are never inflated. Temporal completeness covers only the loaded
        earliest–latest annual panel, not years outside that range. Reference district coverage
        describes the loaded GIS extent, not all of Papua.
      </p>
      <h3>Field completeness</h3>
      <div className="integrity-fields">
        {report.fieldCounts.map((f) => (
          <div key={f.field}>
            <div>
              <strong>{f.field}</strong>
              <span>
                {f.present} / {f.total} ·{' '}
                {f.total ? fmt((f.present / f.total) * 100) + '%' : 'Unavailable'}
              </span>
            </div>
            <progress
              aria-label={`${f.field} completeness`}
              max={Math.max(1, f.total)}
              value={f.present}
            />
          </div>
        ))}
      </div>
      <p>
        Staleness and abrupt-change review signals remain visible outside the numeric score. A
        quality score is a reproducible diagnostic, not a certificate of scientific accuracy or
        independent verification.
      </p>
    </Panel>
  );
}
export default function ScientificIntegrityCenter() {
  const { state, year, setYear, model, setModel } = useStore();
  const [chosen, setChosen] = useState<string | null>(null),
    [tab, setTab] = useState<(typeof tabs)[number]>('Dataset Health'),
    [severity, setSeverity] = useState('ALL'),
    [search, setSearch] = useState(''),
    [inspectionTime, setInspectionTime] = useState(() => new Date().toISOString());
  const reports = useMemo(
    () =>
      inspectScientificIntegrity(state.datasets, state.geometry, {
        year,
        model,
        now: inspectionTime,
      }),
    [state.datasets, state.geometry, year, model, inspectionTime],
  );
  const selected = reports.find((r) => r.dataset.id === (chosen ?? state.active)) || reports[0];
  const allIssues = reports.flatMap((r) => r.issues);
  const visibleIssues =
    selected?.issues.filter(
      (issue) =>
        (severity === 'ALL' || issue.severity === severity) &&
        [issue.issue, issue.field, issue.action, String(issue.row ?? 'Dataset')]
          .join(' ')
          .toLowerCase()
          .includes(search.toLowerCase()),
    ) || [];
  const years = [...new Set([year, ...reports.flatMap((report) => report.years)])].sort(
    (a, b) => a - b,
  );
  const metricCards = selected
    ? [
        [
          'Dataset Health',
          selected.status,
          `${selected.rowCount} audited source rows · ${selected.issues.length} issues`,
        ],
        [
          'Data Quality Score',
          selected.score === null ? 'Unavailable' : fmt(selected.score) + ' / 100',
          'Fixed weights; unavailable components receive no credit',
        ],
        [
          'GIS Match Rate',
          fmt(selected.scoreComponents[4].percent) +
            (selected.scoreComponents[4].percent !== null ? '%' : ''),
          `${selected.gisMatched} matched / ${selected.districtCount} dataset districts`,
        ],
        [
          'Temporal Completeness',
          fmt(selected.scoreComponents[3].percent) +
            (selected.scoreComponents[3].percent !== null ? '%' : ''),
          `${selected.period.present} / ${selected.period.expected} loaded-panel district-years`,
        ],
        [
          'District Coverage',
          fmt(selected.scoreComponents[5].percent) +
            (selected.scoreComponents[5].percent !== null ? '%' : ''),
          `${selected.gisMatched} / ${selected.gisTotal} GIS reference districts`,
        ],
        [
          'Field Completeness',
          fmt(selected.scoreComponents[0].percent) +
            (selected.scoreComponents[0].percent !== null ? '%' : ''),
          'All source rows × fixed nine-field denominator',
        ],
        [
          'Validation Status',
          selected.status,
          'Schema checks do not establish scientific verification',
        ],
      ]
    : [];
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">DATA QUALITY · SCIENTIFIC INTEGRITY</div>
          <h1>Scientific Integrity Center</h1>
          <p>
            Inspect original evidence, expose limitations, and check analysis-specific
            prerequisites.
          </p>
        </div>
        <button
          className="button"
          onClick={() =>
            download('scientific-integrity-report.json', {
              created: new Date().toISOString(),
              inspectedAt: inspectionTime,
              analysisYear: year,
              selectedModel: model,
              geometrySource: state.geometrySource ?? null,
              reports,
              issueCounts: Object.fromEntries(
                severities.map((s) => [s, allIssues.filter((i) => i.severity === s).length]),
              ),
              scope: 'All loaded datasets; no rows removed or imputed',
            })
          }
        >
          Export integrity report
        </button>
      </div>
      <div className="integrity-controls">
        <label>
          Dataset detail
          <select
            aria-label="Integrity dataset"
            value={selected?.dataset.id || ''}
            onChange={(e) => setChosen(e.target.value)}
          >
            {!reports.length && <option value="">No datasets loaded</option>}
            {reports.map((r) => (
              <option key={r.dataset.id} value={r.dataset.id}>
                {r.dataset.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Analysis year
          <select aria-label="Global year" value={year} onChange={(e) => setYear(+e.target.value)}>
            {years.map((y) => (
              <option key={y}>{y}</option>
            ))}
          </select>
        </label>
        <label>
          Forecast model
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
        <button className="button" onClick={() => setInspectionTime(new Date().toISOString())}>
          Refresh inspection
        </button>
      </div>
      <div className="notice">
        All {reports.length} loaded datasets are inspected automatically. Dataset selection and
        issue filters change the view only. Eligibility follows analysis year/model; quality scores
        cover the full source dataset. No rows are corrected, dropped, or imputed.
      </div>
      <DataReadiness />
      <EvidenceCoverage />
      <SourceLedger />
      <div className="integrity-severity-counts" aria-label="Integrity issue totals">
        {severities.map((s) => (
          <div key={s}>
            <span className={`integrity-severity integrity-${s.toLowerCase()}`}>{s}</span>
            <strong>{allIssues.filter((i) => i.severity === s).length}</strong>
          </div>
        ))}
      </div>
      {!selected ? (
        <Panel title="No loaded evidence">
          <p>
            No dataset quality score or eligibility can be established without observations.
            Supplied study aggregates are not raw district datasets.
          </p>
          <NavLink className="text-link" to="/data-center">
            Connect research evidence →
          </NavLink>
        </Panel>
      ) : (
        <>
          <div className="integrity-metrics">
            {metricCards.map(([label, value, hint]) => (
              <section key={label}>
                <div className="eyebrow">{label}</div>
                <strong>{value}</strong>
                <p>{hint}</p>
              </section>
            ))}
          </div>
          <div
            className="tabs integrity-tabs"
            role="tablist"
            aria-label="Scientific integrity views"
          >
            {tabs.map((name, i) => (
              <button
                key={name}
                role="tab"
                id={`integrity-tab-${i}`}
                aria-controls={`integrity-panel-${i}`}
                aria-selected={tab === name}
                tabIndex={tab === name ? 0 : -1}
                className={tab === name ? 'active' : ''}
                onClick={() => setTab(name)}
                onKeyDown={(e) => {
                  let index = i;
                  if (e.key === 'ArrowRight') index = (i + 1) % tabs.length;
                  else if (e.key === 'ArrowLeft') index = (i + tabs.length - 1) % tabs.length;
                  else if (e.key === 'Home') index = 0;
                  else if (e.key === 'End') index = tabs.length - 1;
                  else return;
                  e.preventDefault();
                  setTab(tabs[index]);
                  document.getElementById(`integrity-tab-${index}`)?.focus();
                }}
              >
                {name}
              </button>
            ))}
          </div>
          <div
            role="tabpanel"
            id={`integrity-panel-${tabs.indexOf(tab)}`}
            aria-labelledby={`integrity-tab-${tabs.indexOf(tab)}`}
          >
            {tab === 'Dataset Health' ? (
              <>
                <Panel title="Loaded dataset health">
                  <div className="table-scroll">
                    <table aria-label="Dataset health registry">
                      <thead>
                        <tr>
                          <th>Dataset</th>
                          <th>Source rows</th>
                          <th>Quality score</th>
                          <th>Validation</th>
                          <th>Blocking / errors / warnings / info</th>
                          <th>Details</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reports.map((r) => (
                          <tr key={r.dataset.id}>
                            <td>{r.dataset.name}</td>
                            <td>{r.rowCount}</td>
                            <td>{fmt(r.score)}</td>
                            <td>{r.status}</td>
                            <td>
                              {['BLOCKING', 'ERROR', 'WARNING', 'INFO']
                                .map((s) => r.issues.filter((i) => i.severity === s).length)
                                .join(' / ')}
                            </td>
                            <td>
                              <button className="text-link" onClick={() => setChosen(r.dataset.id)}>
                                Inspect dataset
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Panel>
                <Panel title="Dataset provenance and inspection limits">
                  <dl className="integrity-summary">
                    <dt>Dataset / source</dt>
                    <dd>
                      {selected.dataset.name} · {selected.dataset.source}
                    </dd>
                    <dt>Original-row basis</dt>
                    <dd>{selected.sourceBasis}</dd>
                    <dt>Audited / loaded row count</dt>
                    <dd>
                      {selected.rowCount} / {selected.loadedRowCount}
                    </dd>
                    <dt>Source classification</dt>
                    <dd>
                      {selected.dataset.classification} · registry metadata, not an independent
                      audit
                    </dd>
                    <dt>Checksum</dt>
                    <dd>{selected.dataset.checksum}</dd>
                    <dt>Loaded period</dt>
                    <dd>
                      {selected.period.start ?? 'Unavailable'}–
                      {selected.period.end ?? 'Unavailable'}
                    </dd>
                    <dt>Latest surveillance year</dt>
                    <dd>{selected.latestSurveillanceYear ?? 'Unavailable'}</dd>
                    <dt>Registry ingestion age</dt>
                    <dd>{fmt(selected.ageDays)} days · not source publication age</dd>
                    <dt>Inspection time</dt>
                    <dd>{selected.inspectedAt}</dd>
                  </dl>
                  <details>
                    <summary>GIS reference provenance</summary>
                    <pre>
                      {JSON.stringify(
                        state.geometrySource ?? { status: 'Source metadata unavailable' },
                        null,
                        2,
                      )}
                    </pre>
                  </details>
                  <p>
                    Names use documented codes when present and deterministic normalization of case,
                    punctuation, and administrative prefixes. No fuzzy or invented geographic
                    aliases are introduced. Conflicting identities and many-to-one GIS matches are
                    exposed.
                  </p>
                  <p>
                    Checks inspect each dataset separately. Similar observations in separate
                    model/source datasets are not automatically treated as duplicate observations
                    within one dataset.
                  </p>
                </Panel>
              </>
            ) : tab === 'Issue Register' ? (
              <Panel title="Detected integrity issues">
                <div className="integrity-controls">
                  <label>
                    Severity
                    <select
                      aria-label="Integrity issue severity"
                      value={severity}
                      onChange={(e) => setSeverity(e.target.value)}
                    >
                      <option value="ALL">All severities</option>
                      {severities.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Search issues
                    <input
                      aria-label="Search integrity issues"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </label>
                </div>
                <p>
                  {visibleIssues.length} displayed / {selected.issues.length} dataset issues. Row
                  numbers are 1-based source observations, excluding a CSV header; “Dataset” marks
                  metadata or missing-period issues. Filtering does not change the score.
                </p>
                <div className="table-scroll">
                  <table aria-label="Scientific integrity issues">
                    <thead>
                      <tr>
                        <th>Dataset</th>
                        <th>Row</th>
                        <th>Field</th>
                        <th>Issue</th>
                        <th>Severity</th>
                        <th>Suggested corrective action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleIssues.map((issue) => (
                        <tr key={issue.id}>
                          <td>{issue.dataset}</td>
                          <td>{issue.row ?? 'Dataset'}</td>
                          <td>{issue.field}</td>
                          <td>{issue.issue}</td>
                          <td>
                            <span
                              className={`integrity-severity integrity-${issue.severity.toLowerCase()}`}
                            >
                              {issue.severity}
                            </span>
                          </td>
                          <td>{issue.action}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!visibleIssues.length && (
                  <p>
                    {selected.issues.length
                      ? 'No issues match this display filter.'
                      : 'No issues detected by these checks. This does not establish independent scientific verification.'}
                  </p>
                )}
              </Panel>
            ) : tab === 'Analysis Eligibility' ? (
              <Panel title="Analysis Eligibility">
                <p>
                  Conservative mechanical prerequisites for {selected.dataset.name}. Results use
                  analysis year {year} and model {model}, except Trend Analysis which inspects the
                  full loaded panel. A YES does not establish scientific validity or permission to
                  deploy. Optional-field errors can remain relevant even when the required fields
                  for an analysis pass.
                </p>
                <div className="integrity-eligibility">
                  {selected.eligibility.map((e) => (
                    <article key={e.analysis}>
                      <h3>
                        {e.analysis} Eligible:{' '}
                        <span className={e.eligible ? 'integrity-yes' : 'integrity-no'}>
                          {e.eligible ? 'YES' : 'NO'}
                        </span>
                      </h3>
                      <p>
                        {e.usable} / {e.total} candidate records meet the analysis input checks.
                        Dataset-level structural blocking can still prevent eligibility.
                      </p>
                      <ul>
                        {e.reasons.map((reason, i) => (
                          <li key={i}>{reason}</li>
                        ))}
                      </ul>
                    </article>
                  ))}
                </div>
              </Panel>
            ) : (
              <ScoreInspector report={selected} />
            )}
          </div>
          <Panel title="Inspection policy">
            <p>
              Policy v{selected.policy.version}: supported years {selected.policy.minYear}–
              {selected.policy.maxYear}; incidence tolerance {selected.policy.incidenceTolerance}{' '}
              per 1,000; abrupt adjacent case changes ≥{selected.policy.abruptChangePercent}% in
              either direction (zero-baseline increases are flagged separately); ingestion age &gt;
              {selected.policy.staleDays} days; latest surveillance lag &gt;
              {selected.policy.surveillanceLagYears} analysis years. Abrupt changes are review
              signals, not proof of erroneous data.
            </p>
            <p>
              BLOCKING: required schema, district identity, duplicate observation, or
              source-snapshot failure. ERROR: invalid values, inconsistent incidence, coordinates,
              or GIS joins. WARNING: missing optional fields, gaps, staleness, or unusual changes.
              INFO: inspection limits or contextual metadata. Validation status is derived from the
              highest detected severity. Scientific verification remains separate from schema
              checks.
            </p>
          </Panel>
        </>
      )}
    </>
  );
}
