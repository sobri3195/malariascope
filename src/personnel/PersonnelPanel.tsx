import { useEffect, useState } from 'react';
import { regionName } from '../indonesia/engine';
type Person = Record<string, string>;
export async function personnelGet(path: string, signal?: AbortSignal) {
  const r = await fetch('/api/personnel/' + path, {
    credentials: 'same-origin',
    cache: 'no-store',
    signal,
  });
  if (!r.ok)
    throw Error(
      r.status === 401
        ? 'Sesi berakhir. Masuk melalui layanan institusi.'
        : r.status === 403
          ? 'Akses personel tidak diberikan.'
          : r.status === 404
            ? 'Wilayah atau unit tidak tersedia dalam cakupan Anda.'
            : 'Sumber personel belum terhubung atau gagal dimuat.',
    );
  return r.json();
}
export default function PersonnelPanel({ region }: { region: string }) {
  const [summary, setSummary] = useState<{
    source: string;
    version: string;
    placementAsOf: string;
    demo: boolean;
    total: number;
    units: { id: string; label: string; total: number; regionCode: string }[];
  } | null>(null);
  const [unit, setUnit] = useState(''),
    [query, setQuery] = useState(''),
    [status, setStatus] = useState(''),
    [page, setPage] = useState(1);
  const [list, setList] = useState<{ total: number; rows: Person[] } | null>(null),
    [person, setPerson] = useState(''),
    [detail, setDetail] = useState<Person | null>(null),
    [error, setError] = useState('');
  useEffect(() => {
    const c = new AbortController();
    setSummary(null);
    setError('');
    personnelGet('regions/' + encodeURIComponent(region), c.signal)
      .then((s) => {
        if (!c.signal.aborted) setSummary(s);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(String(e));
      });
    return () => c.abort();
  }, [region]);
  useEffect(() => {
    if (!unit) return;
    const c = new AbortController();
    setList(null);
    setError('');
    personnelGet(
      `regions/${encodeURIComponent(region)}/units/${encodeURIComponent(unit)}/people?` +
        new URLSearchParams({ q: query, status, page: String(page) }),
      c.signal,
    )
      .then((s) => {
        if (!c.signal.aborted) setList(s);
      })
      .catch((e) => {
        if (!c.signal.aborted) {
          setList(null);
          setDetail(null);
          setSummary(null);
          setError(String(e));
        }
      });
    return () => c.abort();
  }, [region, unit, query, status, page]);
  useEffect(() => {
    if (!person || !unit) return;
    const c = new AbortController();
    setDetail(null);
    setError('');
    personnelGet(
      `regions/${encodeURIComponent(region)}/units/${encodeURIComponent(unit)}/people/${encodeURIComponent(person)}`,
      c.signal,
    )
      .then((s) => {
        if (!c.signal.aborted) setDetail(s);
      })
      .catch((e) => {
        if (!c.signal.aborted) {
          setSummary(null);
          setList(null);
          setDetail(null);
          setError(String(e));
        }
      });
    return () => c.abort();
  }, [region, unit, person]);
  // Parent keys this component by region; no response/cache survives a selection change.
  return (
    <section className="personnel-roster" aria-label="Cek Personel">
      <h3>Cek Personel</h3>
      {error && <p role="alert">{error}</p>}
      {!summary && !error && <p role="status">Memuat cakupan personel…</p>}
      {summary && (
        <>
          <p>
            {summary.demo ? 'DEMO SINTETIS — bukan personel nyata' : 'Sumber roster disetujui'} ·{' '}
            {summary.source} · versi {summary.version}
          </p>
          <p>Acuan penempatan: {summary.placementAsOf} (terpisah dari periode malaria)</p>
          <p>Total dalam cakupan Anda: {summary.total}</p>
          <label>
            Unit
            <select
              aria-label="Unit personel"
              value={unit}
              onChange={(e) => {
                setUnit(e.target.value);
                setPage(1);
                setPerson('');
                setDetail(null);
                setList(null);
              }}
            >
              <option value="">Pilih unit</option>
              {summary.units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.label} · {regionName('2025', u.regionCode) || u.regionCode} · {u.total}
                </option>
              ))}
            </select>
          </label>
          {unit && (
            <>
              <label>
                Cari personel
                <input
                  aria-label="Cari personel"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setPage(1);
                    setPerson('');
                    setDetail(null);
                  }}
                />
              </label>
              <label>
                Status penempatan
                <select
                  value={status}
                  onChange={(e) => {
                    setStatus(e.target.value);
                    setPage(1);
                    setPerson('');
                    setDetail(null);
                  }}
                >
                  <option value="">Semua status</option>
                  <option value="ACTIVE">Aktif</option>
                  <option value="INACTIVE">Tidak aktif</option>
                </select>
              </label>
              {!list && <p role="status">Memuat daftar…</p>}
              {list && (
                <>
                  <p>
                    {list.total} hasil · halaman {page}
                  </p>
                  <ul>
                    {list.rows.map((p) => (
                      <li key={p.id}>
                        <button onClick={() => setPerson(p.id)}>
                          {p.name || 'Buka detail administratif'}
                        </button>{' '}
                        {p.maskedId} · {p.role} · {p.placementStatus}
                      </li>
                    ))}
                  </ul>
                  <button
                    disabled={page === 1}
                    onClick={() => {
                      setPage(page - 1);
                      setPerson('');
                      setDetail(null);
                    }}
                  >
                    Sebelumnya
                  </button>
                  <button
                    disabled={page * 10 >= list.total}
                    onClick={() => {
                      setPage(page + 1);
                      setPerson('');
                      setDetail(null);
                    }}
                  >
                    Berikutnya
                  </button>
                </>
              )}
              {person && !detail && <p role="status">Memeriksa izin detail…</p>}
              {detail && (
                <section aria-label="Detail personel">
                  <h4>Detail administratif</h4>
                  <dl>
                    {Object.entries(detail)
                      .filter(([k]) => !['id', 'unitId'].includes(k))
                      .map(([k, v]) => (
                        <div key={k}>
                          <dt>{k}</dt>
                          <dd>{v}</dd>
                        </div>
                      ))}
                  </dl>
                  <button
                    onClick={() => {
                      setPerson('');
                      setDetail(null);
                    }}
                  >
                    Tutup detail personel
                  </button>
                </section>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
