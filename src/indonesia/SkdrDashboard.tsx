import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useSkdr } from './SkdrContext';
import { masters, regionName, csv, type RecordRow } from './engine';
import { selectedSkdr, skdrExport, skdrReconciliation } from './skdr';
import { captureSurveillanceSnapshot, restoreSurveillanceSnapshot } from '../workspace-context';
import './indonesia.css';
const fmt = (n: number | null) => (n === null ? 'Belum tersedia' : n.toLocaleString('id-ID'));
function save(name: string, text: string, type: string) {
  const u = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = u;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 1000);
}
export function SkdrExports() {
  const { data, selection, error } = useSkdr();
  const valid =
    data &&
    selection.year === 2026 &&
    selection.snapshot === data.id &&
    !!regionName('2025', selection.region);
  const payload = valid ? skdrExport(data!, selection) : null;
  return (
    <>
      <button
        disabled={!payload || !!error}
        onClick={() =>
          save(
            `skdr-${selection.region}.json`,
            JSON.stringify(payload, null, 2),
            'application/json',
          )
        }
      >
        Export overview
      </button>
      <button
        disabled={!payload || !!error}
        onClick={() => {
          if (!payload) return;
          const rows: RecordRow[] = payload.records.map((r) =>
            Object.fromEntries(
              Object.entries({
                ...r,
                ...payload.source,
                selectedRegion: selection.region,
                nationalPublished: payload.reconciliation?.national,
                provinceDerived: payload.reconciliation?.provinceSum,
                provinceAvailableSubtotal: payload.reconciliation?.availableSum,
                sourceDifference: payload.reconciliation?.difference,
                reconciliationStatus: payload.reconciliation?.status,
              }).map(([k, v]) => [k, v === null || v === undefined ? '' : String(v)]),
            ),
          );
          const headers = rows.length
            ? Object.keys(rows[0])
            : ['regionCode', 'level', 'value', 'availability'];
          save(`skdr-${selection.region}.csv`, csv(headers, rows), 'text/csv');
        }}
      >
        Ekspor CSV SKDR
      </button>
    </>
  );
}
export function SkdrFilters() {
  const { selection, select } = useSkdr();
  const [search, setSearch] = useState('');
  const matches = masters['2025'].regions.filter((r) =>
    (r.name + ' ' + r.code).toLocaleLowerCase('id').includes(search.toLocaleLowerCase('id')),
  );
  const province = selection.region === 'ID' ? '' : selection.region.slice(0, 2);
  return (
    <>
      <label>
        YEAR
        <select
          aria-label="Context year"
          value={selection.year}
          onChange={(e) => select({ year: +e.target.value })}
        >
          <option>2026</option>
          {selection.year !== 2026 && <option>{selection.year}</option>}
        </select>
      </label>
      <label>
        PROVINSI
        <select
          aria-label="Context province"
          value={province}
          onChange={(e) => select({ region: e.target.value || 'ID' })}
        >
          <option value="">Indonesia</option>
          {masters['2025'].regions
            .filter((r) => /^\d{2}$/.test(r.code))
            .map((r) => (
              <option key={r.code} value={r.code}>
                {r.name}
              </option>
            ))}
        </select>
      </label>
      <label>
        KABUPATEN/KOTA
        <select
          aria-label="Context regency"
          disabled={!province}
          value={selection.region.includes('.') ? selection.region : ''}
          onChange={(e) => select({ region: e.target.value || province })}
        >
          <option value="">Seluruh provinsi</option>
          {masters['2025'].regions
            .filter((r) => r.code.startsWith(province + '.'))
            .map((r) => (
              <option key={r.code} value={r.code}>
                {r.name}
              </option>
            ))}
        </select>
      </label>
      <label>
        CARI WILAYAH
        <input
          aria-label="Context region search"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      {search && (
        <label>
          HASIL PENCARIAN
          <select
            aria-label="Context region results"
            value=""
            onChange={(e) => {
              select({ region: e.target.value });
              setSearch('');
            }}
          >
            <option value="">Pilih wilayah ({matches.length})</option>
            {matches.map((r) => (
              <option key={r.code} value={r.code}>
                {r.name} · {r.code}
              </option>
            ))}
          </select>
        </label>
      )}
      <label>
        BULETIN
        <select
          aria-label="Context bulletin"
          value={selection.snapshot}
          onChange={(e) => select({ snapshot: e.target.value })}
        >
          <option value="2026-m44">2026-m44</option>
          {selection.snapshot !== '2026-m44' && <option>{selection.snapshot}</option>}
        </select>
      </label>
    </>
  );
}
export function SkdrBreadcrumb() {
  const { selection } = useSkdr();
  return (
    <span>
      Indonesia
      {selection.region !== 'ID' && ` / ${regionName('2025', selection.region.slice(0, 2))}`}
      {selection.region.includes('.') && ` / ${regionName('2025', selection.region)}`} /{' '}
      {selection.year} / {selection.snapshot}
    </span>
  );
}
export function SkdrInspector() {
  const { data, selection } = useSkdr();
  if (!data) return <p>Snapshot belum dimuat.</p>;
  const r = skdrReconciliation(data);
  return (
    <section aria-label="SKDR Inspector">
      <h2>Jejak sumber SKDR</h2>
      <SkdrBreadcrumb />
      <p>Terbit {data.publishedAt} · data sampai M43 2026 · Buletin M44</p>
      <p>
        URL sumber: {data.sourceUrl || 'Belum diterima dari lampiran'} · waktu penarikan:{' '}
        {data.retrievedAt || 'Belum diterima'}
      </p>
      <p>
        Asal bukti: {data.evidence}. Master batas 2025: transkripsi kode Kemendagri; belum
        seluruhnya diaudit terhadap lampiran resmi.
      </p>
      {selection.region === 'ID' && (
        <dl>
          <dt>Angka publikasi nasional · halaman 36</dt>
          <dd>{fmt(r.national)}</dd>
          <dt>Jumlah turunan 38 provinsi · halaman 45</dt>
          <dd>{fmt(r.provinceSum)}</dd>
          <dt>Provinsi dengan angka tersedia</dt>
          <dd>
            {r.availableProvinceCount}/{r.provinceCount}
          </dd>
          <dt>Subtotal parsial (bukan total Indonesia)</dt>
          <dd>{fmt(r.availableSum)}</dd>
          <dt>Selisih turunan − publikasi nasional</dt>
          <dd>{fmt(r.difference)}</dd>
          <dt>Status</dt>
          <dd>{r.status}</dd>
        </dl>
      )}
      <p>
        Target pemeriksaan dari permintaan: 394.361 dan selisih 5.866. Keduanya baru menjadi hasil
        hitungan bila seluruh angka provinsi telah diterima; bukan hasil rekonstruksi provinsi yang
        kosong.
      </p>
      <SkdrExports />
    </section>
  );
}
export function SkdrDashboard() {
  const { data, error, retry, selection, select } = useSkdr();
  const location = useLocation();
  if (error)
    return (
      <section role="alert">
        <h2>Data SKDR gagal dimuat</h2>
        <p>{error}</p>
        <button onClick={retry}>Coba lagi SKDR</button>
      </section>
    );
  if (!data) return <p role="status">Memuat snapshot SKDR…</p>;
  if (
    !regionName('2025', selection.region) ||
    selection.snapshot !== data.id ||
    selection.year !== 2026
  )
    return (
      <section role="alert">
        <h2>Konteks SKDR tidak sah</h2>
        <p>
          Kode wilayah, tahun, atau versi buletin tidak tersedia; angka tidak diganti diam-diam.
        </p>
      </section>
    );
  const rows = selectedSkdr(data, selection),
    row = rows[0];
  const district = selection.region.includes('.');
  const table = selection.region === 'ID' ? data.rows.filter((r) => r.level === 'province') : rows;
  return (
    <section className="indonesia" aria-label="SKDR Regional Surveillance Workspace">
      <h2>SKDR Kemenkes — Indonesia 2026</h2>
      <p>Data sampai M43 2026 · Buletin M44</p>
      <SkdrBreadcrumb />
      {data.evidence === 'user-supplied-incomplete' && (
        <p role="alert">
          Snapshot parsial dari angka dalam permintaan. Lampiran CSV 38 provinsi, URL sumber, dan
          waktu penarikan belum diterima; angka ini belum diperiksa terhadap buletin asli.
        </p>
      )}
      <div className="metrics">
        <article className="metric">
          <h3>
            {district
              ? 'Kasus kabupaten/kota'
              : selection.region === 'ID'
                ? 'Kasus publikasi nasional'
                : 'Kasus provinsi'}
          </h3>
          <strong>{fmt(row?.value ?? null)}</strong>
          <p>
            {district
              ? 'Data kabupaten/kota belum tersedia'
              : `${row?.availability ?? 'unavailable'} · halaman ${row?.page ?? '—'}`}
          </p>
        </article>
      </div>
      <p>
        Insidens, klasifikasi risiko, prediksi, dan peringatan riset tidak tersedia untuk snapshot
        ini: denominator dan kelayakan analisis belum tersedia.
      </p>
      <section aria-label="Peta SKDR">
        <h3>Peta wilayah</h3>
        <p>
          Geometri resmi yang cocok dengan kode dan jenjang belum tersedia. Tabel tetap berfungsi;
          geometri studi Papua tidak digunakan sebagai pengganti.
        </p>
      </section>
      <div style={{ overflowX: 'auto' }}>
        <table aria-label="Tabel SKDR">
          <thead>
            <tr>
              <th>Kode</th>
              <th>Wilayah</th>
              <th>Jenjang</th>
              <th>Kasus</th>
              <th>Status</th>
              <th>Halaman</th>
            </tr>
          </thead>
          <tbody>
            {table.map((r) => (
              <tr key={r.regionCode}>
                <td>{r.regionCode}</td>
                <td>
                  <button onClick={() => select({ region: r.regionCode })}>
                    {regionName('2025', r.regionCode)}
                  </button>
                </td>
                <td>{r.level}</td>
                <td>{fmt(r.value)}</td>
                <td>{r.availability}</td>
                <td>{r.page}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Link to={'/surveilans-indonesia' + location.search}>Buka lima panel surveilans</Link>
      <SkdrExports />
    </section>
  );
}
export function SkdrSnapshots() {
  const { selection, select } = useSkdr();
  const [name, setName] = useState('SKDR snapshot');
  const [message, setMessage] = useState('');
  const [saved, setSaved] = useState<ReturnType<typeof captureSurveillanceSnapshot>[]>(() => {
    try {
      const value = JSON.parse(localStorage.getItem('malariascope-skdr-views-v1') || '[]');
      if (!Array.isArray(value)) return [];
      return value.filter((s) => !restoreSurveillanceSnapshot(s).error);
    } catch {
      return [];
    }
  });
  return (
    <section>
      <h2>SKDR snapshots</h2>
      <label>
        Snapshot name
        <input aria-label="Snapshot name" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <button
        onClick={() => {
          const next = [
            ...saved,
            captureSurveillanceSnapshot(selection, name, crypto.randomUUID()),
          ];
          try {
            localStorage.setItem('malariascope-skdr-views-v1', JSON.stringify(next));
            setSaved(next);
            setMessage('Snapshot SKDR tersimpan terpisah dari riset.');
          } catch {
            setMessage('Penyimpanan snapshot gagal.');
          }
        }}
      >
        Save snapshot
      </button>
      <p role="status">{message}</p>
      {saved.map((s) => (
        <article key={s.id}>
          <p>
            {s.name} · {s.selection.region} · {s.selection.snapshot}
          </p>
          <button
            aria-label={`Load snapshot ${s.name}`}
            onClick={() => {
              const result = restoreSurveillanceSnapshot(s);
              if (result.selection) select(result.selection);
              else setMessage(result.error || 'Snapshot tidak sah.');
            }}
          >
            Load Snapshot
          </button>
        </article>
      ))}
    </section>
  );
}
