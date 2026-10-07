import { useMemo, useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useStore } from './store';
import { download, normalize } from './analytics';
import {
  buildReadinessMatrix,
  readinessDomainDefinitions,
  readinessStates,
  readinessChecklistKey,
  checklistStates,
  safeChecklistState,
  type ReadinessDomain,
  type EvidenceGroup,
} from './readiness-engine';
import './readiness-matrix.css';
const evidenceGroups: EvidenceGroup[] = [
  'Known',
  'Unknown',
  'Not Connected',
  'Derived',
  'User-entered',
];
const value = (input: number | string | null, unit?: string) =>
  input === null
    ? 'Unavailable'
    : `${typeof input === 'number' ? input.toLocaleString('en-GB', { maximumFractionDigits: 4 }) : input}${unit ? ' ' + unit : ''}`;
const timestamp = (input: string | null | undefined) =>
  input && Number.isFinite(Date.parse(input))
    ? new Date(input).toLocaleString('en-GB', { timeZone: 'Asia/Bangkok' }) + ' ICT'
    : 'Timestamp unavailable';
function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="panel readiness-panel">
      <div className="panel-head">
        <h2>{title}</h2>
      </div>
      <div className="readiness-panel-body">{children}</div>
    </section>
  );
}
export default function ForceHealthReadinessMatrix() {
  const { state, update, year, setYear, district, setDistrict, model } = useStore();
  const [domain, setDomain] = useState<ReadinessDomain>('diagnostics'),
    [search, setSearch] = useState(''),
    [newDistrict, setNewDistrict] = useState(''),
    [error, setError] = useState('');
  const matrix = useMemo(
    () =>
      buildReadinessMatrix({
        datasets: state.datasets,
        active: state.active,
        year,
        model,
        checklists: state.districtChecklists || {},
        metadata: state.readinessMetadata,
        manualDistricts: state.readinessDistricts,
        thresholds: state.thresholds,
      }),
    [
      state.datasets,
      state.active,
      year,
      model,
      state.districtChecklists,
      state.readinessMetadata,
      state.readinessDistricts,
      state.thresholds,
    ],
  );
  const selected =
    matrix.districts.find((d) => normalize(d.district) === normalize(district)) ||
    matrix.districts[0];
  const selectedCell = selected?.cells.find((cell) => cell.domain === domain),
    key = selected ? readinessChecklistKey(selected.district, year) : '';
  const visible = matrix.districts.filter((d) => normalize(d.district).includes(normalize(search)));
  const years = [
    ...new Set([
      year,
      2020,
      2021,
      2022,
      2023,
      2024,
      2025,
      ...state.datasets.flatMap((d) => d.rows.map((r) => r.year)),
    ]),
  ].sort((a, b) => a - b);
  function saveItem(item: string, status: string, note?: string) {
    if (!selected) return;
    const normalized = safeChecklistState(status),
      existing = state.readinessMetadata?.[key]?.[item];
    update(
      {
        districtChecklists: {
          ...state.districtChecklists,
          [key]: { ...state.districtChecklists?.[key], [item]: normalized },
        },
        readinessMetadata: {
          ...state.readinessMetadata,
          [key]: {
            ...state.readinessMetadata?.[key],
            [item]: {
              status: normalized,
              note: (note ?? existing?.note ?? '').slice(0, 500),
              updatedAt: new Date().toISOString(),
            },
          },
        },
      },
      note === undefined ? 'District readiness status saved' : undefined,
      `${selected.district} · ${year} · ${item}: ${normalized}`,
    );
  }
  function addDistrict() {
    const name = newDistrict.trim();
    if (!name || name.length > 100 || !normalize(name)) {
      setError('Enter a district name of 1–100 characters.');
      return;
    }
    if (matrix.districts.some((d) => normalize(d.district) === normalize(name))) {
      setError('This district is already available. Select it in the evidence controls.');
      return;
    }
    update(
      { readinessDistricts: [...(state.readinessDistricts || []), name] },
      'Local readiness district added',
      `${name} · user-entered identity; no surveillance data inferred`,
    );
    setDistrict(name);
    setNewDistrict('');
    setError('');
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">EXPLAINABLE PREPAREDNESS EVIDENCE</div>
          <h1>Force Health Readiness Matrix</h1>
          <p>
            Review district-specific evidence and checklist completeness across eight readiness
            domains.
          </p>
        </div>
        <button
          className="button"
          onClick={() =>
            download('readiness-matrix-report.json', {
              created: new Date().toISOString(),
              matrix,
              checklists: state.districtChecklists || {},
              metadata: state.readinessMetadata || {},
              manualDistricts: state.readinessDistricts || [],
              interpretation:
                'Retrospective analytical decision support. READY describes locally documented applicable checklist completion, not independently verified capacity.',
              legacyRegionalChecklist: state.checklist,
              legacyScope: 'Retained regional entries; never automatically assigned to a district',
            })
          }
        >
          Export readiness evidence
        </button>
      </div>
      <div className="notice amber-notice">
        Decision Support — Not Autonomous Clinical or Operational Recommendations
      </div>
      <div className="readiness-controls">
        <label>
          Assessment year
          <select
            aria-label="Readiness year"
            value={year}
            onChange={(e) => setYear(+e.target.value)}
          >
            {years.map((y) => (
              <option key={y}>{y}</option>
            ))}
          </select>
        </label>
        <label>
          District evidence
          <select
            aria-label="Readiness district"
            value={selected?.district || ''}
            onChange={(e) => setDistrict(e.target.value)}
          >
            {!selected && <option value="">No district selected</option>}
            {matrix.districts.map((d) => (
              <option key={d.district}>{d.district}</option>
            ))}
          </select>
        </label>
        <label>
          Readiness domain
          <select
            aria-label="Readiness domain"
            value={domain}
            onChange={(e) => setDomain(e.target.value as ReadinessDomain)}
          >
            {readinessDomainDefinitions.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Find district
          <input
            aria-label="Search readiness districts"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>
      <p className="readiness-scope">
        Matrix rows cover all loaded and manually documented districts for {year}; district
        selection changes the evidence and checklist panels only. Model predictions do not determine
        readiness. Local checklists are shared with District Intelligence 360° and remain specific
        to district and year.
      </p>
      {Object.keys(state.checklist).length > 0 && (
        <div className="notice">
          {Object.keys(state.checklist).length} legacy regional checklist entry/entries are retained
          separately and have not been assigned to district rows.
        </div>
      )}
      <Panel title="District × Readiness Domain">
        <div className="readiness-legend">
          {readinessStates.map((s) => (
            <span
              key={s}
              className={'readiness-state state-' + s.toLowerCase().replaceAll(' ', '-')}
            >
              {s}
            </span>
          ))}
        </div>
        <div className="table-scroll readiness-table-wrap">
          <table aria-label="District readiness matrix">
            <thead>
              <tr>
                <th scope="col">District / year</th>
                {readinessDomainDefinitions.map((d) => (
                  <th scope="col" key={d.id}>
                    {d.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((d) => (
                <tr key={d.district}>
                  <th scope="row">
                    {d.district}
                    <small>{year}</small>
                  </th>
                  {d.cells.map((cell) => (
                    <td key={cell.domain}>
                      <button
                        className={`readiness-cell state-${cell.state.toLowerCase().replaceAll(' ', '-')} ${selected?.district === d.district && domain === cell.domain ? 'selected' : ''}`}
                        aria-label={`${d.district} · ${cell.label} · ${cell.state}`}
                        aria-pressed={selected?.district === d.district && domain === cell.domain}
                        onClick={() => {
                          setDistrict(d.district);
                          setDomain(cell.domain);
                        }}
                      >
                        {cell.state}
                        <small>
                          {cell.items.filter((item) => item.status === 'AVAILABLE').length}/
                          {cell.items.filter((item) => item.status !== 'NOT APPLICABLE').length}{' '}
                          applicable available
                        </small>
                      </button>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!visible.length && (
          <p>
            {matrix.districts.length
              ? 'No districts match the display search.'
              : 'No district evidence is connected. Add a district for local checklist documentation or import surveillance records.'}
          </p>
        )}
        <p>
          {visible.length}/{matrix.districts.length} displayed districts. Select any cell for its
          exact trigger, explanation, evidence status, missing information, and review category.
        </p>
        {matrix.identityIssues.length > 0 && (
          <details>
            <summary>District identity issues</summary>
            <ul>
              {matrix.identityIssues.map((issue, i) => (
                <li key={i}>{issue}</li>
              ))}
            </ul>
          </details>
        )}
      </Panel>
      <Panel title="Add a district for local documentation">
        <div className="readiness-controls">
          <label>
            District name
            <input
              aria-label="New readiness district"
              maxLength={100}
              value={newDistrict}
              onChange={(e) => setNewDistrict(e.target.value)}
              placeholder="User-entered district identity"
            />
          </label>
          <button className="button" onClick={addDistrict}>
            Add local district
          </button>
        </div>
        <p>
          Adding a name records a user-entered identity only. It creates no malaria observation,
          resource feed, or GIS match.
        </p>
        {error && (
          <div role="alert" className="notice amber-notice">
            {error}
          </div>
        )}
      </Panel>
      {selected && selectedCell && (
        <>
          <div className="readiness-detail-grid">
            <Panel title={`${selectedCell.label}: ${selectedCell.state}`}>
              <div aria-label="Readiness assessment explanation" aria-live="polite">
                <h3>
                  {selected.district} · {year}
                </h3>
                <dl className="readiness-summary">
                  <dt>Reason</dt>
                  <dd>{selectedCell.reason}</dd>
                  <dt>Rule</dt>
                  <dd>{selectedCell.rule}</dd>
                  <dt>Evidence status</dt>
                  <dd>{selectedCell.evidenceStatus}</dd>
                  <dt>Suggested review category</dt>
                  <dd>{selectedCell.suggestedReviewCategory}</dd>
                  <dt>Source verification</dt>
                  <dd>{selected.sourceVerification}</dd>
                </dl>
                <h3>Missing information</h3>
                {selectedCell.missingInformation.length ? (
                  <ul>
                    {selectedCell.missingInformation.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  <p>
                    No applicable checklist item is missing. Independent resource-feed verification
                    is still not connected.
                  </p>
                )}
                <details>
                  <summary>Exact triggering data</summary>
                  <div className="table-scroll">
                    <table aria-label="Readiness triggering data">
                      <thead>
                        <tr>
                          <th>Evidence class</th>
                          <th>Variable / checklist item</th>
                          <th>Value</th>
                          <th>Year</th>
                          <th>Source</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedCell.triggeringData.map((entry, i) => (
                          <tr key={i}>
                            <td>{entry.group}</td>
                            <td>{entry.label}</td>
                            <td>{value(entry.value, entry.unit)}</td>
                            <td>{entry.year}</td>
                            <td>{entry.source}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <pre>{JSON.stringify(selectedCell.triggeringData, null, 2)}</pre>
                </details>
                <NavLink
                  className="text-link"
                  to={`/district-intelligence?district=${encodeURIComponent(selected.district)}&year=${year}`}
                >
                  Open District Intelligence 360° →
                </NavLink>
              </div>
            </Panel>
            <Panel title={`${selectedCell.label} · local checklist`}>
              <p>
                Changes save automatically in this browser for {selected.district} / {year}. Entries
                and notes are user-entered, independently unverified evidence.
              </p>
              {selectedCell.items.map((item) => (
                <div className="readiness-checklist-item" key={item.item}>
                  <label>
                    {item.item}
                    <select
                      aria-label={item.item}
                      value={item.status}
                      onChange={(e) => saveItem(item.item, e.target.value)}
                    >
                      {checklistStates.map((status) => (
                        <option key={status}>{status}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Evidence reference / research note
                    <textarea
                      aria-label={`Evidence note: ${item.item}`}
                      value={item.note}
                      maxLength={500}
                      onChange={(e) => saveItem(item.item, item.status, e.target.value)}
                    />
                  </label>
                  <small>User-entered · {timestamp(item.updatedAt)}</small>
                </div>
              ))}
              <p role="status">
                Local checklist is saved automatically; no submission or external sharing occurs.
              </p>
            </Panel>
          </div>
          <Panel title="Readiness Evidence Panel">
            <p>
              Known means present in loaded source records; it does not establish verification.
              Derived values follow explicit arithmetic. Unknown means a required value or review is
              unavailable. Not Connected means there is no independent evidence feed. User-entered
              means a local checklist statement or note.
            </p>
            <div className="readiness-evidence-grid">
              {evidenceGroups.map((group) => {
                const entries = selected.evidence.filter((entry) => entry.group === group);
                return (
                  <section
                    key={group}
                    className="readiness-evidence-group"
                    aria-label={`${group} readiness evidence`}
                  >
                    <h3>
                      {group} <span>{entries.length}</span>
                    </h3>
                    {entries.length ? (
                      <ul>
                        {entries.map((entry, i) => (
                          <li key={i}>
                            <strong>{entry.label}</strong>
                            <p>
                              {value(entry.value, entry.unit)} · {entry.year}
                            </p>
                            <p>{entry.source}</p>
                            {entry.note && <p>Note: {entry.note}</p>}
                            {entry.group === 'User-entered' && <p>{timestamp(entry.updatedAt)}</p>}
                            {entry.references.length > 0 && (
                              <details>
                                <summary>Source references</summary>
                                <pre>{JSON.stringify(entry.references, null, 2)}</pre>
                              </details>
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p>No evidence entries in this category.</p>
                    )}
                  </section>
                );
              })}
            </div>
            {selected.sourceIssues.length > 0 && (
              <details>
                <summary>Selected-year source conflicts / quality notes</summary>
                <ul>
                  {selected.sourceIssues.map((issue, i) => (
                    <li key={i}>{issue}</li>
                  ))}
                </ul>
              </details>
            )}
          </Panel>
        </>
      )}
      <Panel title="Readiness interpretation rules">
        <p>
          Applicable local LIMITED or UNAVAILABLE items → ATTENTION. Elevated observed cases
          (&gt;20,000) or incidence (≥{state.thresholds[1]}) with unreviewed diagnostic availability
          → ATTENTION. An adjacent incidence rise is reported only when both annual values exist.
          Predictions never trigger readiness attention.
        </p>
        <p>
          Missing required surveillance/provenance data → INSUFFICIENT DATA for surveillance/data
          domains. Source conflicts → REVIEW. All applicable local items AVAILABLE → READY; all NOT
          APPLICABLE → INSUFFICIENT DATA. Partial documentation → REVIEW; absent resource
          documentation → INSUFFICIENT DATA. READY describes local checklist completion, not
          verified capacity. Resource availability is never inferred from malaria counts, map
          facilities, or model output.
        </p>
        <p>
          Review categories organize human evidence review. The matrix provides no autonomous
          clinical or operational instructions.
        </p>
      </Panel>
    </>
  );
}
