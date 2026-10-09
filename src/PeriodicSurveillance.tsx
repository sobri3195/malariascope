import { useStore } from './store';
import { useState } from 'react';
import { metricLabels, ruleMetrics, operators, download, type Condition } from './analytics';
import { evaluatePeriodic, type PeriodicRecord } from './periodic-surveillance';
export default function PeriodicSurveillance() {
  const { year, district } = useStore();
  const [cached] = useState(() => {
    try {
      const v = JSON.parse(localStorage.getItem('malariascope-periodic-surveillance') || 'null');
      if (v) {
        evaluatePeriodic(
          v.rows,
          { metric: 'cases', operator: '>', value: 20000 },
          v.frequency,
          1,
          true,
        );
        return v as { rows: PeriodicRecord[]; frequency: 'monthly' | 'weekly' };
      }
      return null;
    } catch {
      return null;
    }
  });
  const [rows, setRows] = useState<PeriodicRecord[]>(cached?.rows || []),
    [frequency, setFrequency] = useState<'monthly' | 'weekly'>(cached?.frequency || 'monthly'),
    [condition, setCondition] = useState<Condition>({
      metric: 'cases',
      operator: '>',
      value: 20000,
    }),
    [persistence, setPersistence] = useState(1),
    [suppression, setSuppression] = useState(true),
    [alerts, setAlerts] = useState<ReturnType<typeof evaluatePeriodic>>([]),
    [error, setError] = useState('');
  return (
    <section className="panel">
      <h2>Monthly & weekly surveillance</h2>
      <p>
        Independent periodic import · displayed context {year} / {district}. Evaluation uses all
        imported history for persistence; global year/district constrain displayed signals. The
        primary annual dataset is not overwritten.
      </p>
      <p>
        Separate from annual study observations. Import JSON records with district, period, source
        and metrics. Monthly period: YYYY-MM. Weekly period: Monday YYYY-MM-DD. Metric values must
        carry the declared metric meaning; monthly cases are not annual cases. No monthly
        observations are synthesized.
      </p>
      <label>
        Frequency
        <select
          value={frequency}
          onChange={(e) => {
            setFrequency(e.target.value as typeof frequency);
            setAlerts([]);
          }}
        >
          <option value="monthly">Monthly</option>
          <option value="weekly">Weekly</option>
        </select>
      </label>
      <label>
        Import period observations
        <input
          aria-label="Import period observations"
          type="file"
          accept=".json"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f)
              void f
                .text()
                .then((t) => {
                  const a = JSON.parse(t);
                  if (!Array.isArray(a)) throw Error('JSON array required');
                  evaluatePeriodic(a, condition, frequency, persistence, suppression);
                  localStorage.setItem(
                    'malariascope-periodic-surveillance',
                    JSON.stringify({ rows: a, frequency }),
                  );
                  setRows(a);
                  setAlerts([]);
                  setError('');
                })
                .catch((e) => setError(String(e)));
          }}
        />
      </label>
      <label>
        Metric
        <select
          value={condition.metric}
          onChange={(e) => {
            setCondition({ ...condition, metric: e.target.value as Condition['metric'] });
            setAlerts([]);
          }}
        >
          {ruleMetrics.map((m) => (
            <option key={m} value={m}>
              {metricLabels[m]}
            </option>
          ))}
        </select>
      </label>
      <label>
        Operator
        <select
          value={condition.operator}
          onChange={(e) => {
            setCondition({ ...condition, operator: e.target.value as Condition['operator'] });
            setAlerts([]);
          }}
        >
          {operators.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      </label>
      <label>
        Threshold
        <input
          type="number"
          step="any"
          value={condition.value}
          onChange={(e) => {
            setCondition({ ...condition, value: e.target.value === '' ? NaN : +e.target.value });
            setAlerts([]);
          }}
        />
      </label>
      {['between', 'outside range'].includes(condition.operator) && (
        <label>
          Upper bound
          <input
            type="number"
            value={condition.upper ?? ''}
            onChange={(e) => {
              setCondition({ ...condition, upper: +e.target.value });
              setAlerts([]);
            }}
          />
        </label>
      )}
      <label>
        Persistence
        <select
          aria-label="Periodic persistence"
          value={persistence}
          onChange={(e) => {
            setPersistence(+e.target.value);
            setAlerts([]);
          }}
        >
          {[1, 2, 3].map((p) => (
            <option key={p} value={p}>
              {p} consecutive periods
            </option>
          ))}
        </select>
      </label>
      <label>
        <input
          type="checkbox"
          checked={suppression}
          onChange={(e) => {
            setSuppression(e.target.checked);
            setAlerts([]);
          }}
        />
        Suppress identical uninterrupted episodes
      </label>
      <button
        className="button"
        onClick={() => {
          try {
            setAlerts(evaluatePeriodic(rows, condition, frequency, persistence, suppression));
            setError('');
          } catch (e) {
            setError(String(e));
          }
        }}
      >
        Evaluate loaded periods
      </button>
      <button
        className="button"
        onClick={() =>
          download('periodic-surveillance-alerts.json', {
            frequency,
            condition,
            alerts,
            classification: 'USER-IMPORTED PERIODIC ANALYSIS',
          })
        }
      >
        Export analytical signals
      </button>
      <p>
        {rows.length} records · {alerts.length} signals
      </p>
      {alerts
        .filter(
          (a) =>
            a.period.startsWith(String(year)) &&
            (district === 'All districts' || a.district === district),
        )
        .map((a) => (
          <article key={a.district + a.period}>
            <strong>
              {a.district} · {a.period}
            </strong>
            <p>
              {a.explanation} Source: {a.source} · value {a.comparedValue}
            </p>
          </article>
        ))}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
