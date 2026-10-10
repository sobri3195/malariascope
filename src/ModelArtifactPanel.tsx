import { useState } from 'react';
import { validatePortableModel, predictPortable, type PortableModel } from './portable-model';
import { download } from './analytics';
export default function ModelArtifactPanel() {
  const [models, setModels] = useState<PortableModel[]>(() => {
      try {
        const a = JSON.parse(localStorage.getItem('malariascope-model-artifacts') || '[]');
        if (!Array.isArray(a)) return [];
        a.forEach(validatePortableModel);
        return a;
      } catch {
        return [];
      }
    }),
    [selected, setSelected] = useState(''),
    [inputs, setInputs] = useState<Record<string, number>>({}),
    [error, setError] = useState(''),
    [result, setResult] = useState<ReturnType<typeof predictPortable> | null>(null);
  const artifact = models.find((a) => a.version + '|' + a.model === selected);
  return (
    <section className="panel" aria-label="Portable model laboratory">
      <h2>Reproducible model laboratory</h2>
      <p>
        Import a portable JSON artifact produced by the research pipeline. Feature units and
        preprocessing are explicit. User-trained outputs do not replace supplied study results.
      </p>
      <label className="button">
        Import trained artifact
        <input
          aria-label="Import trained artifact"
          type="file"
          accept=".json"
          onChange={(e) => {
            const f = e.target.files?.[0];
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
          No trained artifact connected. Run the documented pipeline on authorized data, then import
          its JSON output.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      <details>
        <summary>Training & backtesting protocol</summary>
        <p>
          Pipeline: research/train.py. Contiguous preceding-year features, fixed seed, training-only
          scaling, rolling-origin validation, MAE bootstrap intervals and explicit calibration
          limitations. Artifacts never execute uploaded code.
        </p>
      </details>
    </section>
  );
}
