import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  parseSkdrSelection,
  skdrDataset,
  validateSkdr,
  type SkdrSelection,
  type SkdrSnapshot,
} from './skdr';
const Context = createContext<{
  active: boolean;
  selection: SkdrSelection;
  data: SkdrSnapshot | null;
  error: string;
  retry: () => void;
  select: (s: Partial<SkdrSelection>) => void;
  activate: () => void;
  leave: () => void;
}>(null!);
export function SkdrProvider({ children }: { children: ReactNode }) {
  const route = useLocation(),
    navigate = useNavigate();
  const q = new URLSearchParams(route.search);
  const active = q.get('dataset') === skdrDataset;
  const selection = parseSkdrSelection(q);
  const [data, setData] = useState<SkdrSnapshot | null>(null),
    [error, setError] = useState(''),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    setData(null);
    setError('');
    void fetch('/data/indonesia/skdr/2026-m44.json', { signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) throw Error(`HTTP ${r.status}`);
        const s = await r.json();
        const errors = validateSkdr(s, s.evidence === 'attachment-extraction');
        if (errors.length) throw Error(errors.join(' '));
        if (!controller.signal.aborted) setData(s);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(String(e));
      });
    return () => controller.abort();
  }, [active, revision]);
  function select(s: Partial<SkdrSelection>) {
    const next = { ...selection, ...s };
    const p = new URLSearchParams(route.search);
    p.set('dataset', skdrDataset);
    p.set('year', String(next.year));
    p.set('snapshot', next.snapshot);
    p.set('region', next.region);
    navigate({ pathname: route.pathname, search: p.toString() });
  }
  return (
    <Context.Provider
      value={{
        active,
        selection,
        data,
        error,
        retry: () => setRevision((n) => n + 1),
        select,
        activate: () =>
          navigate(
            `${route.pathname}?dataset=${skdrDataset}&year=2026&snapshot=2026-m44&region=ID`,
          ),
        leave: () => navigate(route.pathname),
      }}
    >
      {children}
    </Context.Provider>
  );
}
export const useSkdr = () => useContext(Context);
