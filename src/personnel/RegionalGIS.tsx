import { validateGeometry } from '../geometry';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { masters, regionName } from '../indonesia/engine';
import { featureIdentity } from '../map-intelligence';
import type { MapHandle } from '../MapCanvas';
import type { Row } from '../analytics';
import { personnelGet } from './PersonnelPanel';
import './regional-gis.css';
const Canvas = lazy(() => import('../MapCanvas'));
const Personnel = lazy(() => import('./PersonnelPanel'));
const regions = masters['2025'].regions;
type Props = {
  internal?: boolean;
  year?: number;
  region?: string;
  onSelect?: (code: string) => void;
  source?: string;
  version?: string;
  period?: string;
  values?: { regionCode: string; value: number | null; availability: string }[];
};
export default function RegionalGIS({
  internal = false,
  year = 2026,
  region = 'ID',
  onSelect,
  source = 'Master wilayah Kemendagri 2025',
  version = '2025',
  period = 'Belum dipilih',
  values = [],
}: Props) {
  const location = useLocation(),
    navigate = useNavigate();
  const query = new URLSearchParams(location.search);
  const [search, setSearch] = useState(''),
    [authorized, setAuthorized] = useState(false),
    [authorizationVersion, setAuthorizationVersion] = useState(''),
    [authError, setAuthError] = useState('');
  const [geometry, setGeometry] = useState<any>(null),
    [geometryError, setGeometryError] = useState(''),
    [opened, setOpened] = useState(true);
  const map = useRef<MapHandle>(null);
  const selected = onSelect ? region : query.get('region') || region;
  const layer =
    internal && authorized && query.get('gisLayer') === 'personnel' ? 'personnel' : 'cases';
  function setLayer(next: string) {
    const q = new URLSearchParams(location.search);
    q.set('gisLayer', next);
    navigate(
      { pathname: location.pathname, search: q.toString() },
      { state: { workspaceContextSync: true } },
    );
  }
  const [showDetail, setShowDetail] = useState(false);
  useEffect(() => {
    if (selected !== 'ID') setShowDetail(true);
  }, [selected]);
  useEffect(() => {
    if (geometry) map.current?.focus(selected);
  }, [selected, geometry]);
  function select(code: string) {
    if (onSelect) onSelect(code);
    else {
      const q = new URLSearchParams(location.search);
      q.set('region', code);
      navigate(
        { pathname: location.pathname, search: q.toString() },
        { state: { workspaceContextSync: true } },
      );
    }
    setShowDetail(true);
    setSearch('');
    map.current?.focus(code);
  }
  useEffect(() => {
    if (!internal) return;
    const c = new AbortController();
    const check = () =>
      personnelGet('access', c.signal)
        .then((access) => {
          if (!c.signal.aborted) {
            setAuthorized(true);
            setAuthorizationVersion(access.authorizationVersion);
          }
        })
        .catch((e) => {
          if (!c.signal.aborted) {
            setAuthorized(false);
            setAuthError(String(e));
          }
        });
    check();
    const timer = setInterval(check, 30000);
    window.addEventListener('focus', check);
    return () => {
      c.abort();
      clearInterval(timer);
      window.removeEventListener('focus', check);
    };
  }, [internal]);
  useEffect(() => {
    if (!opened || (internal && !authorized)) return;
    const c = new AbortController();
    fetch('/data/verified/papua-study-adm2.geojson', { signal: c.signal })
      .then(async (r) => {
        if (!r.ok) throw Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((g) => {
        g = validateGeometry(g);
        const features = g.features.filter((f: any) =>
          regions.some((r) => r.code === (f.properties?.district_code || f.properties?.code)),
        );
        if (!features.length) throw Error('Geometri dengan kode resmi yang cocok belum tersedia.');
        if (!c.signal.aborted) setGeometry({ ...g, features });
      })
      .catch((e) => {
        if (!c.signal.aborted) setGeometryError(String(e));
      });
    return () => c.abort();
  }, [opened, internal, authorized]);
  const rows: Row[] = values
    .filter((v) => v.value !== null)
    .map((v) => ({
      district: regionName('2025', v.regionCode) || v.regionCode,
      district_code: v.regionCode,
      year,
      cases: v.value!,
    }));
  const children = regions.filter((r) =>
    selected === 'ID'
      ? /^\d{2}$/.test(r.code)
      : /^\d{2}$/.test(selected)
        ? r.code.startsWith(selected + '.')
        : r.code === selected,
  );
  const matches = search
    ? regions
        .filter((r) =>
          (r.name + ' ' + r.code).toLocaleLowerCase('id').includes(search.toLocaleLowerCase('id')),
        )
        .slice(0, 30)
    : children;
  const value = values.find((v) => v.regionCode === selected);
  if (internal && !authorized)
    return (
      <section>
        <h2>GIS Internal — Cek Personel</h2>
        <p role="status">{authError || 'Memeriksa sesi internal…'}</p>
        <NavLink to="/research-operations">Buka autentikasi layanan internal</NavLink>
        <p>
          Masuk melalui layanan autentikasi organisasi yang dikonfigurasi. Akses roster memerlukan
          grant personel tersendiri.
        </p>
      </section>
    );
  if (!regions.some((r) => r.code === selected)) return <p role="alert">Kode wilayah tidak sah.</p>;
  return (
    <section className="regional-gis" aria-label="GIS wilayah">
      <header>
        {!internal && (
          <NavLink
            to={
              '/internal-personnel?' +
              new URLSearchParams({
                ...Object.fromEntries(new URLSearchParams(window.location.search)),
                region: selected,
              }).toString()
            }
          >
            Cek Personel internal
          </NavLink>
        )}
        <h2>{internal ? 'GIS Internal — Cek Personel' : 'GIS Surveilans Indonesia'}</h2>
        <nav aria-label="Breadcrumb wilayah">
          <button onClick={() => select('ID')}>Indonesia</button>
          {selected !== 'ID' && (
            <>
              {' '}
              →{' '}
              <button onClick={() => select(selected.slice(0, 2))}>
                {regionName('2025', selected.slice(0, 2))}
              </button>
            </>
          )}
          {selected.includes('.') && <> → {regionName('2025', selected)}</>}
        </nav>
        <p>
          {source} · periode malaria: {period} · versi {version}
        </p>
      </header>
      <details open>
        <summary>Filter dan legenda wilayah</summary>
        <label>
          Cari kode atau nama wilayah
          <input
            aria-label="Cari wilayah GIS"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label>
          Layer GIS
          <select
            value={layer}
            onChange={(e) => {
              setLayer(e.target.value);
              setShowDetail(true);
            }}
          >
            <option value="cases">Kasus Malaria</option>
            <option value="incidence" disabled>
              Insidens — penyebut/periode belum cocok
            </option>
            {internal && authorized && <option value="personnel">Personel</option>}
          </select>
        </label>
        <p>
          Legenda:{' '}
          {layer === 'personnel'
            ? 'Cakupan administratif; angka hanya melalui API internal'
            : 'Kasus dilaporkan; nol ≠ belum tersedia; arsiran = tanpa data'}
        </p>
      </details>
      <div className="regional-stage">
        <div>
          <button onClick={() => setOpened(true)}>Muat peta wilayah</button>
          <button
            onClick={() => {
              select('ID');
              map.current?.reset();
            }}
          >
            Reset tampilan wilayah
          </button>
          {!opened && <p>Peta dimuat saat diperlukan. Pencarian dan tabel tetap tersedia.</p>}
          {geometryError && (
            <p role="status">
              {geometryError} Pencarian dan tabel tetap tersedia; geometri studi tidak dipaksakan ke
              kode lain.
            </p>
          )}
          {geometry && (
            <Suspense fallback={<p>Memuat peta…</p>}>
              <Canvas
                ref={map}
                geometry={geometry}
                administrative
                rows={rows}
                year={year}
                layer={layer === 'personnel' ? 'boundaries' : layer}
                model="Persistence"
                thresholds={[100, 300, 500]}
                breaks={[1, 100, 1000]}
                opacity={0.7}
                visible
                clusters={{}}
                selectedIdentity={selected}
                neighbors={[]}
                facilities={[]}
                camera={null}
                onCamera={() => {}}
                onSelect={(name) => {
                  const f = geometry.features.find(
                    (f: any) =>
                      f.properties?.name === name ||
                      f.properties?.district === name ||
                      featureIdentity(f) === name,
                  );
                  const code = f?.properties?.district_code || f?.properties?.code;
                  if (regions.some((r) => r.code === code)) select(code);
                }}
                label="Peta wilayah administratif"
                reduced
              />
            </Suspense>
          )}
          <table aria-label="Tabel wilayah GIS">
            <thead>
              <tr>
                <th>Wilayah</th>
                <th>Kasus</th>
              </tr>
            </thead>
            <tbody>
              {matches.map((r) => {
                const v = values.find((v) => v.regionCode === r.code);
                return (
                  <tr key={r.code} aria-selected={r.code === selected}>
                    <td>
                      <button onClick={() => select(r.code)}>
                        {r.code} · {r.name}
                      </button>
                    </td>
                    <td>
                      {v?.value == null ? 'Belum tersedia' : v.value.toLocaleString('id-ID')}
                      {v?.availability === 'partial' ? ' · parsial' : ''}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {showDetail && (
          <aside className="regional-detail" aria-label="Detail wilayah GIS">
            <button onClick={() => setShowDetail(false)}>Tutup detail wilayah</button>
            <h3>Profil Wilayah 360° · {regionName('2025', selected)}</h3>
            <p>
              Kode: {selected} · Jenjang:{' '}
              {selected === 'ID'
                ? 'Nasional'
                : selected.includes('.')
                  ? 'Kabupaten/Kota'
                  : 'Provinsi'}
            </p>
            <p>
              Cakupan pelaporan:{' '}
              {values.filter((v) => /^\d{2}$/.test(v.regionCode) && v.value !== null).length}/38
              provinsi berangka pada sumber ini.
            </p>
            <p>
              {source} · {period} · {version}
            </p>
            <p>
              Kasus: {value?.value == null ? 'Belum tersedia' : value.value.toLocaleString('id-ID')}{' '}
              · {value?.availability || 'unavailable'}
            </p>
            {selected.includes('.') && value?.value == null && (
              <section aria-label="Angka induk tingkat provinsi">
                <h4>Konteks provinsi — {regionName('2025', selected.slice(0, 2))}</h4>
                <p>
                  {values
                    .find((v) => v.regionCode === selected.slice(0, 2))
                    ?.value?.toLocaleString('id-ID') ?? 'Belum tersedia'}{' '}
                  kasus · {period}. Angka provinsi bukan angka kabupaten/kota.
                </p>
              </section>
            )}
            {internal && (
              <>
                <button onClick={() => setLayer('personnel')}>Tab Personel</button>
                {layer === 'personnel' && (
                  <Suspense fallback={<p>Memuat Personel…</p>}>
                    <Personnel key={selected + authorizationVersion} region={selected} />
                  </Suspense>
                )}
              </>
            )}
          </aside>
        )}
      </div>
    </section>
  );
}
