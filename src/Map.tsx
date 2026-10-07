import { useEffect, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { resolveFeatureRow } from './geometry';
import { Maximize, Minus, Plus, RotateCcw, Layers, Info, X } from 'lucide-react';
import { useStore } from './store';
import { change, incidence, normalize, risk, type Row } from './analytics';
const palette = ['#43a79a', '#e6bf60', '#dd9160', '#c15f57'];
function variable(r: Row, layer: string, model: string) {
  return layer === 'incidence'
    ? incidence(r)
    : layer === 'population'
      ? (r.population ?? null)
      : layer === 'rainfall'
        ? (r.rainfall ?? null)
        : layer === 'temperature'
          ? (r.temperature ?? null)
          : layer === 'prediction'
            ? r.model === model
              ? (r.prediction ?? null)
              : null
            : layer === 'completeness'
              ? ([r.population, r.rainfall, r.temperature].filter((v) => v !== undefined).length /
                  3) *
                100
              : layer === 'residual'
                ? r.prediction === undefined || r.model !== model
                  ? null
                  : Math.abs(r.prediction - r.cases)
                : r.cases;
}
export default function MapView({ large = false }: { large?: boolean }) {
  const div = useRef<HTMLDivElement>(null),
    map = useRef<L.Map | null>(null),
    geo = useRef<L.GeoJSON | null>(null);
  const { state, rows, year, setDistrict, update, district, model } = useStore();
  const [opacity, setOpacity] = useState(0.65),
    [error, setError] = useState(''),
    [controls, setControls] = useState(false),
    [visible, setVisible] = useState(true),
    [classification, setClassification] = useState('quantile'),
    [selected, setSelected] = useState('');
  const focusRef = useRef<{ district: string; geometry: any } | null>(null);
  const identityRows = state.datasets
    .flatMap((d) => d.rows)
    .filter((r) => normalize(r.district) === normalize(district));
  const selectedCodes = new Set(identityRows.map((r) => r.district_code).filter(Boolean));
  const selectedCode = selectedCodes.size === 1 ? [...selectedCodes][0] : null;
  function isSelectedFeature(f: any) {
    const code = f?.properties?.district_code || f?.properties?.code;
    return selectedCode && code
      ? String(code) === selectedCode
      : normalize(String(f?.properties?.district || f?.properties?.name || '')) ===
          normalize(district);
  }
  const selectedRow = rows.find(
    (r) => normalize(r.district) === normalize(selected) && r.year === year,
  );
  const dataRows = rows.filter((r) => r.year === year);
  const values = dataRows
    .map((r) => variable(r, state.layer, model))
    .filter((v): v is number => v !== null)
    .sort((a, b) => a - b);
  const breaks = values.length
    ? [1, 2, 3].map((i) =>
        classification === 'quantile'
          ? values[Math.min(values.length - 1, Math.floor((values.length * i) / 4))]
          : values[0] + ((values.at(-1)! - values[0]) * i) / 4,
      )
    : [];
  useEffect(() => {
    if (!div.current) return;
    const m = L.map(div.current, { zoomControl: false, attributionControl: true }).setView(
      [-3.2, 138.4],
      6,
    );
    map.current = m;
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '© OpenStreetMap contributors © CARTO · outlines © Natural Earth',
      maxZoom: 18,
    })
      .on('tileerror', () => setError('Basemap unavailable. Public outlines remain interactive.'))
      .addTo(m);
    const resize = new ResizeObserver(() => m.invalidateSize());
    resize.observe(div.current);
    return () => {
      resize.disconnect();
      m.remove();
      map.current = null;
    };
  }, []);
  useEffect(() => {
    let live = true;
    async function draw() {
      if (!map.current) return;
      try {
        const data =
          state.geometry ||
          (await fetch('/data/boundaries.geojson').then((r) => {
            if (!r.ok) throw Error();
            return r.json();
          }));
        if (!live || !map.current) return;
        geo.current?.remove();
        if (!visible) return;
        geo.current = L.geoJSON(data, {
          style: (f) => {
            const row = resolveFeatureRow(
              f,
              rows.filter((r) => r.year === year),
            );
            const value = row ? variable(row, state.layer, model) : null;
            let fill = '#c5d4bf';
            if (state.geometry && state.layer !== 'boundaries')
              fill =
                row && state.layer === 'risk'
                  ? palette[
                      ['LOW', 'MODERATE', 'HIGH', 'VERY HIGH'].indexOf(risk(row, state.thresholds))
                    ] || '#cbd4d4'
                  : value === null
                    ? '#cbd4d4'
                    : palette[breaks.filter((b) => value >= b).length] || palette[0];
            return {
              color: isSelectedFeature(f) ? '#177e70' : '#597a76',
              weight: isSelectedFeature(f) ? 3 : 1,
              fillColor: fill,
              fillOpacity: opacity,
            };
          },
          onEachFeature: (f, l) => {
            const name = String(f.properties?.district || f.properties?.name || 'Unnamed geometry');
            const row = resolveFeatureRow(
              f,
              rows.filter((r) => r.year === year),
            );
            const el = document.createElement('div');
            const title = document.createElement('strong');
            title.textContent = name;
            el.append(
              title,
              document.createElement('br'),
              document.createTextNode(
                row
                  ? `${row.cases.toLocaleString()} cases · incidence ${incidence(row)?.toFixed(2) ?? 'not available'}`
                  : 'No linked district surveillance data',
              ),
            );
            l.bindTooltip(el);
            l.on('click', () => {
              if (state.geometry) {
                setSelected(row?.district || name);
                setDistrict(row?.district || name);
              } else l.bindPopup(el).openPopup();
            });
          },
        }).addTo(map.current);
        if (
          state.geometry &&
          district !== 'All districts' &&
          (focusRef.current?.district !== district || focusRef.current?.geometry !== state.geometry)
        ) {
          zoomSelected();
          focusRef.current = { district, geometry: state.geometry };
        }
      } catch {
        setError('Boundary geometry could not be loaded. Import a valid GeoJSON in Data Center.');
      }
    }
    void draw();
    return () => {
      live = false;
    };
  }, [
    state.geometry,
    state.layer,
    state.thresholds,
    rows,
    year,
    opacity,
    visible,
    classification,
    district,
    setDistrict,
    model,
  ]);
  function zoomSelected() {
    if (!geo.current || !map.current) return;
    geo.current.eachLayer((l) => {
      const f = (l as L.Polygon & { feature?: any }).feature;
      if (isSelectedFeature(f) && 'getBounds' in l)
        map.current?.fitBounds((l as L.Polygon).getBounds(), { padding: [30, 30] });
    });
  }
  return (
    <div className={`map-wrap ${large ? 'large' : ''}`}>
      <div ref={div} className="map-canvas" aria-label="Interactive Papua geographic map" />
      <div className="map-top">
        <span className="map-pill">
          <span className="dot" /> Papua region <span className="muted">/ {year}</span>
        </span>
        <button onClick={() => setControls(!controls)} className="map-pill">
          <Layers size={14} /> Layers
        </button>
      </div>
      {controls && (
        <div className="map-controls">
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
              value={state.layer}
              onChange={(e) => update({ layer: e.target.value })}
            >
              {[
                ['boundaries', 'Administrative context'],
                ['risk', 'Derived incidence risk'],
                ['cases', 'Observed cases'],
                ['incidence', 'Incidence / 1,000'],
                ['population', 'Population'],
                ['rainfall', 'Rainfall'],
                ['temperature', 'Temperature'],
                ['prediction', 'Model predictions'],
                ['residual', 'Absolute model error'],
                ['completeness', 'Optional-field completeness'],
              ].map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Classification
            <select value={classification} onChange={(e) => setClassification(e.target.value)}>
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
              onChange={(e) => setOpacity(Number(e.target.value))}
            />
          </label>
          <button className="button" onClick={zoomSelected}>
            Zoom to selected district
          </button>
          <small>
            {state.geometry
              ? 'Imported geometry · name-based joins'
              : 'Country outlines only. District boundaries not connected.'}
          </small>
        </div>
      )}
      <div className="map-zoom">
        <button aria-label="Zoom in" onClick={() => map.current?.zoomIn()}>
          <Plus size={16} />
        </button>
        <button aria-label="Zoom out" onClick={() => map.current?.zoomOut()}>
          <Minus size={16} />
        </button>
        <button
          aria-label="Reset map"
          onClick={() => {
            map.current?.setView([-3.2, 138.4], 6);
            setSelected('');
          }}
        >
          <RotateCcw size={15} />
        </button>
        <button
          aria-label="Fullscreen map"
          onClick={() => {
            void div.current?.parentElement
              ?.requestFullscreen()
              .catch(() => setError('Fullscreen is unavailable in this browser.'));
          }}
        >
          <Maximize size={15} />
        </button>
      </div>
      <div className="map-legend">
        <strong>
          {state.geometry && state.layer !== 'boundaries'
            ? state.layer === 'risk'
              ? 'DERIVED INCIDENCE RISK'
              : state.layer.toUpperCase()
            : 'GEOGRAPHIC CONTEXT'}
        </strong>
        {state.geometry && state.layer !== 'boundaries' ? (
          <div>
            {(state.layer === 'risk'
              ? ['LOW', 'MODERATE', 'HIGH', 'VERY HIGH']
              : breaks.length
                ? [
                    `< ${breaks[0].toFixed(1)}`,
                    `≥ ${breaks[0].toFixed(1)}`,
                    `≥ ${breaks[1].toFixed(1)}`,
                    `≥ ${breaks[2].toFixed(1)}`,
                  ]
                : ['No matched values']
            ).map((s, i) => (
              <span key={`${s}-${i}`}>
                <i style={{ background: palette[i] }} />
                {s}
              </span>
            ))}
          </div>
        ) : (
          <div>
            <span>
              <i style={{ background: '#c5d4bf' }} /> Public country outlines
            </span>
          </div>
        )}
        <small>
          <Info size={11} />{' '}
          {state.geometry
            ? state.layer === 'completeness'
              ? 'Populated population, rainfall, temperature fields ÷ 3 × 100'
              : 'Gray = data not available · imported district observations'
            : 'Risk shading unavailable without district boundaries'}
        </small>
      </div>
      {error && <div className="map-error">{error}</div>}
      <span className="map-scale">100 km ━━━━━</span>
      {selected && (
        <aside className="district-drawer" aria-label="District intelligence drawer">
          <button
            aria-label="Close district drawer"
            className="icon-btn close"
            onClick={() => setSelected('')}
          >
            <X size={17} />
          </button>
          <div className="eyebrow">DISTRICT INTELLIGENCE</div>
          <h2>{selected}</h2>
          <p>{year} · loaded observations</p>
          <dl>
            <dt>Cases</dt>
            <dd>{selectedRow?.cases.toLocaleString() ?? 'Data not available'}</dd>
            <dt>Population</dt>
            <dd>{selectedRow?.population?.toLocaleString() ?? 'Data not available'}</dd>
            <dt>Incidence / 1,000</dt>
            <dd>
              {selectedRow
                ? (incidence(selectedRow)?.toFixed(2) ?? 'Data not available')
                : 'Data not available'}
            </dd>
            <dt>Annual change</dt>
            <dd>
              {selectedRow
                ? (change(selectedRow, rows)?.toFixed(1) ?? 'Data not available')
                : 'Data not available'}
            </dd>
            <dt>Derived risk</dt>
            <dd>{selectedRow ? risk(selectedRow, state.thresholds) : 'Data not available'}</dd>
            <dt>Prediction</dt>
            <dd>{selectedRow?.prediction?.toLocaleString() ?? 'Data not available'}</dd>
            <dt>Rainfall</dt>
            <dd>{selectedRow?.rainfall ?? 'Data not available'}</dd>
            <dt>Source</dt>
            <dd>
              {state.datasets.find((d) => d.id === state.active)?.name ?? 'No matched dataset'} ·
              USER IMPORT
            </dd>
          </dl>
          <NavLink
            className="button primary"
            to={`/district-intelligence?district=${encodeURIComponent(selected)}&year=${year}`}
          >
            Open full district profile
          </NavLink>
          <NavLink className="text-link" to="/provenance">
            Inspect provenance →
          </NavLink>
        </aside>
      )}
    </div>
  );
}
