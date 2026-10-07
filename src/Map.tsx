import { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Maximize, Minus, Plus, RotateCcw, Layers, X, Play, Pause, Download } from 'lucide-react';
import { useStore } from './store';
import { download, incidence, normalize, risk } from './analytics';
import { validateGeometry } from './geometry';
import MapCanvas, { type MapCamera, type MapHandle } from './MapCanvas';
import {
  clusterNames,
  clusterPalette,
  palette,
  layerOptions,
  layerAvailability,
  modes,
  featureIdentity,
  featureName,
  mapValue,
  valueLabel,
  commonBreaks,
  mapStatistics,
  comparisonRows,
  intersectsBounds,
  type Bounds,
  type MapFeature,
} from './map-intelligence';
import {
  validateFacilitySnapshot,
  fetchPublicFacilities,
  type FacilitySnapshot,
} from './public-healthcare';
import type { Adjacency, hotspotContext } from './hotspot-spatial';
import type { moran } from './moran';
import './hotspot.css';
import DataReadiness from './DataReadiness';
import { gisRows } from './scientific-sources';
import { featureDistrictIdentity, resolveDistrict } from './district-registry';
type MoranResult = ReturnType<typeof moran>;
const EMPTY_FEATURES: MapFeature[] = [];
const EMPTY_CLUSTERS: Record<string, string> = {};
const EMPTY_FACILITIES: FacilitySnapshot['facilities'] = [];
const format = (v: number | null | undefined) =>
  v === null || v === undefined
    ? 'Data not available'
    : v.toLocaleString('en-GB', { maximumFractionDigits: 2 });
