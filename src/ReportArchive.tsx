import { validArchivedReport } from './report-archive-validation';
import { useState } from 'react';
import type { ResearchReport } from './report-engine';
import { download } from './analytics';
type Entry = { id: string; report: ResearchReport; saved: string };
export default function ReportArchive({
  report,
  onLoad,
}: {
  report: ResearchReport | null;
  onLoad: (r: ResearchReport) => void;
}) {
  const [entries, setEntries] = useState<Entry[]>(() => {
      try {
        const a = JSON.parse(localStorage.getItem('malariascope-report-archive') || '[]');
        return Array.isArray(a)
          ? a.filter(
              (x) =>
                x &&
                typeof x.id === 'string' &&
                typeof x.saved === 'string' &&
                validArchivedReport(x.report),
            )
          : [];
      } catch {
        return [];
      }
    }),
    [query, setQuery] = useState(''),
    [error, setError] = useState('');
  const save = (next: Entry[]) => {
    try {
      localStorage.setItem('malariascope-report-archive', JSON.stringify(next));
      setEntries(next);
      setError('');
    } catch {
      setError('Report archive could not be saved. Export the report before leaving.');
    }
  };
  return (
    <section className="panel no-print" aria-label="Saved research reports">
      <h2>Report archive</h2>
      <p>
        Saved reports retain their captured data, filters and provenance. Later dataset changes do
        not update an archived report. Archive is local; complete workspace backups include it.
      </p>
      <button
        className="button"
        disabled={!report}
        onClick={() => {
          if (report)
            save([
              {
                id: crypto.randomUUID(),
                report: structuredClone(report),
                saved: new Date().toISOString(),
              },
              ...entries,
            ]);
        }}
      >
        Archive generated report
      </button>
      <label>
        Search archived reports
        <input
          aria-label="Search archived reports"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      {entries
        .filter((x) => x.report.metadata.title.toLowerCase().includes(query.toLowerCase()))
        .map((x) => (
          <article key={x.id}>
            <strong>{x.report.metadata.title}</strong>
            <p>
              {x.saved} · {x.report.metadata.district}
            </p>
            <button className="button" onClick={() => onLoad(structuredClone(x.report))}>
              Open captured report
            </button>
            <button className="button" onClick={() => download(`report-${x.id}.json`, x.report)}>
              Export archived report
            </button>
            <button
              className="button"
              onClick={() => {
                if (confirm('Delete this archived report?'))
                  save(entries.filter((e) => e.id !== x.id));
              }}
            >
              Delete archived report
            </button>
          </article>
        ))}
      {!entries.length && <p>No archived reports. Generate and archive a report to preserve it.</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
