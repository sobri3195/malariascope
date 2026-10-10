import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Database } from 'lucide-react';
import { useStore } from '../store';
import { isAnalyticalDemo } from '../analytical-demo';
export default function MobileSourceControls({ expanded = false }: { expanded?: boolean }) {
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
  function restore() {
    update({ active: 'study-balanced' }, 'Research data restored', 'Synthetic demo excluded');
    setYear(2025);
    setDistrict('All districts');
  }
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
  if (!expanded && state.active && !demo && !researchError) return null;
  return (
    <section className="m-source-control" aria-label="Mobile analytical data source">
      <div className="m-source-title">
        <Database size={18} />
        <strong>
          {demo
            ? 'SYNTHETIC DEMO — NOT OBSERVED DATA'
            : state.active
              ? 'Research data source'
              : 'No primary dataset connected'}
        </strong>
      </div>
      <p>
        {demo
          ? 'Artificial cases, climate and model outputs. Synthetic signals stay outside the historical research alert log.'
          : state.active
            ? 'Active source labels and provenance remain with the analysis.'
            : 'Use supplied study data or connect your observations in Data Center.'}
      </p>
      <div className="m-inline-actions">
        <button disabled={!research || busy} onClick={restore}>
          Use research data
        </button>
        <Link to={expanded ? '/data-center' : '/mobile/more'}>
          {expanded ? 'Open Data Center' : 'More details'}
        </Link>
      </div>
      {expanded && (
        <details>
          <summary>Synthetic demo and source details</summary>
          <p>
            The connected demo has 54 artificial district-years. The separate 100,000-record fixture
            is preview-only. Source datasets and uploaded geometry are preserved.
          </p>
          <button disabled={busy || !research} onClick={start}>
            {busy ? 'Loading synthetic demo…' : 'Activate connected synthetic demo'}
          </button>
          <a href="/data/demo/analytical-workspace.json" download>
            Export synthetic demo data/provenance
          </a>
        </details>
      )}
      {researchError && (
        <div role="alert">
          <p>Study evidence could not be connected.</p>
          <button onClick={retryResearch}>Retry supplied research data</button>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
      {busy && <p role="status">Checking synthetic dataset integrity…</p>}
    </section>
  );
}
