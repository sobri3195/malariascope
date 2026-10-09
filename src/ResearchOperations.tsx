import BoundaryCrosswalk from './BoundaryCrosswalk';
import ClientDiagnostics from './ClientDiagnostics';
import { useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useStore } from './store';
import { download } from './analytics';
import { coverageGaps, validateReview, type Review } from './evidence-completion';
import ModelArtifactPanel from './ModelArtifactPanel';
import WorkspaceManagement from './WorkspaceManagement';
import PeriodicSurveillance from './PeriodicSurveillance';
import ServiceConnection from './ServiceConnection';
import './research-operations.css';
const empty: Review = {
  id: '',
  subject: '',
  source: '',
  license: '',
  reviewer: '',
  date: '',
  decision: 'PENDING',
  note: '',
};
export default function ResearchOperations() {
  const { state, year, district, research } = useStore();
  const [tab, setTab] = useState('Evidence'),
    [reviews, setReviews] = useState<Review[]>(() => {
      try {
        const a = JSON.parse(localStorage.getItem('malariascope-evidence-review') || '[]');
        return Array.isArray(a) ? a : [];
      } catch {
        return [];
      }
    }),
    [form, setForm] = useState(empty),
    [error, setError] = useState(''),
    [query, setQuery] = useState('');
  const rows = state.datasets.find((d) => d.id === state.active)?.rows || [];
  const districts = useMemo(
    () =>
      district === 'All districts'
        ? [
            ...new Set([
              ...rows.map((r) => r.district),
              ...(research?.registry.districts.map((d: any) => d.canonicalName) || []),
            ]),
          ]
        : [district],
    [rows, district, research],
  );
  const gaps = useMemo(
    () => coverageGaps(rows, districts, Math.max(1900, year - 5), year),
    [rows, districts, year],
  );
  return (
    <div className="research-operations">
      <h1>Research Operations & Integration</h1>
      <p>
        Complete evidence, run reproducible research, preserve work and inspect service readiness.
        Global context: {year} · {district} · {state.active || 'No dataset'}. External verification
        must be supported by original records.
      </p>
      <nav aria-label="Research operations sections">
        {['Evidence', 'Models', 'Periodic surveillance', 'Workspace', 'Services'].map((t) => (
          <button className="button" key={t} aria-pressed={tab === t} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </nav>
      {tab === 'Evidence' && (
        <>
          <BoundaryCrosswalk />
          <section className="panel">
            <h2>Evidence completion queue</h2>
            <p>
              {gaps.length} incomplete district-years in the selected six-year window. Missing
              outcomes and denominators remain unavailable. Changing the active dataset changes this
              queue.
            </p>
            <label>
              Search gaps
              <input value={query} onChange={(e) => setQuery(e.target.value)} />
            </label>
            <button
              className="button"
              onClick={() =>
                download('evidence-completion-queue.json', {
                  year,
                  district,
                  dataset: state.active,
                  gaps,
                })
              }
            >
              Export gap queue
            </button>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>District</th>
                    <th>Year</th>
                    <th>Missing fields</th>
                    <th>Evidence state</th>
                  </tr>
                </thead>
                <tbody>
                  {gaps
                    .filter((g) =>
                      `${g.district} ${g.year} ${g.missing.join(' ')}`
                        .toLowerCase()
                        .includes(query.toLowerCase()),
                    )
                    .slice(0, 200)
                    .map((g) => (
                      <tr key={g.district + g.year}>
                        <td>{g.district}</td>
                        <td>{g.year}</td>
                        <td>{g.missing.join(', ')}</td>
                        <td>{g.sourceStatus}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            {!gaps.length && (
              <p>
                {rows.length
                  ? 'No missing core fields in this selected window. This is not independent verification.'
                  : 'Connect observations in Data Center.'}
              </p>
            )}
            <NavLink to="/data-center">
              Import authorized observations, population and climate sources →
            </NavLink>
          </section>
          <section className="panel">
            <h2>Source reconciliation & review ledger</h2>
            <p>
              Record report discrepancies, licensing, boundary/code crosswalk review, denominator
              definitions, resource evidence and formula review. Entries are user-entered review
              records; they never change the supplied dataset or independently verify it.
            </p>
            {research?.ledger.map((r: any) => (
              <article key={r.id}>
                <strong>{r.id}</strong>
                <p>
                  {r.description} · {r.resolution}
                </p>
              </article>
            ))}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                try {
                  const r = validateReview(form);
                  const next = [r, ...reviews];
                  localStorage.setItem('malariascope-evidence-review', JSON.stringify(next));
                  setReviews(next);
                  setForm(empty);
                  setError('');
                } catch (e) {
                  setError(String(e));
                }
              }}
            >
              {(['subject', 'source', 'license', 'reviewer', 'date', 'note'] as const).map((k) => (
                <label key={k}>
                  {k}
                  <input
                    required={k !== 'note'}
                    type={k === 'date' ? 'date' : 'text'}
                    value={form[k]}
                    onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                  />
                </label>
              ))}
              <label>
                Decision
                <select
                  value={form.decision}
                  onChange={(e) => setForm({ ...form, decision: e.target.value })}
                >
                  <option>PENDING</option>
                  <option>SOURCE CLARIFICATION RECORDED</option>
                  <option>REVIEWED WITH LIMITATIONS</option>
                  <option>REJECTED</option>
                </select>
              </label>
              <button className="button">Save review evidence</button>
            </form>
            {error && <p role="alert">{error}</p>}
            <button
              className="button"
              onClick={() =>
                download('source-review-ledger.json', {
                  classification: 'USER-ENTERED REVIEW — NOT INDEPENDENT VERIFICATION',
                  reviews,
                })
              }
            >
              Export reviews
            </button>
            {reviews.map((r) => (
              <article key={r.id}>
                <strong>
                  {r.subject} · {r.decision}
                </strong>
                <p>
                  {r.reviewer} · {r.date} · {r.source} · {r.license}
                </p>
                <p>{r.note}</p>
              </article>
            ))}
          </section>
        </>
      )}
      {tab === 'Models' && <ModelArtifactPanel />}
      {tab === 'Periodic surveillance' && <PeriodicSurveillance />}
      {tab === 'Workspace' && <WorkspaceManagement />}
      {tab === 'Services' && (
        <>
          <ServiceConnection />
          <ClientDiagnostics />
        </>
      )}
    </div>
  );
}
