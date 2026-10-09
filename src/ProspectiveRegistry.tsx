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
const fieldLabels: Record<string, string> = {
  issue_date: 'Forecast issue date',
  target_period: 'Target period (YYYY, YYYY-MM or YYYY-MM-DD)',
  data_cutoff: 'Latest input date',
  dataset_version: 'Dataset version',
  dataset_hash: 'Dataset SHA-256',
  model_version: 'Model version',
  model: 'Model name',
  district: 'District',
  prediction: 'Model predicted cases',
  persistence_prediction: 'Persistence predicted cases',
  input_features_json: 'Optional input features (JSON numeric object)',
  interval_json: 'Optional prediction interval ([lower, upper] cases)',
};
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
  input_features_json: '',
  interval_json: '',
};
export default function ProspectiveRegistry({ monitoring = false }: { monitoring?: boolean }) {
  const { research } = useStore();
  const [records, setRecords] = useState<ProspectiveRecord[]>(() => {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem('malariascope-prospective') || '[]');
      if (
        !Array.isArray(saved) ||
        saved.some(
          (r) =>
            !r ||
            typeof r.forecast_id !== 'string' ||
            typeof r.model !== 'string' ||
            typeof r.model_version !== 'string' ||
            !Number.isFinite(r.prediction),
        )
      )
        throw Error('Invalid registry');
      return saved;
    } catch {
      return [];
    }
  });
  const [reviewThreshold, setReviewThreshold] = useState(20);
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
          <div className="table-wrap">
            <table aria-label="Prospective model cohorts">
              <thead>
                <tr>
                  <th>Model / version</th>
                  <th>Target period</th>
                  <th>Dataset version</th>
                  <th>Pairs</th>
                  <th>MAE</th>
                  <th>RMSE</th>
                  <th>Bias</th>
                  <th>Persistence MAE</th>
                </tr>
              </thead>
              <tbody>
                {monitor.groups.map((g) => (
                  <tr key={g.key}>
                    <td>
                      {g.modelName} · {g.version}
                    </td>
                    <td>{g.period}</td>
                    <td>{g.datasetVersion}</td>
                    <td>{g.model?.n}</td>
                    <td>{g.model?.mae.toFixed(2)}</td>
                    <td>{g.model?.rmse.toFixed(2)}</td>
                    <td>{g.model?.bias.toFixed(2)}</td>
                    <td>{g.persistence?.mae.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {monitor.groups.some((g) => g.duplicateDistricts.length > 0) && (
            <p role="alert">
              Ambiguous duplicate district forecasts are excluded from cohort metrics. Inspect
              original records before resolving.
            </p>
          )}
          <p>
            Each row is a separate model/version/period/dataset cohort. Metrics are never pooled
            across models. Small cohorts do not establish generalizable superiority.
          </p>
          <section className="panel">
            <h2>Residuals and interval review</h2>
            <p>
              Coverage uses only intervals registered before outcomes. Missing intervals are not
              inferred. Empirical coverage from small cohorts is not proof of nominal calibration.
            </p>
            {monitor.groups.map((g) => (
              <p key={g.key}>
                {g.modelName} / {g.version} · {g.period}: signed residual minimum / median / maximum{' '}
                {g.model
                  ? Object.values(g.model.residualDistribution)
                      .map((v) => v.toFixed(2))
                      .join(' / ')
                  : 'Unavailable'}{' '}
                ·{' '}
                {g.model?.intervalReview
                  ? `${g.model.intervalReview.n} intervals · coverage ${(g.model.intervalReview.coverage * 100).toFixed(1)}% · mean width ${g.model.intervalReview.meanWidth.toFixed(2)} cases`
                  : 'No declared prediction intervals'}
              </p>
            ))}
          </section>
          <section className="panel">
            <h2>Descriptive drift review</h2>
            <label>
              Experimental MAE increase review threshold (%)
              <input
                aria-label="MAE increase review threshold"
                type="number"
                min="0"
                value={reviewThreshold}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (Number.isFinite(v) && v >= 0) setReviewThreshold(v);
                }}
              />
            </label>
            <p>
              Compare earliest/latest periods only within the same model, version and dataset
              identity, on common districts. At least three districts required. Feature shifts
              require optional recorded input features and nonzero reference variance. They are
              descriptive, not calibrated drift tests; error shifts alone are not evidence of
              clinical degradation.
            </p>
            {monitor.drift.map((d) => (
              <p key={d.key}>
                {d.model} · {d.version}: {d.referencePeriod} → {d.currentPeriod} ·{' '}
                {d.commonDistricts} matched districts · MAE change{' '}
                {d.maeChange?.toFixed(2) ?? 'Unavailable'} · bias change{' '}
                {d.biasChange?.toFixed(2) ?? 'Unavailable'} · {d.status} ·{' '}
                {d.maePercentageChange === null
                  ? 'Review threshold unavailable (missing or zero reference MAE)'
                  : d.maePercentageChange >= reviewThreshold
                    ? 'MAE INCREASE — ANALYTICAL REVIEW'
                    : 'Below configured review threshold'}
                {d.features.map((f) => (
                  <span key={f.name}>
                    {' '}
                    · {f.name} standardized mean shift{' '}
                    {f.standardizedMeanShift?.toFixed(2) ?? 'Unavailable'} ({f.referenceN}/
                    {f.currentN} values)
                  </span>
                ))}
              </p>
            ))}
            {!monitor.drift.length && <p>No comparable completed multi-period cohorts.</p>}
          </section>
          <details>
            <summary>Advanced Technical Details</summary>
            <pre>{JSON.stringify(monitor.groups, null, 2)}</pre>
          </details>
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
                  features: form.input_features_json.trim()
                    ? JSON.parse(form.input_features_json)
                    : undefined,
                  predictionInterval: form.interval_json.trim()
                    ? JSON.parse(form.interval_json)
                    : undefined,
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
                {fieldLabels[key] || key}
                <input
                  required={!['input_features_json', 'interval_json'].includes(key)}
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
