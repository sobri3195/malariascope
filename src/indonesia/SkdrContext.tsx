import { validateSkdrCatalog, type SkdrCatalog } from './skdr-catalog';
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
  catalog: SkdrCatalog | null;
  syncStatus: string;
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
  const [catalog, setCatalog] = useState<SkdrCatalog | null>(null);
  const [catalogError, setCatalogError] = useState('');
  const [sourceStatus, setSourceStatus] = useState('');
  const selection = parseSkdrSelection(q);
  if (!q.has('snapshot') && selection.source !== 'sismal' && catalog?.latest) {
    selection.snapshot = catalog.latest;
    if (!q.has('year')) selection.year = Number(catalog.latest.slice(0, 4));
  }
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
    if (!active) return;
    const controller = new AbortController();
    void fetch('/data/indonesia/sync-manifest.json', {
      signal: controller.signal,
      cache: 'no-cache',
    })
      .then(async (r) => {
        if (!r.ok) return;
        const m = await r.json();
        const attempt = Array.isArray(m.attempts)
          ? m.attempts.find((a: { source?: string }) => a.source === 'skdr')
          : null;
        if (!controller.signal.aborted)
          setSourceStatus(
            attempt?.status === 'failed'
              ? 'Memakai versi terakhir karena sumber gagal.'
              : attempt?.status === 'unchanged'
                ? 'Belum ada edisi baru.'
                : ['published', 'revised', 'saved'].includes(attempt?.status)
                  ? 'Berhasil diperbarui.'
                  : '',
          );
      })
      .catch(() => {
        /* Optional status does not invalidate versioned source assets. */
      });
    return () => controller.abort();
  }, [active, revision]);
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    setCatalogError('');
    void fetch('/data/indonesia/skdr/catalog.json', {
      signal: controller.signal,
      cache: 'no-cache',
    })
      .then(async (r) => {
        if (!r.ok) throw Error(`HTTP ${r.status}`);
        const c = validateSkdrCatalog(await r.json());
        if (!controller.signal.aborted) setCatalog(c);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setCatalogError(String(e));
      });
    return () => controller.abort();
  }, [active, revision]);
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
  const entry = catalog?.entries.find((e) => e.id === skdrId);
  const snapshotPath = entry?.path || `/data/indonesia/skdr/${skdrId}.json`;
  const expectedVersion = entry?.complete ? entry.version : null;
  const catalogReady = !!catalog || !!catalogError;
  useEffect(() => {
    if (!active || sourceError || !catalogReady) return;
    const controller = new AbortController();
    setData((previous) => (previous?.id === skdrId ? previous : null));
    setError('');
    if (!/^20\d{2}-m(?:[1-9]|[1-4]\d|5[0-3])$/.test(skdrId)) {
      setError('Versi buletin SKDR tidak sah.');
      return () => controller.abort();
    }
    void fetch(snapshotPath, { signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) throw Error(`HTTP ${r.status}`);
        const s = await r.json();
        const errors = validateSkdr(s, s?.evidence === 'attachment-extraction');
        if (
          expectedVersion !== null &&
          (s.version !== expectedVersion || s.evidence !== 'attachment-extraction')
        )
          errors.push('Identitas versi berbeda dari katalog.');
        if (s?.id !== skdrId) errors.push('Versi respons berbeda dari buletin yang diminta.');
        if (errors.length) throw Error(errors.join(' '));
        if (!controller.signal.aborted) setData(s);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(String(e));
      });
    return () => controller.abort();
  }, [active, sourceError, revision, skdrId, snapshotPath, expectedVersion, catalogReady]);
  function select(s: Partial<SkdrSelection>) {
    const next = { ...selection, ...s };
    if (s.source === 'skdr' && selection.source !== 'skdr') {
      next.snapshot = catalog?.latest || '2026-m44';
      next.year = Number(next.snapshot.slice(0, 4));
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
        catalog,
        syncStatus:
          error && data?.id === skdrId
            ? `Memakai versi terakhir karena sumber gagal: ${error}`
            : catalogError
              ? `Memakai versi terakhir karena katalog gagal: ${catalogError}`
              : sourceStatus ||
                (!catalog
                  ? 'Memuat katalog SKDR…'
                  : !catalog.latest
                    ? 'Belum ada snapshot lengkap tervalidasi; versi parsial terakhir ditampilkan.'
                    : 'Katalog versi tervalidasi dimuat.'),
        selection,
        data: sourceError ? null : data,
        sismal: sourceError ? null : sismal,
        error: sourceError || (selection.source === 'sismal' ? sismalError : error),
        retry: () => setRevision((n) => n + 1),
        select,
        activate: () => navigate(`${route.pathname}?dataset=${skdrDataset}&region=ID`),
        leave: () => navigate(route.pathname),
      }}
    >
      {children}
    </Context.Provider>
  );
}
export const useSkdr = () => useContext(Context);
