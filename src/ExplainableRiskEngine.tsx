import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useStore } from './store';
import { download, normalize } from './analytics';
import {
  calculateRisk,
  canEditRiskScenario,
  defaultResearchModel,
  readRiskScenario,
  recordIdentity,
  riskConfiguration,
  riskEvidence,
  riskModes,
  riskVariables,
  validRiskWeights,
  type RiskCalculation,
  type RiskMode,
  type RiskWeights,
} from './risk-engine';
import { spatialRiskInputs } from './risk-spatial';
import './risk-engine.css';
const labels = {
  observed: 'Observed incidence',
  predicted: 'Predicted incidence',
  neighbor: 'Neighbor incidence',
};
const fmt = (value: number | null) =>
  value === null
    ? 'Data not available'
    : value.toLocaleString('en-GB', { maximumFractionDigits: 4 });
const modeName = (mode: string) => mode.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="panel risk-panel">
      <div className="panel-head">
        <h2>{title}</h2>
      </div>
      <div className="risk-panel-body">{children}</div>
    </section>
  );
}
function Contributions({ calculation }: { calculation: RiskCalculation }) {
  const components = [...calculation.components].sort(
    (a, b) => (b.contribution ?? -1) - (a.contribution ?? -1),
  );
  const max =
    calculation.score !== null && calculation.score > 0
      ? calculation.score
      : Math.max(1, ...components.map((c) => c.contribution ?? 0));
  return (
    <div className="risk-contributions" aria-label="Risk variable contributions">
      <h3>Variable contributions</h3>
      <p>
        {calculation.score === null
          ? 'Partial contributions only: the final score is unavailable. Missing required inputs are not reweighted.'
          : 'Bars show each variable’s additive contribution to the final score, in incidence per 1,000.'}
      </p>
      {components.map((component) => (
        <div className="risk-contribution" key={component.id}>
          <div>
            <strong>{component.label}</strong>
            <span>
              {component.weight === 0
                ? 'Excluded · weight 0'
                : component.contribution === null
                  ? 'Unavailable'
                  : `${fmt(component.contribution)} per 1,000${calculation.score !== null && calculation.score > 0 ? ` · ${fmt((component.contribution / calculation.score) * 100)}% of score` : ''}`}
            </span>
          </div>
          {component.contribution !== null ? (
            <progress
              aria-label={`${component.label} contribution`}
              value={component.contribution}
              max={max}
            />
          ) : (
            <span className="risk-missing">Missing required contribution</span>
          )}
        </div>
      ))}
    </div>
  );
}
function FormulaInspector({
  calculation,
  spatial,
  geometrySource,
  onClose,
}: {
  calculation: RiskCalculation;
  spatial: ReturnType<typeof spatialRiskInputs>[string] | undefined;
  geometrySource:
    { name: string; checksum: string; created: string; classification: string } | undefined;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    dialog.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => {
      if (opener?.isConnected) opener.focus();
    };
  }, []);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal risk-inspector"
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label="Risk calculation"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
          }
          if (e.key === 'Tab') {
            const focusable = [
              ...e.currentTarget.querySelectorAll<HTMLElement>(
                'button, a[href], input, select, textarea, summary, [tabindex="0"]',
              ),
            ].filter((el) => el.offsetParent !== null);
            const first = focusable[0],
              last = focusable.at(-1);
            if (e.shiftKey && document.activeElement === first) {
              e.preventDefault();
              last?.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first?.focus();
            }
          }
        }}
      >
        <button className="close" aria-label="Close calculation" onClick={onClose}>
          ×
        </button>
        <h2 id="risk-inspector-title">Risk Formula Inspector · {calculation.district}</h2>
        {calculation.configuration.experimental && (
          <div className="risk-experimental" role="status">
            EXPERIMENTAL RISK CONFIGURATION — NOT VERIFIED RESEARCH OUTPUT.
          </div>
        )}
        <dl className="risk-summary">
          <dt>Configuration</dt>
          <dd>
            {calculation.configuration.name} · v{calculation.configuration.version}
          </dd>
          <dt>Mode / year / model</dt>
          <dd>
            {modeName(calculation.mode)} · {calculation.year} · {calculation.model}
          </dd>
          <dt>Formula</dt>
          <dd className="risk-formula">{calculation.formula}</dd>
          <dt>Final score</dt>
          <dd>
            {fmt(calculation.score)} per 1,000 · {calculation.category}
          </dd>
          <dt>Classification threshold</dt>
          <dd>{calculation.classificationThreshold}</dd>
          <dt>Formula verification status</dt>
          <dd>{calculation.configuration.verification}</dd>
          <dt>Input verification status</dt>
          <dd>{calculation.dataVerification}</dd>
        </dl>
        <p>{calculation.normalization}</p>
        <div className="table-scroll">
          <table aria-label="Risk formula variables">
            <thead>
              <tr>
                <th>Variable</th>
                <th>Value / 1,000</th>
                <th>Normalized value</th>
                <th>Raw weight</th>
                <th>Normalized weight</th>
                <th>Contribution / 1,000</th>
              </tr>
            </thead>
            <tbody>
              {calculation.components.map((c) => (
                <tr key={c.id}>
                  <td>{c.label}</td>
                  <td>{fmt(c.value)}</td>
                  <td>{fmt(c.value)} · identity, same units</td>
                  <td>{c.weight}</td>
                  <td>{fmt(c.normalizedWeight)}</td>
                  <td>{fmt(c.contribution)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Contributions calculation={calculation} />
        <h3>Thresholds and classification</h3>
        <p>
          LOW: 0 ≤ score &lt; 100 · MODERATE: 100 ≤ score &lt; 300 · HIGH: 300 ≤ score &lt; 500 ·
          VERY HIGH: score ≥ 500. All cutoffs are in incidence per 1,000; equality enters the higher
          category. Missing required inputs yield INSUFFICIENT DATA.
        </p>
        {calculation.reasons.length > 0 && (
          <div className="notice amber-notice">
            <ul>
              {calculation.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </div>
        )}
        <h3>Raw inputs and transformations</h3>
        {calculation.components.map((c) => (
          <details key={c.id}>
            <summary>
              {c.label} · {c.weight > 0 ? 'used' : 'excluded'}
            </summary>
            <p>{c.formula}</p>
            <dl className="risk-summary">
              {c.raw.map((raw, i) => (
                <div key={i}>
                  <dt>{raw.variable}</dt>
                  <dd>{raw.value === null ? 'Data not available' : String(raw.value)}</dd>
                </div>
              ))}
            </dl>
          </details>
        ))}
        {calculation.usesGeometry && (
          <>
            <h3>Spatial inputs</h3>
            <p>{spatial?.reason}</p>
            <ul>
              {spatial?.neighbors.map((n, i) => (
                <li key={i}>
                  {n.district} · {fmt(n.value)} incidence / 1,000
                </li>
              ))}
            </ul>
            <p>
              Geometry verification status: {geometrySource?.classification || 'Not supplied'} ·
              registry metadata, not independently audited.
            </p>
            <p>Administrative geometry provenance</p>
            <pre>
              {JSON.stringify(
                geometrySource ?? {
                  status: 'Geometry metadata unavailable; verification not established',
                },
                null,
                2,
              )}
            </pre>
          </>
        )}
        <h3>Source datasets · contributing fields</h3>
        <p>
          Registry classifications are source metadata, not an independent audit. Formula
          verification and input verification are separate. Model outputs remain predictions.
        </p>
        <div className="table-scroll">
          <table aria-label="Risk input provenance">
            <thead>
              <tr>
                <th>Dataset / source</th>
                <th>District / year</th>
                <th>Field / value</th>
                <th>Verification label</th>
                <th>Checksum</th>
              </tr>
            </thead>
            <tbody>
              {calculation.references.map((ref, i) => (
                <tr key={i}>
                  <td>
                    {ref.dataset}
                    <br />
                    {ref.source}
                  </td>
                  <td>
                    {ref.district} · {ref.year}
                  </td>
                  <td>
                    {ref.field} = {String(ref.value)}
                  </td>
                  <td>{ref.classification}</td>
                  <td className="risk-checksum">{ref.checksum}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!calculation.references.length && <p>No contributing field references are available.</p>}
        {calculation.issues.length > 0 && (
          <details>
            <summary>Source conflicts and data-quality notes</summary>
            <ul>
              {calculation.issues.map((issue, i) => (
                <li key={i}>{issue}</li>
              ))}
            </ul>
          </details>
        )}
        <details>
          <summary>Exact calculation audit record</summary>
          <pre>
            {JSON.stringify(
              {
                ...calculation,
                spatial: calculation.usesGeometry ? spatial : null,
                geometrySource: calculation.usesGeometry ? geometrySource : null,
              },
              null,
              2,
            )}
          </pre>
        </details>
        <button className="button" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
export default function ExplainableRiskEngine({ filters }: { filters: ReactNode }) {
  const { state, update, year, district, model } = useStore();
  const [mode, setMode] = useState<RiskMode>('OBSERVED RISK'),
    [scope, setScope] = useState('ALL'),
    [selected, setSelected] = useState<string | null>(null),
    [weightError, setWeightError] = useState('');
  const scenario = readRiskScenario(state.riskScenario),
    configuration = riskConfiguration(scenario),
    editable = canEditRiskScenario(state.profile);
  const datasets = useMemo(
    () =>
      scope === 'ACTIVE' ? state.datasets.filter((d) => d.id === state.active) : state.datasets,
    [scope, state.datasets, state.active],
  );
  const evidence = useMemo(
    () => riskEvidence(datasets, state.active, model, year),
    [datasets, state.active, model, year],
  );
  const spatial = useMemo(
    () => spatialRiskInputs(state.geometry, evidence.records),
    [state.geometry, evidence.records],
  );
  const calculations = evidence.records.map((record) => ({
    key: recordIdentity(record),
    calculation: calculateRisk(record, mode, configuration, spatial[recordIdentity(record)]),
  }));
  const selectedIdentities = new Set(
    evidence.records
      .filter(
        (record) =>
          normalize(record.district) === normalize(district) ||
          record.references.some((ref) => normalize(ref.district) === normalize(district)),
      )
      .map(recordIdentity),
  );
  const visible = calculations.filter(
    ({ key }) => district === 'All districts' || selectedIdentities.has(key),
  );
  const detail = visible.find((row) => row.key === selected);
  function activate() {
    if (!editable) return;
    update(
      {
        riskScenario: {
          active: true,
          weights: { ...(scenario?.weights || defaultResearchModel.weights) },
        },
      },
      'Experimental risk configuration activated',
      'Separate local scenario; default model unchanged',
    );
    setWeightError('');
  }
  function setWeight(variable: keyof RiskWeights, value: string) {
    if (!editable || !configuration.experimental) return;
    const weights = {
      ...configuration.weights,
      [variable]: value.trim() === '' ? NaN : Number(value),
    };
    if (!validRiskWeights(weights)) {
      setWeightError(
        'Weights must be finite numbers from 0 to 100, with at least one positive weight. The last valid scenario remains active.',
      );
      return;
    }
    setWeightError('');
    update(
      { riskScenario: { active: true, weights } },
      'Experimental risk weights changed',
      JSON.stringify(weights),
    );
  }
  function reset() {
    update(
      { riskScenario: { active: false, weights: { ...defaultResearchModel.weights } } },
      'Risk configuration reset',
      'Immutable research defaults restored; global thresholds and source datasets unchanged',
    );
    setWeightError('');
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">TRANSPARENT RESEARCH CLASSIFICATION</div>
          <h1>Explainable Risk Engine 2.0</h1>
          <p>Inspect every variable, source, weight, contribution, and classification decision.</p>
        </div>
        <button
          className="button"
          onClick={() =>
            download('explainable-risk-calculations.json', {
              created: new Date().toISOString(),
              year,
              model,
              mode,
              scope,
              configuration,
              defaultResearchModel,
              scenario: scenario ?? null,
              calculations: visible.map((row) => ({
                ...row.calculation,
                spatial: row.calculation.usesGeometry ? spatial[row.key] : null,
                geometrySource: row.calculation.usesGeometry
                  ? (state.geometrySource ?? { status: 'Unavailable' })
                  : null,
              })),
              identityIssues: evidence.issues,
              permissionModel: 'Browser-local profile gate; not authenticated server authorization',
            })
          }
        >
          Export risk calculations
        </button>
      </div>
      {filters}
      {configuration.experimental && (
        <div className="risk-experimental" role="status">
          <strong>EXPERIMENTAL RISK CONFIGURATION — NOT VERIFIED RESEARCH OUTPUT.</strong>
          <p>
            Only this risk workspace uses these scenario weights. Default configuration, source
            data, global thresholds, GIS, and alerts retain their existing settings.
          </p>
        </div>
      )}
      {state.riskScenario && !scenario && (
        <div className="notice amber-notice">
          Stored scenario configuration is invalid and has been excluded. Default Research Model is
          active.
        </div>
      )}
      <div className="risk-controls">
        <label>
          Risk mode
          <select
            aria-label="Risk mode"
            value={mode}
            onChange={(e) => setMode(e.target.value as RiskMode)}
          >
            {riskModes.map((m) => (
              <option key={m} value={m}>
                {modeName(m)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Evidence scope
          <select
            aria-label="Risk evidence scope"
            value={scope}
            onChange={(e) => setScope(e.target.value)}
          >
            <option value="ALL">All loaded datasets</option>
            <option value="ACTIVE">Active dataset only</option>
          </select>
        </label>
        <div>
          <strong>{configuration.name}</strong>
          <p>
            Version 2 · {year} · {model}
          </p>
        </div>
      </div>
      <div className="risk-config-grid">
        <Panel title="Default Research Model">
          <p>
            Immutable, versioned baseline. Thresholds: 100 / 300 / 500 per 1,000. Composite weights:
            observed 1, predicted 1, neighbor 0.
          </p>
          <p>
            <strong>Verification status:</strong> {defaultResearchModel.verification}. Existing
            research settings are preserved as a baseline; this label does not establish
            scientifically verified output.
          </p>
          <p>
            Observed = observed incidence. Spatial = mean adjacent incidence. Model-assisted =
            predicted incidence. Composite = weighted mean of selected positive-weight components;
            every required component must be available.
          </p>
        </Panel>
        <Panel title="Experimental Scenario Model">
          <p>
            Separate local configuration. Editing is enabled for Researcher and Analyst profiles
            only. This application uses a browser-local profile gate, not authenticated server
            authorization.
          </p>
          <div className="risk-actions">
            <button
              className="button"
              disabled={!editable || configuration.experimental}
              onClick={activate}
            >
              Activate Scenario Mode
            </button>
            <button className="button" onClick={reset}>
              Reset to research defaults
            </button>
          </div>
          {!editable && (
            <p className="risk-permission">
              Your {state.profile} profile can inspect and reset scenarios but cannot activate or
              change weights.
            </p>
          )}
          <div className="risk-weights">
            {riskVariables.map((variable) => (
              <label key={variable}>
                {labels[variable]} weight
                <input
                  aria-label={`${labels[variable]} weight`}
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  disabled={!editable || !configuration.experimental}
                  value={scenario?.weights[variable] ?? defaultResearchModel.weights[variable]}
                  onChange={(e) => setWeight(variable, e.target.value)}
                />
              </label>
            ))}
          </div>
          <p>
            Weights apply to Composite Research Risk only; other modes keep their single-variable
            formula. Missing positive-weight components make the result unavailable. No weight
            editing changes the default baseline.
          </p>
          {weightError && (
            <div role="alert" className="notice amber-notice">
              {weightError}
            </div>
          )}
        </Panel>
      </div>
      <Panel title="Risk formula and thresholds">
        <div className="risk-formula">
          {calculations[0]?.calculation.formula ??
            (mode === 'COMPOSITE RESEARCH RISK'
              ? `Weighted incidence mean · weights ${configuration.weights.observed} / ${configuration.weights.predicted} / ${configuration.weights.neighbor}`
              : modeName(mode))}
        </div>
        <p>
          LOW &lt; 100 · MODERATE ≥ 100 · HIGH ≥ 300 · VERY HIGH ≥ 500, in incidence per 1,000.
          Equal-to-cutoff values enter the higher category. There is no clipping or
          dataset-dependent value normalization. These research cutoffs are not clinical
          recommendations.
        </p>
        <p>
          Scores use the selected year and model. Source conflicts are exposed; selected
          active-source values take precedence. Default Risk Engine cutoffs are fixed independently
          of legacy global thresholds. Spatial risk requires actual administrative geometry and
          every adjacent district’s valid incidence.
        </p>
      </Panel>
      <Panel title={`${modeName(mode)} · district classifications`}>
        <div className="table-scroll">
          <table aria-label="District risk calculations">
            <thead>
              <tr>
                <th>District</th>
                <th>Year</th>
                <th>Final score / 1,000</th>
                <th>Risk category</th>
                <th>Configuration</th>
                <th>Formula inspector</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.key}>
                  <td>{row.calculation.district}</td>
                  <td>{row.calculation.year}</td>
                  <td>{fmt(row.calculation.score)}</td>
                  <td>
                    <span
                      className={`risk-category risk-${row.calculation.category.toLowerCase().replaceAll(' ', '-')}`}
                    >
                      {row.calculation.category}
                    </span>
                  </td>
                  <td>{row.calculation.configuration.name}</td>
                  <td>
                    <button className="text-link" onClick={() => setSelected(row.key)}>
                      How was this risk calculated?
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!visible.length && (
          <p>
            District evidence is not connected for this selection. Import observations or choose an
            available district. No risk category is inferred from absent evidence.
          </p>
        )}
        <p>
          {visible.length} displayed districts ·{' '}
          {visible.filter((row) => row.calculation.score !== null).length} calculated scores.
          Districts without required inputs remain INSUFFICIENT DATA.
        </p>
        {evidence.issues.length > 0 && (
          <details>
            <summary>District identity issues</summary>
            <ul>
              {evidence.issues.map((issue, i) => (
                <li key={i}>{issue}</li>
              ))}
            </ul>
          </details>
        )}
      </Panel>
      {detail && (
        <FormulaInspector
          calculation={detail.calculation}
          spatial={spatial[detail.key]}
          geometrySource={state.geometrySource}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}
