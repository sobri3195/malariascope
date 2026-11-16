import { validateSismal, type SismalSnapshot } from './sismal';
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
  sismal: SismalSnapshot | null;
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
  const sourceError =
    q.has('source') && !['skdr', 'sismal'].includes(q.get('source')!)
      ? 'Seri sumber pada URL tidak dikenal. Pilih SKDR atau SISMAL.'
      : '';
  const [data, setData] = useState<SkdrSnapshot | null>(null),
    [error, setError] = useState(''),
    [revision, setRevision] = useState(0);
  const [sismal, setSismal] = useState<SismalSnapshot | null>(null);
  const [sismalError, setSismalError] = useState('');
  useEffect(() => {
    if (!active || sourceError || selection.source !== 'sismal') return;
    const controller = new AbortController();
    setSismal(null);
    setSismalError('');
    if (![2025, 2026].includes(selection.year)) {
      setSismalError('Tahun SISMAL belum tersedia.');
      return () => controller.abort();
    }
    void fetch(`/data/indonesia/sismal/${selection.year}.json`, { signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) throw Error(`HTTP ${r.status}`);
        const s = await r.json();
        const errors = validateSismal(s, selection.year);
        if (errors.length) throw Error(errors.join(' '));
        if (!controller.signal.aborted) setSismal(s);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setSismalError(String(e));
      });
    return () => controller.abort();
  }, [active, sourceError, selection.source, selection.year, revision]);
  const skdrId = selection.source === 'sismal' ? '2026-m44' : selection.snapshot;
  useEffect(() => {
    if (!active || sourceError) return;
    const controller = new AbortController();
    setData(null);
    setError('');
    if (!/^2026-m(?:[1-9]|[1-4]\d|5[0-3])$/.test(skdrId)) {
      setError('Versi buletin SKDR tidak sah.');
      return () => controller.abort();
    }
    void fetch(`/data/indonesia/skdr/${skdrId}.json`, { signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) throw Error(`HTTP ${r.status}`);
        const s = await r.json();
        const errors = validateSkdr(s, s?.evidence === 'attachment-extraction');
        if (s?.id !== skdrId) errors.push('Versi respons berbeda dari buletin yang diminta.');
        if (errors.length) throw Error(errors.join(' '));
        if (!controller.signal.aborted) setData(s);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(String(e));
      });
    return () => controller.abort();
  }, [active, sourceError, revision, skdrId]);
  function select(s: Partial<SkdrSelection>) {
    const next = { ...selection, ...s };
    if (s.source === 'skdr' && selection.source !== 'skdr') {
      next.year = 2026;
      next.snapshot = '2026-m44';
    }
    if (next.source === 'sismal' && (s.source || s.year !== undefined))
      next.snapshot = `sismal-${next.year}`;
    const p = new URLSearchParams(route.search);
    p.set('dataset', skdrDataset);
    p.set('source', next.source || 'skdr');
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
        sismal,
        error: sourceError || (selection.source === 'sismal' ? sismalError : error),
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
