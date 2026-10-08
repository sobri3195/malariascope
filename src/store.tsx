import {
  loadResearchPackage,
  researchDatasets,
  builtin,
  researchRows,
  studyModels,
  type ResearchPackage,
} from './research-data/research';
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
  fieldSources?: Partial<
    Record<
      import('./district-intelligence').Field,
      { source: string; checksum: string; name: string }
    >
  >;
  classification?: import('./district-intelligence').Classification;
};
export type State = {
  researchMode?: 'BUILTIN' | 'USER IMPORT';
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
  research: ResearchPackage | null;
  researchError: string;
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
  const [research, setResearch] = useState<ResearchPackage | null>(null);
  const [researchError, setResearchError] = useState('');
  const route = useLocation();
  const navigationType = useNavigationType();
  const [state, setState] = useState(() => {
    const initialState = load(),
      query = new URLSearchParams(route.search),
      dataset = query.get('dataset'),
      mode = query.get('riskMode');
    if (
      dataset !== null &&
      (dataset === '' || initialState.datasets.some((d) => d.id === dataset))
    ) {
      initialState.active = dataset;
      if (!builtin(dataset)) {
        initialState.researchMode = 'USER IMPORT';
        initialState.datasets = initialState.datasets.filter((d) => !builtin(d.id));
      }
    }
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
      (studyModels as readonly string[]).includes(params.get('model') ?? '')
        ? params.get('model')!
        : (studyModels as readonly string[]).includes(state.selection?.model ?? '')
          ? state.selection!.model
          : 'Persistence',
    );
  useEffect(() => {
    let live = true;
    void loadResearchPackage()
      .then((p) => {
        if (!live) return;
        setResearch(p);
        setState((prev) => {
          if ((prev.active && !builtin(prev.active)) || prev.researchMode === 'USER IMPORT')
            return {
              ...prev,
              researchMode: 'USER IMPORT',
              datasets: prev.datasets.filter((d) => !builtin(d.id)),
            };
          const built = researchDatasets(p);
          return {
            ...prev,
            researchMode: 'BUILTIN',
            datasets: [...prev.datasets.filter((d) => !builtin(d.id)), ...built],
            active: builtin(prev.active) ? prev.active : 'study-balanced',
            geometry: prev.geometry || p.geometry,
            geometrySource: prev.geometrySource || {
              ...p.geometryMetadata,
              checksum: p.geometryMetadata.sha256,
              created: p.geometryMetadata.retrieved,
            },
          };
        });
      })
      .catch((e) => {
        if (live) {
          setResearchError(String(e));
          setState((prev) =>
            builtin(prev.active)
              ? { ...prev, active: '', datasets: prev.datasets.filter((d) => !builtin(d.id)) }
              : prev,
          );
        }
      });
    return () => {
      live = false;
    };
  }, []);
  const projectedDatasets = useMemo(
    () =>
      state.datasets.map((d) =>
        builtin(d.id) && research && ['study-balanced', 'study-spatial'].includes(d.id)
          ? {
              ...d,
              rows: researchRows(research, model, d.id === 'study-spatial').filter(
                (r) => d.id !== 'study-spatial' || r.year === 2025,
              ),
            }
          : d,
      ),
    [state.datasets, research, model],
  );
  const effectiveState = useMemo(
    () => ({ ...state, datasets: projectedDatasets }),
    [state, projectedDatasets],
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
    if (m && (studyModels as readonly string[]).includes(m)) setModel(m);
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
        : {
            ...prev,
            riskMode: nextRisk,
            active: nextDataset,
            ...(dataset !== null && !builtin(nextDataset)
              ? {
                  researchMode: 'USER IMPORT' as const,
                  datasets: prev.datasets.filter((d) => !builtin(d.id)),
                }
              : {}),
          };
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
        ...(s.active !== undefined && !builtin(s.active)
          ? {
              researchMode: 'USER IMPORT' as const,
              datasets: (s.datasets || prev.datasets).filter((d) => !builtin(d.id)),
            }
          : s.active && builtin(s.active) && research
            ? {
                researchMode: 'BUILTIN' as const,
                datasets: [
                  ...(s.datasets || prev.datasets).filter((d) => !builtin(d.id)),
                  ...researchDatasets(research),
                ],
              }
            : {}),
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
  const rows = projectedDatasets.find((d) => d.id === state.active)?.rows || EMPTY_ROWS;
  const signals = useMemo(() => {
    const dataset = projectedDatasets.find((d) => d.id === state.active);
    return evaluate(dataset?.rows || [], state.rules, state.active, {
      datasetCreated: dataset?.created,
      datasetName: dataset?.name,
      source: dataset?.source,
      checksum: dataset?.checksum,
      classification: dataset?.classification,
      model,
      thresholds: state.thresholds,
    });
  }, [projectedDatasets, state.active, state.rules, state.thresholds, model]);
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
        state: effectiveState,
        research,
        researchError,
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
          if ((studyModels as readonly string[]).includes(s)) setModel(s);
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
