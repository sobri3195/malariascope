import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, useSearchParams } from 'react-router-dom';
import { useStore } from '../store';
import { download } from '../analytics';
import { validateGeometry } from '../geometry';
import { researchRows, studyVersion } from '../research-data/research';
import RegionalCanvas, { type RegionalMapHandle } from './RegionalCanvas';
import { GeographicBreadcrumb, ContextLegend, MapProvenance } from './MapChrome';
import MapTools from './MapTools';
import { measure, type MapTool, type Measurement } from './measurement';
import type { Position } from 'geojson';
import { LayerControl, Timeline } from './Controls';
import { Comparison, RegionDetails } from './Details';
import {
  countries,
  presets,
  readFilters,
  writeFilters,
  scopedRows,
  availableYears,
  indicatorInfo,
  valueFor,
  breaksFor,
  exportRecords,
  recordsCSV,
  filteredGeometry,
  models,
  type Filters,
  type Geometry,
  type CountryCode,
} from './engine';
import './asean.css';

async function loadCountries(signal: AbortSignal): Promise<Geometry> {
  const [response, metadata] = await Promise.all([
    fetch('/data/geography/asean-countries.geojson', { signal }),
    fetch('/data/geography/asean-metadata.json', { signal }),
  ]);
  if (!response.ok || !metadata.ok)
    throw Error('ASEAN boundary files could not be loaded. Reconnect and retry.');
  const [raw, source] = await Promise.all([response.text(), metadata.json()]);
  if (source.crs !== 'EPSG:4326')
    throw Error('Country boundaries require WGS84 longitude/latitude (EPSG:4326).');
  const hash = [
    ...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw))),
  ]
    .map((n) => n.toString(16).padStart(2, '0'))
    .join('');
  if (hash !== source.sha256)
    throw Error('ASEAN boundary checksum mismatch. Reload a trusted application build.');
  const geometry = validateGeometry(JSON.parse(raw), true) as Geometry;
  const ids = geometry.features.map((f) => f.properties?.['ISO3166-1-Alpha-3']);
  if (ids.length !== 11 || countries.some((c) => !ids.includes(c.code)))
    throw Error('The country dataset does not contain exactly the eleven ASEAN members.');
  return geometry;
}
const emptyRows: ReturnType<typeof researchRows> = [];
export default function AseanWorkspace() {
  const { research, researchError, retryResearch } = useStore();
  const [params, setParams] = useSearchParams(),
    query = params.toString();
  const [filters, setFilters] = useState(() => readFilters(new URLSearchParams(query)));
  useEffect(() => setFilters(readFilters(new URLSearchParams(query))), [query]);
  const current = useRef(filters);
  current.current = filters;
  const patch = useCallback(
    (change: Partial<Filters>) => {
      // Update controlled inputs immediately; router navigation can commit in a transition.
      const geographicChange =
        change.area !== undefined ||
        change.countries !== undefined ||
        change.district !== undefined;
      const next = {
        ...current.current,
        camera: geographicChange ? null : current.current.camera,
        ...change,
      };
      current.current = next;
      setFilters(next);
      if (geographicChange) setDetailOpen(!!next.district || next.countries.length === 1);
      setParams(writeFilters(next, new URLSearchParams(window.location.search)), { replace: true });
    },
    [setParams],
  );
  const [geometry, setGeometry] = useState<Geometry | null>(null),
    [error, setError] = useState(''),
    [attempt, setAttempt] = useState(0);
  const [coordinates, setCoordinates] = useState('Move or tap the map'),
    [status, setStatus] = useState(''),
    [busy, setBusy] = useState(false),
    [search, setSearch] = useState('');
  const [playing, setPlaying] = useState(false),
    [speed, setSpeed] = useState(1000);
  const [bookmark, setBookmark] = useState<string | null>(null);
  const [panel, setPanel] = useState<'layers' | 'tools' | null>(null),
    [detailOpen, setDetailOpen] = useState(filters.countries.length > 0 || !!filters.district);
  const [tool, setTool] = useState<MapTool>('inspect'),
    [points, setPoints] = useState<Position[]>([]),
    [measurement, setMeasurement] = useState<Measurement | null>(null),
    [measureError, setMeasureError] = useState('');
  const map = useRef<RegionalMapHandle>(null),
    root = useRef<HTMLDivElement>(null),
    camera = useRef<[number, number, number] | null>(filters.camera);
  const rows = useMemo(
    () => (research ? researchRows(research, filters.model, true) : emptyRows),
    [research, filters.model],
  );
  const districts = useMemo(() => [...new Set(rows.map((r) => r.district))].sort(), [rows]);
  const years = useMemo(() => availableYears(rows, filters), [rows, filters]);
  const filtered = useMemo(() => scopedRows(rows, filters), [rows, filters]);
  // Classification is fixed for the complete study cohort across annual periods, including comparison.
  const breaks = useMemo(
    () =>
      breaksFor(
        rows.map((r) => valueFor(r, filters.indicator)).filter((v): v is number => v !== null),
      ),
    [rows, filters.indicator],
  );
  const study = research?.geometry as Geometry | undefined;
  const country = filters.countries.length === 1 ? filters.countries[0] : null;
  const info = indicatorInfo(filters.indicator),
    values = filtered
      .map((r) => valueFor(r, filters.indicator))
      .filter((v): v is number => v !== null);
  const addPoint = (point: Position) => {
    setPoints((previous) => (previous.length >= 256 ? previous : [...previous, point]));
    setMeasurement(null);
    setMeasureError(
      points.length >= 256 ? 'Maximum 256 vertices. Undo or start a new measurement.' : '',
    );
  };
  const startTool = (next: MapTool) => {
    setTool(next);
    setMeasureError('');
    if (next !== 'inspect') {
      setPoints([]);
      setMeasurement(null);
    }
  };
  const clearMeasurement = () => {
    setPoints([]);
    setMeasurement(null);
    setMeasureError('');
    setTool('inspect');
  };
  const finishMeasurement = () => {
    if (tool === 'inspect') return;
    try {
      setMeasurement(measure(tool, points, filters.area === 'papua' ? study || null : null));
      setMeasureError('');
      setTool('inspect');
    } catch (e) {
      setMeasureError(e instanceof Error ? e.message : String(e));
    }
  };
  const showMetadata = () => {
    setPanel(null);
    const details = document.getElementById('asean-map-provenance') as HTMLDetailsElement | null;
    if (details) {
      details.open = true;
      details.querySelector('summary')?.focus();
      details.scrollIntoView({ block: 'nearest' });
    }
  };
  useEffect(() => {
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) {
        document
          .querySelector<HTMLButtonElement>(
            '[aria-controls="asean-map-panel"][aria-expanded="true"]',
          )
          ?.focus();
        setPanel(null);
        setTool('inspect');
      }
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, []);
  useEffect(() => {
    const abort = new AbortController();
    setError('');
    void loadCountries(abort.signal)
      .then(setGeometry)
      .catch((e) => {
        if (!abort.signal.aborted) setError(e instanceof Error ? e.message : String(e));
      });
    return () => abort.abort();
  }, [attempt]);
  useEffect(() => {
    try {
      setBookmark(localStorage.getItem('malariascope-asean-map-view'));
    } catch {
      /* Saving still reports storage errors explicitly. */
    }
  }, []);
  useEffect(() => {
    if (years.length < 2) {
      setPlaying(false);
      return;
    }
    if (!playing) return;
    const interval = window.setInterval(() => {
      const index = years.indexOf(current.current.year);
      patch({ year: years[(index + 1) % years.length] });
    }, speed);
    return () => window.clearInterval(interval);
  }, [playing, years.join(','), speed, patch]);
  const goPapua = () => {
    setDetailOpen(true);
    setPlaying(false);
    patch({ area: 'papua', countries: ['IDN'], district: '', camera: null });
  };
  const chooseCountry = (code: CountryCode) => {
    setDetailOpen(true);
    setPlaying(false);
    patch({
      area: code === 'IDN' ? 'indonesia' : 'asean',
      countries: [code],
      district: '',
      camera: null,
    });
    setStatus(
      `${countries.find((c) => c.code === code)?.name} selected. National observations are not connected.`,
    );
  };
  const reset = () => {
    if (filters.area === 'asean') map.current?.fit();
    setPlaying(false);
    patch(readFilters(new URLSearchParams()));
    setSearch('');
    setDetailOpen(false);
    setPanel(null);
    clearMeasurement();
    setStatus('Regional view and all map filters reset.');
  };
  async function act(operation: () => void | Promise<void>, success: string) {
    setBusy(true);
    setStatus('Preparing…');
    try {
      await operation();
      setStatus(success);
    } catch (e) {
      setStatus(`Action failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }
  const share = () =>
    act(async () => {
      const p = writeFilters(
        { ...filters, camera: camera.current },
        new URLSearchParams(window.location.search),
      );
      const url = new URL(window.location.href);
      url.search = p.toString();
      await navigator.clipboard.writeText(url.toString());
      patch({ camera: camera.current });
    }, 'Shareable map URL copied.');
  const save = () =>
    act(() => {
      const saved = writeFilters({ ...filters, camera: camera.current }).toString();
      localStorage.setItem('malariascope-asean-map-view', saved);
      setBookmark(saved);
    }, 'Map configuration saved locally.');
  const records = () => exportRecords(rows, filters, studyVersion);
  const exportVector = () =>
    act(() => {
      const selected = filters.area === 'papua' ? study : geometry;
      if (!selected) throw Error('Selected geometry is not loaded.');
      const output = filteredGeometry(selected, rows, filters, studyVersion);
      if (!output.features.length) throw Error('No geometry matches the selected filters.');
      download(`malariascope-${filters.area}-${filters.year}.geojson`, output);
    }, 'Filtered GeoJSON exported with values, missingness and attribution.');
  const png = () =>
    act(async () => {
      const svg = map.current?.image();
      if (!svg) throw Error('Map is not ready.');
      const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      try {
        const image = new Image();
        image.src = url;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height + 185;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw Error('PNG rendering is not supported.');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(image, 0, 0);
        ctx.fillStyle = '#17384c';
        ctx.font = '14px sans-serif';
        const context = filters.indicator === 'boundaries' || !filters.visible;
        const lines = [
          `MALARIASCOPE · ${presets[filters.area].label} · ${filters.year}`,
          `${info.title} (${info.unit}) · ${info.kind} · ${filters.visible ? 'visible' : 'hidden'}`,
          `District filter: ${filters.district || 'all'} · Countries: ${filters.countries.join(', ') || 'all'}`,
          context
            ? 'Administrative context only; no epidemiological legend or values.'
            : 'Equal-width bins across the supplied study periods; gray = unavailable.',
          context
            ? 'Muted country/study outlines; teal = selected geography.'
            : `Breaks: ${values.length ? breaks.map((v) => v.toFixed(2)).join(' / ') : 'no connected values for this scope'}`,
          'Natural Earth: public domain. Papua: geoBoundaries / BPS / WFP / OCHA; CC BY 3.0 IGO.',
          'Study: MALARIASCOPE-AMMM2026-v1; not independently audited; redistribution license unspecified.',
          'No national surveillance connected. No prospective forecast or operational validation.',
          measurement
            ? `User-drawn measurement: ${measurement.value.toFixed(2)} ${measurement.unit} (Turf spherical Earth); no observations apportioned.`
            : points.length
              ? `Unfinished user drawing: ${points.length} vertices; no calculated statistics.`
              : 'No user-drawn study area or measurement.',
        ];
        lines.forEach((line, index) =>
          ctx.fillText(line, 12, image.height + 22 + index * 20, canvas.width - 24),
        );
        const blob = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(
            (value) => (value ? resolve(value) : reject(Error('PNG encoding failed.'))),
            'image/png',
          ),
        );
        const link = document.createElement('a'),
          pngURL = URL.createObjectURL(blob);
        link.href = pngURL;
        link.download = `malariascope-${filters.area}-${filters.year}.png`;
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(pngURL), 1000);
      } finally {
        URL.revokeObjectURL(url);
      }
    }, 'Map PNG exported with legend thresholds, provenance and limitations.');
  return (
    <div className="asean-workspace" ref={root}>
      <header className="asean-header">
        <div>
          <span className="asean-eyebrow">REGIONAL GEOSPATIAL INTELLIGENCE</span>
          <h1>ASEAN Map Explorer</h1>
          <p>Explore geography. Inspect available evidence. Keep missing data visible.</p>
        </div>
        <NavLink to="/risk-map">Papua GIS & spatial analytics →</NavLink>
      </header>
      <div className="asean-notice">
        Research workspace · 11 country outlines · Papua study observations only · No ASEAN-wide
        live surveillance connection
      </div>
      <div className="asean-toolbar">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const match = countries.find((c) =>
              [c.name.toLowerCase(), c.code.toLowerCase()].includes(search.trim().toLowerCase()),
            );
            const district = districts.find((d) => d.toLowerCase() === search.trim().toLowerCase());
            if (match) chooseCountry(match.code);
            else if (district) {
              goPapua();
              patch({ area: 'papua', countries: ['IDN'], district, camera: null });
            } else
              setStatus(
                'No matching country or available study district. Choose a geographic autocomplete suggestion.',
              );
          }}
        >
          <label>
            Geographic search
            <input
              aria-label="Geographic search"
              list="asean-geographies"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Country, ISO code or study district"
            />
          </label>
          <datalist id="asean-geographies">
            {countries.map((c) => (
              <option key={c.code} value={c.name}>
                {c.code}
              </option>
            ))}
            {districts.map((d) => (
              <option key={d} value={d}>
                Indonesia · Papua ADM2
              </option>
            ))}
          </datalist>
          <button>Go</button>
        </form>
        <div className="asean-actions">
          {Object.entries(presets).map(([area, p]) => (
            <button
              key={area}
              aria-pressed={filters.area === area}
              onClick={() => {
                setPlaying(false);
                patch({
                  area: area as Filters['area'],
                  countries: ['papua', 'indonesia'].includes(area)
                    ? ['IDN']
                    : area === 'mekong'
                      ? ['MMR', 'THA', 'LAO', 'KHM', 'VNM']
                      : [],
                  district: '',
                  camera: null,
                });
                if (filters.area === area) map.current?.fit();
              }}
            >
              {p.label}
            </button>
          ))}
          <button onClick={reset}>Reset map & filters</button>
        </div>
      </div>
      <p className="asean-filter-summary">
        Active scope: <strong>{presets[filters.area].label}</strong> ·{' '}
        {filters.countries.map((code) => countries.find((c) => c.code === code)?.name).join(', ') ||
          'all countries'}{' '}
        · {filters.district || 'all available districts'} · {info.title} · {filters.year} ·{' '}
        {studyVersion}
      </p>
      {filters.area === 'mekong' && (
        <p className="asean-notice">
          Greater Mekong preset is a geographic extent. Chinese provinces are not loaded; it is not
          a complete GMS dataset.
        </p>
      )}
      <div className={`asean-layout ${detailOpen ? 'has-detail' : ''}`}>
        <section className="asean-map-section" aria-label="Map workspace">
          <div className={`asean-map-frame ${panel ? 'has-panel' : ''}`}>
            {error ? (
              <div role="alert" className="asean-map-message">
                <p>{error}</p>
                <button onClick={() => setAttempt((n) => n + 1)}>Retry regional boundaries</button>
              </div>
            ) : geometry ? (
              <RegionalCanvas
                ref={map}
                geometry={geometry}
                study={filters.area === 'papua' ? study || null : null}
                rows={filtered}
                filters={filters}
                breaks={breaks}
                selectedCountry={country}
                tool={tool}
                panelOpen={panel !== null}
                points={points}
                areaComplete={!!measurement?.geometry}
                onPoint={addPoint}
                onCountry={chooseCountry}
                onDistrict={(district) => {
                  setDetailOpen(true);
                  patch({ district, countries: ['IDN'] });
                }}
                onCamera={(next) => {
                  camera.current = next;
                }}
                onCoordinates={setCoordinates}
              />
            ) : (
              <div role="status" className="asean-map-message">
                Loading verified country geometry…
              </div>
            )}
            {geometry && !error && (
              <>
                <div className="asean-map-top">
                  <GeographicBreadcrumb filters={filters} patch={patch} />
                  <div className="asean-map-panel-triggers">
                    <button
                      id="asean-layers-trigger"
                      aria-expanded={panel === 'layers'}
                      aria-controls="asean-map-panel"
                      onClick={() => setPanel(panel === 'layers' ? null : 'layers')}
                    >
                      Layers
                    </button>
                    <button
                      id="asean-tools-trigger"
                      aria-expanded={panel === 'tools'}
                      aria-controls="asean-map-panel"
                      onClick={() => setPanel(panel === 'tools' ? null : 'tools')}
                    >
                      Tools
                    </button>
                    <button aria-expanded={detailOpen} onClick={() => setDetailOpen(!detailOpen)}>
                      {detailOpen ? 'Hide details' : 'Region details'}
                    </button>
                  </div>
                </div>
                {panel && (
                  <div
                    id="asean-map-panel"
                    className="asean-map-panel"
                    role="region"
                    aria-label={panel === 'layers' ? 'Layer Control Center' : 'Spatial map tools'}
                  >
                    <button
                      className="asean-panel-close"
                      aria-label="Close map panel"
                      onClick={() => {
                        document
                          .getElementById(
                            panel === 'tools' ? 'asean-tools-trigger' : 'asean-layers-trigger',
                          )
                          ?.focus();
                        setPanel(null);
                      }}
                    >
                      Close ×
                    </button>
                    {panel === 'layers' ? (
                      <LayerControl
                        filters={filters}
                        patch={patch}
                        districts={districts}
                        years={years}
                        onMetadata={showMetadata}
                      />
                    ) : (
                      <MapTools
                        tool={tool}
                        setTool={startTool}
                        points={points}
                        addPoint={addPoint}
                        undo={() => {
                          setPoints(points.slice(0, -1));
                          setMeasurement(null);
                        }}
                        finish={finishMeasurement}
                        clear={clearMeasurement}
                        measurement={measurement}
                        error={measureError}
                        onExportArea={() =>
                          act(() => {
                            if (!measurement?.geometry)
                              throw Error('Finish a study polygon first.');
                            download('malariascope-drawn-study-area.geojson', {
                              ...measurement.geometry,
                              properties: {
                                classification: 'USER-DRAWN STUDY AREA',
                                crs: 'EPSG:4326',
                                area_km2: measurement.value,
                                method: 'Turf spherical WGS84 area',
                                intersectingStudyDistricts: measurement.districts,
                                limitation:
                                  'Exploratory selection only; no observations apportioned to drawn geometry',
                              },
                            });
                          }, 'Drawn study geometry exported with method and limitations.')
                        }
                        onSearch={() => {
                          setPanel(null);
                          document
                            .querySelector<HTMLInputElement>('[aria-label="Geographic search"]')
                            ?.focus();
                        }}
                        onCompare={() => {
                          setPanel(null);
                          document
                            .getElementById('asean-comparison-drawer')
                            ?.setAttribute('open', '');
                          document
                            .getElementById('asean-comparison-drawer')
                            ?.scrollIntoView({ block: 'start', behavior: 'smooth' });
                        }}
                        onLayers={() => setPanel('layers')}
                        onImage={() => {
                          setPanel(null);
                          void png();
                        }}
                      />
                    )}
                  </div>
                )}
                <ContextLegend
                  filters={filters}
                  breaks={breaks}
                  hasValues={values.length > 0 && filters.area === 'papua'}
                />
                {tool !== 'inspect' && (
                  <div className="asean-drawing-bar" role="status">
                    {tool === 'area' ? 'Draw study area' : 'Measure distance'} · {points.length}{' '}
                    vertices <button onClick={finishMeasurement}>Finish</button>
                    <button onClick={clearMeasurement}>Cancel</button>
                    {measureError && <span>{measureError}</span>}
                  </div>
                )}
              </>
            )}
            {geometry && !error && (
              <div className="asean-map-buttons">
                <button aria-label="Zoom in regional map" onClick={() => map.current?.zoom(1)}>
                  +
                </button>
                <button aria-label="Zoom out regional map" onClick={() => map.current?.zoom(-1)}>
                  −
                </button>
                <button onClick={() => map.current?.fit()}>Fit region</button>
                <button
                  onClick={() =>
                    act(async () => {
                      if (document.fullscreenElement) await document.exitFullscreen();
                      else if (root.current?.requestFullscreen)
                        await root.current.requestFullscreen();
                      else throw Error('Fullscreen is not supported by this browser.');
                    }, 'Fullscreen updated.')
                  }
                >
                  Fullscreen
                </button>
              </div>
            )}
          </div>
          <div className="asean-coordinate">
            <span>Latitude, longitude: {coordinates}</span>
            <button
              disabled={!/^[\d-]/.test(coordinates)}
              onClick={() =>
                act(() => navigator.clipboard.writeText(coordinates), 'Coordinates copied.')
              }
            >
              Copy coordinates
            </button>
          </div>
          <MapProvenance filters={filters} available={values.length} count={filtered.length} />
          {filters.area === 'papua' && (!research || researchError) && (
            <div role={researchError ? 'alert' : 'status'} className="asean-notice">
              {researchError || 'Loading checksummed study observations…'}
              {researchError && <button onClick={retryResearch}>Retry study data</button>}
            </div>
          )}
          {filters.indicator !== 'boundaries' && (filters.area !== 'papua' || !values.length) && (
            <p className="asean-unavailable" role="status">
              {filters.area !== 'papua'
                ? 'National observations unavailable. Open Papua study to explore the connected district data.'
                : 'Selected indicator or period is unavailable for the matching study scope. Missing values are not zero.'}
            </p>
          )}
          {filters.indicator === 'prediction' && (
            <label>
              Retrospective model
              <select
                aria-label="Retrospective model"
                value={filters.model}
                onChange={(e) => patch({ model: e.target.value })}
              >
                {models.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
              <span className="asean-muted">
                2025 saved hindcasts only; no validated prospective forecast or district prediction
                intervals.
              </span>
            </label>
          )}
          <details className="asean-timeline-drawer">
            <summary>Time Machine · {filters.year} · annual study periods</summary>
            <Timeline
              filters={filters}
              patch={patch}
              districts={districts}
              years={years}
              playing={playing}
              setPlaying={setPlaying}
              speed={speed}
              setSpeed={setSpeed}
            />
          </details>
        </section>
        {detailOpen && (
          <RegionDetails country={country} rows={rows} filters={filters} onPapua={goPapua} />
        )}
      </div>
      <section className="asean-exports" aria-label="Map exports and saved views">
        <h2>Research exports & saved views</h2>
        <div className="asean-actions">
          <button
            disabled={busy}
            onClick={() =>
              act(() => {
                const data = records();
                if (!data.length) throw Error('No records match the selected filters.');
                download(
                  `malariascope-${filters.area}-${filters.year}.csv`,
                  recordsCSV(data),
                  true,
                );
              }, 'Filtered CSV exported; unavailable values remain blank.')
            }
          >
            Export CSV
          </button>
          <button disabled={busy || !geometry} onClick={exportVector}>
            Export GeoJSON
          </button>
          <button disabled={busy || !geometry} onClick={png}>
            Export map PNG
          </button>
          <button onClick={() => window.print()}>Print / Save PDF</button>
          <button onClick={save} disabled={busy}>
            Save map view
          </button>
          <button
            disabled={!bookmark || busy}
            onClick={() => {
              if (bookmark) {
                setPlaying(false);
                patch(readFilters(new URLSearchParams(bookmark)));
                setStatus('Saved map configuration restored.');
              }
            }}
          >
            Restore saved view
          </button>
          <button disabled={busy} onClick={share}>
            Copy map link
          </button>
          <button
            onClick={() =>
              act(
                () =>
                  download('malariascope-analysis-config.json', {
                    schemaVersion: 1,
                    filters: { ...filters, camera: camera.current },
                    studyVersion,
                    boundaryMetadata: '/data/geography/asean-metadata.json',
                    method:
                      'Equal-width bins over complete supplied study periods; annual observations only',
                    limitations:
                      'No national observations, real-time surveillance or prospective forecast; source research license unspecified',
                  }),
                'Reproducible map configuration exported.',
              )
            }
          >
            Export configuration
          </button>
        </div>
        <p role="status" aria-live="polite">
          {status ||
            'Exports include selected period, unit, evidence type, source, version and limitations. PNG includes vector map and attribution; PDF uses the browser print dialog.'}
        </p>
      </section>
      <details id="asean-comparison-drawer" className="asean-comparison-drawer">
        <summary>Compare countries & study districts</summary>
        <Comparison
          filters={filters}
          rows={rows}
          version={studyVersion}
          years={years}
          patch={patch}
        />
      </details>
      <details className="asean-sources">
        <summary>Data Sources & Metadata registry</summary>
        <div className="asean-table-scroll">
          <table>
            <thead>
              <tr>
                <th>Dataset</th>
                <th>Coverage / version</th>
                <th>License / update status</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th>
                  <a href="/data/geography/asean-metadata.json">Natural Earth country context</a>
                </th>
                <td>11 ASEAN countries · EPSG:4326 · ADM0 · ca3b7150</td>
                <td>
                  Public domain · static snapshot retrieved 20 October 2026; country navigation only
                </td>
              </tr>
              <tr>
                <th>
                  <a href="/data/verified/geometry-metadata.json">geoBoundaries study geometry</a>
                </th>
                <td>9 Papua ADM2 polygons · 2020 vintage · release 9469f09</td>
                <td>CC BY 3.0 IGO · BPS, WFP, OCHA ROAP · no ADM1 coverage</td>
              </tr>
              <tr>
                <th>
                  <a href="/data/verified/manifest.json">Supplied study package</a>
                </th>
                <td>
                  Annual 2020–2025; 48 balanced records + 9-district 2025 snapshot, climate and
                  hindcasts · {studyVersion}
                </td>
                <td>
                  Source redistribution license unspecified · extracted October 2026; underlying
                  reports not independently audited
                </td>
              </tr>
              <tr>
                <th>WHO / national programmes / ASEAN BTSC</th>
                <td>Candidate epidemiological providers; not integrated</td>
                <td>No connected API, permissions or compatible data agreement established</td>
              </tr>
              <tr>
                <th>ERA5 / CHIRPS / WorldPop</th>
                <td>Candidate environmental and population products; not integrated</td>
                <td>
                  Raster, monthly/weekly periods, pixel aggregation and licensing require review
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          Parasite species, confirmed/local/imported case classifications, testing, deaths, NDVI,
          national facilities and prospective forecasts are unavailable. Import authorized district
          data in the existing <NavLink to="/data-center">Data Center</NavLink>; imported values
          remain separate from this fixed study adapter. Use the{' '}
          <NavLink to="/spatial-analysis">spatial lab</NavLink> and{' '}
          <NavLink to="/model-benchmarking">model laboratory</NavLink> for existing supported
          analyses and their parameters.
        </p>
      </details>
    </div>
  );
}
