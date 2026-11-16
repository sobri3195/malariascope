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
import {
  validateCatalog,
  resolvePublication,
  type PublicationCatalog,
  type PublicationSource,
  type PublishedVersion,
} from './publication-catalog';
const Context = createContext<{
  active: boolean;
  selection: SkdrSelection;
  data: SkdrSnapshot | null;
  sismal: SismalSnapshot | null;
  catalog: PublicationCatalog | null;
  publication: PublishedVersion | null;
  sourceCheck: PublicationSource | null;
  manifestWarning: string;
  requestedSnapshot: string;
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
  const parsed = parseSkdrSelection(q);
  const requestedSnapshot = q.get('snapshot') || 'latest';
  const sourceError =
    q.has('source') && !['skdr', 'sismal'].includes(q.get('source')!)
      ? 'Seri sumber pada URL tidak dikenal. Pilih SKDR atau SISMAL.'
      : '';
  const [catalog, setCatalog] = useState<PublicationCatalog | null>(null);
  const [manifestWarning, setManifestWarning] = useState('');
  const [data, setData] = useState<SkdrSnapshot | null>(null),
    [sismal, setSismal] = useState<SismalSnapshot | null>(null);
  const [loadedHash, setLoadedHash] = useState('');
  const [error, setError] = useState(''),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    setManifestWarning('');
    void fetch('/data/indonesia/manifest.json', { signal: controller.signal, cache: 'no-store' })
      .then(async (r) => {
        if (!r.ok) throw Error(`HTTP ${r.status}`);
        const value: unknown = await r.json();
        validateCatalog(value);
        if (!controller.signal.aborted) setCatalog(value);
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setManifestWarning(
            `Manifest gagal diperiksa: ${String(e)}. Jika tersedia, katalog terakhir dalam sesi tetap digunakan.`,
          );
      });
    return () => controller.abort();
  }, [active, revision]);
  const resolved = catalog
    ? resolvePublication(
        catalog,
        parsed.source || 'skdr',
        q.has('year') ? parsed.year : undefined,
        requestedSnapshot,
      )
    : null;
  const publication = resolved?.version || null,
    sourceCheck = resolved?.source || null;
  const selection: SkdrSelection = {
    ...parsed,
    year: publication?.year ?? parsed.year,
    snapshot: publication?.publicationId ?? parsed.snapshot,
    ...(publication ? { versionId: publication.id } : {}),
  };
  const path = publication?.path,
    expectedHash = publication?.dataSha256,
    expectedId = publication?.publicationId,
    expectedYear = publication?.year;
  const kind = parsed.source || 'skdr';
  useEffect(() => {
    if (!active || sourceError) return;
    const controller = new AbortController();
    setData(null);
    setSismal(null);
    setError('');
    if (!path || !expectedHash) return () => controller.abort();
    void fetch(path, { signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) throw Error(`HTTP ${r.status}`);
        const bytes = await r.arrayBuffer();
        const digest = await crypto.subtle.digest('SHA-256', bytes);
        const hash = [...new Uint8Array(digest)]
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');
        if (hash !== expectedHash) throw Error('Checksum snapshot berbeda dari manifest.');
        const s = JSON.parse(new TextDecoder().decode(bytes));
        const errors =
          kind === 'sismal'
            ? validateSismal(s, expectedYear!)
            : validateSkdr(s, s?.evidence === 'attachment-extraction');
        if (s?.id !== expectedId || (kind === 'skdr' && s?.rows?.[0]?.year !== expectedYear))
          errors.push('Versi/tahun respons berbeda dari manifest.');
        if (errors.length) throw Error(errors.join(' '));
        if (!controller.signal.aborted) {
          setLoadedHash(expectedHash);
          if (kind === 'sismal') setSismal(s);
          else setData(s);
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(String(e));
      });
    return () => controller.abort();
  }, [active, sourceError, revision, path, expectedHash, expectedId, expectedYear, kind]);
  function select(s: Partial<SkdrSelection>) {
    const next = { ...selection, ...s };
    const changedSeries = s.source !== undefined && s.source !== selection.source;
    let snapshot = s.versionId || s.snapshot || requestedSnapshot;
    if ((changedSeries || s.year !== undefined) && !s.snapshot && !s.versionId) snapshot = 'latest';
    if (changedSeries && s.year === undefined) {
      const latest = catalog && resolvePublication(catalog, next.source || 'skdr', undefined);
      if (latest) next.year = latest.version.year;
    }
    const p = new URLSearchParams(route.search);
    p.set('dataset', skdrDataset);
    p.set('source', next.source || 'skdr');
    p.set('year', String(next.year));
    p.set('snapshot', snapshot);
    p.set('region', next.region);
    navigate({ pathname: route.pathname, search: p.toString() });
  }
  const unavailable =
    catalog && !resolved
      ? 'Versi buletin atau tahun tidak tersedia dalam manifest; angka tidak diganti diam-diam.'
      : '';
  return (
    <Context.Provider
      value={{
        active,
        selection,
        data: loadedHash === expectedHash ? data : null,
        sismal: loadedHash === expectedHash ? sismal : null,
        catalog,
        publication,
        sourceCheck,
        manifestWarning,
        requestedSnapshot,
        error: sourceError || (!catalog ? manifestWarning : '') || unavailable || error,
        retry: () => setRevision((n) => n + 1),
        select,
        activate: () =>
          navigate(`${route.pathname}?dataset=${skdrDataset}&snapshot=latest&region=ID`),
        leave: () => navigate(route.pathname),
      }}
    >
      {children}
    </Context.Provider>
  );
}
export const useSkdr = () => useContext(Context);
