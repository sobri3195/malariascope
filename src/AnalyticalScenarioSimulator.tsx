import { useMemo, useState } from 'react';
import { useStore } from './store';
import { aggregateEvidence } from './district-intelligence';
import {
  SCENARIO_LABEL,
  scenarioModels,
  captureBaseline,
  baselineScore,
  category,
  simulate,
  sensitivity,
  scenarioExport,
  validSavedScenario,
  type Baseline,
  type Inputs,
  type SavedScenario,
} from './scenario-engine';
import './scenario.css';
const number = (n: number | null) =>
  n === null ? 'Unavailable' : n.toLocaleString('en-US', { maximumFractionDigits: 2 });
const labels = {
  burden: 'Malaria baseline burden',
  annualChange: 'Annual percentage change (%)',
  population: 'Population',
  rainfall: 'Rainfall anomaly (SD)',
  temperature: 'Temperature anomaly (SD)',
};
export default function AnalyticalScenarioSimulator() {
  const { state, year, district, setDistrict } = useStore();
  const districts = useMemo(
    () =>
      [
        ...new Set(
          aggregateEvidence(state.datasets, state.active, 'Persistence').records.map(
            (r) => r.district,
          ),
        ),
      ].sort(),
    [state.datasets, state.active],
  );
  const selected = districts.includes(district) ? district : (districts[0] ?? '');
  const baseline = useMemo(
    () => captureBaseline(state.datasets, state.active, selected, year, state.thresholds),
    [state.datasets, state.active, selected, year, state.thresholds],
  );
  const contextKey = JSON.stringify([
    selected,
    year,
    state.active,
    baseline.inputs,
    baseline.references,
    baseline.issues,
  ]);
  return (
    <div className="simulator">
      <h1>What-If Analytical Simulator</h1>
      <p>
        One-period arithmetic exploration. Global year and selected district determine the source
        baseline. Changing source context resets working assumptions; saved snapshots remain
        unchanged.
      </p>
      <label>
        Selected district{' '}
        <select
          aria-label="Scenario district"
          value={selected}
          onChange={(e) => setDistrict(e.target.value)}
        >
          <option value="" disabled>
            Select district
          </option>
          {districts.map((d) => (
            <option key={d}>{d}</option>
          ))}
        </select>
      </label>
      <Workspace key={contextKey} baseline={baseline} />
    </div>
  );
}
function Workspace({ baseline }: { baseline: Baseline }) {
  const { state, update } = useStore();
  const [inputs, setInputs] = useState<Inputs>(() => structuredClone(baseline.inputs));
  const [name, setName] = useState('Exploratory scenario');
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const saved = (Array.isArray(state.analyticalScenarios) ? state.analyticalScenarios : []).filter(
    validSavedScenario,
  );
  const invalid = (state.analyticalScenarios?.length ?? 0) - saved.length;
  const result = simulate(inputs),
    score = baselineScore(baseline),
    effects = sensitivity(baseline, inputs);
  const largest = effects.find((e) => e.adjusted && e.effect !== null && Math.abs(e.effect) > 0);
  const working = (): SavedScenario => ({
    id: crypto.randomUUID(),
    name: name.trim() || 'Exploratory scenario',
    created: new Date().toISOString(),
    label: SCENARIO_LABEL,
    baseline: structuredClone(baseline),
    inputs: structuredClone(inputs),
  });
  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(scenarioExport(working()), null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob),
      a = document.createElement('a');
    a.href = url;
    a.download = 'exploratory-scenario.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const save = () => {
    update(
      { analyticalScenarios: [...(state.analyticalScenarios ?? []), working()] },
      'Scenario saved',
      'Separate exploratory snapshot',
    );
    setMessage('Scenario saved locally.');
  };
  const compare = saved.filter((s) => selected.includes(s.id));
  return (
    <>
      <div className="notice amber-notice">
        {SCENARIO_LABEL}. Analytical decision support only. No causal climate inference or
        operational recommendations.
      </div>
      <div className="two-col scenario-columns">
        <section className="panel baseline-panel">
          <h2>VERIFIED BASELINE</h2>
          <p role="status">{baseline.verification}</p>
          <p>
            {baseline.district || 'No district selected'} · Observation year {baseline.year}
          </p>
          <dl>
            <dt>Observed malaria burden</dt>
            <dd>{number(baseline.inputs.burden)}</dd>
            <dt>Population</dt>
            <dd>{number(baseline.inputs.population)}</dd>
            <dt>Observed incidence per 1,000</dt>
            <dd>{number(score)}</dd>
            <dt>Baseline risk category (configured incidence cutoffs)</dt>
            <dd>{category(score, baseline.inputs.thresholds)}</dd>
          </dl>
          <details>
            <summary>Baseline provenance and assumptions</summary>
            <p>
              “VERIFIED BASELINE” denotes the comparison slot. Only sources explicitly marked
              VERIFIED carry that status. The derived score and thresholds are analytical
              configuration, not independently verified research output.
            </p>
            <p>
              Captured{' '}
              {new Date(baseline.captured).toLocaleString('en-GB', { timeZone: 'Asia/Bangkok' })}{' '}
              ICT. Climate anomalies use at least three earlier annual observations and sample
              standard deviation. Annual change requires the immediately preceding year.
            </p>
            <ul>
              {baseline.issues.map((i, k) => (
                <li key={k}>{i}</li>
              ))}
            </ul>
            {baseline.references.map((r, i) => (
              <p key={i}>
                {r.dataset} · {r.source} · {r.year} · {r.field}: {r.value} · {r.classification} ·
                checksum {r.checksum}
              </p>
            ))}
          </details>
        </section>
        <section className="panel exploratory-panel">
          <h2>EXPLORATORY SCENARIO</h2>
          <p className="scenario-label">{SCENARIO_LABEL}</p>
          <p>
            Projection period: {baseline.year + 1}. Scenario score is projected incidence per 1,000,
            not a probability.
          </p>
          {Object.entries(labels).map(([field, label]) => (
            <label className="form-row" key={field}>
              {label}
              <input
                aria-label={label}
                type="number"
                step="any"
                value={inputs[field as keyof typeof labels] ?? ''}
                onChange={(e) =>
                  setInputs({
                    ...inputs,
                    [field]: e.target.value === '' ? null : Number(e.target.value),
                  })
                }
              />
            </label>
          ))}
          <label className="form-row">
            Model selection
            <select
              aria-label="Scenario model"
              value={inputs.model}
              onChange={(e) => setInputs({ ...inputs, model: e.target.value })}
            >
              {scenarioModels.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </label>
          <fieldset>
            <legend>Experimental risk thresholds (incidence per 1,000)</legend>
            {inputs.thresholds.map((t, i) => (
              <label className="form-row" key={i}>
                {['MODERATE', 'HIGH', 'VERY HIGH'][i]} cutoff
                <input
                  aria-label={`${['MODERATE', 'HIGH', 'VERY HIGH'][i]} cutoff`}
                  type="number"
                  step="any"
                  value={Number.isFinite(t) ? t : ''}
                  onChange={(e) =>
                    setInputs({
                      ...inputs,
                      thresholds: inputs.thresholds.map((v, j) =>
                        j === i ? (e.target.value === '' ? NaN : Number(e.target.value)) : v,
                      ),
                    })
                  }
                />
              </label>
            ))}
          </fieldset>
          <button
            onClick={() => {
              setInputs(structuredClone(baseline.inputs));
              setMessage('Working assumptions reset to baseline.');
            }}
          >
            Reset to Baseline
          </button>
        </section>
      </div>
      {result.errors.length > 0 && (
        <div role="alert" className="notice">
          {result.errors.join('. ')}. No projection generated.
        </div>
      )}
      <div className="scenario-metrics">
        {[
          ['Projected analytical risk score', number(result.score)],
          ['Projected cases', number(result.cases)],
          [
            'Change from observed baseline',
            number(result.score !== null && score !== null ? result.score - score : null),
          ],
          [
            'Risk-category transition',
            `${category(score, baseline.inputs.thresholds)} → ${result.category}`,
          ],
          ['Selected model output', number(result.modelOutput)],
        ].map(([label, value]) => (
          <section key={label} className="panel exploratory-panel" aria-label={label}>
            <h3>{label}</h3>
            <strong>{value}</strong>
            <p className="scenario-label">{SCENARIO_LABEL}</p>
          </section>
        ))}
      </div>
      <section className="panel exploratory-panel">
        <h2>Formula and model support</h2>
        <p className="scenario-label">{SCENARIO_LABEL}</p>
        <p>{result.formula}</p>
        <p>{result.modelSupport}</p>
        <p>
          Changing climate assumptions records hypotheses without changing the score. Model output
          is separate from the annual-growth projection. Experimental cutoffs change classification,
          not incidence or the verified default settings.
        </p>
      </section>
      <section className="panel exploratory-panel">
        <h2>Sensitivity and contributing factors</h2>
        <p className="scenario-label">{SCENARIO_LABEL}</p>
        <p>
          Largest supported adjusted-variable effect:{' '}
          {largest ? labels[largest.field] : 'No measurable supported adjustment'}. Each effect
          restores one input to its captured baseline while keeping other inputs fixed. These
          effects overlap and must not be summed. This compares assumptions, not causal effects.
        </p>
        <div className="scenario-table">
          <table aria-label="Scenario sensitivity">
            <caption>{SCENARIO_LABEL}</caption>
            <thead>
              <tr>
                <th>Variable</th>
                <th>Baseline</th>
                <th>Scenario</th>
                <th>Score effect</th>
                <th>Evidence</th>
              </tr>
            </thead>
            <tbody>
              {effects.map((e) => (
                <tr key={e.field}>
                  <th>{labels[e.field]}</th>
                  <td>{number(baseline.inputs[e.field])}</td>
                  <td>{number(inputs[e.field])}</td>
                  <td>
                    {number(e.effect)}
                    <div
                      className="effect-bar"
                      style={{
                        width: `${Math.min(100, (Math.abs(e.effect ?? 0) / Math.max(1, ...effects.map((v) => Math.abs(v.effect ?? 0)))) * 100)}%`,
                      }}
                      aria-hidden="true"
                    />
                  </td>
                  <td>{e.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel exploratory-panel">
        <h2>Scenario library</h2>
        <p className="scenario-label">{SCENARIO_LABEL}</p>
        <label>
          Scenario name{' '}
          <input
            aria-label="Scenario name"
            value={name}
            maxLength={120}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <div className="scenario-actions">
          <button disabled={result.errors.length > 0} onClick={save}>
            Save Scenario
          </button>
          <button disabled={result.errors.length > 0} onClick={exportJSON}>
            Export Scenario JSON
          </button>
          <button
            disabled={compare.length < 2}
            onClick={() =>
              setMessage(`Comparing ${compare.length} independent scenario snapshots below.`)
            }
          >
            Compare Scenarios
          </button>
        </div>
        <p role="status">{message}</p>
        {invalid > 0 && (
          <p role="alert">
            {invalid} malformed saved records excluded from analysis; original local records
            retained.
          </p>
        )}
        {saved.map((s) => (
          <article key={s.id} className="saved-scenario">
            <label>
              <input
                type="checkbox"
                aria-label={`Compare ${s.name}`}
                checked={selected.includes(s.id)}
                onChange={(e) =>
                  setSelected(
                    e.target.checked ? [...selected, s.id] : selected.filter((id) => id !== s.id),
                  )
                }
              />
              {s.name}
            </label>
            <p>
              {SCENARIO_LABEL} · {s.baseline.district} · baseline {s.baseline.year} ·{' '}
              {new Date(s.created).toLocaleString('en-GB', { timeZone: 'Asia/Bangkok' })} ICT
            </p>
            <div className="scenario-actions">
              <button
                aria-label={`Duplicate ${s.name}`}
                onClick={() => {
                  update(
                    {
                      analyticalScenarios: [
                        ...(state.analyticalScenarios ?? []),
                        {
                          ...structuredClone(s),
                          id: crypto.randomUUID(),
                          name: s.name + ' copy',
                          created: new Date().toISOString(),
                        },
                      ],
                    },
                    'Scenario duplicated',
                  );
                  setMessage('Scenario duplicated with original baseline.');
                }}
              >
                Duplicate Scenario
              </button>
              <button
                aria-label={`Delete ${s.name}`}
                onClick={() => {
                  update(
                    {
                      analyticalScenarios: (state.analyticalScenarios ?? []).filter(
                        (v) => v.id !== s.id,
                      ),
                    },
                    'Scenario deleted',
                  );
                  setSelected(selected.filter((id) => id !== s.id));
                  setMessage('Scenario deleted locally.');
                }}
              >
                Delete Scenario
              </button>
            </div>
          </article>
        ))}
      </section>
      {compare.length >= 2 && (
        <section className="panel exploratory-panel">
          <h2>Scenario comparison</h2>
          <p>
            Each column retains its own baseline, district, period, and provenance. Differences
            across contexts are not causal effects.
          </p>
          <div className="scenario-table">
            <table aria-label="Scenario comparison">
              <caption>{SCENARIO_LABEL}</caption>
              <thead>
                <tr>
                  <th>Scenario</th>
                  <th>District / baseline year</th>
                  <th>Source status</th>
                  <th>Score</th>
                  <th>Change vs own baseline</th>
                  <th>Category</th>
                  <th>Model output</th>
                </tr>
              </thead>
              <tbody>
                {compare.map((s) => {
                  const r = simulate(s.inputs),
                    b = baselineScore(s.baseline);
                  return (
                    <tr key={s.id}>
                      <th>{s.name}</th>
                      <td>
                        {s.baseline.district} / {s.baseline.year}
                      </td>
                      <td>{s.baseline.verification}</td>
                      <td>{number(r.score)}</td>
                      <td>{number(r.score !== null && b !== null ? r.score - b : null)}</td>
                      <td>{r.category}</td>
                      <td>{number(r.modelOutput)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
