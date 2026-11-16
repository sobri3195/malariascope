import { useState } from 'react';
import { columns, regionName, type Kind, type RecordRow } from './engine';
import {
  aggregateIdentity,
  label,
  proportion,
  reconcileAggregates,
  responseGroups,
} from './aggregate-data';
const percent = (p: number | null) =>
  p === null
    ? 'Persentase belum tersedia'
    : p.toLocaleString('id-ID', { maximumFractionDigits: 1 }) + '%';
export function ImportPreview({ kind, rows }: { kind: Kind; rows: RecordRow[] }) {
  const [page, setPage] = useState(0);
  const size = 10;
  const pages = Math.ceil(rows.length / size);
  const current = Math.min(page, pages - 1);
  return (
    <section aria-label="Pratinjau impor">
      <h4>Pratinjau {rows.length} baris agregat</h4>
      <p>
        Nilai tetap mengikuti wilayah, periode, dan sumber asli. Pemeriksaan struktur tidak
        membuktikan publikasi atau anonimitas seluruh teks bebas; periksa isinya sebelum menyimpan.
      </p>
      <div className="id-table-scroll">
        <table>
          <thead>
            <tr>
              {columns(kind).map((k) => (
                <th key={k}>{label(k)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(current * size, (current + 1) * size).map((r, i) => (
              <tr key={i}>
                {columns(kind).map((k) => (
                  <td key={k}>
                    {k === 'region_code'
                      ? `${r[k]} · ${regionName(r.region_version, r[k])}`
                      : r[k] || 'Belum tersedia'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div>
          <button disabled={current === 0} onClick={() => setPage(current - 1)}>
            Sebelumnya
          </button>
          <span>
            Halaman {current + 1}/{pages}
          </span>
          <button disabled={current + 1 === pages} onClick={() => setPage(current + 1)}>
            Berikutnya
          </button>
        </div>
      )}
    </section>
  );
}
export function AggregateHighlights({ kind, row: r }: { kind: Kind; row: RecordRow }) {
  if (r.status === 'unavailable')
    return <p>Angka belum tersedia; nilai kosong tidak diperlakukan sebagai nol.</p>;
  if (kind === 'asal')
    return (
      <>
        <p>
          Total terkonfirmasi: <strong>{Number(r.confirmed).toLocaleString('id-ID')}</strong> ·
          jumlah semua kategori telah sesuai.
        </p>
        <div className="id-table-scroll">
          <table aria-label="Asal penularan">
            <thead>
              <tr>
                <th>Kategori</th>
                <th>Kasus</th>
                <th>Persentase</th>
              </tr>
            </thead>
            <tbody>
              {['imported', 'introduced', 'indigenous', 'other', 'unclassified'].map((k) => (
                <tr key={k}>
                  <td>{label(k)}</td>
                  <td>{r[k]}</td>
                  <td>{percent(proportion(+r[k], +r.confirmed))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    );
  if (kind === 'layanan')
    return (
      <div className="id-table-scroll">
        <table aria-label="Indikator kesiapan layanan">
          <thead>
            <tr>
              <th>Indikator</th>
              <th>Siap / dinilai</th>
              <th>Persentase</th>
              <th>Tanggal penilaian</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['rdt', 'RDT'],
              ['microscopy', 'Mikroskopi'],
              ['referral', 'Rujukan'],
            ].map(([k, n]) => (
              <tr key={k}>
                <td>{n}</td>
                <td>
                  {r[k + '_ready']}/{r[k + '_assessed']}
                </td>
                <td>
                  {+r[k + '_assessed']
                    ? percent(proportion(+r[k + '_ready'], +r[k + '_assessed']))
                    : 'Belum dinilai (penyebut nol)'}
                </td>
                <td>{r.assessed_at}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  return null;
}
export function ResponseSummary({ rows }: { rows: RecordRow[] }) {
  return (
    <section aria-label="Ringkasan ketepatan waktu">
      <h3>Ketepatan waktu per tahap dan SOP</h3>
      <p>
        Setiap kelompok memakai wilayah, periode, definisi, sumber, dan SOP yang sama. Kejadian
        wajib yang sudah jatuh tempo tetap masuk penyebut walaupun belum selesai. Kelompok pemicu
        harus saling lepas.
      </p>
      {responseGroups(rows).map(({ row: r, cohorts, metric: m }, i) => (
        <article key={i}>
          <h4>
            {r.stage} · {r.source_id}@{r.publication_version}
          </h4>
          <p>
            {cohorts} kelompok pemicu ·{' '}
            {m
              ? `${m.numerator}/${m.denominator} tepat waktu · ${percent(m.percent)}`
              : 'Belum tersedia atau kelompok tidak dapat digabung'}
          </p>
          {m?.partial && <p>PARSIAL — cakupan belum lengkap.</p>}
          <p>
            SOP{' '}
            <a href={r.sop_url} rel="noreferrer" target="_blank">
              {r.sop_version}
            </a>{' '}
            · evaluasi {r.as_of}
          </p>
        </article>
      ))}
    </section>
  );
}
export function ReconciliationPanel({ kind, rows }: { kind: Kind; rows: RecordRow[] }) {
  const [base, setBase] = useState('');
  const baseline = rows.find((r) => aggregateIdentity(kind, r) === base) || rows[0];
  if (rows.length < 2) return <p>Belum ada pasangan sumber untuk dibandingkan.</p>;
  return (
    <>
      <label>
        Sumber pembanding
        <select
          aria-label={`Sumber pembanding ${kind}`}
          value={aggregateIdentity(kind, baseline)}
          onChange={(e) => setBase(e.target.value)}
        >
          {rows.map((r) => (
            <option key={aggregateIdentity(kind, r)} value={aggregateIdentity(kind, r)}>
              {r.source_id}@{r.publication_version} · {r.period_start}–{r.period_end}
              {r.stage ? ` · ${r.stage} · ${r.trigger_at}` : ''}
            </option>
          ))}
        </select>
      </label>
      {rows
        .filter((r) => r !== baseline)
        .map((r) => {
          const result = reconcileAggregates(kind, baseline, r);
          return (
            <article key={aggregateIdentity(kind, r)}>
              <h4>
                {baseline.source_id}@{baseline.publication_version} ↔ {r.source_id}@
                {r.publication_version}
              </h4>
              <p>
                {result.comparable
                  ? 'Metadata sebanding; perbedaan angka berikut belum membuktikan kesalahan sumber.'
                  : `Belum dapat dibandingkan: ${result.blockers.map(label).join(', ') || 'data parsial atau belum tersedia'}`}
              </p>
              {result.revisionChanged && (
                <p>Versi publikasi berbeda; revisi tetap ditampilkan terpisah.</p>
              )}
              {result.comparable && (
                <div className="id-table-scroll">
                  <table aria-label="Perbandingan angka sumber">
                    <thead>
                      <tr>
                        <th>Indikator</th>
                        <th>Pembanding</th>
                        <th>Sumber dibandingkan</th>
                        <th>Selisih (kedua − pembanding)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.differences.map((d) => (
                        <tr key={d.field}>
                          <td>{label(d.field)}</td>
                          <td>{d.a}</td>
                          <td>{d.b}</td>
                          <td>{d.delta}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </article>
          );
        })}
    </>
  );
}
