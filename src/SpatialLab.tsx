import { useState } from 'react';
import { useStore } from './store';
import { download } from './analytics';
import { spatialInput, type moran } from './spatial';
type Result = ReturnType<typeof moran>;
export default function SpatialLab({ evidence }: { evidence: any }) {
  const { rows, year, state } = useStore();
  const [result, setResult] = useState<Result | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [permutations, setPermutations] = useState(999),
    [selected, setSelected] = useState('');
  function run() {
    setError('');
    setResult(null);
    try {
      if (!state.geometry) throw Error('District administrative geometry is not connected.');
      const input = spatialInput(
        state.geometry,
        rows.filter((r) => r.year === year),
      );
      setBusy(true);
      const worker = new Worker(new URL('./spatial.worker.ts', import.meta.url), {
        type: 'module',
      });
      worker.onmessage = (e) => {
        setBusy(false);
        if (e.data.error) setError(e.data.error);
        else setResult(e.data.result);
        worker.terminate();
      };
      worker.onerror = () => {
        setBusy(false);
        setError('Spatial worker failed. Check imported geometry.');
        worker.terminate();
      };
      worker.postMessage({ input, permutations, seed: 2025 });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">MALARIASCOPE / ANALYTICAL WORKSPACE</div>
          <h1>Spatial Analysis Lab</h1>
          <p>Inspect supplied evidence and calculate spatial association from loaded inputs.</p>
        </div>
      </div>
      <div className="two-col">
        <section className="panel">
          <div className="panel-head">
            <h2>Supplied global Moran’s I</h2>
            <span className="badge">SUPPLIED STUDY RESULT</span>
          </div>
          <div className="scenario-result">
            <span>2025 · NINE-DISTRICT ASSESSMENT</span>
            <h1>{evidence?.moranI ?? '—'}</h1>
            <strong>Permutation p = {evidence?.pValue ?? '—'}</strong>
          </div>
          <div className="notice">
            Not statistically significant at p &lt; 0.05. Underlying weights and permutation count
            were not supplied.
          </div>
          <button
            className="button"
            onClick={() => download('spatial-study-evidence.json', evidence)}
          >
            Export supplied evidence
          </button>
        </section>
        <section className="panel">
          <div className="panel-head">
            <h2>Calculate loaded-data spatial association</h2>
            <span className="badge teal">DERIVED ANALYTICS</span>
          </div>
          <div className="body-copy">
            Year {year} · queen contiguity · row-standardized weights · fixed reproducible seed
            2025. Results are calculated from the active imported dataset, separate from supplied
            study evidence.
          </div>
          <div className="toolbar">
            <label>
              Permutations
              <select value={permutations} onChange={(e) => setPermutations(+e.target.value)}>
                {[99, 499, 999, 4999].map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </label>
            <button className="button primary" disabled={busy} onClick={run}>
              {busy ? 'Calculating…' : 'Run spatial analysis'}
            </button>
          </div>
          {error && <div className="notice amber-notice">{error}</div>}
          {!state.geometry && (
            <div className="body-copy">
              District geometry not connected. Import polygon GeoJSON with district or name
              properties in Data Center.
            </div>
          )}
        </section>
      </div>
      {result && (
        <>
          <section className="panel">
            <div className="panel-head">
              <h2>Global spatial association · loaded observations</h2>
              <button
                className="button"
                onClick={() =>
                  download('derived-spatial-analysis.json', {
                    ...result,
                    year,
                    dataset: state.active,
                  })
                }
              >
                Export analysis
              </button>
            </div>
            <div className="spatial-stats">
              <div>
                <span>MORAN’S I</span>
                <strong>{result.observed.toFixed(4)}</strong>
              </div>
              <div>
                <span>EXPECTED I</span>
                <strong>{result.expected.toFixed(4)}</strong>
              </div>
              <div>
                <span>PERMUTATION P</span>
                <strong>{result.pValue.toFixed(4)}</strong>
              </div>
              <div>
                <span>MATCHED DISTRICTS</span>
                <strong>{result.n}</strong>
              </div>
            </div>
            <div className="notice">
              {result.pValue < 0.05
                ? 'Statistically significant at p < 0.05 under the selected exploratory weights.'
                : 'Not statistically significant at p < 0.05.'}{' '}
              {result.permutations} permutations. Missing districts are excluded. Quadrant labels
              are exploratory and do not establish statistically significant local hotspots.
            </div>
          </section>
          <section className="panel">
            <div className="panel-head">
              <h2>Spatial lag & neighborhood viewer</h2>
              <select value={selected} onChange={(e) => setSelected(e.target.value)}>
                <option value="">All matched districts</option>
                {result.local.map((r) => (
                  <option key={r.district}>{r.district}</option>
                ))}
              </select>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>District</th>
                    <th>Neighbors</th>
                    <th>Standardized burden</th>
                    <th>Spatial lag</th>
                    <th>Local I</th>
                    <th>Exploratory quadrant</th>
                  </tr>
                </thead>
                <tbody>
                  {result.local
                    .filter((r) => !selected || r.district === selected)
                    .map((r) => (
                      <tr key={r.district}>
                        <td>{r.district}</td>
                        <td>{r.neighbors.join(', ') || 'Isolated'}</td>
                        <td>{r.z.toFixed(3)}</td>
                        <td>{r.lag?.toFixed(3) ?? '—'}</td>
                        <td>{r.localI?.toFixed(3) ?? '—'}</td>
                        <td>{r.quadrant}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </>
  );
}
