import RegionalGIS from '../personnel/RegionalGIS';
import { Link, useLocation } from 'react-router-dom';
import { useSkdr } from './SkdrContext';
import { masters, regionName } from './engine';
import { districtCoverage } from '../region-profile';
import { selectedSismal, sismalEvidence } from './sismal';
import { SkdrExports, SkdrBreadcrumb } from './SkdrDashboard';

const regions = masters['2025'].regions;
const provinces = regions.filter((region) => /^\d{2}$/.test(region.code));

export default function SismalDashboard() {
  const { sismal, selection, error, retry, select } = useSkdr();
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
  const { region } = selection;
  const name = regionName('2025', region);
  const national = region === 'ID';
  const district = region.includes('.');
  const row = selectedSismal(sismal, selection)[0];
  const personnelQuery = new URLSearchParams(location.search);
  personnelQuery.set('region', region);
  personnelQuery.set('gisLayer', 'personnel');
  const coverage = districtCoverage(region, sismal.rows);
  const byCode = new Map(sismal.rows.map((record) => [record.regionCode, record]));
  const districts = regions.filter(
    (entry) =>
      entry.code.includes('.') && (entry.code === region || entry.code.startsWith(region + '.')),
  );
  return (
    <section
      className="indonesia sismal-workspace"
      aria-label="SISMAL Regional Surveillance Workspace"
    >
      <header className="sismal-heading">
        <div>
          <SkdrBreadcrumb />
          <h2>SISMAL Kemenkes — {selection.year}</h2>
          <p>Rekap tahunan kasus positif · {name}</p>
        </div>
        <Link to={'/internal-personnel?' + personnelQuery.toString()}>Cek Personel internal</Link>
      </header>
      <div className="sismal-summary">
        <article className="metric">
          <h3>Kasus positif {name}</h3>
          <strong>
            {row?.value == null ? 'Belum tersedia' : row.value.toLocaleString('id-ID')}
          </strong>
          <p>
            {row
              ? row.validationStatus
              : district
                ? `Data ${name} ${selection.year} belum tersedia`
                : `Total resmi tingkat ${national ? 'nasional' : 'provinsi'} memerlukan rekap pada jenjang itu.`}
          </p>
        </article>
        <article className="sismal-coverage" aria-label="Cakupan SISMAL">
          <h3>Cakupan data</h3>
          <p>
            <strong>
              {coverage.available}/{coverage.total}
            </strong>{' '}
            kabupaten/kota berangka
          </p>
          <progress
            aria-label="Kabupaten/kota dengan angka"
            value={coverage.available}
            max={coverage.total}
          />
          <p>
            {coverage.partial} parsial · {coverage.unavailable} tanpa angka sumber ·{' '}
            {coverage.missing} tanpa baris sumber
          </p>
        </article>
      </div>
      <p className="sismal-provenance">
        {sismalEvidence[sismal.evidence]} · penarikan {sismal.retrievedAt || 'belum dilakukan'}
        {district && ` · pembaruan sumber ${row?.updatedAt || 'tidak dinyatakan'}`}
      </p>
      <div
        className="id-table-scroll sismal-table"
        tabIndex={0}
        role="region"
        aria-label="Rekap wilayah SISMAL"
      >
        <table className={national ? 'sismal-national-table' : undefined} aria-label="Tabel SISMAL">
          <caption>{national ? 'Cakupan SISMAL per provinsi' : `Rekap SISMAL · ${name}`}</caption>
          <thead>
            {national ? (
              <tr>
                <th scope="col">Provinsi</th>
                <th scope="col">Kab./kota berangka</th>
                <th scope="col">Kesenjangan data</th>
              </tr>
            ) : (
              <tr>
                <th scope="col">Kode</th>
                <th scope="col">Kabupaten/kota</th>
                <th scope="col">ID sumber</th>
                <th scope="col">Positif</th>
                <th scope="col">Status sumber</th>
                <th scope="col">Pembaruan sumber</th>
              </tr>
            )}
          </thead>
          <tbody>
            {national
              ? provinces.map((province) => {
                  const summary = districtCoverage(province.code, sismal.rows);
                  return (
                    <tr key={province.code}>
                      <th scope="row">
                        <button onClick={() => select({ region: province.code })}>
                          {province.name}
                        </button>
                      </th>
                      <td>
                        {summary.available}/{summary.total}
                        {summary.partial > 0 && ` (${summary.partial} parsial)`}
                      </td>
                      <td>
                        {summary.unavailable > 0 && <div>{summary.unavailable} tanpa angka</div>}
                        {summary.missing > 0 && <div>{summary.missing} tanpa baris</div>}
                        {!summary.unavailable && !summary.missing && '—'}
                      </td>
                    </tr>
                  );
                })
              : districts.map((entry) => {
                  const record = byCode.get(entry.code);
                  return (
                    <tr key={entry.code}>
                      <th scope="row">
                        <button onClick={() => select({ region: entry.code })}>{entry.code}</button>
                      </th>
                      <td>{entry.name}</td>
                      <td>{record?.sourceId ?? '—'}</td>
                      <td className={record?.value == null ? 'sismal-unavailable' : 'sismal-value'}>
                        {record?.value == null
                          ? 'Belum tersedia'
                          : record.value.toLocaleString('id-ID')}
                        {record?.availability === 'partial' && ' · parsial'}
                      </td>
                      <td>{record?.validationStatus ?? 'Tanpa baris sumber'}</td>
                      <td>{record?.updatedAt ?? '—'}</td>
                    </tr>
                  );
                })}
          </tbody>
        </table>
      </div>
      <RegionalGIS
        region={region}
        onSelect={(region) => select({ region })}
        year={sismal.reportingYear}
        source={sismal.sourceUrl}
        version={sismal.id}
        period={`SISMAL ${sismal.reportingYear}`}
        values={sismal.rows}
        coverageLevel="district"
      />
      <div className="sismal-actions">
        {location.pathname !== '/dashboard' && <SkdrExports />}
        {location.pathname !== '/surveilans-indonesia' && (
          <Link to={'/surveilans-indonesia' + location.search}>Buka lima panel surveilans</Link>
        )}
      </div>
    </section>
  );
}
