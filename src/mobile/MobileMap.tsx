import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../store';
import MapCanvas, { type MapHandle } from '../MapCanvas';
import { validateGeometry } from '../geometry';
import { observed } from '../district-intelligence';
import { adjacencyGraph, hotspotContext } from '../hotspot-spatial';
import {
  commonBreaks,
  mapValue,
  mapColor,
  palette,
  clusterPalette,
  clusterNames,
  layerAvailability,
} from '../map-intelligence';
import { gisRows } from '../scientific-sources';
import { layerOptions } from '../map-options';
import { Card, Sheet, useMobile } from './MobileApp';
import { DistrictFacts } from './MobilePages';
const modes = [
  ['cases', 'Observed Cases'],
  ['incidence', 'Incidence'],
  ['risk', 'Research Risk'],
  ['prediction_risk', 'Predicted Risk'],
  ['rainfall', 'Climate'],
  ['cluster', 'Spatial Analysis'],
  ['completeness', 'Data Completeness'],
] as const;
export default function MobileMap() {
  const { state, update, year, setYear, district, setDistrict, model } = useStore(),
    { evidence } = useMobile();
  const [fallback, setFallback] = useState<any>(null),
    [error, setError] = useState(''),
    [layer, setLayer] = useState('cases'),
    [advanced, setAdvanced] = useState(false),
    [selected, setSelected] = useState<string | null>(null),
    [full, setFull] = useState(false);
  const handle = useRef<MapHandle>(null),
    wrapper = useRef<HTMLDivElement>(null);
  const valid = useMemo(() => {
    try {
      validateGeometry(state.geometry);
      return state.geometry;
    } catch {
      return null;
    }
  }, [state.geometry]);
  useEffect(() => {
    if (valid) return;
    const controller = new AbortController();
    void fetch('/data/geography/papua-context.geojson', { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw Error('Context geometry unavailable');
        return r.json();
      })
      .then((data) => setFallback(validateGeometry(data, true)))
      .catch((e) => {
        if (!controller.signal.aborted) setError(String(e));
      });
    return () => controller.abort();
  }, [valid]);
  const rows = useMemo(
    () =>
      gisRows(
        evidence.history.map(observed).filter((r) => r !== null),
        state.scientificSources || [],
        model,
      ),
    [evidence.history, state.scientificSources, model],
  );
  const graph = useMemo(() => (valid ? adjacencyGraph(valid.features) : {}), [valid]);
  const context = useMemo(
    () => hotspotContext(valid?.features ?? [], graph, rows, year, district, state.thresholds),
    [valid, graph, rows, year, district, state.thresholds],
  );
  const breaks = commonBreaks(
    rows
      .filter((r) => r.year === year)
      .map((r) => mapValue(r, layer, rows, model, state.thresholds, context.clusters)),
    'quantile',
  );
  const availability = layerAvailability(
    valid?.features || [],
    rows,
    year,
    layer,
    model,
    state.thresholds,
    context.clusters,
  );
  const years = [
    ...new Set([
      year,
      ...evidence.history.map((r) => r.year),
      ...state.datasets.flatMap((d) => d.rows.map((r) => r.year)),
    ]),
  ].sort((a, b) => a - b);
  const reduced = state.reduced || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const legend =
    layer === 'risk' || layer === 'prediction_risk'
      ? palette.map((color, i) => ({ color, label: ['LOW', 'MODERATE', 'HIGH', 'VERY HIGH'][i] }))
      : layer === 'cluster'
        ? clusterPalette.map((color, i) => ({ color, label: clusterNames[i] }))
        : breaks.map((b, i) => ({
            color: mapColor(b, layer, breaks),
            label: `Threshold ${i + 1}: ${b.toLocaleString('en-GB', { maximumFractionDigits: 2 })}`,
          }));
  useEffect(() => {
    if (!full) return;
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFull(false);
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [full]);
  return (
    <>
      <h1>Risk Map</h1>
      <p className="m-warning">
        Retrospective research intelligence — not an operational deployment map.
      </p>
      {!availability.available && (
        <p role="status" className="m-warning">
          {availability.reason}. No data is not LOW risk.
        </p>
      )}
      <div className="m-map-filters">
        <label>
          Year
          <select
            aria-label="Map year"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          >
            {years.map((y) => (
              <option key={y}>{y}</option>
            ))}
          </select>
        </label>
        <label>
          Map mode
          <select
            aria-label="Mobile map mode"
            value={layer}
            onChange={(e) => setLayer(e.target.value)}
          >
            {!modes.some(([id]) => id === layer) && (
              <option value={layer}>{layerOptions.find(([id]) => id === layer)?.[1]}</option>
            )}
            {modes.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p>
        {layer === 'risk'
          ? 'Research Risk uses derived observed incidence thresholds, separate from the global risk mode.'
          : layer === 'cluster'
            ? 'Exploratory burden quadrants; not a significance-tested hotspot classification.'
            : layer === 'prediction_risk'
              ? 'Predicted incidence requires the selected model output and valid population.'
              : 'Missing and unmatched districts are shown in gray.'}
      </p>
      {!valid && (
        <p className="m-warning">
          District GIS is not connected. Public country outlines provide geographic context only; no
          district values or selections are assigned to these outlines.
        </p>
      )}
      <div ref={wrapper} className={'m-map-workspace' + (full ? ' m-map-fullscreen' : '')}>
        <div className="m-map-toolbar">
          <button onClick={() => handle.current?.zoom(1)} aria-label="Zoom in">
            +
          </button>
          <button onClick={() => handle.current?.zoom(-1)} aria-label="Zoom out">
            −
          </button>
          <button onClick={() => handle.current?.reset()}>Reset</button>
          <button
            onClick={() => {
              if (context.targetIdentity) handle.current?.focus(context.targetIdentity);
              else setError('Selected district has no unique administrative geometry match.');
            }}
          >
            Locate selected
          </button>
          <button aria-pressed={full} onClick={() => setFull(!full)}>
            {full ? 'Exit fullscreen' : 'Fullscreen'}
          </button>
          <button onClick={() => setAdvanced(true)}>Advanced layers</button>
        </div>
        {valid || fallback ? (
          <MapCanvas
            ref={handle}
            context={state.mapContext ?? 'local'}
            geometry={valid ?? fallback}
            administrative={!!valid}
            rows={rows}
            year={year}
            layer={layer}
            model={model}
            thresholds={state.thresholds}
            breaks={breaks}
            opacity={state.mapOpacity ?? 0.8}
            visible
            clusters={context.clusters}
            selectedIdentity={context.targetIdentity}
            neighbors={context.neighborIds}
            facilities={[]}
            camera={null}
            onCamera={() => {}}
            onSelect={(name) => {
              setDistrict(name);
              setSelected(name);
            }}
            label="Mobile Papua district map"
            reduced={reduced}
          />
        ) : (
          <p role="status">Loading geographic context…</p>
        )}
        <div className="m-map-legend" aria-label="Map legend">
          {legend.map((item) => (
            <span key={item.label}>
              <i style={{ background: item.color }} />
              {item.label}
            </span>
          ))}
          <span>
            <i style={{ background: '#cad5d3' }} />
            Data not available
          </span>
        </div>
      </div>
      {error && <p role="status">{error}</p>}
      <Card title="Spatial context">
        <p>
          {district} · {context.neighbors.length} neighboring district(s)
        </p>
        {context.neighbors.map((n) => (
          <p key={n.district}>
            {n.district} · cases {n.cases ?? 'Data not available'} · incidence{' '}
            {n.incidence ?? 'Data not available'}
          </p>
        ))}
        {!context.neighbors.length && (
          <p>Data not available — a unique administrative match and adjacency are required.</p>
        )}
      </Card>
      {advanced && (
        <Sheet title="Advanced map controls" onClose={() => setAdvanced(false)}>
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
            Layer opacity
            <input
              aria-label="Layer opacity"
              type="range"
              min="0"
              max="1"
              step=".05"
              value={state.mapOpacity ?? 0.8}
              onChange={(e) => update({ mapOpacity: Number(e.target.value) })}
            />
          </label>
          <details>
            <summary>View Layer Provenance</summary>
            <p>
              {layer} · {year} · {model}. Incidence = cases / population × 1,000. Risk thresholds:{' '}
              {state.thresholds.join(', ')}. Anomalies: historical z-score. Missing values are
              withheld.
            </p>
            <p>
              Geometry:{' '}
              {JSON.stringify(
                state.geometrySource || {
                  source: 'Natural Earth country context',
                  license: 'Public domain',
                  metadata: '/data/geography/geometry-metadata.json',
                },
              )}
            </p>
            <p>
              Sources:{' '}
              {JSON.stringify(
                state.datasets.map(({ rows: _rows, sourceRows: _sourceRows, ...meta }) => meta),
              )}
            </p>
            <p>
              Supplemental sources:{' '}
              {JSON.stringify(
                (state.scientificSources || []).map(({ records: _records, ...meta }) => meta),
              )}
            </p>
          </details>
          <button
            onClick={() => {
              setDistrict('All districts');
              setSelected(null);
            }}
          >
            Clear selection
          </button>
          <label>
            Metric layer
            <select
              aria-label="Advanced mobile layer"
              value={layer}
              onChange={(e) => setLayer(e.target.value)}
            >
              {layerOptions.map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <p>
            Pinch to zoom; tap a district polygon for evidence. Local vectors need no external
            tiles. OpenStreetMap is optional online context; tiles are never cached offline.
          </p>
          <button
            onClick={() => {
              handle.current?.reset();
              setAdvanced(false);
            }}
          >
            Reset map extent
          </button>
        </Sheet>
      )}
      {selected && (
        <Sheet title={selected + ' · District evidence'} onClose={() => setSelected(null)}>
          <DistrictFacts name={selected} />
          <p>Neighbor highlighting uses queen-contiguous administrative polygons.</p>
          <div className="m-actions">
            <Link to="/mobile/district" onClick={() => setSelected(null)}>
              Open District Intelligence
            </Link>
            <Link to="/mobile/alerts" onClick={() => setSelected(null)}>
              Open district alerts
            </Link>
            <Link to="/mobile/provenance" onClick={() => setSelected(null)}>
              View Provenance
            </Link>
          </div>
        </Sheet>
      )}
    </>
  );
}
