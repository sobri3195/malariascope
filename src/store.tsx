import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useMemo,
  type ReactNode,
} from 'react';
import { defaults, evaluate, type Row, type Rule } from './analytics';
import { safeRiskMode, validYear } from './workspace-context';
import { riskModes, type RiskMode } from './risk-engine';
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom';
export type Dataset = {
  id: string;
  name: string;
  rows: Row[];
  sourceRows?: Record<string, unknown>[];
  source: string;
  checksum: string;
  created: string;
  classification?: import('./district-intelligence').Classification;
};
export type State = {
  scientificSources?: import('./scientific-sources').ScientificSource[];
  facilitySnapshot?: import('./public-healthcare').FacilitySnapshot;
  mapContext?: 'local' | 'osm';
  mapOpacity?: number;
  datasets: Dataset[];
  active: string;
  rules: Rule[];
  alertStates: Record<string, { status: string; note: string }>;
  checklist: Record<string, string>;
  districtChecklists?: Record<string, Record<string, string>>;
  readinessMetadata?: import('./readiness-engine').ReadinessMetadata;
  readinessDistricts?: string[];
  districtBookmarks?: string[];
  thresholds: number[];
  analyticalScenarios?: import('./scenario-engine').SavedScenario[];
  riskScenario?: import('./risk-engine').RiskScenario;
  riskMode?: RiskMode;
  snapshots: {
    id: string;
    name: string;
    year: number;
    district: string;
    model: string;
    layer: string;
    mapLayers?: string[];
    date: string;
    view?: string;
    riskMode?: RiskMode;
    datasetVersion?: string;
    riskScenario?: State['riskScenario'];
    dataset?: string;
    thresholds?: number[];
    filters?: State['filters'];
    risk?: { district: string; risk: string }[];
  }[];
  audit: { time: string; event: string; details: string }[];
  profile: string;
  geometry: any | null;
  geometrySource?: {
    name: string;
    checksum: string;
    created: string;
    classification: string;
    source?: string;
    license?: string;
    crs?: string;
    administrativeLevel?: string;
    districtIdentifiers?: string[];
  };
  layer: string;
  reduced: boolean;
  filters?: { risk: string; region: string; mode: string; start?: number; end?: number };
  alertCreated?: Record<string, string>;
  alertLog?: (ReturnType<typeof evaluate>[number] & { timestamp: string })[];
  selection?: { year: number; district: string; model: string };
};
const initial: State = {
  datasets: [],
  active: '',
  rules: defaults,
  alertStates: {},
  checklist: {},
  thresholds: [100, 300, 500],
  snapshots: [],
  audit: [],
  profile: 'RESEARCHER',
  geometry: null,
  layer: 'boundaries',
  reduced: false,
};
function load(): State {
  try {
    const x = JSON.parse(localStorage.getItem('malariascope-v1') || 'null');
    return x ? { ...initial, ...x } : initial;
  } catch {
    return initial;
  }
}
const Context = createContext<{
  state: State;
  update: (s: Partial<State>, event?: string, details?: string) => void;
  rows: Row[];
  signals: ReturnType<typeof evaluate>;
  year: number;
  setYear: (n: number) => void;
  district: string;
  setDistrict: (s: string) => void;
  model: string;
  setModel: (s: string) => void;
  riskMode: RiskMode;
  setRiskMode: (mode: RiskMode) => void;
}>(null!);
const EMPTY_ROWS: Row[] = [];
export function Provider({ children }: { children: ReactNode }) {
  const route = useLocation();
  const navigationType = useNavigationType();
  const [state, setState] = useState(() => {
    const initialState = load(),
      query = new URLSearchParams(route.search),
      dataset = query.get('dataset'),
      mode = query.get('riskMode');
    if (dataset !== null && (dataset === '' || initialState.datasets.some((d) => d.id === dataset)))
      initialState.active = dataset;
    if (mode && riskModes.includes(mode as RiskMode)) initialState.riskMode = mode as RiskMode;
    return initialState;
  });
  const navigate = useNavigate();
  const navRef = useRef(navigate);
  navRef.current = navigate;
  const params = new URLSearchParams(route.search);
  const [year, setYear] = useState(
      validYear(Number(params.get('year')))
        ? Number(params.get('year'))
        : validYear(state.selection?.year)
          ? state.selection!.year
          : 2025,
    ),
    [district, setDistrict] = useState(
      params.get('district') || state.selection?.district || 'All districts',
    ),
    [model, setModel] = useState(
      ['Persistence', 'Ridge Regression', 'Random Forest', 'Gradient Boosting'].includes(
        params.get('model') ?? '',
      )
        ? params.get('model')!
        : ['Persistence', 'Ridge Regression', 'Random Forest', 'Gradient Boosting'].includes(
              state.selection?.model ?? '',
            )
          ? state.selection!.model
          : 'Persistence',
    );
  const riskMode = safeRiskMode(state.riskMode);
  function setRiskMode(mode: RiskMode) {
    if (riskModes.includes(mode)) update({ riskMode: mode }, 'Risk mode changed', mode);
  }
  useEffect(() => {
    // Never replay a delayed URL write over a newer local filter selection.
    // Browser back/forward and externally supplied links remain authoritative.
    if (route.state?.workspaceContextSync && navigationType !== 'POP') return;
    const p = new URLSearchParams(route.search);
    const y = Number(p.get('year'));
    if (validYear(y)) setYear(y);
    const d = p.get('district');
    if (d) setDistrict(d);
    const m = p.get('model');
    if (m && ['Persistence', 'Ridge Regression', 'Random Forest', 'Gradient Boosting'].includes(m))
      setModel(m);
    const risk = p.get('riskMode'),
      dataset = p.get('dataset');
    setState((prev) => {
      const nextRisk =
        risk && riskModes.includes(risk as RiskMode)
          ? (risk as RiskMode)
          : safeRiskMode(prev.riskMode);
      const nextDataset =
        dataset !== null && (dataset === '' || prev.datasets.some((d) => d.id === dataset))
          ? dataset
          : prev.active;
      return nextRisk === safeRiskMode(prev.riskMode) && nextDataset === prev.active
        ? prev
        : { ...prev, riskMode: nextRisk, active: nextDataset };
    });
  }, [route.search, route.key, navigationType, route.state]);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    p.set('year', String(year));
    p.set('district', district);
    p.set('model', model);
    p.set('riskMode', riskMode);
    p.set('dataset', state.active);
    navRef.current(
      { pathname: window.location.pathname, search: p.toString() },
      { replace: true, state: { workspaceContextSync: true } },
    );
    setState((prev) => {
      const next = { ...prev, selection: { year, district, model } };
      try {
        localStorage.setItem('malariascope-v1', JSON.stringify(next));
      } catch {
        /* In-memory state stays usable when storage is full. */
      }
      return next;
    });
  }, [year, district, model, riskMode, state.active]);
  function update(s: Partial<State>, event?: string, details = '') {
    setState((prev) => {
      const next = {
        ...prev,
        ...s,
        audit: event
          ? [{ time: new Date().toISOString(), event, details }, ...prev.audit].slice(0, 500)
          : prev.audit,
      };
      try {
        localStorage.setItem('malariascope-v1', JSON.stringify(next));
      } catch {
        window.dispatchEvent(
          new CustomEvent('malariascope-notice', {
            detail:
              'Browser storage is full. Changes remain in this session. Export a copy before reloading.',
          }),
        );
      }
      return next;
    });
  }
  const rows = state.datasets.find((d) => d.id === state.active)?.rows || EMPTY_ROWS;
  const signals = useMemo(() => {
    const dataset = state.datasets.find((d) => d.id === state.active);
    return evaluate(dataset?.rows || [], state.rules, state.active, {
      datasetCreated: dataset?.created,
      datasetName: dataset?.name,
      source: dataset?.source,
      checksum: dataset?.checksum,
      classification: dataset?.classification,
      model,
      thresholds: state.thresholds,
    });
  }, [state.datasets, state.active, state.rules, state.thresholds, model]);
  useEffect(() => {
    setState((prev) => {
      const additions = signals.filter(
        (a) => !(prev.alertLog || []).some((old) => old.id === a.id),
      );
      if (!additions.length) return prev;
      const now = new Date().toISOString();
      const next = {
        ...prev,
        audit: [
          {
            time: now,
            event: 'Analytical alert generated',
            details: `${additions.length} new rule-based analytical alert(s)`,
          },
          ...prev.audit,
        ].slice(0, 500),
        alertCreated: {
          ...prev.alertCreated,
          ...Object.fromEntries(additions.map((a) => [a.id, prev.alertCreated?.[a.id] || now])),
        },
        alertLog: [
          ...(prev.alertLog || []),
          ...additions.map((a) => ({ ...a, timestamp: prev.alertCreated?.[a.id] || now })),
        ],
      };
      try {
        localStorage.setItem('malariascope-v1', JSON.stringify(next));
      } catch {
        /* Local memory remains usable. */
      }
      return next;
    });
  }, [signals]);
  return (
    <Context.Provider
      value={{
        state,
        update,
        rows,
        signals,
        year,
        setYear: (n) => {
          if (validYear(n)) setYear(n);
        },
        district,
        setDistrict,
        model,
        setModel: (s) => {
          if (['Persistence', 'Ridge Regression', 'Random Forest', 'Gradient Boosting'].includes(s))
            setModel(s);
        },
        riskMode,
        setRiskMode,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export const useStore = () => useContext(Context);
