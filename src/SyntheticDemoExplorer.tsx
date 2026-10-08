import { useMemo, useState } from 'react';
import Papa from 'papaparse';
type DemoRow = {
  record_id: string;
  district: string;
  year: number;
  cases: number;
  population: number;
  rainfall_mm: number;
  temperature_c: number;
  classification: string;
};
export default function SyntheticDemoExplorer() {
  const [rows, setRows] = useState<DemoRow[]>([]),
    [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle'),
    [error, setError] = useState(''),
    [query, setQuery] = useState(''),
    [district, setDistrict] = useState('All fictional districts'),
    [year, setYear] = useState('All artificial years'),
    [page, setPage] = useState(0);
  async function load() {
    setStatus('loading');
    setError('');
    try {
      const [csvResponse, metadataResponse] = await Promise.all([
        fetch('/data/demo/synthetic-100000.csv'),
        fetch('/data/demo/metadata.json'),
      ]);
      if (!csvResponse.ok || !metadataResponse.ok) throw Error('Synthetic demo files unavailable.');
      const [raw, metadata] = await Promise.all([csvResponse.text(), metadataResponse.json()]);
      const hash = Array.from(
        new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw))),
      )
        .map((n) => n.toString(16).padStart(2, '0'))
        .join('');
      if (hash !== metadata.sha256 || metadata.records !== 100000)
        throw Error('Synthetic demo integrity check failed.');
      const parsed = await new Promise<DemoRow[]>((resolve, reject) =>
        Papa.parse<DemoRow>(raw, {
          header: true,
          dynamicTyping: true,
          skipEmptyLines: true,
          worker: true,
          complete: (r) =>
            r.errors.length ? reject(Error('Synthetic CSV schema invalid.')) : resolve(r.data),
          error: reject,
        }),
      );
      if (
        parsed.length !== 100000 ||
        parsed.some(
          (r) =>
            r.classification !== 'SYNTHETIC_NOT_OBSERVED' ||
            !r.record_id?.startsWith('SYN-') ||
            !r.district?.startsWith('Synthetic District ') ||
            !Number.isFinite(r.cases),
        )
      )
        throw Error('Unexpected synthetic data content.');
      setRows(parsed);
      setStatus('ready');
    } catch (e) {
      setError(String(e));
      setStatus('error');
    }
  }
  const filtered = useMemo(
    () =>
      rows.filter(
        (r) =>
          (district === 'All fictional districts' || r.district === district) &&
          (year === 'All artificial years' || String(r.year) === year) &&
          `${r.record_id} ${r.district}`.toLowerCase().includes(query.toLowerCase()),
      ),
    [rows, district, year, query],
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / 50)),
    current = Math.min(page, pageCount - 1);
  return (
    <section className="coverage-demo" aria-label="Synthetic demo dataset">
      <h2>Synthetic Demo Dataset</h2>
      <p className="method-callout">
        <strong>SYNTHETIC — NOT OBSERVED DATA</strong>
        <br />
        100,000 artificial record-level examples in nine fictional districts. These are not
        district-year surveillance observations, climate measurements, predictions or research
        evidence. Repeated district-year labels are intentional. No real geographic locations are
        assigned.
      </p>
      <p>
        Preview only: never stored in verified datasets, global analytical context or local
        surveillance storage.
      </p>
      <div className="method-actions">
        <button className="button" disabled={status === 'loading'} onClick={load}>
          {status === 'loading'
            ? 'Loading synthetic demo…'
            : status === 'ready'
              ? 'Reload synthetic demo'
              : 'Load 100,000 synthetic records'}
        </button>
        <a href="/data/demo/synthetic-100000.csv" download>
          Download synthetic CSV
        </a>
        <a href="/data/demo/metadata.json" download>
          Download synthetic provenance
        </a>
      </div>
      {status === 'idle' && <p role="status">Demo not loaded. Research data remain active.</p>}
      {status === 'loading' && (
        <p role="status">
          Loading and verifying 100,000 synthetic records; parsing in a background worker…
        </p>
      )}
      {status === 'error' && <p role="alert">{error} Retry using the load button.</p>}
      {status === 'ready' && (
        <>
          <div className="coverage-filters">
            <label>
              Search synthetic records
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(0);
                }}
              />
            </label>
            <label>
              Fictional district
              <select
                value={district}
                onChange={(e) => {
                  setDistrict(e.target.value);
                  setPage(0);
                }}
              >
                <option>All fictional districts</option>
                {[...new Set(rows.map((r) => r.district))].sort().map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </label>
            <label>
              Artificial year
              <select
                value={year}
                onChange={(e) => {
                  setYear(e.target.value);
                  setPage(0);
                }}
              >
                <option>All artificial years</option>
                {[...new Set(rows.map((r) => r.year))].sort().map((y) => (
                  <option key={y}>{y}</option>
                ))}
              </select>
            </label>
          </div>
          <p role="status">
            {rows.length.toLocaleString('en-US')} synthetic records loaded ·{' '}
            {filtered.length.toLocaleString('en-US')} matching · Page {current + 1} / {pageCount}
          </p>
          {!filtered.length ? (
            <p>No synthetic records match these filters.</p>
          ) : (
            <div className="method-table-wrap">
              <table>
                <caption>SYNTHETIC — NOT OBSERVED DATA · Artificial demo preview</caption>
                <thead>
                  <tr>
                    {[
                      'Record',
                      'Fictional district',
                      'Artificial year',
                      'Synthetic cases',
                      'Synthetic population',
                      'Synthetic rainfall (mm)',
                      'Synthetic temperature (°C)',
                    ].map((h) => (
                      <th scope="col" key={h}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(current * 50, current * 50 + 50).map((r) => (
                    <tr key={r.record_id}>
                      <th scope="row">{r.record_id}</th>
                      <td>{r.district}</td>
                      <td>{r.year}</td>
                      <td>{r.cases}</td>
                      <td>{r.population}</td>
                      <td>{r.rainfall_mm}</td>
                      <td>{r.temperature_c}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="method-actions">
            <button
              className="button"
              disabled={current === 0}
              onClick={() => setPage(current - 1)}
            >
              Previous demo page
            </button>
            <button
              className="button"
              disabled={current >= pageCount - 1}
              onClick={() => setPage(current + 1)}
            >
              Next demo page
            </button>
            <button
              className="button"
              onClick={() => {
                setRows([]);
                setStatus('idle');
                setPage(0);
              }}
            >
              Unload demo
            </button>
          </div>
        </>
      )}
    </section>
  );
}
