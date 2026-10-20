import {
  countries,
  indicators,
  indicatorInfo,
  presets,
  type Filters,
  type Indicator,
  type Area,
} from './engine';
type Props = {
  filters: Filters;
  patch: (next: Partial<Filters>) => void;
  districts: string[];
  years: number[];
};
export function LayerControl({
  filters: f,
  patch,
  districts,
  onMetadata,
}: Props & { onMetadata?: () => void }) {
  return (
    <details className="asean-controls" open>
      <summary>Layer Control Center & filters</summary>
      <label>
        Analysis area
        <select
          aria-label="Analysis area"
          value={f.area}
          onChange={(e) =>
            patch({
              area: e.target.value as Area,
              countries: ['papua', 'indonesia'].includes(e.target.value)
                ? ['IDN']
                : e.target.value === 'mekong'
                  ? ['MMR', 'THA', 'LAO', 'KHM', 'VNM']
                  : [],
              district: '',
              camera: null,
            })
          }
        >
          {Object.entries(presets).map(([id, p]) => (
            <option key={id} value={id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      <fieldset>
        <legend>Countries to compare</legend>
        <div className="asean-country-list">
          {countries.map((c) => (
            <label key={c.code}>
              <input
                type="checkbox"
                checked={f.countries.includes(c.code)}
                onChange={(e) =>
                  patch({
                    countries: e.target.checked
                      ? [...f.countries, c.code]
                      : f.countries.filter((id) => id !== c.code),
                    district: '',
                  })
                }
              />
              {c.name}
            </label>
          ))}
        </div>
      </fieldset>
      <label>
        Study district
        <select
          aria-label="Study district"
          disabled={f.area !== 'papua'}
          value={f.district}
          onChange={(e) => patch({ district: e.target.value })}
        >
          <option value="">All study districts</option>
          {districts.map((d) => (
            <option key={d}>{d}</option>
          ))}
        </select>
      </label>
      <label>
        Indicator
        <select
          aria-label="Regional indicator"
          value={f.indicator}
          onChange={(e) => patch({ indicator: e.target.value as Indicator })}
        >
          {[...new Set(indicators.map((i) => i.group))].map((group) => (
            <optgroup key={group} label={group}>
              {indicators
                .filter((i) => i.group === group)
                .map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.title}
                    {i.field === null && i.id !== 'boundaries' ? ' · not connected' : ''}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </label>
      <button onClick={onMetadata}>Dataset information</button>
      <label>
        <input
          type="checkbox"
          checked={f.visible}
          onChange={(e) => patch({ visible: e.target.checked })}
        />
        {f.indicator === 'boundaries' ? 'Show administrative fill' : 'Show thematic layer'}
      </label>
      <label>
        {f.indicator === 'boundaries' ? 'Administrative fill opacity' : 'Thematic opacity'}:{' '}
        {Math.round(f.opacity * 100)}%
        <input
          aria-label={
            f.indicator === 'boundaries' ? 'Administrative fill opacity' : 'Thematic opacity'
          }
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={f.opacity}
          onChange={(e) => patch({ opacity: +e.target.value })}
        />
      </label>
      <label>
        <input
          type="checkbox"
          checked={f.boundaries}
          onChange={(e) => patch({ boundaries: e.target.checked })}
        />
        Show boundary layer
      </label>
      <label>
        Top layer
        <select
          aria-label="Top layer"
          value={f.order}
          onChange={(e) => patch({ order: e.target.value as Filters['order'] })}
        >
          <option value="thematic">Thematic indicators</option>
          <option value="boundaries">Boundary outlines</option>
        </select>
      </label>
      <button
        onClick={() => patch({ visible: true, boundaries: true, opacity: 0.8, order: 'thematic' })}
      >
        Reset layers
      </button>
      <p className="asean-muted">
        {indicatorInfo(f.indicator).kind} · {indicatorInfo(f.indicator).unit}. One thematic
        indicator at a time avoids incompatible units. Country context uses local vectors; no online
        basemap is required.
      </p>
    </details>
  );
}
export function Timeline({
  filters: f,
  patch,
  years,
  playing,
  setPlaying,
  speed,
  setSpeed,
}: Props & {
  playing: boolean;
  setPlaying: (v: boolean) => void;
  speed: number;
  setSpeed: (v: number) => void;
}) {
  const index = years.indexOf(f.year);
  const step = (delta: number) => {
    setPlaying(false);
    if (years.length)
      patch({
        year: years[Math.max(0, Math.min(years.length - 1, (index < 0 ? 0 : index) + delta))],
      });
  };
  return (
    <section className="asean-timeline" aria-label="Time Machine">
      <div>
        <strong>Time Machine · {f.year}</strong>
        <span>Annual observations only · no interpolation</span>
      </div>
      <div className="asean-actions">
        <button disabled={!years.length || index === 0} onClick={() => step(-1)}>
          Previous year
        </button>
        <button
          disabled={years.length < 2}
          aria-pressed={playing}
          onClick={() => setPlaying(!playing)}
        >
          {playing ? 'Pause' : 'Play'}
        </button>
        <button disabled={!years.length || index === years.length - 1} onClick={() => step(1)}>
          Next year
        </button>
        <label>
          Playback speed
          <select
            aria-label="Playback speed"
            value={speed}
            onChange={(e) => setSpeed(+e.target.value)}
          >
            <option value="2000">0.5×</option>
            <option value="1000">1×</option>
            <option value="500">2×</option>
          </select>
        </label>
      </div>
      {years.length > 0 ? (
        <>
          <label>
            Reporting year
            <select
              aria-label="Reporting year"
              value={f.year}
              onChange={(e) => {
                setPlaying(false);
                patch({ year: +e.target.value });
              }}
            >
              {!years.includes(f.year) && <option value={f.year}>{f.year} · unavailable</option>}
              {years.map((y) => (
                <option key={y}>{y}</option>
              ))}
            </select>
          </label>
          <input
            aria-label="Annual timeline"
            type="range"
            min="0"
            max={Math.max(0, years.length - 1)}
            value={index < 0 ? 0 : index}
            disabled={years.length < 2}
            onChange={(e) => {
              setPlaying(false);
              patch({ year: years[+e.target.value] });
            }}
          />
        </>
      ) : (
        <p>No available annual periods for this indicator and study scope.</p>
      )}
      {years.some((y, i) => i > 0 && y - years[i - 1] > 1) && (
        <p>Missing intervals are skipped during playback; no observations are interpolated.</p>
      )}
    </section>
  );
}
