import { useState } from 'react';
import { useStore } from './store';
import { isAnalyticalDemo } from './analytical-demo';
import './analytical-demo.css';
export default function AnalyticalDemoControls() {
  const {
    state,
    research,
    researchError,
    retryResearch,
    activateDemo,
    update,
    setYear,
    setDistrict,
  } = useStore();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const demo = isAnalyticalDemo(state.active);
  async function start() {
    setBusy(true);
    setError('');
    try {
      await activateDemo();
      setYear(2025);
      setDistrict('All districts');
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  function restore() {
    update({ active: 'study-balanced' }, 'Research data restored', 'Synthetic demo excluded');
    setYear(2025);
    setDistrict('All districts');
  }
  const actions = (
    <div className="demo-source-actions">
      <button onClick={start} disabled={busy || !research}>
        {busy ? 'Loading synthetic demo…' : 'Activate connected synthetic demo'}
      </button>
      <button onClick={restore} disabled={!research}>
        Use supplied research data
      </button>
      <a href="/data/demo/analytical-workspace.json" download>
        Download synthetic demo provenance/data
      </a>
    </div>
  );
  return (
    <section
      className={`analytical-demo-controls ${demo ? 'demo-active' : ''}`}
      aria-label="Analytical data source"
    >
      <details open={demo || !state.active}>
        <summary>
          {demo
            ? 'SYNTHETIC DEMO — NOT OBSERVED DATA'
            : state.active
              ? 'Analytical data source & demo'
              : 'No primary dataset — connect research or demo data'}
        </summary>
        <p>
          {demo
            ? 'All cases, populations, climate values and model outputs in the active analytical workspace are artificial. Model formulas are illustrations, not trained forecasts. Public district boundaries are geographic context only.'
            : 'Choose supplied research observations or a clearly labeled synthetic demo. The connected demo contains 54 artificial district-years and illustrative outputs for five model labels; the separate 100,000-record fixture remains a preview-only dataset.'}
        </p>
        {actions}
        <p>
          Source datasets and uploaded geometry are preserved. Synthetic signals are previewed
          without entering the historical research alert log.
        </p>
      </details>
      {!research && !researchError && <p role="status">Connecting supplied research data…</p>}
      {researchError && (
        <div role="alert">
          <p>
            Supplied research package could not be connected. Source integrity checks remain
            enabled.
          </p>
          <details>
            <summary>Source loading details</summary>
            <p>{researchError}</p>
          </details>
          <button onClick={retryResearch}>Retry supplied research data</button>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
      {busy && <p role="status">Checking synthetic dataset integrity…</p>}
    </section>
  );
}
