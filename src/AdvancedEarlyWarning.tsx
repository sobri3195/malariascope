import { validExpression, type Expression } from './rule-expression';
import { useEffect, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useStore } from './store';
import {
  defaults,
  normalize,
  metricLabels,
  operators,
  ruleMetrics,
  ruleText,
  validCondition,
  type Condition,
  type Rule,
} from './analytics';
import { ruleTemplates } from './warning-templates';
import './warning.css';
function ConditionEditor({
  value,
  onChange,
  secondary = false,
}: {
  value: Condition;
  onChange: (c: Condition) => void;
  secondary?: boolean;
}) {
  const prefix = secondary ? 'Secondary' : 'Rule';
  return (
    <div className="warning-condition">
      <label>
        Metric
        <select
          aria-label={`${prefix} metric`}
          value={value.metric}
          onChange={(e) => onChange({ ...value, metric: e.target.value as Rule['metric'] })}
        >
          {ruleMetrics.map((metric) => (
            <option key={metric} value={metric}>
              {metricLabels[metric]}
            </option>
          ))}
        </select>
      </label>
      <label>
        Operator
        <select
          aria-label={`${prefix} operator`}
          value={value.operator}
          onChange={(e) =>
            onChange({
              ...value,
              operator: e.target.value as Condition['operator'],
              upper: value.upper ?? value.value + 10,
            })
          }
        >
          {operators.map((operator) => (
            <option key={operator}>{operator}</option>
          ))}
        </select>
      </label>
      <label>
        {['between', 'outside range'].includes(value.operator) ? 'Lower bound' : 'Threshold'}
        <input
          aria-label={`${prefix} threshold`}
          type="number"
          step="any"
          required
          value={Number.isNaN(value.value) ? '' : value.value}
          onChange={(e) =>
            onChange({ ...value, value: e.target.value === '' ? NaN : +e.target.value })
          }
        />
      </label>
      {['between', 'outside range'].includes(value.operator) && (
        <label>
          Upper bound
          <input
            aria-label={`${prefix} upper bound`}
            type="number"
            step="any"
            required
            min={value.value}
            value={value.upper ?? ''}
            onChange={(e) =>
              onChange({ ...value, upper: e.target.value === '' ? undefined : +e.target.value })
            }
          />
        </label>
      )}
      {['increased by', 'decreased by'].includes(value.operator) && (
        <p className="warning-hint">
          Threshold is a percentage change of this metric against the previous adjacent year. A
          missing or nonpositive baseline cannot trigger.
        </p>
      )}
    </div>
  );
}
function ExpressionEditor({
  value,
  onChange,
  depth = 0,
}: {
  value: Expression;
  onChange: (e: Expression) => void;
  depth?: number;
}) {
  if (!('children' in value))
    return (
      <div>
        <ConditionEditor value={value} onChange={onChange} />
        {depth < 4 && (
          <button
            type="button"
            className="button"
            onClick={() => onChange({ join: 'AND', children: [value] })}
          >
            Create condition group
          </button>
        )}
      </div>
    );
  return (
    <fieldset>
      <legend>Condition group</legend>
      <select
        aria-label="Group join"
        value={value.join}
        onChange={(e) => onChange({ ...value, join: e.target.value as 'AND' | 'OR' })}
      >
        <option>AND</option>
        <option>OR</option>
      </select>
      {value.children.map((c, i) => (
        <div key={i}>
          <ExpressionEditor
            value={c}
            depth={depth + 1}
            onChange={(next) =>
              onChange({ ...value, children: value.children.map((x, j) => (j === i ? next : x)) })
            }
          />
          <button
            type="button"
            className="button"
            disabled={value.children.length === 1}
            onClick={() =>
              onChange({ ...value, children: value.children.filter((_, j) => j !== i) })
            }
          >
            Remove condition
          </button>
        </div>
      ))}
      <button
        type="button"
        className="button"
        disabled={value.children.length >= 10}
        onClick={() =>
          onChange({
            ...value,
            children: [...value.children, { metric: 'cases', operator: '>', value: 20000 }],
          })
        }
      >
        Add condition
      </button>
    </fieldset>
  );
}
function RuleCard({ rule }: { rule: Rule }) {
  const { state, update, signals } = useStore();
  const draftKey = `malariascope-rule-draft:${rule.id}`;
  const [draft, setDraft] = useState(() => {
      try {
        const saved = JSON.parse(localStorage.getItem(draftKey) || 'null');
        return saved && saved.baseRevision === (rule.revision || 0) && saved.draft?.id === rule.id
          ? (saved.draft as Rule)
          : rule;
      } catch {
        return rule;
      }
    }),
    [error, setError] = useState('');
  const edit = (patch: Partial<Rule>) => setDraft((prev) => ({ ...prev, ...patch }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(rule);
  useEffect(() => {
    try {
      if (dirty)
        localStorage.setItem(draftKey, JSON.stringify({ baseRevision: rule.revision || 0, draft }));
      else localStorage.removeItem(draftKey);
    } catch {
      setError('Draft could not be saved locally. Save the rule before leaving.');
    }
  }, [draft, draftKey, dirty, rule.revision]);
  const matches = signals.filter((a) => a.rule === rule.id);
  const historical = (state.alertLog || []).filter(
    (a) => a.rule === rule.id && a.sourceDataset.id === state.active,
  );
  const districts = new Set([...matches, ...historical].map((a) => normalize(a.district))).size;
  const latest = [...historical].sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0];
  function save() {
    if (
      !validCondition(draft) ||
      (draft.secondary && !validCondition(draft.secondary)) ||
      (draft.expression && !validExpression(draft.expression))
    ) {
      setError(
        'Enter finite thresholds; range upper bounds must be at least the lower bound. Percentage-change thresholds must be nonnegative.',
      );
      return;
    }
    update(
      {
        rules: state.rules.map((r) =>
          r.id === rule.id ? { ...draft, revision: (rule.revision || 0) + 1 } : r,
        ),
      },
      'Analytical rule saved',
      rule.id,
    );
    try {
      localStorage.removeItem(draftKey);
    } catch {
      /* Storage warning is handled separately. */
    }
    setError('');
  }
  return (
    <article
      id={`rule-${rule.id}`}
      className="warning-rule"
      aria-label={`Rule ${rule.name || rule.id}`}
    >
      <div className="warning-rule-head">
        <h2>{rule.name || rule.id}</h2>
        <span className={`badge ${rule.enabled ? 'teal' : 'neutral'}`}>
          {rule.enabled ? 'ACTIVE' : 'INACTIVE'}
        </span>
      </div>
      <p className="warning-stats">
        {districts} triggered districts · {matches.length} current signals · Last triggered:{' '}
        {latest
          ? new Date(latest.timestamp).toLocaleString('en-GB', { timeZone: 'Asia/Bangkok' }) +
            ' ICT'
          : 'Never recorded'}
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <details>
          <summary>Advanced nested conditions</summary>
          <p>
            Nested groups support up to four levels and ten conditions per group. When enabled this
            expression replaces the simple IF conditions below.
          </p>
          <label>
            <input
              type="checkbox"
              checked={!!draft.expression}
              onChange={(e) =>
                edit({
                  expression: e.target.checked
                    ? {
                        join: 'AND',
                        children: [
                          {
                            metric: draft.metric,
                            operator: draft.operator,
                            value: draft.value,
                            upper: draft.upper,
                          },
                        ],
                      }
                    : undefined,
                })
              }
            />
            Use nested expression
          </label>
          {draft.expression && (
            <ExpressionEditor
              value={draft.expression}
              onChange={(expression) => edit({ expression })}
            />
          )}
        </details>
        <div className="warning-meta">
          <label>
            Rule name
            <input
              aria-label="Rule name"
              maxLength={100}
              value={draft.name || ''}
              onChange={(e) => edit({ name: e.target.value })}
            />
          </label>
          <label>
            Priority
            <select
              aria-label="Rule priority"
              value={draft.priority || 'NORMAL'}
              onChange={(e) => edit({ priority: e.target.value as Rule['priority'] })}
            >
              {['LOW', 'NORMAL', 'HIGH', 'URGENT'].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label>
            Category
            <input
              aria-label="Rule category"
              maxLength={80}
              value={draft.category || 'Surveillance'}
              onChange={(e) => edit({ category: e.target.value })}
            />
          </label>
        </div>
        <label>
          Description
          <textarea
            aria-label="Rule description"
            maxLength={500}
            value={draft.description || ''}
            onChange={(e) => edit({ description: e.target.value })}
          />
        </label>
        <strong className="warning-keyword">IF</strong>
        <ConditionEditor value={draft} onChange={edit} />
        <label>
          Additional condition
          <select
            aria-label="Additional condition"
            value={draft.secondary ? draft.join || 'AND' : 'NONE'}
            onChange={(e) =>
              edit(
                e.target.value === 'NONE'
                  ? { secondary: undefined, join: undefined }
                  : {
                      join: e.target.value as Rule['join'],
                      secondary: draft.secondary || { metric: 'change', operator: '>', value: 20 },
                    },
              )
            }
          >
            <option value="NONE">No additional condition</option>
            <option>AND</option>
            <option>OR</option>
          </select>
        </label>
        {draft.secondary && (
          <ConditionEditor
            secondary
            value={draft.secondary}
            onChange={(secondary) => edit({ secondary })}
          />
        )}
        <div className="warning-meta">
          <label>
            Persistence
            <select
              aria-label="Rule persistence"
              value={draft.persistence || 1}
              onChange={(e) => edit({ persistence: +e.target.value as Rule['persistence'] })}
            >
              <option value={1}>Trigger immediately</option>
              <option value={2}>After 2 consecutive periods</option>
              <option value={3}>After 3 consecutive periods</option>
            </select>
          </label>
          <label>
            THEN severity
            <select
              aria-label="Rule severity"
              value={draft.severity}
              onChange={(e) => edit({ severity: e.target.value })}
            >
              {['INFO', 'WATCH', 'MODERATE', 'HIGH', 'CRITICAL ANALYTICAL SIGNAL'].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="warning-switches">
          <label>
            <input
              aria-label="Rule active"
              type="checkbox"
              checked={draft.enabled}
              onChange={(e) => edit({ enabled: e.target.checked })}
            />{' '}
            Active
          </label>
          <label>
            <input
              aria-label="Suppress repeated alerts"
              type="checkbox"
              checked={!!draft.suppress}
              onChange={(e) => edit({ suppress: e.target.checked })}
            />{' '}
            Suppress repeats until the expression clears or a period is missing
          </label>
        </div>
        <p className="warning-preview">{ruleText(draft)}</p>
        {dirty && (
          <p className="warning-draft" role="status">
            Unsaved edits — alerts continue to use the saved rule until you save.
          </p>
        )}
        {error && <p role="alert">{error}</p>}
        <div className="warning-actions">
          <button className="button primary" type="submit" disabled={!dirty}>
            Save rule
          </button>
          <button
            className="button"
            type="button"
            disabled={!dirty}
            onClick={() => {
              setDraft(rule);
              setError('');
            }}
          >
            Discard edits
          </button>
          <button
            className="button"
            type="button"
            onClick={() =>
              update(
                {
                  rules: [
                    ...state.rules,
                    {
                      ...rule,
                      id: crypto.randomUUID(),
                      name: `${rule.name || rule.id} copy`,
                      revision: undefined,
                    },
                  ],
                },
                'Rule duplicated',
              )
            }
          >
            Duplicate rule
          </button>
          <button
            className="button"
            type="button"
            onClick={() =>
              update(
                { rules: state.rules.filter((r) => r.id !== rule.id) },
                'Rule deleted',
                rule.id,
              )
            }
          >
            Delete rule
          </button>
        </div>
      </form>
    </article>
  );
}
export default function AdvancedEarlyWarning() {
  const { state, update, rows, signals, model } = useStore();
  const [template, setTemplate] = useState('High Burden');
  const [query, setQuery] = useState(''),
    [status, setStatus] = useState('ALL'),
    [priority, setPriority] = useState('ALL');
  const [page, setPage] = useState(0);
  const newRule = useRef<string | null>(null);
  useEffect(() => {
    if (!newRule.current) return;
    const target = document.getElementById(`rule-${newRule.current}`);
    if (!target) return;
    target.scrollIntoView({ block: 'start' });
    target
      .querySelector<HTMLInputElement>('input[aria-label="Rule name"]')
      ?.focus({ preventScroll: true });
    newRule.current = null;
  }, [state.rules, page]);
  const visible = new Set(
    state.rules
      .filter((rule) => {
        const text = [rule.name, rule.id, rule.category, rule.description, ruleText(rule)]
          .join(' ')
          .toLowerCase();
        return (
          text.includes(query.trim().toLowerCase()) &&
          (status === 'ALL' || (status === 'ACTIVE' ? rule.enabled : !rule.enabled)) &&
          (priority === 'ALL' || (rule.priority || 'NORMAL') === priority)
        );
      })
      .map((rule) => rule.id),
  );
  const ids = [...visible];
  const displayPage = Math.min(page, Math.max(0, Math.ceil(ids.length / 20) - 1));
  const pageIds = new Set(ids.slice(displayPage * 20, displayPage * 20 + 20));
  function clearFilters() {
    setPage(0);
    setQuery('');
    setStatus('ALL');
    setPriority('ALL');
  }
  const activeDataset = state.datasets.find((d) => d.id === state.active);
  function add(templateName?: string) {
    const id = crypto.randomUUID();
    newRule.current = id;
    clearFilters();
    setPage(Math.floor(state.rules.length / 20));
    const chosen = ruleTemplates.find((t) => t.name === templateName);
    update(
      {
        rules: [
          ...state.rules,
          {
            ...(chosen?.rule || {
              metric: 'cases',
              operator: '>',
              value: 10000,
              enabled: false,
              severity: 'WATCH',
              priority: 'NORMAL',
              persistence: 1,
              suppress: true,
            }),
            name: chosen?.name || 'Custom rule',
            id,
          },
        ],
      },
      'Analytical rule created',
    );
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Early Warning Center</h1>
          <p>Configurable analytical surveillance · explicit rules and traceable evidence</p>
        </div>
        <button className="button primary" onClick={() => add()}>
          Add rule
        </button>
      </div>
      <div className="notice">
        Analytical decision support only. Signals describe loaded data and do not provide autonomous
        clinical or military recommendations.
      </div>
      <div className="warning-summary">
        <span>
          <strong>{signals.length}</strong> current signals
        </span>
        <span>
          <strong>{new Set(signals.map((a) => a.district)).size}</strong> triggered districts
        </span>
        <span>
          <strong>{state.rules.filter((r) => r.enabled).length}</strong> active rules
        </span>
        <NavLink className="text-link" to="/alerts">
          Review generated alerts →
        </NavLink>
      </div>
      <section className="warning-rule">
        <h2>Rule templates</h2>
        <div className="warning-actions">
          <label>
            Template
            <select
              aria-label="Rule template"
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
            >
              {ruleTemplates.map((t) => (
                <option key={t.name}>{t.name}</option>
              ))}
            </select>
          </label>
          <button className="button" onClick={() => add(template)}>
            Add template
          </button>
          <button
            className="button"
            onClick={() => {
              for (const r of state.rules)
                try {
                  localStorage.removeItem(`malariascope-rule-draft:${r.id}`);
                } catch {
                  /* Existing persistence warning remains visible. */
                }
              update(
                {
                  rules: defaults.map((r) => ({
                    ...r,
                    revision: (state.rules.find((old) => old.id === r.id)?.revision || 0) + 1,
                  })),
                },
                'Default alert rules restored',
              );
            }}
          >
            Reset defaults
          </button>
        </div>
        <p>{ruleTemplates.find((t) => t.name === template)?.rule.description}</p>
      </section>
      <p className="warning-hint">
        Source: {activeDataset?.name || 'No surveillance dataset connected'} · {rows.length}{' '}
        district-year observations · Model: {model}. Rules evaluate all available years in the
        active dataset. Save edits to activate the new rule revision; recorded alerts retain their
        original rule and evidence.
      </p>
      {!state.rules.length && <p>No rules configured. Add a rule or template to begin.</p>}
      {!!state.rules.length && (
        <section className="warning-browser" aria-label="Rule library filters">
          <div className="warning-browser-controls">
            <label>
              Search saved rules
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Name, description or rule expression"
              />
            </label>
            <label>
              Rule status
              <select
                aria-label="Rule status"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="ALL">All statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </select>
            </label>
            <label>
              Rule priority filter
              <select
                aria-label="Rule priority filter"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
              >
                <option value="ALL">All priorities</option>
                {['LOW', 'NORMAL', 'HIGH', 'URGENT'].map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </label>
            <button
              className="button"
              onClick={clearFilters}
              disabled={!query && status === 'ALL' && priority === 'ALL'}
            >
              Clear rule filters
            </button>
          </div>
          <p role="status">
            Showing {visible.size} of {state.rules.length} saved rules. All active saved rules
            remain evaluated.
          </p>
          {!visible.size && (
            <div className="warning-no-results">
              <strong>No matching rules</strong>
              <p>Change the search or clear filters to return to your rule library.</p>
              <button className="button" onClick={clearFilters}>
                Show all rules
              </button>
            </div>
          )}
        </section>
      )}
      <div className="toolbar">
        <button
          className="button"
          disabled={displayPage === 0}
          onClick={() => setPage(displayPage - 1)}
        >
          Previous rule page
        </button>
        <span>
          Rule page {displayPage + 1} of {Math.max(1, Math.ceil(ids.length / 20))} · 20 editors per
          page
        </span>
        <button
          className="button"
          disabled={(displayPage + 1) * 20 >= ids.length}
          onClick={() => setPage(displayPage + 1)}
        >
          Next rule page
        </button>
      </div>
      {state.rules
        .filter((rule) => pageIds.has(rule.id))
        .map((rule) => (
          <div key={`${rule.id}:${rule.revision || 0}`} hidden={!visible.has(rule.id)}>
            <RuleCard rule={rule} />
          </div>
        ))}
      <details className="warning-rule">
        <summary>Metric definitions and evaluation policy</summary>
        <p>
          Annual periods are consecutive only when year differs by exactly one. The entire AND/OR
          expression must match in each required period. Missing inputs never satisfy numeric
          comparisons; OR may match its other available condition. Inclusive between / exclusive
          outside range; increased by and decreased by compare the chosen metric as a percentage
          against an adjacent positive baseline.
        </p>
        <p>
          Rolling average requires three contiguous observed years. Climate anomalies use all
          earlier available district climate observations (at least three), sample SD, and no future
          values. Prediction deviation uses the mean of up to three earlier observed periods; zero
          baselines are unavailable. Forecast inputs must match the selected model. Signed residual
          = predicted − observed; absolute error remains a separate metric.
        </p>
        <p>
          Risk encoding: LOW = 0, MODERATE = 1, HIGH = 2, VERY HIGH = 3, using global incidence
          cutoffs {state.thresholds.join(' / ')} per 1,000. Missing population or cases means
          unknown risk. Completeness = available cases, population, rainfall, temperature, humidity,
          and selected-model prediction / 6 × 100.
        </p>
        <p>
          Dataset age is elapsed days since the registry ingestion timestamp at evaluation, not the
          surveillance year or source publication date. Re-evaluated on workspace load or
          rule/source/model changes. Registry age is available only for the latest loaded
          district-year; historical ingestion snapshots are unavailable, so dataset-age persistence
          or percentage changes cannot be confirmed. Suppression emits one signal when persistence
          is first satisfied in an uninterrupted episode; it rearms after a false/unknown expression
          or missing annual period. Reopening the workspace does not duplicate the recorded alert.
          Inactive rules generate no new alerts; historical snapshots remain reviewable.
        </p>
      </details>
    </>
  );
}
