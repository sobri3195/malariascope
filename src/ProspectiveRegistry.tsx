import { useState } from 'react';
import { useStore } from './store';
import { download } from './analytics';
import {
  createProspective,
  lockProspective,
  attachOutcome,
  monitorProspective,
  type ProspectiveRecord,
} from './prospective-engine';
const empty = {
  issue_date: '',
  target_period: '',
  data_cutoff: '',
  dataset_version: '',
  dataset_hash: '',
  model_version: '',
  model: '',
  district: '',
  prediction: '',
  persistence_prediction: '',
};
export default function ProspectiveRegistry({ monitoring = false }: { monitoring?: boolean }) {
  const { research } = useStore();
  const [records, setRecords] = useState<ProspectiveRecord[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('malariascope-prospective') || '[]');
    } catch {
      return [];
    }
  });
  const [form, setForm] = useState(empty),
    [message, setMessage] = useState(''),
    [outcomes, setOutcomes] = useState<Record<string, string>>({});
  const save = (next: ProspectiveRecord[]) => {
    try {
      localStorage.setItem('malariascope-prospective', JSON.stringify(next));
      setRecords(next);
    } catch {
      setMessage('Local storage unavailable; export your registry before leaving.');
      setRecords(next);
    }
  };
  const action = (fn: () => void) => {
    try {
      fn();
      setMessage('Registry updated locally.');
    } catch (e) {
      setMessage(String(e));
    }
  };
  const monitor = monitorProspective(records);
  return (
    <section className="research-evidence">
      <h1>{monitoring ? 'Model Performance Monitoring' : 'Prospective Forecast Registry'}</h1>
      <p>
        Future research evaluation only. No prospective forecasts or outcomes are generated
        automatically. Locked forecast fields cannot be edited; original issue/cutoff/version remain
        preserved. Local browser records are not an independently timestamped tamper-proof registry.
      </p>
      {message && <p role="status">{message}</p>}
      {monitoring ? (
        <>
          <h2>{monitor.status}</h2>
          {monitor.pairs.map((r) => (
            <p key={r.forecast_id}>
              {r.district} · {r.target_period} · signed error {r.error} · absolute error{' '}
              {Math.abs(r.error!)} · Persistence absolute error{' '}
              {Math.abs(r.persistence_prediction - r.outcome!)}
            </p>
          ))}
          <p>Historical reference: 2025 retrospective test, distinct from prospective outcomes.</p>
          {research?.performance
            .filter((r) => r.year === 2025)
            .map((r) => (
              <p key={r.model}>
                {r.model} · historical MAE {r.mae}
              </p>
            ))}
          <pre>
            {JSON.stringify({ model: monitor.model, persistence: monitor.persistence }, null, 2)}
          </pre>
        </>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            action(() => {
              save([
                ...records,
                createProspective({
                  ...form,
                  prediction: Number(form.prediction),
                  persistence_prediction: Number(form.persistence_prediction),
                }),
              ]);
              setForm(empty);
            });
          }}
        >
          <div className="evidence-grid">
            {Object.entries(form).map(([key, value]) => (
              <label key={key}>
                {key}
                <input
                  required
                  aria-label={'Prospective ' + key}
                  type={
                    ['issue_date', 'data_cutoff'].includes(key)
                      ? 'datetime-local'
                      : key.includes('prediction')
                        ? 'number'
                        : 'text'
                  }
                  min={0}
                  step="any"
                  value={value}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                />
              </label>
            ))}
          </div>
          <button className="button primary">Create forecast record</button>
        </form>
      )}
      {!records.length && <p>No prospective forecasts registered.</p>}
      <button
        className="button"
        onClick={() =>
          download('prospective-registry.json', {
            records,
            generated: new Date().toISOString(),
            limitations: 'Local user-entered registry; no independent timestamp guarantee.',
          })
        }
      >
        Export registry
      </button>
      <label className="button">
        Import outcomes later
        <input
          aria-label="Import prospective outcomes"
          type="file"
          accept=".json"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file)
              void file
                .text()
                .then((text) => {
                  const data = JSON.parse(text);
                  if (!Array.isArray(data))
                    throw Error('JSON array of forecast_id/outcome required.');
                  const next = [...records];
                  const seen = new Set();
                  for (const row of data) {
                    if (seen.has(row.forecast_id)) throw Error('Duplicate outcome identifier');
                    seen.add(row.forecast_id);
                    const index = next.findIndex((r) => r.forecast_id === row.forecast_id);
                    if (index < 0) throw Error('Unknown forecast identifier');
                    next[index] = attachOutcome(next[index], row.outcome);
                  }
                  save(next);
                  setMessage('Outcomes imported.');
                })
                .catch((e) => setMessage(String(e)));
          }}
        />
      </label>
      {records.map((r) => (
        <article className="panel research-evidence" key={r.forecast_id}>
          <strong>
            {r.district} · {r.target_period} · {r.status}
          </strong>
          <p>
            {r.model} prediction {r.prediction}; persistence {r.persistence_prediction}; observed{' '}
            {r.outcome ?? 'Not available'}; signed error {r.error ?? 'Not available'}.
          </p>
          <details>
            <summary>Immutable forecast provenance</summary>
            <pre>{JSON.stringify(r, null, 2)}</pre>
          </details>
          {!r.locked && (
            <button
              className="button"
              onClick={() =>
                action(() =>
                  save(
                    records.map((row) =>
                      row.forecast_id === r.forecast_id ? lockProspective(row) : row,
                    ),
                  ),
                )
              }
            >
              Lock forecast
            </button>
          )}
          {r.locked && r.outcome === null && (
            <>
              <input
                aria-label={'Outcome ' + r.district}
                type="number"
                min="0"
                value={outcomes[r.forecast_id] || ''}
                onChange={(e) => setOutcomes({ ...outcomes, [r.forecast_id]: e.target.value })}
              />
              <button
                className="button"
                onClick={() =>
                  action(() => {
                    if (!outcomes[r.forecast_id]) throw Error('Enter an outcome');
                    save(
                      records.map((row) =>
                        row.forecast_id === r.forecast_id
                          ? attachOutcome(row, Number(outcomes[r.forecast_id]))
                          : row,
                      ),
                    );
                  })
                }
              >
                Add observed outcome
              </button>
            </>
          )}
        </article>
      ))}
    </section>
  );
}
