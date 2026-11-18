import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useSkdr } from '../indonesia/SkdrContext';
import { validateSkdr, type SkdrSnapshot } from '../indonesia/skdr';
import { sismalEvidence, validateSismal, type SismalSnapshot } from '../indonesia/sismal';
import { validateSkdrCatalog } from '../indonesia/skdr-catalog';
import { regionName } from '../indonesia/engine';
import {
  parseRegionReference,
  comparisonObservation,
  compareRegions,
  type RegionReference,
  type ComparisonObservation,
} from '../region-comparison';

async function readJson(path: string, signal: AbortSignal) {
  const r = await fetch(path, { signal });
  if (!r.ok) throw Error(`HTTP ${r.status}`);
  return r.json();
}
async function load(ref: RegionReference, signal: AbortSignal): Promise<ComparisonObservation> {
  if (ref.source === 'sismal') {
    const s: SismalSnapshot = await readJson(`/data/indonesia/sismal/${ref.year}.json`, signal);
    const errors = validateSismal(s, ref.year);
    if (errors.length) throw Error(errors.join(' '));
    if (s.id !== ref.snapshot || s.id !== ref.version) throw Error('Versi SISMAL berbeda.');
    return comparisonObservation(
      ref,
      s.rows,
      'district',
      s.sourceUrl,
      `SISMAL ${s.reportingYear}`,
      `SISMAL · kasus positif tahunan · ${s.id} · ${sismalEvidence[s.evidence]}`,
      'Kasus positif',
    );
  }
  const catalog = validateSkdrCatalog(await readJson('/data/indonesia/skdr/catalog.json', signal));
  const entry = catalog.entries.find(
    (e) => e.id === ref.snapshot && (e.version || e.id) === ref.version,
  );
  if (!entry) throw Error('Versi pilihan tidak tersedia dalam katalog.');
  const s: SkdrSnapshot = await readJson(entry.path, signal);
  const errors = validateSkdr(s, entry.complete);
  if (errors.length) throw Error(errors.join(' '));
  if (s.id !== ref.snapshot || (s.version || s.id) !== ref.version)
    throw Error('Versi SKDR berbeda.');
  return comparisonObservation(
    ref,
    s.rows,
    'province',
    s.sourceUrl || s.evidence,
    `M${s.rows[0]?.weekThrough} ${ref.year}`,
    `SKDR · kasus terkonfirmasi kumulatif · edisi ${s.id} · versi ${s.version || s.id} · ${s.evidence === 'attachment-extraction' ? 'ekstraksi lampiran' : 'angka parsial dari permintaan, belum diverifikasi terhadap lampiran'}`,
    'Kasus terkonfirmasi',
  );
}

type ObservationState = { data?: ComparisonObservation; error?: string };
function useObservation(raw: string | null): ObservationState {
  const [state, setState] = useState<{
    raw: string | null;
    data?: ComparisonObservation;
    error?: string;
  }>({ raw: null });
  useEffect(() => {
    const controller = new AbortController();
    const r = parseRegionReference(raw);
    if (r)
      void load(r, controller.signal).then(
        (data) => {
          if (!controller.signal.aborted) setState({ raw, data });
        },
        (e) => {
          if (!controller.signal.aborted) setState({ raw, error: String(e) });
        },
      );
    return () => controller.abort();
  }, [raw]);
  return state.raw === raw ? state : {};
}
function Column({
  slot,
  raw,
  state,
  remove,
}: {
  slot: string;
  raw: string | null;
  state: ObservationState;
  remove: () => void;
}) {
  const ref = parseRegionReference(raw);
  const data = state.data;
  return (
    <article aria-label={`Wilayah ${slot}`}>
      <h4>
        {slot} · {ref ? regionName('2025', ref.region) : 'Belum dipilih'}
      </h4>
      {raw && <button onClick={remove}>Hapus {slot}</button>}
      {ref && (
        <p>
          {ref.region} · {ref.source.toUpperCase()} · {ref.year} · snapshot {ref.snapshot} · versi{' '}
          {ref.version}
        </p>
      )}
      {raw && !ref && <p role="alert">Pilihan URL tidak sah. Hapus lalu pilih ulang.</p>}
      {ref && !data && (
        <p role="status">
          {state.error ? `Data belum tersedia: ${state.error}` : 'Memuat data perbandingan…'}
        </p>
      )}
      {data && (
        <>
          <p>Jenjang: {data.level}</p>
          <p>
            {data.indicator}:{' '}
            {data.value === null ? 'Belum tersedia' : data.value.toLocaleString('id-ID')}{' '}
            {data.unit} · {data.availability}
          </p>
          <p>Periode: {data.period}</p>
          <p>Sumber: {data.source}</p>
          <p>Definisi sumber: {data.definition}</p>
          <p>
            Cakupan data: {data.coverage.available}/{data.coverage.total} {data.coverage.label}{' '}
            berangka pada master wilayah. Kelengkapan pelaporan resmi belum tersedia.
          </p>
        </>
      )}
    </article>
  );
}

