import ReportArchive from './ReportArchive';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from './store';
import { download } from './analytics';
import { forecastModels } from './forecasting';
import {
  buildResearchReport,
  reportCSV,
  reportDisclaimer,
  reportPresets,
  reportSections,
  reportTypes,
  requiredSections,
  validateReportRequest,
  type ReportInput,
  type ReportRequest,
  type ReportTable,
  type ResearchReport,
  type SectionId,
} from './report-engine';
import './reports.css';
const display = (value: string | number | null | undefined) =>
  value == null
    ? 'Unavailable'
    : typeof value === 'number'
      ? value.toLocaleString('en-GB', { maximumFractionDigits: 3 })
      : value;
const stamp = (time: string) =>
  new Date(time).toLocaleString('en-GB', { timeZone: 'Asia/Bangkok' }) + ' ICT';
function EvidenceTable({ table }: { table: ReportTable }) {
  return (
    <div className="report-table-scroll">
      <table className="report-table" aria-label={table.title}>
        <caption>{table.title}</caption>
        <thead>
          <tr>
            {table.columns.map((c) => (
              <th scope="col" key={c.key}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, i) => (
            <tr key={i}>
              {table.columns.map((c) => (
                <td key={c.key}>
                  {c.key === 'year' && row[c.key] !== null
                    ? String(row[c.key])
                    : display(row[c.key])}
                </td>
              ))}
            </tr>
          ))}
          {!table.rows.length && (
            <tr>
              <td colSpan={table.columns.length}>
                No evidence available for this section and selection.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
function TrendGraphic({ report }: { report: ResearchReport }) {
  const rows = report.trend ?? [],
    max = Math.max(1, ...rows.map((r) => r.cases ?? 0));
  return (
    <figure className="report-trend" aria-label="Observed cases temporal chart">
      <figcaption>Observed cases by year · selected cohort</figcaption>
      {rows.map((r) => (
        <div className="report-trend-row" key={r.year}>
          <span>{r.year}</span>
          <div className="report-trend-track">
            <span style={{ width: `${r.cases === null ? 0 : (r.cases / max) * 100}%` }} />
          </div>
          <strong>{display(r.cases)}</strong>
        </div>
      ))}
      <p>Unavailable periods have no bar. Values and district coverage are tabulated below.</p>
    </figure>
  );
}
function ReportMap({ map }: { map: NonNullable<ResearchReport['map']> }) {
  if (!map.bounds || !map.features.length)
    return (
      <p role="status">
        Administrative map unavailable: {map.error ?? 'No connected district polygons'}. Country
        outlines are not substituted for district boundaries.
      </p>
    );
  const { west, east, north, south } = map.bounds;
  const cos = Math.cos((((north + south) / 2) * Math.PI) / 180),
    width = 800,
    height = 420;
  const scale = Math.min(
    (width - 30) / Math.max(0.0001, (east - west) * cos),
    (height - 30) / Math.max(0.0001, north - south),
  );
  const project = ([lon, lat]: number[]) => [
    15 + (lon - west) * cos * scale,
    15 + (north - lat) * scale,
  ];
  const maximum = Math.max(1, ...map.features.map((f) => f.cases ?? 0));
  const color = (cases: number | null) =>
    cases === null ? '#e5e7eb' : `hsl(170 45% ${90 - (55 * cases) / maximum}%)`;
  return (
    <figure className="report-map">
      <svg
        role="img"
        aria-label={`Administrative observed burden map ${map.year}`}
        viewBox={`0 0 ${width} ${height}`}
      >
        <title>Observed burden · {map.year}</title>
        {map.features.map((f) => {
          const polygons =
            f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
          const path = polygons
            .flatMap((polygon: number[][][]) =>
              polygon.map((ring) => 'M' + ring.map((p) => project(p).join(',')).join('L') + 'Z'),
            )
            .join(' ');
          return (
            <path
              key={f.code}
              d={path}
              fill={color(f.cases)}
              stroke="#374151"
              strokeWidth=".8"
              fillRule="evenodd"
            >
              <title>
                {f.district}: {display(f.cases)} observed cases · {f.risk}
              </title>
            </path>
          );
        })}
      </svg>
      <figcaption>
        Static snapshot · year {map.year}. Gray = unavailable or outside selected filters; darker
        teal = greater observed burden (linear scale 0–{maximum.toLocaleString('en-GB')}).
        Equirectangular administrative context, not a navigational map. Source:{' '}
        {map.source?.name ?? 'Source version unavailable'}.
      </figcaption>
    </figure>
  );
}
function Document({ report }: { report: ResearchReport }) {
  const m = report.metadata;
  useEffect(() => {
    const previousTitle = document.title;
    document.title = report.metadata.title + ' | MALARIASCOPE';
    return () => {
      document.title = previousTitle;
    };
  }, [report.metadata.title]);
  return (
    <article className="report-document" aria-label="Generated research report">
      <header className="report-cover">
        <p className="report-kicker">MALARIASCOPE · RESEARCH INTELLIGENCE</p>
        <h1>{m.title}</h1>
        <p>{m.type}</p>
        <dl className="report-metadata">
          <dt>Reporting Period</dt>
          <dd>
            {m.period.start}–{m.period.end}
          </dd>
          <dt>Selected District</dt>
          <dd>{m.district}</dd>
          <dt>Generated Date</dt>
          <dd>{stamp(m.generatedAt)}</dd>
          <dt>Analysis Date</dt>
          <dd>{stamp(m.analysisDate)}</dd>
          <dt>Data Version</dt>
          <dd>
            {m.dataVersion.length
              ? m.dataVersion.map((v) => `${v.name}: ${v.checksum}`).join('; ')
              : 'No loaded district dataset; supplied evidence versions listed in Provenance'}
          </dd>
          <dt>Analytical Configuration</dt>
          <dd>
            Model: {m.analyticalConfiguration.model}. Observed incidence cutoffs:{' '}
            {m.analyticalConfiguration.incidenceThresholds.join(' / ')} per 1,000. Model comparison:
            MAE, common validation pairs. Scenarios excluded.
          </dd>
          <dt>Selected Filters</dt>
          <dd>
            District: {m.selectedFilters.district}; years: {m.selectedFilters.start}–
            {m.selectedFilters.end}; risk: {m.selectedFilters.risk}; region:{' '}
            {m.selectedFilters.region}; model: {m.selectedFilters.model}.
          </dd>
        </dl>
        <p className="report-disclaimer">{report.disclaimer}</p>
      </header>
      <nav className="report-contents no-print" aria-label="Report contents">
        {report.sections.map((s) => (
          <a key={s.id} href={`#report-section-${s.id}`}>
            {s.title}
          </a>
        ))}
      </nav>
      {report.sections.map((s) => (
        <section className="report-section" id={`report-section-${s.id}`} key={s.id}>
          <h2>{s.title}</h2>
          {s.paragraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
          {s.id === 'map' && report.map && <ReportMap map={report.map} />}{' '}
          {s.id === 'trend' && <TrendGraphic report={report} />}{' '}
          {s.tables.map((t, i) => (
            <EvidenceTable key={i} table={t} />
          ))}
        </section>
      ))}
      <div className="report-closing">
        MALARIASCOPE · Analysis {stamp(m.analysisDate)} · Source versions and limitations included
        above.
      </div>
    </article>
  );
}
export default function ResearchReportBuilder({
  models,
  summary,
  spatial,
  provenance,
}: {
  models: any[];
  summary: any;
  spatial: any;
  provenance: Record<string, any>;
}) {
  const { state, signals, year, district, setDistrict, model, setModel, update } = useStore();
  const [type, setType] = useState<ReportRequest['type']>(reportTypes[0]),
    [title, setTitle] = useState<string>(reportTypes[0]);
  const [period, setPeriod] = useState({ year, start: String(year), end: String(year) });
  const start = period.year === year ? period.start : String(year),
    end = period.year === year ? period.end : String(year);
  const [sections, setSections] = useState<SectionId[]>([
    ...reportPresets[reportTypes[0]],
    ...requiredSections,
  ]);
  const [risk, setRisk] = useState(state.filters?.risk || 'ALL'),
    [region, setRegion] = useState(state.filters?.region || 'ALL');
  const [generated, setGenerated] = useState<{ report: ResearchReport; key: string } | null>(null),
    [error, setError] = useState('');
  const preview = useRef<HTMLDivElement>(null);
  const districts = useMemo(
    () => [...new Set(state.datasets.flatMap((d) => d.rows.map((r) => r.district)))].sort(),
    [state.datasets],
  );
  const regions = useMemo(
    () =>
      [
        ...new Set(
          state.datasets.flatMap((d) =>
            d.rows.map((r) => r.region).filter((r): r is string => !!r),
          ),
        ),
      ].sort(),
    [state.datasets],
  );
  const request: ReportRequest = {
    type,
    title,
    start: start === '' ? NaN : Number(start),
    end: end === '' ? NaN : Number(end),
    district,
    model,
    risk,
    region,
    sections,
  };
  const draftError = validateReportRequest(request);
  const key = JSON.stringify({
    request,
    datasets: state.datasets,
    active: state.active,
    thresholds: state.thresholds,
    riskMode: state.riskMode,
    rules: state.rules,
    geometry: state.geometry,
    geometrySource: state.geometrySource,
    checklists: state.districtChecklists,
    readinessMetadata: state.readinessMetadata,
    alerts: signals,
    alertCreated: state.alertCreated,
    models,
    summary,
    spatial,
    provenance,
  });
  function generate() {
    try {
      const input: ReportInput = {
        state,
        request,
        now: new Date().toISOString(),
        supplied: { models, summary, spatial, provenance },
        alerts: signals,
      };
      setGenerated({ report: buildResearchReport(input), key });
      setError('');
      update({}, 'Research report generated', `${type}: ${start}–${end}, ${district}`);
      requestAnimationFrame(() =>
        preview.current?.scrollIntoView({
          behavior: state.reduced ? 'instant' : 'smooth',
          block: 'start',
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to build report');
    }
  }
  return (
    <div className="research-report-builder">
      <ReportArchive
        report={generated?.report || null}
        onLoad={(report) => setGenerated({ report, key })}
      />
      <div className="no-print">
        <h1>Professional Research Report Builder</h1>
        <p>
          Choose evidence sections, review a reproducible snapshot, and print or export the exact
          generated selection.
        </p>
        <p className="report-disclaimer">{reportDisclaimer}</p>
      </div>
      <section className="panel report-controls no-print" aria-label="Report builder controls">
        <div className="report-input-grid">
          <label>
            Report type
            <select
              aria-label="Report type"
              value={type}
              onChange={(e) => {
                const t = e.target.value as ReportRequest['type'];
                setType(t);
                setTitle(title === type ? t : title);
                setSections([...reportPresets[t], ...requiredSections]);
              }}
            >
              {reportTypes.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label>
            Report Title
            <input
              aria-label="Report Title"
              value={title}
              maxLength={200}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label>
            Reporting period start
            <input
              aria-label="Reporting period start"
              type="number"
              min="1900"
              max="2100"
              value={start}
              onChange={(e) => setPeriod({ year, start: e.target.value, end })}
            />
          </label>
          <label>
            Reporting period end
            <input
              aria-label="Reporting period end"
              type="number"
              min="1900"
              max="2100"
              value={end}
              onChange={(e) => setPeriod({ year, start, end: e.target.value })}
            />
          </label>
          <label>
            Selected District
            <select
              aria-label="Report district"
              value={district}
              onChange={(e) => setDistrict(e.target.value)}
            >
              <option>All districts</option>
              {!districts.includes(district) && district !== 'All districts' && (
                <option>{district}</option>
              )}
              {districts.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </label>
          <label>
            Analytical model
            <select
              aria-label="Report model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
            >
              {forecastModels.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </label>
          <label>
            Risk filter
            <select
              aria-label="Report risk filter"
              value={risk}
              onChange={(e) => setRisk(e.target.value)}
            >
              {['ALL', 'LOW', 'MODERATE', 'HIGH', 'VERY HIGH', 'INSUFFICIENT DATA'].map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </label>
          <label>
            Region filter
            <select
              aria-label="Report region filter"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
            >
              <option>ALL</option>
              {regions.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </label>
        </div>
        <p>
          Report period starts from the global year; changing the global year resets the draft
          period. District and model use global selections. These report-specific risk and region
          filters are shown in the generated metadata. Default incidence cutoffs:{' '}
          {state.thresholds.join(' / ')} per 1,000.
        </p>
        <fieldset>
          <legend>Report sections</legend>
          <div className="report-section-choices">
            {reportSections.map(([id, label]) => (
              <label key={id}>
                <input
                  type="checkbox"
                  aria-label={`Include ${label}`}
                  checked={sections.includes(id)}
                  disabled={requiredSections.includes(id)}
                  onChange={(e) =>
                    setSections(
                      e.target.checked ? [...sections, id] : sections.filter((s) => s !== id),
                    )
                  }
                />
                {label}
                {requiredSections.includes(id) ? ' (always included)' : ''}
              </label>
            ))}
          </div>
        </fieldset>
        {(error || draftError) && <p role="alert">{error || draftError}</p>}
        <button className="button primary" onClick={generate} disabled={!!draftError}>
          Generate report
        </button>
      </section>
      {generated && (
        <div ref={preview}>
          <div className="report-output-actions no-print">
            <p role="status">
              {generated.key === key
                ? 'Generated snapshot matches the current draft.'
                : 'Draft or source context has changed. The previous generated snapshot remains below; generate again to include changes.'}
            </p>
            <div className="report-actions">
              <button className="button" onClick={() => window.print()}>
                Print
              </button>
              <button className="button" onClick={() => window.print()}>
                Save as PDF via browser
              </button>
              <button
                className="button"
                onClick={() =>
                  download('report-selected-data.csv', reportCSV(generated.report), true)
                }
              >
                Export selected data as CSV
              </button>
              <button
                className="button"
                onClick={() => download('analytical-report.json', generated.report)}
              >
                Export analytical metadata as JSON
              </button>
            </div>
            <p>
              PDF uses your browser’s print dialog: select “Save as PDF”. CSV contains the displayed
              section tables in a long format; JSON includes metadata and the selected analytical
              evidence. Both export the generated snapshot, not later draft changes.
            </p>
          </div>
          <Document report={generated.report} />
        </div>
      )}
    </div>
  );
}
