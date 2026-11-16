import { Link, useLocation } from 'react-router-dom';
import { useSkdr } from './SkdrContext';
import { regionName } from './engine';
import { selectedSismal, scopedSismal } from './sismal';
import { SkdrExports, SkdrBreadcrumb, PublicationStatus } from './SkdrDashboard';
export default function SismalDashboard() {
  const { sismal, selection, error, retry } = useSkdr();
  const location = useLocation();
  if (error)
    return (
      <section role="alert">
        <h2>Data SISMAL gagal dimuat</h2>
        <p>{error}</p>
        <button onClick={retry}>Coba lagi SISMAL</button>
      </section>
    );
  if (!sismal) return <p role="status">Memuat snapshot SISMAL…</p>;
  if (
    !regionName('2025', selection.region) ||
    selection.snapshot !== sismal.id ||
    selection.year !== sismal.reportingYear
  )
    return <p role="alert">Konteks SISMAL tidak sah.</p>;
  const records = selectedSismal(sismal, selection);
  const row = records[0];
  const table = scopedSismal(sismal, selection);
  return (
    <section className="indonesia" aria-label="SISMAL Regional Surveillance Workspace">
      <h2>SISMAL Kemenkes — {selection.year}</h2>
      <PublicationStatus />
      <SkdrBreadcrumb />
      <p>
        Rekap tahunan SISMAL · tahun pelaporan {sismal.reportingYear}. Tidak digabung dengan SKDR
        kumulatif.
      </p>
      {sismal.evidence === 'user-supplied-incomplete' && (
        <p role="alert">
          Angka dinyatakan dalam permintaan; respons portal belum dapat ditarik dan diperiksa. Tidak
          diklaim sebagai snapshot portal tervalidasi.
        </p>
      )}
      <article className="metric">
        <h3>Kasus positif {regionName('2025', selection.region)}</h3>
        <strong>
          {row?.value === null || row?.value === undefined
            ? 'Belum tersedia'
            : row.value.toLocaleString('id-ID')}
        </strong>
        <p>
          {row
            ? row.validationStatus
            : `Data ${regionName('2025', selection.region)} ${selection.year} belum tersedia`}
        </p>
      </article>
      <p>
        Tanggal pembaruan sumber: {row?.updatedAt || 'Tidak dinyatakan'} · waktu penarikan:{' '}
        {sismal.retrievedAt || 'Belum ditarik'} · respons: {sismal.responseState}
      </p>
      <p>
        Geometri resmi belum tersedia; pencarian dan tabel tetap berfungsi. Insidens, risiko dan
        prediksi tidak dihitung dari angka positif saja.
      </p>
      <div style={{ overflowX: 'auto', maxWidth: '100%' }}>
        <table aria-label="Tabel SISMAL">
          <thead>
            <tr>
              <th>Kode</th>
              <th>ID sumber</th>
              <th>Positif</th>
              <th>Tahun</th>
              <th>Status sumber</th>
            </tr>
          </thead>
          <tbody>
            {table.map((r) => (
              <tr key={r.regionCode}>
                <td>{r.regionCode}</td>
                <td>{r.sourceId}</td>
                <td>{r.value === null ? 'Belum tersedia' : r.value}</td>
                <td>{r.reportingYear}</td>
                <td>{r.validationStatus}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <SkdrExports />
      <Link to={'/surveilans-indonesia' + location.search}>Buka lima panel surveilans</Link>
    </section>
  );
}
