import { useState } from 'react';
import { useStore } from '../store';
import {
  buildResearchReport,
  reportCSV,
  reportSections,
  type SectionId,
  type ResearchReport,
} from '../report-engine';
import { Card, useMobile, date } from './MobileApp';
import { MobileDistrictSelect, Indicators } from './MobilePages';
function download(text: string, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type })),
    a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function MobileReport() {
  const { state, year, district, model, signals } = useStore(),
    { data, evidence } = useMobile();
  const [sections, setSections] = useState<SectionId[]>([
      'district',
      'trend',
      'risk',
      'alerts',
      'forecast',
      'readiness',
      'quality',
    ]),
    [report, setReport] = useState<ResearchReport | null>(null),
    [message, setMessage] = useState(''),
    [title, setTitle] = useState('Mobile District Intelligence Report');
  const allowed = ['district', 'trend', 'risk', 'alerts', 'forecast', 'readiness', 'quality'];
  const generate = () => {
    try {
      setReport(
        buildResearchReport({
          state,
          request: {
            type: 'District Intelligence Report',
            title,
            start: Math.min(
              year,
              ...evidence.history
                .filter((r) => district === 'All districts' || r.district === district)
                .map((r) => r.year),
            ),
            end: year,
            district,
            model,
            risk: 'ALL',
            region: 'ALL',
            sections,
          },
          now: new Date().toISOString(),
          supplied: data!,
          alerts: signals,
        }),
      );
      setMessage('Report generated from the current loaded evidence.');
    } catch (e) {
      setMessage(String(e));
    }
  };
  return (
    <>
      <div className="m-report-controls">
        <h1>Mobile Research Report</h1>
        <MobileDistrictSelect />
        <label>
          Report title
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} />
        </label>
        <Card title="Report sections">
          {reportSections
            .filter(([id]) => allowed.includes(id))
            .map(([id, label]) => (
              <label key={id} className="m-check">
                <input
                  type="checkbox"
                  checked={sections.includes(id)}
                  onChange={(e) =>
                    setSections(
                      e.target.checked ? [...sections, id] : sections.filter((s) => s !== id),
                    )
                  }
                />
                {label}
              </label>
            ))}
        </Card>
        <button onClick={generate}>Generate mobile report</button>
        <p role="status">{message}</p>
        {report && (
          <div className="m-actions">
            <button onClick={() => window.print()}>Print / Save as PDF</button>
            <button
              onClick={() =>
                download(
                  JSON.stringify(report, null, 2),
                  'malariascope-mobile-report.json',
                  'application/json',
                )
              }
            >
              Export JSON
            </button>
            <button
              onClick={() =>
                download(reportCSV(report), 'malariascope-mobile-report.csv', 'text/csv')
              }
            >
              Export CSV
            </button>
            <button
              onClick={async () => {
                if (!navigator.share) {
                  setMessage(
                    'Web Share is not available in this browser. Use JSON, CSV or Print instead.',
                  );
                  return;
                }
                try {
                  await navigator.share({
                    title: report.metadata.title,
                    text: [
                      report.disclaimer,
                      ...report.sections.flatMap((s) => [s.title, ...s.paragraphs]),
                    ].join('\n'),
                  });
                  setMessage('Report shared.');
                } catch (e) {
                  setMessage(
                    e instanceof Error && e.name === 'AbortError' ? 'Share cancelled.' : String(e),
                  );
                }
              }}
            >
              Share report
            </button>
          </div>
        )}
      </div>
      {report && (
        <article className="m-report-output">
          <h1>{report.metadata.title}</h1>
          <p>{report.disclaimer}</p>
          <Indicators
            items={[
              [
                'Observation period',
                `${report.metadata.period.start}–${report.metadata.period.end}`,
              ],
              ['District', report.metadata.district],
              ['Generated', date(report.metadata.generatedAt)],
              ['Selected model', report.metadata.analyticalConfiguration.model],
              [
                'Data version',
                report.metadata.dataVersion.map((d) => `${d.name}: ${d.checksum}`).join('; ') ||
                  'No loaded district datasets',
              ],
            ]}
          />
          {report.sections.map((s) => (
            <Card key={s.id} title={s.title}>
              {s.paragraphs.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
              {s.tables.map((t, i) => (
                <section key={i}>
                  <h3>{t.title}</h3>
                  {t.rows.length ? (
                    t.rows.map((row, j) => (
                      <Indicators
                        key={j}
                        items={t.columns.map((c) => [c.label, row[c.key] ?? 'Data not available'])}
                      />
                    ))
                  ) : (
                    <p>Data not available</p>
                  )}
                </section>
              ))}
            </Card>
          ))}
          <Card title="Analytical configuration">
            <pre>{JSON.stringify(report.metadata.analyticalConfiguration, null, 2)}</pre>
          </Card>
        </article>
      )}
    </>
  );
}