export default function MapView({ large = false }: { large?: boolean }) {
  const {
    state,
    rows: observedRows,
    signals,
    year,
    setYear,
    district,
    setDistrict,
    model,
    update,
  } = useStore();
  const rows = useMemo(
    () => gisRows(observedRows, state.scientificSources || [], model),
    [observedRows, state.scientificSources, model],
  );
  const root = useRef<HTMLDivElement>(null),
    mapA = useRef<MapHandle>(null),
    mapB = useRef<MapHandle>(null),
    facilityAbort = useRef<AbortController | null>(null);
  const [fallback, setFallback] = useState<any>(null),
    [error, setError] = useState(''),
    [controls, setControls] = useState(false),
    [visible, setVisible] = useState(true),
    [opacity, setOpacity] = useState(state.mapOpacity ?? 0.7),
    [classification, setClassification] = useState('quantile'),
    [compare, setCompare] = useState(false),
    [yearB, setYearB] = useState<number | null>(null),
    [playing, setPlaying] = useState(false),
    [camera, setCamera] = useState<MapCamera | null>(null),
    [boundsA, setBoundsA] = useState<Bounds | null>(null),
    [boundsB, setBoundsB] = useState<Bounds | null>(null),
    [drawer, setDrawer] = useState(false),
    [fullscreen, setFullscreen] = useState(false);
  const [graphState, setGraphState] = useState<{
      geometry: any;
      graph: Adjacency;
      compute: typeof hotspotContext;
    } | null>(null),
    [spatialError, setSpatialError] = useState('');
  const [moranState, setMoranState] = useState<{ key: string; result: MoranResult } | null>(null),
    [moranBusy, setMoranBusy] = useState(false),
    [moranError, setMoranError] = useState(''),
    [permutations, setPermutations] = useState(999);
  const workerRef = useRef<Worker | null>(null),
    contextKeyRef = useRef('');
  const [facilitySnapshot, setFacilitySnapshot] = useState<FacilitySnapshot | null>(
      state.facilitySnapshot ?? null,
    ),
    [showFacilities, setShowFacilities] = useState(false),
    [facilityBusy, setFacilityBusy] = useState(false),
    [facilityError, setFacilityError] = useState('');
  const [motionPreference, setMotionPreference] = useState(false);
  const reduced = state.reduced || motionPreference;
  const validated = useMemo(() => {
    if (!state.geometry) return { geometry: null, error: '' };
    try {
      return { geometry: validateGeometry(state.geometry), error: '' };
    } catch (e) {
      return { geometry: null, error: e instanceof Error ? e.message : String(e) };
    }
  }, [state.geometry]);
  const geometry = validated.geometry || fallback,
    administrative = !!validated.geometry;
  const features: MapFeature[] = administrative
    ? geometry?.features || EMPTY_FEATURES
    : EMPTY_FEATURES;
  const years = useMemo(() => [...new Set(rows.map((r) => r.year))].sort((a, b) => a - b), [rows]);
  const otherYear =
    yearB !== null && years.includes(yearB)
      ? yearB
      : (years.filter((y) => y < year).at(-1) ?? years[0] ?? year);
  const currentDataset = state.datasets.find((d) => d.id === state.active);
  const layer = layerOptions.some(([id]) => id === state.layer) ? state.layer : 'boundaries';
  const layerLabel = layerOptions.find(([id]) => id === layer)?.[1] || layer;
  useEffect(() => {
    let live = true;
    if (!validated.geometry)
      void fetch('/data/geography/papua-context.geojson')
        .then((r) => {
          if (!r.ok) throw Error('Country outline unavailable.');
          return r.json();
        })
        .then((data) => {
          if (live) setFallback(validateGeometry(data, true));
        })
        .catch((e) => {
          if (live) setError(String(e));
        });
    return () => {
      live = false;
    };
  }, [validated.geometry]);
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => setMotionPreference(media.matches);
    change();
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  useEffect(() => {
    setSpatialError('');
    setGraphState(null);
    if (!validated.geometry) return;
    const worker = new Worker(new URL('./hotspot.worker.ts', import.meta.url), { type: 'module' });
    let live = true;
    worker.onmessage = (event) => {
      if (event.data.error) setSpatialError(event.data.error);
      else
        void import('./hotspot-spatial')
          .then((module) => {
            if (live)
              setGraphState({
                geometry: validated.geometry,
                graph: event.data.graph,
                compute: module.hotspotContext,
              });
          })
          .catch((e) => {
            if (live) setSpatialError(String(e));
          });
      worker.terminate();
    };
    worker.onerror = () => {
      setSpatialError('District adjacency calculation failed.');
      worker.terminate();
    };
    worker.postMessage({ geometry: validated.geometry });
    return () => {
      live = false;
      worker.terminate();
    };
  }, [validated.geometry]);
  const ctxA = useMemo(
    () =>
      graphState?.geometry === validated.geometry
        ? graphState?.compute(features, graphState.graph, rows, year, district, state.thresholds) ||
          null
        : null,
    [graphState, validated.geometry, features, rows, year, district, state.thresholds],
  );
  const ctxB = useMemo(
    () =>
      compare && graphState?.geometry === validated.geometry
        ? graphState?.compute(
            features,
            graphState.graph,
            rows,
            otherYear,
            district,
            state.thresholds,
          ) || null
        : null,
    [
      compare,
      graphState,
      validated.geometry,
      features,
      rows,
      otherYear,
      district,
      state.thresholds,
    ],
  );
  const clustersA = ctxA?.clusters || EMPTY_CLUSTERS,
    clustersB = ctxB?.clusters || EMPTY_CLUSTERS;
  const availability = layerAvailability(
    features,
    rows,
    year,
    layer,
    model,
    state.thresholds,
    clustersA,
  );
  const ambiguousMatches = features.filter((f) =>
    resolveDistrict(
      featureDistrictIdentity(f),
      rows.filter((r) => r.year === year),
    ).status.startsWith('Manual'),
  );
  // Classification is pooled across both complete map cohorts, not recalculated on pan.
  const comparisons = useMemo(
    () =>
      comparisonRows(
        features,
        rows,
        year,
        compare ? otherYear : year,
        layer,
        model,
        state.thresholds,
        clustersA,
        clustersB,
      ),
    [
      features,
      rows,
      year,
      compare,
      otherYear,
      layer,
      model,
      state.thresholds,
      clustersA,
      clustersB,
    ],
  );
  const breaks = useMemo(
    () =>
      commonBreaks(
        comparisons.flatMap((r) => (compare ? [r.valueA, r.valueB] : [r.valueA])),
        classification,
      ),
    [comparisons, classification, compare],
  );
  const statsA = useMemo(
    () =>
      mapStatistics(
        features,
        rows,
        year,
        layer,
        model,
        state.thresholds,
        boundsA,
        clustersA,
        visible,
      ),
    [features, rows, year, layer, model, state.thresholds, boundsA, clustersA, visible],
  );
  const statsB = useMemo(
    () =>
      mapStatistics(
        features,
        rows,
        otherYear,
        layer,
        model,
        state.thresholds,
        boundsB,
        clustersB,
        visible,
      ),
    [features, rows, otherYear, layer, model, state.thresholds, boundsB, clustersB, visible],
  );
  const selected =
    ctxA?.selected ||
    rows.find((r) => normalize(r.district) === normalize(district) && r.year === year);
  const contextKey = JSON.stringify([
    state.active,
    currentDataset?.checksum,
    year,
    state.geometrySource?.checksum,
    features.length,
    ctxA?.input,
  ]);
  contextKeyRef.current = contextKey;
  const result = moranState?.key === contextKey ? moranState.result : null;
  useEffect(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
    setMoranBusy(false);
    setMoranError('');
  }, [contextKey]);
  useEffect(() => {
    if (!playing || reduced || years.length < 2) {
      if (reduced) setPlaying(false);
      return;
    }
    const timer = setInterval(() => {
      const index = years.indexOf(year);
      if (index >= years.length - 1) {
        setPlaying(false);
        return;
      }
      setYear(years[Math.max(0, index + 1)]);
    }, 1500);
    return () => clearInterval(timer);
  }, [playing, reduced, years, year, setYear]);
  useEffect(() => {
    const listener = () => setFullscreen(document.fullscreenElement === root.current);
    document.addEventListener('fullscreenchange', listener);
    return () => document.removeEventListener('fullscreenchange', listener);
  }, []);
  useEffect(
    () => () => {
      facilityAbort.current?.abort();
      workerRef.current?.terminate();
    },
    [],
  );
  const lastFocused = useRef<string | null>(null);
  useEffect(() => {
    if (
      ctxA?.targetIdentity &&
      district !== 'All districts' &&
      lastFocused.current !== ctxA.targetIdentity
    ) {
      mapA.current?.focus(ctxA.targetIdentity);
      lastFocused.current = ctxA.targetIdentity;
    }
    if (district === 'All districts') lastFocused.current = null;
  }, [ctxA?.targetIdentity, district]);
  const legend = !administrative
    ? [{ label: 'Country outlines only', color: '#c5d4bf' }]
    : layer === 'cluster'
      ? clusterNames.map((label, i) => ({ label, color: clusterPalette[i] }))
      : ['risk', 'prediction_risk'].includes(layer)
        ? ['LOW', 'MODERATE', 'HIGH', 'VERY HIGH'].map((label, i) => ({ label, color: palette[i] }))
        : layer === 'boundaries' || !administrative
          ? [
              {
                label: administrative ? 'Administrative polygons' : 'Country outlines only',
                color: '#c5d4bf',
              },
            ]
          : breaks.length
            ? [
                `< ${format(breaks[0])}`,
                `≥ ${format(breaks[0])}`,
                `≥ ${format(breaks[1])}`,
                `≥ ${format(breaks[2])}`,
              ].map((label, i) => ({ label, color: palette[i] }))
            : [];
  const facilities =
    showFacilities && facilitySnapshot ? facilitySnapshot.facilities : EMPTY_FACILITIES;
  function onCamera(pane: 'A' | 'B', next: MapCamera, bounds: Bounds) {
    (pane === 'A' ? setBoundsA : setBoundsB)(bounds);
    setCamera((prev) =>
      prev &&
      Math.abs(prev.lat - next.lat) < 1e-7 &&
      Math.abs(prev.lon - next.lon) < 1e-7 &&
      prev.zoom === next.zoom
        ? prev
        : next,
    );
  }
  async function loadFacilities() {
    facilityAbort.current?.abort();
    const controller = new AbortController();
    facilityAbort.current = controller;
    setFacilityBusy(true);
    setFacilityError('');
    try {
      const snapshot = await fetchPublicFacilities(controller.signal);
      if (!controller.signal.aborted) {
        setFacilitySnapshot(snapshot);
        update({ facilitySnapshot: snapshot }, 'Public facility snapshot saved', snapshot.source);
        setShowFacilities(true);
      }
    } catch (e) {
      if (!controller.signal.aborted)
        setFacilityError(
          'Live public facility service unavailable. ' +
            (e instanceof Error ? e.message : String(e)),
        );
    } finally {
      if (!controller.signal.aborted) setFacilityBusy(false);
    }
  }
  function runMoran() {
    setMoranError('');
    if (!ctxA) {
      setMoranError('District geometry and matched observations are required.');
      return;
    }
    workerRef.current?.terminate();
    const key = contextKey;
    const worker = new Worker(new URL('./spatial.worker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;
    setMoranBusy(true);
    worker.onmessage = (e) => {
      if (contextKeyRef.current === key) {
        setMoranBusy(false);
        if (e.data.error) setMoranError(e.data.error);
        else setMoranState({ key, result: e.data.result });
      }
      worker.terminate();
    };
    worker.onerror = () => {
      if (contextKeyRef.current === key) {
        setMoranBusy(false);
        setMoranError('Spatial calculation failed.');
      }
      worker.terminate();
    };
    worker.postMessage({ input: ctxA.input, permutations, seed: 2025 });
  }
  function exportMap(pane: 'A' | 'B') {
    const y = pane === 'A' ? year : otherYear;
    const svg = (pane === 'A' ? mapA : mapB).current?.svg(
      `MALARIASCOPE · ${layerLabel} · ${y}`,
      [
        ...legend,
        ...(administrative && layer !== 'boundaries'
          ? [{ label: 'Data not available', color: '#cbd4d4' }]
          : []),
        ...(facilities.length ? [{ label: 'Public healthcare facility', color: '#29739b' }] : []),
        ...(ctxA?.targetIdentity
          ? [{ label: 'Selected district (solid outline)', color: '#154b42' }]
          : []),
        ...(ctxA?.neighborIds.length
          ? [{ label: 'Adjacent districts (dashed outline)', color: '#4d60bf' }]
          : []),
      ],
      JSON.stringify({
        year: y,
        model,
        source: currentDataset?.name || null,
        checksum: currentDataset?.checksum,
        geometrySource: state.geometrySource || {
          source: 'Natural Earth public-domain country outlines; not district geometry',
          license: 'Public domain',
          checksum: 'a7be025bdd48bb15ce732bc27823de3a88a3e5967852aa83d01c028d642c27d1',
        },
        supplementalSources: (state.scientificSources || []).map(
          ({ records: _records, ...metadata }) => metadata,
        ),
        thresholds: state.thresholds,
        classification,
        comparisonYears: compare ? [year, otherYear] : null,
        selectedDistrict: district,
        neighboringDistricts: ctxA?.neighbors.map((n) => n.district) || null,
        facilitySnapshot:
          showFacilities && facilitySnapshot
            ? {
                source: facilitySnapshot.source,
                license: facilitySnapshot.license,
                retrieved: facilitySnapshot.retrieved,
                dataPeriod: facilitySnapshot.dataPeriod,
              }
            : null,
      }),
    );
    if (!svg) return;
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' })),
      a = document.createElement('a');
    a.href = url;
    a.download = `malariascope-map-${y}.svg`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function exportData() {
    download('geospatial-hotspot-intelligence.json', {
      created: new Date().toISOString(),
      yearA: year,
      yearB: compare ? otherYear : null,
      layer,
      model,
      classification,
      breaks,
      thresholds: state.thresholds,
      source: currentDataset
        ? {
            id: currentDataset.id,
            name: currentDataset.name,
            source: currentDataset.source,
            classification: currentDataset.classification || 'USER IMPORT',
            checksum: currentDataset.checksum,
          }
        : null,
      geometrySource: state.geometrySource || {
        source: 'Natural Earth country outlines; not district geometry',
      },
      supplementalSources: (state.scientificSources || []).map(
        ({ records: _records, ...metadata }) => metadata,
      ),
      viewport: boundsA,
      statisticsA: statsA,
      statisticsB: compare ? statsB : null,
      comparison: comparisons,
      spatialContext: ctxA ? { ...ctxA, input: undefined, clusters: undefined } : null,
      moran: result,
      facilities: showFacilities ? facilitySnapshot : null,
      geojson: {
        type: 'FeatureCollection',
        features: visible
          ? features
              .filter((f) => !boundsA || intersectsBounds(f, boundsA))
              .map((f) => ({
                type: 'Feature',
                geometry: f.geometry,
                properties: {
                  district: featureName(f),
                  district_code: featureIdentity(f),
                  ...comparisons.find((r) => r.identity === featureIdentity(f)),
                },
              }))
          : [],
      },
      method:
        'Viewport statistics use polygon intersection. Comparison uses pooled breaks. Exploratory cluster quadrants require all adjacent case observations. Moran uses the matched induced graph and has no local significance tests.',
    });
  }
  function statistics(stats: typeof statsA, y: number) {
    return (
      <section className="hotspot-stats" aria-label={`Map statistics ${y}`}>
        <div>
          <span>VISIBLE DISTRICTS</span>
          <strong>{stats.visibleDistricts}</strong>
          <small>
            {stats.matchedDistricts} matched · {stats.knownValues} known values
          </small>
        </div>
        <div>
          <span>HIGHEST VALUE</span>
          <strong>{valueLabel(stats.highest?.value ?? null, layer)}</strong>
          <small>{stats.highest?.district || 'No matched value'}</small>
        </div>
        <div>
          <span>LOWEST VALUE</span>
          <strong>{valueLabel(stats.lowest?.value ?? null, layer)}</strong>
          <small>{stats.lowest?.district || 'No matched value'}</small>
        </div>
        <div>
          <span>MEDIAN / MEAN</span>
          <strong>
            {stats.categorical ? 'Not numeric' : `${format(stats.median)} / ${format(stats.mean)}`}
          </strong>
          <small>Available visible values only</small>
        </div>
        <div>
          <span>HIGH / VERY HIGH</span>
          <strong>
            {stats.highRisk} / {stats.veryHighRisk}
          </strong>
          <small>Observed incidence · {stats.knownRisk} known risks</small>
        </div>
      </section>
    );
  }
  const canvas = (pane: 'A' | 'B') => (
    <MapCanvas
      ref={pane === 'A' ? mapA : mapB}
      context={state.mapContext ?? 'local'}
      geometry={geometry}
      administrative={administrative}
      rows={rows}
      year={pane === 'A' ? year : otherYear}
      layer={layer}
      model={model}
      thresholds={state.thresholds}
      breaks={breaks}
      opacity={opacity}
      visible={visible}
      clusters={pane === 'A' ? clustersA : clustersB}
      selectedIdentity={ctxA?.targetIdentity || null}
      neighbors={ctxA?.neighborIds || []}
      facilities={facilities}
      camera={camera}
      onCamera={(next, bounds) => onCamera(pane, next, bounds)}
      onSelect={(name) => {
        setDistrict(name);
        setDrawer(true);
      }}
      label={`Interactive Papua geographic map${pane === 'B' ? ' Year B' : ''}`}
      reduced={reduced}
    />
  );
  return (
    <div
      ref={root}
      className={`hotspot-workspace ${large ? 'expanded' : 'compact'} ${fullscreen ? 'is-fullscreen' : ''}`}
    >
      <p className="gis-disclaimer">
        Retrospective research intelligence — not an operational deployment map.
      </p>
      {large && <DataReadiness />}
      {layer !== 'boundaries' && !availability.available && (
        <p className="notice" role="status">
          {availability.reason}. No data is not LOW risk.
        </p>
      )}
      {!!ambiguousMatches.length && (
        <p className="notice" role="alert">
          Manual geographic match required. {ambiguousMatches.map(featureName).join(', ')}; values
          withheld.
        </p>
      )}
      {large && (
        <>
          <div className="hotspot-toolbar">
            <label>
              Analysis mode
              <select
                aria-label="Spatial analysis mode"
                value={modes.find(([, id]) => id === layer)?.[1] || ''}
                onChange={(e) => update({ layer: e.target.value })}
              >
                <option value="" disabled>
                  Custom layer
                </option>
                {modes.map(([label, id]) => (
                  <option key={id} value={id}>
                    {label}
                    {!layerAvailability(
                      features,
                      rows,
                      year,
                      id,
                      model,
                      state.thresholds,
                      clustersA,
                    ).available
                      ? ' — unavailable'
                      : ''}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Map layer
              <select
                aria-label="Map layer"
                value={layer}
                onChange={(e) => update({ layer: e.target.value })}
              >
                {layerOptions.map(([id, label]) => (
                  <option value={id} key={id}>
                    {label}
                    {!layerAvailability(
                      features,
                      rows,
                      year,
                      id,
                      model,
                      state.thresholds,
                      clustersA,
                    ).available
                      ? ' — unavailable'
                      : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="hotspot-check">
              <input
                aria-label="Compare map years"
                type="checkbox"
                checked={compare}
                onChange={(e) => {
                  setCompare(e.target.checked);
                  setPlaying(false);
                }}
              />
              Compare years
            </label>
            {compare && (
              <label>
                Year B
                <select
                  aria-label="Comparison year B"
                  value={otherYear}
                  onChange={(e) => setYearB(+e.target.value)}
                >
                  {years.map((y) => (
                    <option key={y}>{y}</option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <div className="hotspot-time">
            <button
              className="button"
              aria-label={playing ? 'Pause map animation' : 'Play map animation'}
              disabled={reduced || years.length < 2}
              onClick={() => {
                if (!playing && years.indexOf(year) === years.length - 1) setYear(years[0]);
                setPlaying(!playing);
              }}
            >
              {playing ? <Pause size={14} /> : <Play size={14} />}
            </button>
            <label>
              Year A · {year}
              <input
                aria-label="Map time slider"
                type="range"
                min={0}
                max={Math.max(0, years.length - 1)}
                step={1}
                disabled={!years.length}
                value={Math.max(0, years.indexOf(year))}
                aria-valuetext={String(year)}
                onChange={(e) => {
                  setPlaying(false);
                  setYear(years[+e.target.value]);
                }}
              />
            </label>
            <span>
              {years[0] || 'No observations'} → {years.at(-1) || 'No observations'}
            </span>
            <small>
              {reduced
                ? 'Reduced motion: playback disabled.'
                : 'Available observations only · 1.5 seconds / year'}
            </small>
          </div>
        </>
      )}
      <div className={`hotspot-maps ${compare ? 'comparison' : ''}`}>
        <section className="hotspot-pane">
          <div className="hotspot-map-frame">
            {canvas('A')}
            <div className="map-top">
              <span className="map-pill">
                Papua · {compare ? 'Year A · ' : ''}
                {year}
              </span>
              <button className="map-pill" onClick={() => setControls(!controls)}>
                <Layers size={14} />
                Layers
              </button>
            </div>
            <div className="map-zoom">
              <button aria-label="Zoom in" onClick={() => mapA.current?.zoom(1)}>
                <Plus size={16} />
              </button>
              <button aria-label="Zoom out" onClick={() => mapA.current?.zoom(-1)}>
                <Minus size={16} />
              </button>
              <button
                aria-label="Reset map"
                onClick={() => {
                  mapA.current?.reset();
                  setDrawer(false);
                }}
              >
                <RotateCcw size={16} />
              </button>
              <button
                aria-label={fullscreen ? 'Exit fullscreen map' : 'Fullscreen map'}
                onClick={() => {
                  if (document.fullscreenElement) void document.exitFullscreen();
                  else
                    void root.current
                      ?.requestFullscreen()
                      .catch(() => setError('Fullscreen unavailable in this browser.'));
                }}
              >
                <Maximize size={16} />
              </button>
            </div>
            {controls && (
              <div className="map-controls" aria-label="GIS layer controls">
                <button className="button" onClick={() => setControls(false)}>
                  Close controls
                </button>
                <label>
                  Map source
                  <select
                    aria-label="Map source"
                    value={state.mapContext ?? 'local'}
                    onChange={(e) => update({ mapContext: e.target.value as 'local' | 'osm' })}
                  >
                    <option value="local">Local vector map</option>
                    <option value="osm">OpenStreetMap context — online</option>
                  </select>
                </label>
                <label>
                  District search
                  <input
                    aria-label="District search"
                    list="gis-districts"
                    value={district === 'All districts' ? '' : district}
                    onChange={(e) => {
                      setDistrict(e.target.value || 'All districts');
                      setDrawer(!!e.target.value);
                    }}
                  />
                </label>
                <datalist id="gis-districts">
                  {features.map((f) => (
                    <option key={featureIdentity(f)} value={featureName(f)} />
                  ))}
                </datalist>
                <button
                  className="button"
                  onClick={() => {
                    setDistrict('All districts');
                    setDrawer(false);
                  }}
                >
                  Clear selection
                </button>
                <button className="button" onClick={() => mapA.current?.reset()}>
                  Fit to study area
                </button>
                <details className="layer-provenance">
                  <summary>View Layer Provenance</summary>
                  <dl>
                    <dt>Source Dataset</dt>
                    <dd>{currentDataset?.name || 'Not connected'}</dd>
                    <dt>Dataset Version</dt>
                    <dd>{currentDataset?.checksum || 'Not available'}</dd>
                    <dt>Observation Period</dt>
                    <dd>
                      {year} · {model}
                    </dd>
                    <dt>Geography</dt>
                    <dd>
                      {administrative ? 'Imported administrative polygons' : 'Country context only'}
                    </dd>
                    <dt>Observed / Predicted / Derived</dt>
                    <dd>
                      {['prediction', 'prediction_risk'].includes(layer)
                        ? 'PREDICTED'
                        : [
                              'risk',
                              'cluster',
                              'residual',
                              'signed_residual',
                              'completeness',
                              'incidence',
                              'rainfall_anomaly',
                              'temperature_anomaly',
                            ].includes(layer)
                          ? 'DERIVED'
                          : 'OBSERVED / CONTEXT'}
                    </dd>
                    <dt>Calculation</dt>
                    <dd>
                      {layerLabel}; incidence = cases / population × 1,000; risk thresholds{' '}
                      {state.thresholds.join(', ')}; anomalies = historical z-score; residual =
                      predicted − observed; cluster = exploratory queen-contiguity quadrant;
                      completeness = known inputs / 6 × 100.
                    </dd>
                    <dt>Geometry Source / License / Checksum</dt>
                    <dd>
                      {JSON.stringify(
                        state.geometrySource || {
                          source: 'Natural Earth via datasets/geo-countries',
                          url: 'https://github.com/datasets/geo-countries',
                          license: 'Public domain',
                          checksum:
                            'a7be025bdd48bb15ce732bc27823de3a88a3e5967852aa83d01c028d642c27d1',
                          crs: 'EPSG:4326',
                          administrativeLevel: 'country context only',
                          metadata: '/data/geography/geometry-metadata.json',
                        },
                      )}
                    </dd>
                    <dt>Supplemental source versions</dt>
                    <dd>
                      {JSON.stringify(
                        (state.scientificSources || []).map(
                          ({ records: _records, ...metadata }) => metadata,
                        ),
                      )}
                    </dd>
                  </dl>
                  <p>
                    Source metadata is declared by the importer; schema validation does not
                    independently verify provenance. Scenarios never enter GIS observations.
                  </p>
                </details>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={visible}
                    onChange={(e) => setVisible(e.target.checked)}
                  />
                  Show administrative layer
                </label>
                <label>
                  Active indicator
                  <select
                    aria-label="Map indicator"
                    value={layer}
                    onChange={(e) => update({ layer: e.target.value })}
                  >
                    {layerOptions.map(([id, label]) => (
                      <option key={id} value={id}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Classification
                  <select
                    aria-label="Map classification"
                    value={classification}
                    onChange={(e) => setClassification(e.target.value)}
                  >
                    <option value="quantile">Quantile</option>
                    <option value="interval">Equal interval</option>
                  </select>
                </label>
                <label>
                  Layer opacity
                  <input
                    aria-label="Layer opacity"
                    type="range"
                    min="0"
                    max="1"
                    step=".05"
                    value={opacity}
                    onChange={(e) => {
                      setOpacity(+e.target.value);
                      update({ mapOpacity: +e.target.value });
                    }}
                  />
                </label>
                <button
                  className="button"
                  disabled={!ctxA?.targetIdentity}
                  onClick={() => {
                    if (ctxA?.targetIdentity) mapA.current?.focus(ctxA.targetIdentity);
                  }}
                >
                  Zoom to selected district
                </button>
                <small>
                  {administrative
                    ? 'Imported administrative geometry · code/name joins'
                    : 'Country outlines only; district analysis unavailable.'}
                </small>
              </div>
            )}
            <div className="map-legend">
              <strong>{administrative ? layerLabel.toUpperCase() : 'GEOGRAPHIC CONTEXT'}</strong>
              <div>
                {legend.map((item, i) => (
                  <span key={i}>
                    <i style={{ background: item.color }} />
                    {item.label}
                  </span>
                ))}
                {administrative && (
                  <span>
                    <i style={{ background: '#cbd4d4' }} />
                    Unavailable
                  </span>
                )}
              </div>
              <small>Solid dark = selected · dashed indigo = adjacent</small>
              {compare && <small>Shared scale across Year A and Year B</small>}
            </div>
            {drawer && (
              <aside className="district-drawer" aria-label="District intelligence drawer">
                <button
                  className="icon-btn close"
                  aria-label="Close district drawer"
                  onClick={() => setDrawer(false)}
                >
                  <X size={16} />
                </button>
                <div className="eyebrow">DISTRICT INTELLIGENCE</div>
                <h2>{district}</h2>
                <p>
                  {year} · {currentDataset?.classification || 'USER IMPORT'}
                </p>
                <dl>
                  <dt>Cases</dt>
                  <dd>{format(selected?.cases)}</dd>
                  <dt>Population</dt>
                  <dd>{format(selected?.population)}</dd>
                  <dt>Prediction</dt>
                  <dd>
                    {valueLabel(
                      mapValue(selected, 'prediction', rows, model, state.thresholds),
                      'prediction',
                    )}
                  </dd>
                  <dt>Residual</dt>
                  <dd>
                    {valueLabel(
                      mapValue(selected, 'signed_residual', rows, model, state.thresholds),
                      'signed_residual',
                    )}
                  </dd>
                  <dt>Climate Availability</dt>
                  <dd>
                    {['rainfall', 'temperature', 'humidity']
                      .filter((f) => Number.isFinite(selected?.[f as keyof typeof selected]))
                      .join(', ') || 'Not connected'}
                  </dd>
                  <dt>Alert Count</dt>
                  <dd>
                    {
                      signals.filter(
                        (a) => normalize(a.district) === normalize(district) && a.year === year,
                      ).length
                    }
                  </dd>
                  <dt>Data Completeness</dt>
                  <dd>
                    {valueLabel(
                      mapValue(selected, 'completeness', rows, model, state.thresholds),
                      'completeness',
                    )}
                  </dd>
                  <dt>Data Provenance</dt>
                  <dd>
                    {currentDataset?.source || 'Not connected'} ·{' '}
                    {currentDataset?.checksum || 'No version'}
                  </dd>
                  <dt>Incidence / 1,000</dt>
                  <dd>{selected ? format(incidence(selected)) : 'Data not available'}</dd>
                  <dt>Observed risk</dt>
                  <dd>{selected ? risk(selected, state.thresholds) : 'INSUFFICIENT DATA'}</dd>
                  <dt>Active map value</dt>
                  <dd>
                    {valueLabel(
                      mapValue(selected, layer, rows, model, state.thresholds, clustersA),
                      layer,
                    )}
                  </dd>
                  <dt>Neighbors</dt>
                  <dd>
                    {ctxA?.neighbors.map((n) => n.district).join(', ') || 'Unavailable / isolated'}
                  </dd>
                </dl>
                <NavLink
                  className="button primary"
                  to={`/district-intelligence?district=${encodeURIComponent(district)}&year=${year}`}
                >
                  Open full district profile
                </NavLink>
              </aside>
            )}
          </div>
          {large && statistics(statsA, year)}
        </section>
        {compare && (
          <section className="hotspot-pane">
            <div className="hotspot-map-frame">
              {canvas('B')}
              <span className="map-pill hotspot-year-b">
                Year B · {otherYear} · linked viewport
              </span>
              <div className="map-legend">
                <strong>{layerLabel.toUpperCase()}</strong>
                <div>
                  {legend.map((item, i) => (
                    <span key={i}>
                      <i style={{ background: item.color }} />
                      {item.label}
                    </span>
                  ))}
                  <span>
                    <i style={{ background: '#cbd4d4' }} />
                    Unavailable
                  </span>
                </div>
                <small>Shared scale · same source and model</small>
              </div>
            </div>
            {statistics(statsB, otherYear)}
          </section>
        )}
      </div>
      {validated.error && (
        <p role="alert" className="notice">
          {validated.error}
        </p>
      )}
      {error && (
        <p role="alert" className="notice">
          {error}
        </p>
      )}
      {large && (
        <>
          <div className="hotspot-export">
            <button className="button" onClick={() => exportMap('A')}>
              <Download size={14} />
              Export map SVG{compare ? ' · Year A' : ''}
            </button>
            {compare && (
              <button className="button" onClick={() => exportMap('B')}>
                Export map SVG · Year B
              </button>
            )}
            <button className="button" onClick={exportData}>
              Export map data / GeoJSON
            </button>
            <small>
              Vector image of current viewport, with legend and provenance; basemap tiles omitted.
            </small>
          </div>
          <div className="notice">
            {administrative
              ? `${features.length} administrative polygons · ${currentDataset?.name || 'No surveillance source connected'} · ${model}`
              : 'District boundaries are not connected. Country outlines provide geographic context only; no district shading or district statistics are inferred.'}
            {years.length > 0 &&
              !years.includes(year) &&
              ` No active-source observations for selected year ${year}.`}{' '}
            {layer === 'cluster' && 'Exploratory burden quadrants, not significant local hotspots.'}{' '}
            Viewport coverage uses polygon intersection. Risk counts use observed incidence. Map
            cohorts include all active-source districts; display risk/region filters apply to the
            observation table below.
          </div>
          <div className="hotspot-context-grid">
            <section className="panel hotspot-context" aria-label="Spatial Context">
              <div className="panel-head">
                <h2>Spatial Context</h2>
                <span className="badge teal">DERIVED FROM LOADED DATA</span>
              </div>
              <div className="hotspot-context-body">
                <h3>{district === 'All districts' ? 'Select a district' : district}</h3>
                {spatialError && <p role="alert">{spatialError}</p>}
                {!ctxA?.geometryMatch && (
                  <p>A unique district polygon match is required for neighborhood analysis.</p>
                )}
                <dl>
                  <dt>Neighboring districts</dt>
                  <dd>
                    {ctxA?.geometryMatch
                      ? ctxA.neighbors.map((n) => n.district).join(', ') ||
                        'Isolated (no adjacent polygons)'
                      : 'Data not available'}
                  </dd>
                  <dt>Relative burden</dt>
                  <dd>
                    {format(ctxA?.burdenRatio)}
                    {ctxA?.burdenRatio != null ? ' × mean neighbor cases' : ''}
                  </dd>
                  <dt>Relative incidence</dt>
                  <dd>
                    {format(ctxA?.incidenceRatio)}
                    {ctxA?.incidenceRatio != null ? ' × mean neighbor incidence' : ''}
                  </dd>
                  <dt>Spatial-risk classification</dt>
                  <dd>
                    {ctxA?.spatialRisk || 'INSUFFICIENT DATA'} · mean neighbor incidence{' '}
                    {format(ctxA?.neighborIncidence)}
                  </dd>
                  <dt>Exploratory burden quadrant</dt>
                  <dd>{ctxA?.quadrant || 'Unavailable / insufficient neighborhood evidence'}</dd>
                </dl>
                <p>
                  Queen contiguity includes shared edges or vertices. Neighbor means and quadrants
                  require all adjacent inputs; missing neighbors are listed but never imputed.
                </p>
                {ctxA?.neighbors.length ? (
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Neighbor</th>
                          <th>Cases</th>
                          <th>Incidence / 1,000</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ctxA.neighbors.map((n) => (
                          <tr key={n.district}>
                            <td>
                              <button className="text-link" onClick={() => setDistrict(n.district)}>
                                {n.district}
                              </button>
                            </td>
                            <td>{format(n.cases)}</td>
                            <td>{format(n.incidence)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </div>
            </section>
            <section className="panel hotspot-context" aria-label="Moran analysis">
              <div className="panel-head">
                <h2>Moran-related outputs</h2>
                <NavLink className="text-link" to="/spatial-analysis">
                  Spatial Analysis Lab →
                </NavLink>
              </div>
              <div className="hotspot-context-body">
                <p>
                  Observed burden · Year {year} · matched induced graph ({ctxA?.matched || 0} /{' '}
                  {features.length} districts). Missing districts are excluded from this global
                  calculation.
                </p>
                <div className="hotspot-export">
                  <label>
                    Permutations
                    <select
                      aria-label="Map Moran permutations"
                      value={permutations}
                      onChange={(e) => setPermutations(+e.target.value)}
                    >
                      {[99, 499, 999, 4999].map((n) => (
                        <option key={n}>{n}</option>
                      ))}
                    </select>
                  </label>
                  <button
                    className="button primary"
                    disabled={moranBusy || !ctxA}
                    onClick={runMoran}
                  >
                    {moranBusy ? 'Calculating…' : 'Calculate map Moran’s I'}
                  </button>
                </div>
                {moranError && <p role="alert">{moranError}</p>}
                {result ? (
                  <>
                    <dl>
                      <dt>Global Moran’s I</dt>
                      <dd>{format(result.observed)}</dd>
                      <dt>Expected I</dt>
                      <dd>{format(result.expected)}</dd>
                      <dt>Permutation p</dt>
                      <dd>{result.pValue.toFixed(4)}</dd>
                      <dt>District local I</dt>
                      <dd>
                        {format(
                          result.local.find((r) => normalize(r.district) === normalize(district))
                            ?.localI,
                        )}
                      </dd>
                      <dt>District spatial lag</dt>
                      <dd>
                        {format(
                          result.local.find((r) => normalize(r.district) === normalize(district))
                            ?.lag,
                        )}
                      </dd>
                    </dl>
                    <p>
                      {result.pValue < 0.05
                        ? 'Global association significant at p < 0.05 under these exploratory weights.'
                        : 'Global association is not significant at p < 0.05.'}{' '}
                      {result.permutations} permutations · seed 2025. Local I has no local
                      significance test and does not establish a significant hotspot.
                    </p>
                  </>
                ) : (
                  <p>
                    No derived Moran result for these inputs. Calculate from the loaded
                    observations; supplied study results are not substituted.
                  </p>
                )}
              </div>
            </section>
          </div>
          {compare && (
            <section className="panel">
              <div className="panel-head">
                <h2>
                  District comparison · {year} versus {otherYear}
                </h2>
                <span className="badge">{layerLabel}</span>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>District</th>
                      <th>Year A</th>
                      <th>Year B</th>
                      <th>B − A</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparisons.map((r) => (
                      <tr key={r.identity}>
                        <td>
                          <button className="text-link" onClick={() => setDistrict(r.district)}>
                            {r.district}
                          </button>
                        </td>
                        <td>{valueLabel(r.valueA, layer)}</td>
                        <td>{valueLabel(r.valueB, layer)}</td>
                        <td>
                          {['risk', 'prediction_risk', 'cluster', 'boundaries'].includes(layer)
                            ? 'Category comparison'
                            : format(r.delta)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
          <section className="panel hotspot-facilities" aria-label="Public healthcare facilities">
            <div className="panel-head">
              <h2>Public healthcare facilities</h2>
              <span className="badge">PUBLIC SOURCE · OSM</span>
            </div>
            <div className="hotspot-context-body">
              <p>
                Optional public hospital, clinic, and doctors’ locations in the Papua region
                bounding extent. Coverage is volunteered and may be incomplete; locations do not
                imply availability or readiness. This is a current snapshot, independent of
                surveillance year.
              </p>
              <div className="hotspot-export">
                <button
                  className="button"
                  disabled={facilityBusy}
                  onClick={() => void loadFacilities()}
                >
                  {facilityBusy
                    ? 'Loading public facilities…'
                    : facilitySnapshot
                      ? 'Refresh public healthcare facilities'
                      : 'Load public healthcare facilities'}
                </button>
                <label className="hotspot-check">
                  <input
                    type="checkbox"
                    aria-label="Show public healthcare facilities"
                    disabled={!facilitySnapshot}
                    checked={showFacilities}
                    onChange={(e) => setShowFacilities(e.target.checked)}
                  />
                  Show public healthcare facilities
                </label>
              </div>
              <button
                className="button"
                onClick={() => {
                  void fetch('/data/public-facilities.json')
                    .then((r) => {
                      if (!r.ok) throw Error('Static snapshot unavailable');
                      return r.json();
                    })
                    .then((body) => {
                      const snapshot = validateFacilitySnapshot(body);
                      setFacilitySnapshot(snapshot);
                      setShowFacilities(true);
                      update({ facilitySnapshot: snapshot });
                      setFacilityError('');
                    })
                    .catch((e) => setFacilityError(String(e)));
                }}
              >
                Load static public facility snapshot
              </button>
              {facilityError && <p role="alert">{facilityError}</p>}
              {facilitySnapshot ? (
                <p>
                  {facilitySnapshot.facilities.length} public facility records retained · OSM data
                  period {facilitySnapshot.dataPeriod || 'not supplied'} · retrieved{' '}
                  {new Date(facilitySnapshot.retrieved).toLocaleString('en-GB', {
                    timeZone: 'Asia/Bangkok',
                  })}{' '}
                  ICT.{' '}
                  {facilitySnapshot.truncated ? 'Result cap reached; coverage incomplete.' : ''}{' '}
                  <a
                    href="https://www.openstreetmap.org/copyright"
                    target="_blank"
                    rel="noreferrer"
                  >
                    {facilitySnapshot.license}
                  </a>
                </p>
              ) : (
                <p>No public facility dataset loaded. No locations are synthesized.</p>
              )}
              <p>
                Only public healthcare feature fields are displayed or exported. Private/restricted
                facilities and military-tagged records are excluded; routes, positions, and
                deployment information are not ingested.
              </p>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
