import { readMLLibrary } from './ml-library-storage';
import TrainingRunInspector from './TrainingRunInspector';
import { useState } from 'react';
import { validatePortableModel, predictPortable, type PortableModel } from './portable-model';
import { download } from './analytics';
export default function ModelArtifactPanel() {
  const [library, setLibrary] = useState(() =>
    readMLLibrary('malariascope-model-artifacts', validatePortableModel, localStorage),
  );
  const [models, setModels] = useState<PortableModel[]>(library.items),
    [selected, setSelected] = useState(''),
    [inputs, setInputs] = useState<Record<string, number>>({}),
    [error, setError] = useState(''),
    [result, setResult] = useState<ReturnType<typeof predictPortable> | null>(null);
  const artifact = models.find((a) => a.version + '|' + a.model === selected);
  return (
    <>
      <TrainingRunInspector />
      <section className="panel" aria-label="Portable model laboratory">
        <h2>Reproducible model laboratory</h2>
        <p>
          Import a portable JSON artifact produced by the research pipeline. Feature units and
          preprocessing are explicit. User-trained outputs do not replace supplied study results.
        </p>
        {library.issue && (
          <section role="alert">
            <p>{library.issue}</p>
            {library.original !== null && (
              <>
                <button
                  className="button"
                  onClick={() =>
                    download('model-library-recovery.json', {
                      key: 'malariascope-model-artifacts',
                      raw: library.original,
                    })
                  }
                >
                  Export original model library
                </button>
                <button
                  className="button"
                  onClick={() => {
                    if (confirm('Clear unreadable saved models? Export original values first.')) {
                      try {
                        localStorage.removeItem('malariascope-model-artifacts');
                        setLibrary({ items: [], original: null, issue: '' });
                        setError('');
                      } catch (e) {
                        setError(String(e));
                      }
                    }
                  }}
                >
                  Clear unreadable model library
                </button>
              </>
            )}
          </section>
        )}
        <label className="button">
          Import trained artifact
          <input
            aria-label="Import trained artifact"
            type="file"
            disabled={!!library.issue}
            accept=".json"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f && f.size > 20000000) {
                setError('Artifact exceeds 20 MB');
                return;
              }
              if (f)
                void f
                  .text()
                  .then((t) => {
                    if (t.length > 20_000_000) throw Error('Artifact exceeds 20 MB');
                    const a: unknown = JSON.parse(t);
                    validatePortableModel(a);
                    const next = [
                      ...models.filter((m) => m.model !== a.model || m.version !== a.version),
                      a,
                    ];
                    localStorage.setItem('malariascope-model-artifacts', JSON.stringify(next));
                    setModels(next);
                    setSelected(a.version + '|' + a.model);
                    setInputs({});
                    setResult(null);
                    setError('');
                  })
                  .catch((e) => setError(String(e)));
            }}
          />
        </label>
        <label>
          Inspect model
          <select
            aria-label="Inspect portable model"
            value={selected}
            onChange={(e) => {
              setSelected(e.target.value);
              setInputs({});
              setResult(null);
              setError('');
            }}
          >
            <option value="">Select artifact</option>
            {models.map((m) => (
              <option key={m.version + m.model} value={m.version + '|' + m.model}>
                {m.model} · {m.version}
              </option>
            ))}
          </select>
        </label>
        {artifact && (
          <>
            <p>
              {artifact.classification} · training through {artifact.trainingEnd} · validation{' '}
              {artifact.validationPeriod}
            </p>
            <p>
              Dataset hash: <code style={{ overflowWrap: 'anywhere' }}>{artifact.datasetHash}</code>
            </p>
            {artifact.provenance ? (
              <details>
                <summary>Fitted model provenance & applicability</summary>
                <p>
                  Source: {artifact.provenance.source} · license declaration:{' '}
                  {artifact.provenance.license}. Training: {artifact.provenance.trainingStart}–
                  {artifact.trainingEnd}, {artifact.provenance.trainingRows} rows. Selection:{' '}
                  {artifact.provenance.selection.status}. Seed: {artifact.provenance.seed}.
                </p>
                <p>
                  Python {artifact.provenance.environment.python} · NumPy{' '}
                  {artifact.provenance.environment.numpy} · scikit-learn{' '}
                  {artifact.provenance.environment.scikitLearn}. Declaration and checksums do not
                  constitute independent verification.
                </p>
                <ul>
                  {artifact.features.map((f, i) => (
                    <li key={f.name}>
                      {f.name}: training range {artifact.provenance!.inputRanges[i].minimum}–
                      {artifact.provenance!.inputRanges[i].maximum} {f.unit}
                    </li>
                  ))}
                </ul>
                <pre>
                  {JSON.stringify(
                    {
                      parameters: artifact.provenance.parameters,
                      trainingHash: artifact.provenance.trainingHash,
                      codeHashes: artifact.provenance.codeHashes,
                    },
                    null,
                    2,
                  )}
                </pre>
              </details>
            ) : (
              <p role="status">
                Legacy artifact: training provenance and applicability ranges are unavailable.
              </p>
            )}
            <h3>Scenario Output — Not Observed Data</h3>
            {artifact.features.map((f) => (
              <label key={f.name}>
                {f.name} ({f.unit})
                <input
                  type="number"
                  step="any"
                  value={Number.isFinite(inputs[f.name]) ? inputs[f.name] : ''}
                  onChange={(e) => {
                    setInputs({
                      ...inputs,
                      [f.name]: e.target.value === '' ? NaN : Number(e.target.value),
                    });
                    setResult(null);
                  }}
                />
              </label>
            ))}
            <button
              className="button"
              onClick={() => {
                try {
                  setResult(predictPortable(artifact, inputs));
                  setError('');
                } catch (e) {
                  setError(String(e));
                }
              }}
            >
              Calculate exploratory model output
            </button>
            <button className="button" onClick={() => download('model-artifact.json', artifact)}>
              Export artifact
            </button>
            {result?.warnings.map((w) => (
              <p role="status" key={w}>
                {w}
              </p>
            ))}
            {result && (
              <p role="status">
                {result.label}: {result.prediction.toFixed(2)} cases{' '}
                {result.clipped ? '(negative raw output clipped to zero)' : ''}. These manually
                supplied feature values do not establish a causal climate effect.
              </p>
            )}
          </>
        )}
        {!models.length && (
          <p>
            No trained artifact connected. Run the documented pipeline on authorized data, then
            import its JSON output.
          </p>
        )}
        {error && <p role="alert">{error}</p>}
        <details>
          <summary>Training & backtesting protocol</summary>
          <p>
            Pipeline: research/train.py. Contiguous preceding-year features, fixed seed,
            training-only scaling, rolling-origin validation, MAE bootstrap intervals and explicit
            calibration limitations. Artifacts never execute uploaded code.
          </p>
        </details>
      </section>
    </>
  );
}
