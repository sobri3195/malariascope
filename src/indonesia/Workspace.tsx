import { useRef } from 'react';
import { useLocalRepository } from './useLocalRepository';
import LocalRecovery, { saveText } from './LocalRecovery';
import {
  emptyAggregates,
  parseAggregates,
  aggregateIdentity,
  aggregateExport,
  label,
} from './aggregate-data';
import {
  AggregateHighlights,
  ImportPreview,
  ResponseSummary,
  ReconciliationPanel,
} from './AggregatePanels';
import { useSkdr } from './SkdrContext';
import { SkdrDashboard, SkdrInspector, SkdrFilters } from './SkdrDashboard';
import { useLayoutEffect, useState } from 'react';
import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom';
import Papa from 'papaparse';
import {
  columns,
  common,
  csv,
  kinds,
  masters,
  regionName,
  responseMetric,
  selectRows,
  validateRows,
  type Kind,
  type Master,
  type RecordRow,
} from './engine';
import './indonesia.css';
const labels = {
  situasi: 'Situasi malaria',
  asal: 'Asal penularan',
  layanan: 'Kesiapan layanan',
  respons: 'Respons kasus',
  rekonsiliasi: 'Rekonsiliasi dan ekspor',
};
const storageKey = 'malariascope-indonesia-aggregate-v1';
function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function IndonesiaWorkspace() {
  const location = useLocation();
  const skdr = useSkdr();
  const [q, setQ] = useSearchParams();
  const repository = useLocalRepository(storageKey, parseAggregates, emptyAggregates);
  const data = repository.data;
  const request = useRef(0);
  const [deleteTarget, setDeleteTarget] = useState('');
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [preview, setPreview] = useState<{ kind: Kind; rows: RecordRow[] } | null>(null);
  const version = (skdr.active ? '2025' : q.get('wilayah') || '2025') as Master;
  const master = Object.hasOwn(masters, version) ? masters[version] : undefined;
  const code = skdr.active ? skdr.selection.region : q.get('region') || 'ID';
  const period = skdr.active ? String(skdr.selection.year) : q.get('periode') || '';
  const source = q.get('sumber') || '';
  const panel = (q.get('panel') || 'situasi') as keyof typeof labels;
  const valid =
    !!master &&
    !!regionName(version, code) &&
    Object.hasOwn(labels, panel) &&
    (!period || /^\d{4}$/.test(period));
  const patch = (values: Record<string, string>) => {
    const next = new URLSearchParams(q);
    Object.entries(values).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    setQ(next);
  };
  useLayoutEffect(() => {
    request.current++;
    setPreview(null);
    setImporting(false);
    setDeleteTarget('');
    // Invalidate the old panel before the next panel can accept an upload.
    // A passive unmount cleanup may run after a new file read has started.
    return () => {
      request.current++;
    };
  }, [panel]);
  // Deliberately no research-data or synthetic-demo fallback.
  const activeKind: Kind = panel === 'rekonsiliasi' ? 'situasi' : (panel as Kind);
  const filtered = (kind: Kind) => selectRows(data[kind], version, code, period, source);
  const rows = filtered(activeKind);
  const availableSources = [
    ...new Set(
      kinds.flatMap((k) =>
        selectRows(data[k], version, code, period, '').map(
          (r) => `${r.source_id}@${r.publication_version}`,
        ),
      ),
    ),
  ];
  if (location.pathname === '/jakarta') {
    const next = new URLSearchParams(q);
    next.set('region', '31');
    if (!next.has('wilayah')) next.set('wilayah', '2025');
    return <Navigate replace to={'/surveilans-indonesia?' + next.toString()} />;
  }
  if (!valid)
    return (
      <main className="indonesia">
        <h1>Filter surveilans tidak sah</h1>
        <p>Kode dan versi batas wilayah harus cocok. Pilihan tidak diganti diam-diam.</p>
        <Link to="/surveilans-indonesia">Buka Indonesia</Link>
      </main>
    );
  const provinces = master.regions.filter((r) => /^\d{2}$/.test(r.code));
  const province = code === 'ID' ? '' : code.slice(0, 2);
  const districts = master.regions.filter((r) => r.code.startsWith(province + '.'));
  const results = master.regions.filter((r) =>
    (r.code + ' ' + r.name).toLocaleLowerCase('id').includes(search.toLocaleLowerCase('id')),
  );
  async function importFile(file: File, kind: Kind) {
    const token = ++request.current;
    setImporting(false);
    setPreview(null);
    if (file.size > 5 * 1024 * 1024) {
      setMessage('Batas CSV agregat 5 MB.');
      return;
    }
    setImporting(true);
    setMessage('Berkas CSV sedang diperiksa…');
    let text: string;
    try {
      text = await file.text();
    } catch {
      if (token === request.current) {
        setMessage('Berkas tidak dapat dibaca. Pilih ulang CSV.');
        setImporting(false);
      }
      return;
    }
    if (token !== request.current) return;
    const parsed = Papa.parse<RecordRow>(text, {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: (h) => h.trim(),
    });
    setImporting(false);
    const errors = parsed.errors
      .map((e) => e.message)
      .concat(validateRows(kind, parsed.data, parsed.meta.fields));
    if (errors.length) {
      setMessage(errors.slice(0, 30).join('\n'));
      return;
    }
    setPreview({ kind, rows: parsed.data });
    setMessage(
      'Validasi struktur lulus. Tinjau sumber dan pastikan tidak ada identitas pasien dalam teks bebas. Ini bukan verifikasi independen publikasi.',
    );
  }
  function commit() {
    if (!preview) return;
    const combined = [...data[preview.kind], ...preview.rows];
    const errors = validateRows(preview.kind, combined);
    if (errors.length) {
      setMessage(errors.join('\n'));
      return;
    }
    const next = { ...data, [preview.kind]: combined };
    if (repository.write(next)) {
      setPreview(null);
      setMessage(
        'Rekap agregat disimpan di peramban ini. URL membagikan filter, bukan berkas impor.',
      );
    }
  }
  function remove(kind: Kind, identity: string) {
    if (
      repository.write({
        ...data,
        [kind]: data[kind].filter((r) => aggregateIdentity(kind, r) !== identity),
      })
    ) {
      setDeleteTarget('');
      setMessage('Rekap yang dipilih dihapus. Sumber lain tetap disimpan.');
    }
  }

  return (
    <main className="indonesia">
      <header>
        <Link to={'/dashboard' + (skdr.active ? location.search : '')}>← Command Dashboard</Link>
        <h1>Surveilans Malaria Indonesia</h1>
        <p>Rekap agregat resmi dan penilaian layanan. Tidak memakai model riset Papua.</p>
        <Link to={'/jakarta' + location.search}>Pintasan DKI Jakarta</Link>
      </header>
      {skdr.active ? (
        <section className="id-filters">
          <SkdrFilters />
        </section>
      ) : (
        <section aria-label="Filter surveilans" className="id-filters">
          <label>
            Versi batas wilayah
            <select
              aria-label="Versi batas wilayah"
              value={version}
              onChange={(e) => patch({ wilayah: e.target.value, region: 'ID', sumber: '' })}
            >
              {Object.keys(masters).map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label>
            Provinsi
            <select
              aria-label="Provinsi"
              value={province}
              onChange={(e) => patch({ region: e.target.value || 'ID', sumber: '' })}
            >
              <option value="">Indonesia</option>
              {provinces.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Kabupaten/kota
            <select
              aria-label="Kabupaten/kota"
              disabled={!province}
              value={code.includes('.') ? code : ''}
              onChange={(e) => patch({ region: e.target.value || province, sumber: '' })}
            >
              <option value="">Seluruh provinsi (rekap provinsi)</option>
              {districts.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Cari nama atau kode wilayah
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} />
          </label>
          {search && (
            <label>
              Hasil pencarian
              <select
                aria-label="Hasil pencarian"
                value=""
                onChange={(e) => {
                  patch({ region: e.target.value, sumber: '' });
                  setSearch('');
                }}
              >
                <option value="">Pilih wilayah ({results.length})</option>
                {results.map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.name} · {r.code}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            Periode tahun
            <select
              aria-label="Periode tahun"
              value={period}
              onChange={(e) => patch({ periode: e.target.value })}
            >
              <option value="">Semua tahun</option>
              {Array.from({ length: 128 }, (_, i) => String(2027 - i)).map((y) => (
                <option key={y}>{y}</option>
              ))}
            </select>
          </label>
          <label>
            Sumber dan versi
            <select
              aria-label="Sumber dan versi"
              value={source}
              onChange={(e) => patch({ sumber: e.target.value })}
            >
              <option value="">Semua sumber (tidak dijumlahkan)</option>
              {[...new Set([...availableSources, ...(source ? [source] : [])])].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
        </section>
      )}
      <LocalRecovery {...repository} />
      {skdr.active && panel !== 'situasi' && (
        <label>
          Sumber rekap dan versi
          <select
            aria-label="Sumber dan versi"
            value={source}
            onChange={(e) => patch({ sumber: e.target.value })}
          >
            <option value="">Semua sumber (tidak dijumlahkan)</option>
            {[...new Set([...availableSources, ...(source ? [source] : [])])].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
      )}
      {source && <button onClick={() => patch({ sumber: '' })}>Semua sumber rekap</button>}
      <p>
        <strong>
          {regionName(version, code)} · {code}
        </strong>{' '}
        · batas {version}. Master berbasis kode Kemendagri, transkripsi terbuka;{' '}
        <a href="/data/indonesia/sources.json">asal dan status pemeriksaan sumber</a>.
      </p>
      <p role="note">
        Angka nol dilaporkan ditulis 0; data parsial ditandai PARSIAL; belum tersedia tidak dianggap
        nol. Rekap provinsi tidak diturunkan ke kabupaten/kota dan tidak dijumlahkan dengan rincian
        anaknya. Batas sumber historis dipertahankan.
      </p>
      <nav aria-label="Panel surveilans">
        {Object.entries(labels).map(([k, label]) => (
          <button
            key={k}
            aria-current={panel === k ? 'page' : undefined}
            onClick={() => patch({ panel: k })}
          >
            {label}
          </button>
        ))}
      </nav>
      <h2>{labels[panel]}</h2>
      {skdr.active && panel === 'situasi' ? (
        <SkdrDashboard />
      ) : panel === 'rekonsiliasi' ? (
        <>
          <>{skdr.active && <SkdrInspector />}</>
          <p>
            Perbandingan hanya pada wilayah terpilih. Versi publikasi berbeda ditampilkan terpisah;
            tidak ada penggabungan otomatis.
          </p>
          {kinds.map((k) => {
            const rs = filtered(k);
            return (
              <section key={k}>
                <h3>{labels[k]}</h3>
                <ReconciliationPanel kind={k} rows={rs} />
                <button
                  disabled={!rs.length}
                  onClick={() => download(`${k}-${code}.csv`, csv(columns(k), rs))}
                >
                  Ekspor {labels[k]}
                </button>
              </section>
            );
          })}
        </>
      ) : (
        <>
          {!rows.length && (
            <p role="status">
              Belum tersedia — tidak ada rekap yang telah dimuat untuk wilayah, periode, dan sumber
              ini.
            </p>
          )}
          {activeKind === 'respons' && !!rows.length && <ResponseSummary rows={rows} />}
          {rows.map((r, i) => (
            <article key={i}>
              <h3>
                {r.source_id} · versi {r.publication_version} ·{' '}
                {r.status === 'unavailable'
                  ? 'BELUM TERSEDIA'
                  : r.status === 'partial'
                    ? 'PARSIAL'
                    : 'DILAPORKAN'}
              </h3>
              <dl>
                {[
                  'period_start',
                  'period_end',
                  'published_at',
                  'week_start',
                  'week_end',
                  'definition',
                  'coverage',
                  'geo_basis',
                  'reviewed_at',
                  'locator',
                ]
                  .filter((k) => r[k])
                  .map((k) => (
                    <div key={k}>
                      <dt>{label(k)}</dt>
                      <dd>{r[k]}</dd>
                    </div>
                  ))}
              </dl>
              <a href={r.source_url} target="_blank" rel="noreferrer">
                Publikasi sumber
              </a>
              {r.status !== 'unavailable' && (
                <dl>
                  {columns(activeKind)
                    .filter((k) => !common.includes(k) && r[k] !== '')
                    .map((k) => (
                      <div key={k}>
                        <dt>{label(k)}</dt>
                        <dd>{r[k]}</dd>
                      </div>
                    ))}
                </dl>
              )}
              <AggregateHighlights kind={activeKind} row={r} />
              {activeKind === 'respons' &&
                (() => {
                  const m = responseMetric([r]);
                  return (
                    <p>
                      Ketepatan waktu tahap {r.stage}:{' '}
                      {m
                        ? `${m.numerator}/${m.denominator} (${m.percent === null ? 'belum ada kejadian wajib yang jatuh tempo' : m.percent.toFixed(1) + '%'})`
                        : 'belum tersedia'}
                      . Penyebut mencakup seluruh kejadian wajib pada kelompok pemicu yang jatuh
                      tempo, termasuk yang belum selesai. SOP:{' '}
                      <a href={r.sop_url}>{r.sop_version}</a>; tenggat {r.deadline_hours} jam.
                    </p>
                  );
                })()}
              <button
                disabled={!!repository.error}
                aria-label={`Hapus rekap ${r.source_id} ${r.publication_version}`}
                onClick={() => setDeleteTarget(aggregateIdentity(activeKind, r))}
              >
                Hapus rekap
              </button>
              {deleteTarget === aggregateIdentity(activeKind, r) && (
                <div>
                  <p>
                    Hapus rekap {r.source_id}@{r.publication_version} untuk {r.region_code} periode{' '}
                    {r.period_start}–{r.period_end}? Ekspor dahulu bila perlu disimpan.
                  </p>
                  <button onClick={() => remove(activeKind, deleteTarget)}>
                    Konfirmasi hapus rekap
                  </button>
                  <button onClick={() => setDeleteTarget('')}>Batal hapus</button>
                </div>
              )}
            </article>
          ))}
          <button
            disabled={!rows.length}
            onClick={() => download(`${activeKind}-${code}.csv`, csv(columns(activeKind), rows))}
          >
            Ekspor CSV sesuai filter aktif
          </button>
          <button
            disabled={!rows.length}
            onClick={() =>
              saveText(
                `${panel}-${code}.json`,
                JSON.stringify(
                  aggregateExport(activeKind, rows, {
                    region: code,
                    boundaryVersion: version,
                    period,
                    source,
                    panel,
                  }),
                  null,
                  2,
                ),
              )
            }
          >
            Ekspor JSON rekap
          </button>
          <section>
            <h3>Impor rekap agregat — {labels[activeKind]}</h3>
            <p>
              Hanya CSV sesuai templat; tanpa nama pasien, NIK, alamat, nomor telepon, atau
              identitas lain. Baris di luar filter tetap disimpan dengan kode aslinya. Angka
              kabupaten/kota wajib berasal dari publikasi/rekap resmi tingkat tersebut.
            </p>
            <button
              onClick={() => download(`templat-${activeKind}.csv`, csv(columns(activeKind), []))}
            >
              Unduh templat CSV
            </button>
            <label>
              CSV agregat
              <input
                type="file"
                disabled={!!repository.error}
                accept=".csv,text/csv"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void importFile(file, activeKind);
                  e.target.value = '';
                }}
              />
            </label>
            {preview && (
              <div>
                <ImportPreview kind={preview.kind} rows={preview.rows} />
                <button disabled={!!repository.error || importing} onClick={commit}>
                  Konfirmasi rekap tanpa identitas dan simpan
                </button>
                <button onClick={() => setPreview(null)}>Batal</button>
              </div>
            )}
          </section>
        </>
      )}
      {importing && <p role="status">Membaca dan memvalidasi CSV…</p>}
      {message && (
        <pre role="status" className="id-message">
          {message}
        </pre>
      )}
      <footer>
        <p>
          URL menyimpan wilayah, versi batas, periode, sumber, dan panel. Salin alamat peramban
          untuk berbagi tampilan; rekap lokal harus diserahkan terpisah. Snapshot bawaan memiliki
          status bukti tersendiri. Nilai yang belum diperiksa tidak dianggap sudah diverifikasi;
          data yang belum tersedia tidak diisi dengan perkiraan.
        </p>
        <a href="https://github.com/sobri3195/malariascope/blob/main/docs/SURVEILANS-INDONESIA.md">
          Kontrak data dan pembaruan
        </a>
      </footer>
    </main>
  );
}
