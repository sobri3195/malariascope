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
import { useLocation, useNavigate } from 'react-router-dom';
export type Dataset = {
  id: string;
  name: string;
  rows: Row[];
  source: string;
  checksum: string;
  created: string;
  classification?: import('./district-intelligence').Classification;
};
export type State = {
  datasets: Dataset[];
  active: string;
  rules: Rule[];
  alertStates: Record<string, { status: string; note: string }>;
  checklist: Record<string, string>;
  districtChecklists?: Record<string, Record<string, string>>;
  districtBookmarks?: string[];
  thresholds: number[];
  snapshots: {
    id: string;
    name: string;
    year: number;
    district: string;
    model: string;
    layer: string;
    date: string;
    dataset?: string;
    thresholds?: number[];
    filters?: State['filters'];
    risk?: { district: string; risk: string }[];
  }[];
  audit: { time: string; event: string; details: string }[];
  profile: string;
  geometry: any | null;
  geometrySource?: { name: string; checksum: string; created: string; classification: string };
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
}>(null!);
const EMPTY_ROWS: Row[] = [];
export function Provider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(load);
  const route = useLocation();
  const navigate = useNavigate();
  const navRef = useRef(navigate);
  navRef.current = navigate;
  const params = new URLSearchParams(route.search);
  const [year, setYear] = useState(Number(params.get('year')) || state.selection?.year || 2025),
    [district, setDistrict] = useState(
      params.get('district') || state.selection?.district || 'All districts',
    ),
    [model, setModel] = useState(params.get('model') || state.selection?.model || 'Persistence');
  useEffect(() => {
    const p = new URLSearchParams(route.search);
    const y = Number(p.get('year'));
    if (y >= 1900 && y <= 2100) setYear(y);
    const d = p.get('district');
    if (d) setDistrict(d);
    const m = p.get('model');
    if (m && ['Persistence', 'Ridge Regression', 'Random Forest', 'Gradient Boosting'].includes(m))
      setModel(m);
  }, [route.search]);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    p.set('year', String(year));
    p.set('district', district);
    p.set('model', model);
    navRef.current({ search: p.toString() }, { replace: true });
    setState((prev) => {
      const next = { ...prev, selection: { year, district, model } };
      try {
        localStorage.setItem('malariascope-v1', JSON.stringify(next));
      } catch {
        /* In-memory state stays usable when storage is full. */
      }
      return next;
    });
  }, [year, district, model]);
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
        alert(
          'Browser storage is full. Export your data and remove unused datasets. Changes remain in this session.',
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
        setYear,
        district,
        setDistrict,
        model,
        setModel,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export const useStore = () => useContext(Context);
