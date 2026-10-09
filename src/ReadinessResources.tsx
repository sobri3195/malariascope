import { useState } from 'react';
import { useStore } from './store';
import { validateResources, resourceFreshness, type ResourceEvidence } from './resource-evidence';
import { download } from './analytics';
export default function ReadinessResources() {
  const { year, district } = useStore();
  const [rows, setRows] = useState<ResourceEvidence[]>(() => {
      try {
        return validateResources(
          JSON.parse(localStorage.getItem('malariascope-resource-evidence') || '[]'),
        );
      } catch {
        return [];
      }
    }),
    [error, setError] = useState('');
  const selected = rows.filter(
    (r) => r.year === year && (district === 'All districts' || r.district === district),
  );
  return (
    <section className="panel">
      <h2>Connected readiness resource evidence</h2>
      <p>
        Separate source-declared capacity records with review and expiry dates. Imported statements
        do not independently verify availability and never generate operational directives or
        overwrite the checklist-derived matrix.
      </p>
      <label>
        Import resource evidence JSON
        <input
          aria-label="Import resource evidence"
          type="file"
          accept=".json"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f)
              void f
                .text()
                .then((t) => {
                  const next = validateResources(JSON.parse(t));
                  localStorage.setItem('malariascope-resource-evidence', JSON.stringify(next));
                  setRows(next);
                  setError('');
                })
                .catch((e) => setError(String(e)));
          }}
        />
      </label>
      <button
        className="button"
        onClick={() =>
          download('readiness-resource-evidence.json', {
            classification: 'USER-IMPORTED SOURCE STATEMENTS',
            year,
            district,
            records: selected,
          })
        }
      >
        Export resource evidence
      </button>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>District</th>
              <th>Domain</th>
              <th>Declared status</th>
              <th>Review window</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {selected.map((r) => (
              <tr key={r.district + r.domain}>
                <td>{r.district}</td>
                <td>{r.domain}</td>
                <td>{r.status}</td>
                <td>
                  {resourceFreshness(r)} · {r.reviewedAt} → {r.expiresAt}
                </td>
                <td>
                  {r.source} · {r.license}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!selected.length && (
        <p>
          No resource evidence for this year/district. Diagnostic resources, staffing and referral
          availability remain not connected.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
