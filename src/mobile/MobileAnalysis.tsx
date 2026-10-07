import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { normalize } from '../analytics';
import {
  forecastModels,
  primaryMetrics,
  loadedForecastEvidence,
  evaluateForecasts,
  studyEvaluations,
  scientificInterpretation,
  type PrimaryMetric,
} from '../forecasting';
import { buildReadinessMatrix, readinessChecklistKey, checklistStates } from '../readiness-engine';
import { inspectScientificIntegrity } from '../scientific-integrity';
import { Card, useMobile, value } from './MobileApp';
import { Indicators, MobileDistrictSelect } from './MobilePages';
function Models() {
  const { state, year, district, model, setModel } = useStore(),
    { data } = useMobile();
  const [metric, setMetric] = useState<PrimaryMetric>('mae');
  const loaded = useMemo(
    () => loadedForecastEvidence(state.datasets, state.active),
    [state.datasets, state.active],
  );
  const pairs = loaded.pairs.filter(
    (p) => district === 'All districts' || normalize(p.district) === normalize(district),
  );
  const evaluated = evaluateForecasts(pairs, [...forecastModels], year, year, metric);
  const supplied = !state.datasets.length && district === 'All districts';
  const evaluations = supplied
    ? studyEvaluations(data?.models ?? [], year, [...forecastModels], metric)
    : evaluated.evaluations;
  return (
    <>
      <h1>Model Comparison</h1>
      <label>
        Primary metric
        <select
          aria-label="Mobile primary metric"
          value={metric}
          onChange={(e) => setMetric(e.target.value as PrimaryMetric)}
        >
          {primaryMetrics.map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Selected model
        <select aria-label="Mobile model" value={model} onChange={(e) => setModel(e.target.value)}>
          {forecastModels.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
      </label>
      <Card title="Scientific interpretation">
        <p>{scientificInterpretation(evaluations, metric, evaluated.comparable)}</p>
        <p>
          {supplied
            ? 'Supplied study metrics — not independently verified. Underlying validation records are unavailable; cohort comparability cannot be audited.'
            : 'Metrics are calculated on common loaded district-year validation pairs. Missing model outputs are not inferred.'}
        </p>
      </Card>
      {evaluations.map((e) => (
        <Card key={e.model} title={`${e.rank == null ? 'Unranked' : e.rank + '.'} ${e.model}`}>
          <Indicators
            items={[
              ['MAE', value(e.metrics.mae)],
              ['RMSE', value(e.metrics.rmse)],
              ['R²', value(e.metrics.r2)],
              ['Median absolute error', value(e.metrics.medianAbsoluteError)],
              ['Prediction bias', value(e.metrics.bias)],
              ['Validation period', e.period],
              ['Validation pairs', value(e.metrics.n)],
              ['Evidence basis', e.basis],
            ]}
          />
          <button aria-pressed={model === e.model} onClick={() => setModel(e.model)}>
            Select {e.model}
          </button>
          {e.pairs.map((p) => (
            <details key={p.key}>
              <summary>
                {p.district} · absolute error {value(p.absoluteError)}
              </summary>
              <Indicators
                items={[
                  ['Observed', value(p.observed)],
                  ['Predicted', value(p.predicted)],
                  ['Residual', value(p.residual)],
                ]}
              />
            </details>
          ))}
        </Card>
      ))}
    </>
  );
}
function Readiness() {
  const { state, update, year, district, model } = useStore();
  const matrix = useMemo(
    () =>
      buildReadinessMatrix({
        datasets: state.datasets,
        active: state.active,
        year,
        model,
        checklists: state.districtChecklists ?? {},
        metadata: state.readinessMetadata,
        manualDistricts: district === 'All districts' ? state.readinessDistricts : [district],
        thresholds: state.thresholds,
      }),
    [
      state.datasets,
      state.active,
      state.districtChecklists,
      state.readinessMetadata,
      state.readinessDistricts,
      state.thresholds,
      district,
      year,
      model,
    ],
  );
  const districts = matrix.districts.filter(
    (d) => district === 'All districts' || normalize(d.district) === normalize(district),
  );
  const save = (name: string, item: string, status: string, note: string) => {
    const key = readinessChecklistKey(name, year);
    update(
      {
        districtChecklists: {
          ...state.districtChecklists,
          [key]: { ...state.districtChecklists?.[key], [item]: status },
        },
        readinessMetadata: {
          ...state.readinessMetadata,
          [key]: {
            ...state.readinessMetadata?.[key],
            [item]: { status, note, updatedAt: new Date().toISOString() },
          },
        },
      },
      'Readiness checklist saved',
      `${name} · ${year} · ${item}`,
    );
  };
  return (
    <>
      <h1>Readiness Review</h1>
      <MobileDistrictSelect />
      <p>Decision Support — Not Autonomous Clinical or Operational Recommendations</p>
      {!districts.length && <p>Data not available. Select a district or connect observations.</p>}
      {districts.map((d) => (
        <section key={d.district}>
          <h2>
            {d.district} · {year}
          </h2>
          {d.cells.map((c) => (
            <Card key={c.domain} title={c.label}>
              <span className="m-badge">{c.state}</span>
              <p>{c.reason}</p>
              <p>{c.evidenceStatus}</p>
              <p>
                <b>Missing information:</b> {c.missingInformation.join('; ') || 'None recorded'}
              </p>
              <p>
                <b>Review category:</b> {c.suggestedReviewCategory}
              </p>
              <details>
                <summary>Evidence and local checklist</summary>
                <pre>{JSON.stringify(c.triggeringData, null, 2)}</pre>
                {c.items.map((item) => (
                  <div key={item.item}>
                    <label>
                      {item.item}
                      <select
                        aria-label={`${d.district} ${item.item}`}
                        value={item.status}
                        onChange={(e) => save(d.district, item.item, e.target.value, item.note)}
                      >
                        {checklistStates.map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Local note
                      <input
                        aria-label={`${d.district} ${item.item} note`}
                        value={item.note}
                        onChange={(e) => save(d.district, item.item, item.status, e.target.value)}
                      />
                    </label>
                    <small>
                      User-entered; saved locally, not an independently connected resource feed.
                    </small>
                  </div>
                ))}
              </details>
            </Card>
          ))}
          <Card title="Readiness evidence panel">
            {['Known', 'Unknown', 'Not Connected', 'Derived', 'User-entered'].map((group) => (
              <details key={group}>
                <summary>{group}</summary>
                {d.evidence
                  .filter((e) => e.group === group)
                  .map((e, i) => (
                    <Indicators
                      key={i}
                      items={[
                        [e.label, e.value ?? 'Data not available'],
                        ['Source', e.source],
                      ]}
                    />
                  ))}
              </details>
            ))}
          </Card>
        </section>
      ))}
    </>
  );
}
function Quality() {
  const { state, year, model } = useStore();
  const reports = useMemo(
    () =>
      inspectScientificIntegrity(state.datasets, state.geometry, {
        year,
        model,
        now: new Date().toISOString(),
      }),
    [state.datasets, state.geometry, year, model],
  );
  return (
    <>
      <h1>Scientific Integrity</h1>
      <p>
        Missing fields remain part of the scoring denominator. Validation is not independent
        scientific verification.
      </p>
      {!reports.length && <p>Data not available</p>}
      {reports.map((r) => (
        <Card key={r.dataset.id} title={r.dataset.name}>
          <Indicators
            items={[
              ['Data Quality Score / 100', value(r.score)],
              ['Validation status', r.status],
              ['Records inspected', r.rowCount],
              ['GIS matched districts', `${r.gisMatched} / ${r.districtCount}`],
            ]}
          />
          <p>{r.scoreFormula}</p>
          {r.scoreComponents.map((c) => (
            <details key={c.name}>
              <summary>
                {c.name} · contribution {value(c.contribution)}
              </summary>
              <Indicators
                items={[
                  ['Weight', c.weight],
                  ['Numerator', c.numerator],
                  ['Denominator', c.denominator],
                  ['Percent', value(c.percent)],
                ]}
              />
              <p>{c.definition}</p>
            </details>
          ))}
          <details>
            <summary>Dataset health and eligibility</summary>
            <pre>
              {JSON.stringify(
                {
                  scoreFormula: r.scoreFormula,
                  scoreComponents: r.scoreComponents,
                  status: r.status,
                  fieldCompleteness: r.fieldCounts,
                  eligibility: r.eligibility,
                },
                null,
                2,
              )}
            </pre>
          </details>
          {r.issues.map((i, n) => (
            <details key={n}>
              <summary>
                {i.severity} · {i.field} · {i.row ?? 'Dataset'}
              </summary>
              <p>{i.issue}</p>
              <p>{i.action}</p>
            </details>
          ))}
        </Card>
      ))}
    </>
  );
}
export default function MobileAnalysis({ page }: { page: string }) {
  return page === 'models' ? <Models /> : page === 'readiness' ? <Readiness /> : <Quality />;
}

export function ReadinessSummary() {
  const { state, year, model, district } = useStore();
  const result = useMemo(
    () =>
      buildReadinessMatrix({
        datasets: state.datasets,
        active: state.active,
        year,
        model,
        checklists: state.districtChecklists ?? {},
        metadata: state.readinessMetadata,
        manualDistricts: [district],
        thresholds: state.thresholds,
      }),
    [
      state.datasets,
      state.active,
      state.districtChecklists,
      state.readinessMetadata,
      state.thresholds,
      year,
      model,
      district,
    ],
  );
  const candidates = result.districts.filter((d) => normalize(d.district) === normalize(district));
  return candidates.length === 1 ? (
    <Indicators items={candidates[0].cells.map((c) => [c.label, c.state])} />
  ) : (
    <p>Data not available — a unique district identity is required.</p>
  );
}
