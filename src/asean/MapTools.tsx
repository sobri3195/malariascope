import { useState } from 'react';
import type { Position } from 'geojson';
import { formatValue } from './engine';
import { validPoint, type MapTool, type Measurement } from './measurement';
export default function MapTools({
  tool,
  setTool,
  points,
  addPoint,
  undo,
  finish,
  clear,
  measurement,
  error,
  onExportArea,
  onSearch,
  onCompare,
  onLayers,
  onImage,
}: {
  tool: MapTool;
  setTool: (tool: MapTool) => void;
  points: Position[];
  addPoint: (point: Position) => void;
  undo: () => void;
  finish: () => void;
  clear: () => void;
  measurement: Measurement | null;
  error: string;
  onExportArea: () => void;
  onSearch: () => void;
  onCompare: () => void;
  onLayers: () => void;
  onImage: () => void;
}) {
  const [lon, setLon] = useState(''),
    [lat, setLat] = useState(''),
    [inputError, setInputError] = useState('');
  return (
    <section className="asean-tools-panel" aria-label="Map tools">
      <h2>Map tools</h2>
      <div className="asean-tool-grid">
        <button onClick={onSearch}>Search geography</button>
        <button onClick={() => setTool('inspect')} aria-pressed={tool === 'inspect'}>
          Inspect / select
        </button>
        <button onClick={() => setTool('distance')} aria-pressed={tool === 'distance'}>
          Measure distance
        </button>
        <button onClick={() => setTool('area')} aria-pressed={tool === 'area'}>
          Draw study area
        </button>
        <button onClick={onLayers}>Layer transparency</button>
        <button onClick={onCompare}>Compare areas</button>
        <button onClick={onImage}>Export map image</button>
      </div>
      <label>
        Basemap
        <select aria-label="Basemap">
          <option>Local administrative vectors</option>
        </select>
      </label>
      <p className="asean-muted">
        No external tile provider is configured. Country outlines remain available offline after
        local assets load.
      </p>
      {tool !== 'inspect' && (
        <div className="asean-measure-editor">
          <strong>
            {tool === 'distance' ? 'Distance path' : 'Study polygon'} · {points.length} vertices
          </strong>
          <p>
            Tap the map or enter coordinates. Finish to calculate; Escape returns to inspection.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const p = [Number(lon), Number(lat)];
              if (!lon.trim() || !lat.trim() || !validPoint(p)) {
                setInputError('Enter valid longitude (−180 to 180) and latitude (−85 to 85).');
                return;
              }
              addPoint(p);
              setInputError('');
            }}
          >
            <label>
              Longitude
              <input
                aria-label="Measurement longitude"
                type="number"
                step="any"
                value={lon}
                onChange={(e) => setLon(e.target.value)}
              />
            </label>
            <label>
              Latitude
              <input
                aria-label="Measurement latitude"
                type="number"
                step="any"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
              />
            </label>
            <button>Add coordinate</button>
          </form>
          <div className="asean-actions">
            <button onClick={undo} disabled={!points.length}>
              Undo vertex
            </button>
            <button onClick={finish}>Finish measurement</button>
            <button onClick={clear}>Clear measurement</button>
          </div>
        </div>
      )}
      {(error || inputError) && <p role="alert">{error || inputError}</p>}
      {measurement && (
        <div className="asean-measure-result" role="status">
          <strong>
            {formatValue(measurement.value)} {measurement.unit}
          </strong>
          <p>
            {measurement.geometry
              ? `Intersects ${measurement.districts.length} loaded study districts${measurement.districts.length ? `: ${measurement.districts.join(', ')}` : ''}.`
              : 'Sum of great-circle segment distances.'}{' '}
            Calculated on a WGS84 spherical Earth using Turf; not a survey-grade measurement.
          </p>
          {measurement.geometry && (
            <>
              <p>
                Intersecting districts are listed by actual geometry. Observations are not
                apportioned or estimated inside the drawn area.
              </p>
              <button onClick={onExportArea}>Export drawn study area</button>
            </>
          )}
        </div>
      )}
    </section>
  );
}
