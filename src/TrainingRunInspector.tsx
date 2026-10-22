import { readMLLibrary } from './ml-library-storage';
import { useState } from 'react';
import { useStore } from './store';
import { download } from './analytics';
import { primaryMetrics, type PrimaryMetric } from './forecasting';
import {
  rankTrainingRun,
  trainingPairs,
  trainingRunKey,
  validateTrainingRun,
  type TrainingRun,
} from './training-run';
const format = (v: number | null) =>
  v === null ? 'Unavailable' : v.toLocaleString('en-GB', { maximumFractionDigits: 2 });
export default function TrainingRunInspector() {
  const { year, district, setYear, model, setModel } = useStore();
  const [library, setLibrary] = useState(() =>
    readMLLibrary(trainingRunKey, validateTrainingRun, localStorage),
  );
  const [runs, setRuns] = useState<TrainingRun[]>(library.items);
  const [selected, setSelected] = useState(''),
    [metric, setMetric] = useState<PrimaryMetric>('mae'),
    [error, setError] = useState('');
  const identity = (r: TrainingRun) =>
    r.datasetHash +
    '|' +
    r.trainingHash +
    '|' +
    r.testYear +
    '|' +
    r.seed +
    '|' +
    JSON.stringify(r.selection) +
    '|' +
    JSON.stringify(r.codeHashes);
  const run = runs.find((r) => identity(r) === selected);
  const ranking = run ? rankTrainingRun(run, metric, year, district) : [];
  const pairs = run ? trainingPairs(run, year, district) : [];
  return (
    <section className="panel" aria-label="Audited training run inspector">
      <h2>Training run evidence & model comparison</h2>
      <p>
        Import run.json v2 from the audited pipeline. Values are checked against saved pairs; this
        is internal consistency checking, not independent scientific verification. Imported runs
        stay separate from observed research datasets.
      </p>
      {library.issue && (
        <section role="alert">
          <p>{library.issue}</p>
          {library.original !== null && (
            <>
              <button
                className="button"
                onClick={() =>
                  download('training-library-recovery.json', {
                    key: trainingRunKey,
                    raw: library.original,
                  })
                }
              >
                Export original training library
              </button>
              <button
                className="button"
                onClick={() => {
                  if (
                    confirm('Clear unreadable saved training runs? Export original values first.')
                  ) {
                    try {
                      localStorage.removeItem(trainingRunKey);
                      setLibrary({ items: [], original: null, issue: '' });
                      setError('');
                    } catch (e) {
                      setError(String(e));
                    }
                  }
                }}
              >
                Clear unreadable training library
              </button>
            </>
          )}
        </section>
      )}
      <label className="button">
        Import training run
        <input
          aria-label="Import training run"
          type="file"
          disabled={!!library.issue}
          accept=".json"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            if (f.size > 20000000) {
              setError('Training run exceeds 20 MB');
              return;
            }
            void f
              .text()
              .then((t) => {
                const r: unknown = JSON.parse(t);
                validateTrainingRun(r);
                const next = [...runs.filter((x) => identity(x) !== identity(r)), r];
                localStorage.setItem(trainingRunKey, JSON.stringify(next));
                setRuns(next);
                setSelected(identity(r));
                setError('');
              })
              .catch((e) => setError(String(e)));
          }}
        />
      </label>
      <label>
        Saved training run
        <select
          aria-label="Saved training run"
          value={selected}
          onChange={(e) => {
            setSelected(e.target.value);
            setError('');
          }}
        >
          <option value="">Select captured run</option>
          {runs.map((r) => (
            <option key={identity(r)} value={identity(r)}>
              {r.source} · {r.testYear} · seed {r.seed} · {r.datasetHash.slice(0, 12)}
            </option>
          ))}
        </select>
      </label>
      {run && (
        <>
          <p>
            {run.classification} · {run.cohortMode} cohort · source {run.source} · license
            declaration {run.license}. Training {run.trainingStart}–{run.trainingEnd} (
            {run.trainingRows} rows); final holdout {run.testYear}.
          </p>
          <p>
            Global year {year} · district {district}. This captured run has its own source hash;
            changing the primary dataset does not relabel or merge its evidence.
          </p>
          <label>
            Primary comparison metric
            <select
              aria-label="Training run primary metric"
              value={metric}
              onChange={(e) => setMetric(e.target.value as PrimaryMetric)}
            >
              {primaryMetrics.map(([k, label]) => (
                <option key={k} value={k}>
                  {label} · {k === 'r2' ? 'higher' : 'lower'} is better
                </option>
              ))}
            </select>
          </label>
          {!pairs.length ? (
            <p role="status">
              No captured holdout pairs match the global year/district selection.{' '}
              <button className="button" onClick={() => setYear(run.testYear)}>
                Show captured holdout year
              </button>
            </p>
          ) : (
            <>
              <p>
                Leaderboard recalculated from {new Set(pairs.map((p) => p.district)).size} selected
                districts. A ranking is not proof of model superiority.
              </p>
              {!ranking.length && (
                <p role="status">
                  Selected metric is unavailable for this cohort. R² requires nonconstant observed
                  outcomes; unavailable values are never ranked.
                </p>
              )}
              <div className="table-wrap">
                <table aria-label="Training run leaderboard">
                  <thead>
                    <tr>
                      <th>Rank</th>
                      <th>Model</th>
                      <th>Pairs</th>
                      <th>MAE</th>
                      <th>RMSE</th>
                      <th>R²</th>
                      <th>Median absolute error</th>
                      <th>Bias</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ranking.map((r, i) => (
                      <tr key={r.model}>
                        <td>{i + 1}</td>
                        <td>
                          <button
                            className="text-link"
                            aria-pressed={model === r.model}
                            onClick={() => setModel(r.model)}
                          >
                            {r.model}
                          </button>
                        </td>
                        <td>{r.metrics.n}</td>
                        <td>{format(r.metrics.mae)}</td>
                        <td>{format(r.metrics.rmse)}</td>
                        <td>{format(r.metrics.r2)}</td>
                        <td>{format(r.metrics.medianAbsoluteError)}</td>
                        <td>{format(r.metrics.bias)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <details>
            <summary>Captured full-cohort diagnostics (independent of display filters)</summary>
            <p>
              Bootstrap intervals are descriptive under spatial dependence. Marginal permutation
              importance is neither causal nor an intervention estimate.
            </p>
            {run.leaderboard.map((r) => (
              <article key={r.model}>
                <h3>{r.model}</h3>
                <p>
                  Selection: {run.selection[r.model].status}; pre-holdout folds:{' '}
                  {run.selection[r.model].folds.join(', ') || 'None'}.
                </p>
                {r.pairedComparisons.map((c) => (
                  <p key={c.reference}>
                    {r.model} minus {c.reference}: MAE difference {format(c.maeDifference)} · 95%
                    paired bootstrap [{format(c.lower)}, {format(c.upper)}] · {c.n} districts ·{' '}
                    {c.crossesZero
                      ? 'Interval crosses zero; superiority not established'
                      : 'Descriptive interval excludes zero; independent superiority not established'}
                  </p>
                ))}
                {r.featureImportance && (
                  <>
                    <p>
                      {r.featureImportance.basis}. {r.featureImportance.limitation}
                    </p>
                    <ul>
                      {r.featureImportance.values.map((f) => (
                        <li key={f.feature}>
                          {f.feature}: permuted MAE increase {format(f.meanMAEIncrease)} cases (SD{' '}
                          {format(f.standardDeviation)}, {f.repeats} repeats)
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </article>
            ))}
          </details>
          <details>
            <summary>Exclusions, backtests & reproducibility</summary>
            <p>{run.protocol}</p>
            <p>
              {run.excluded.length} excluded observations · {run.ignoredFuture.length} eligible
              post-holdout rows ignored · {run.rollingOrigin.length} pre-holdout model/fold
              evaluations.
            </p>
            <ul>
              {run.limitations.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
            <pre>
              {JSON.stringify(
                {
                  datasetHash: run.datasetHash,
                  trainingHash: run.trainingHash,
                  environment: run.environment,
                  codeHashes: run.codeHashes,
                  selection: run.selection,
                  rollingOrigin: run.rollingOrigin,
                  excluded: run.excluded,
                  ignoredFuture: run.ignoredFuture,
                },
                null,
                2,
              )}
            </pre>
          </details>
          <button className="button" onClick={() => download('captured-training-run.json', run)}>
            Export captured training run
          </button>
          <button
            className="button"
            onClick={() => {
              if (confirm('Delete this captured local training run? Export it first if needed.')) {
                try {
                  const next = runs.filter((r) => identity(r) !== selected);
                  localStorage.setItem(trainingRunKey, JSON.stringify(next));
                  setRuns(next);
                  setSelected('');
                } catch (e) {
                  setError(String(e));
                }
              }
            }}
          >
            Delete captured training run
          </button>
        </>
      )}
      {!runs.length && (
        <p>
          No audited training run loaded. Run research/train.py on authorized annual data; use
          --tune for bounded pre-holdout selection.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