function Difference({
  a,
  b,
  stateA,
  stateB,
}: {
  a: string | null;
  b: string | null;
  stateA: ObservationState;
  stateB: ObservationState;
}) {
  const result = stateA.data && stateB.data ? compareRegions(stateA.data, stateB.data) : undefined;
  return (
    <div role="status" aria-label="Hasil perbandingan">
      {!a || !b ? (
        'Pilih dua wilayah untuk membandingkan.'
      ) : !result ? (
        stateA.error ||
        stateB.error ||
        (a && !parseRegionReference(a)) ||
        (b && !parseRegionReference(b)) ? (
          'Perbandingan belum dapat dihitung: pilihan atau data tidak tersedia.'
        ) : (
          'Memuat hasil perbandingan…'
        )
      ) : result.reasons.length ? (
        <>Tidak sebanding: {result.reasons.join(' ')}</>
      ) : (
        <>
          Selisih B − A: {result.difference!.toLocaleString('id-ID')} kasus.{' '}
          {result.relative === null
            ? 'Persentase tidak dapat dihitung'
            : `Perubahan relatif terhadap A: ${result.relative.toLocaleString('id-ID', { maximumFractionDigits: 2 })}%`}
        </>
      )}
    </div>
  );
}

export default function RegionComparison({
  selected,
  geometryCodes,
}: {
  selected: string;
  geometryCodes: string[];
}) {
  const { active, selection, data, sismal } = useSkdr();
  const location = useLocation(),
    navigate = useNavigate();
  const q = new URLSearchParams(location.search),
    a = q.get('compareA'),
    b = q.get('compareB');
  const stateA = useObservation(a),
    stateB = useObservation(b);
  if (!active) return null;
  function update(nextA: string | null, nextB: string | null) {
    const params = new URLSearchParams(location.search);
    for (const [name, value] of [
      ['compareA', nextA],
      ['compareB', nextB],
    ]) {
      if (value) params.set(name!, value);
      else params.delete(name!);
    }
    navigate(
      { pathname: location.pathname, search: params.toString() },
      { state: { workspaceContextSync: true } },
    );
  }
  const source = selection.source || 'skdr';
  const snapshot = source === 'sismal' ? sismal : data;
  const current: RegionReference | null = snapshot
    ? {
        region: selected,
        source,
        snapshot: snapshot.id,
        year: selection.year,
        version: source === 'sismal' ? snapshot.id : data?.version || snapshot.id,
      }
    : null;
  const serialized = current ? JSON.stringify(current) : null;
  const same = (raw: string | null) => {
    const ref = parseRegionReference(raw);
    return (
      ref?.region === selected &&
      ref?.source === source &&
      ref?.snapshot === current?.snapshot &&
      ref?.version === current?.version
    );
  };
  return (
    <section className="region-comparison" aria-label="Bandingkan Dua Wilayah">
      <h3>Bandingkan Dua Wilayah</h3>
      <button disabled={!current || same(a) || same(b)} onClick={() => update(serialized, b)}>
        Tetapkan sebagai A
      </button>
      {a && (
        <button disabled={!current || same(a) || same(b)} onClick={() => update(a, serialized)}>
          Tetapkan sebagai B
        </button>
      )}
      {(a || b) && (
        <>
          <button disabled={!a || !b} onClick={() => update(b, a)}>
            Tukar A/B
          </button>
          <button onClick={() => update(null, null)}>Kembali ke wilayah tunggal</button>
          <div className="comparison-columns">
            <Column slot="A" raw={a} state={stateA} remove={() => update(null, b)} />
            <Column slot="B" raw={b} state={stateB} remove={() => update(a, null)} />
          </div>
          <Difference a={a} b={b} stateA={stateA} stateB={stateB} />
          {[
            ['A', a],
            ['B', b],
          ].map(([slot, raw]) => {
            const ref = parseRegionReference(raw);
            return (
              ref &&
              !geometryCodes.includes(ref.region) && (
                <p key={slot}>
                  Geometri {slot} · {regionName('2025', ref.region)} belum tersedia; label peta
                  tidak dapat ditempatkan.
                </p>
              )
            );
          })}
        </>
      )}
    </section>
  );
}
