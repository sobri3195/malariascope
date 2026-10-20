import {
  countries,
  indicatorInfo,
  colors,
  missingColor,
  formatValue,
  type Filters,
} from './engine';
export function GeographicBreadcrumb({
  filters: f,
  patch,
}: {
  filters: Filters;
  patch: (change: Partial<Filters>) => void;
}) {
  const country =
    f.area === 'papua' || f.area === 'indonesia'
      ? countries.find((c) => c.code === 'IDN')
      : f.countries.length === 1
        ? countries.find((c) => c.code === f.countries[0])
        : null;
  return (
    <nav className="asean-map-breadcrumb" aria-label="Map geographic breadcrumb">
      <button onClick={() => patch({ area: 'asean', countries: [], district: '', camera: null })}>
        ASEAN
      </button>
      {country && (
        <>
          <span>/</span>
          <button
            onClick={() =>
              patch({
                area: country.code === 'IDN' ? 'indonesia' : 'asean',
                countries: [country.code],
                district: '',
                camera: null,
              })
            }
          >
            {country.name}
          </button>
        </>
      )}
      {f.area === 'papua' && (
        <>
          <span>/</span>
          <button
            onClick={() => patch({ area: 'papua', countries: ['IDN'], district: '', camera: null })}
          >
            Papua study
          </button>
        </>
      )}
      {f.district && f.area === 'papua' && (
        <>
          <span>/</span>
          <strong>{f.district}</strong>
        </>
      )}
      {f.area === 'mekong' && (
        <>
          <span>/</span>
          <strong>Greater Mekong</strong>
        </>
      )}
      {f.countries.length > 1 && f.area !== 'mekong' && (
        <>
          <span>/</span>
          <strong>{f.countries.length} selected countries</strong>
        </>
      )}
      <span>/</span>
      <time>{f.year}</time>
    </nav>
  );
}
export function ContextLegend({
  filters: f,
  breaks,
  hasValues,
}: {
  filters: Filters;
  breaks: number[];
  hasValues: boolean;
}) {
  const context = f.indicator === 'boundaries' || !f.visible,
    info = indicatorInfo(f.indicator);
  return (
    <section className="asean-map-legend" aria-label="Regional map legend">
      <details>
        <summary>
          {context ? 'Administrative context' : `${info.title} · ${info.unit}`}
          <span className="asean-legend-preview" aria-hidden="true">
            {(context ? ['#d8e1e7', '#007f88'] : hasValues ? colors : [missingColor]).map(
              (color) => (
                <i key={color} style={{ background: color }} />
              ),
            )}
          </span>
        </summary>
        {context ? (
          <>
            <div className="asean-legend-colors">
              <span>
                <i style={{ background: '#d8e1e7' }} />
                Country / study outline
              </span>
              <span>
                <i style={{ background: '#007f88' }} />
                Selected geography
              </span>
            </div>
            <p>
              No epidemiological layer is active. ADM1 geometry is not connected; Papua polygons
              represent available study ADM2 only.
              {!f.boundaries && ' Boundary outlines are hidden.'}
              {!f.visible && ' Selected fill is hidden.'}
            </p>
          </>
        ) : (
          <>
            <strong>{info.kind}</strong>
            <div className="asean-legend-colors">
              {hasValues &&
                breaks.length > 0 &&
                colors.slice(0, breaks.length + 1).map((color, i) => (
                  <span key={color}>
                    <i style={{ background: color }} />
                    {i === 0
                      ? `≤ ${formatValue(breaks[0])}`
                      : i === breaks.length
                        ? `> ${formatValue(breaks.at(-1)!)}`
                        : `${formatValue(breaks[i - 1])} – ${formatValue(breaks[i])}`}
                  </span>
                ))}
              <span>
                <i style={{ background: missingColor }} />
                Unavailable · never zero
              </span>
            </div>
            <p>
              {hasValues
                ? 'Equal-width bins fixed across available study years; no risk threshold implied.'
                : 'No values are connected for this scope and period. Country outlines are not epidemiological observations.'}{' '}
              {f.indicator === 'prediction' &&
                'Dashed outlines: saved 2025 hindcasts; no prospective forecast or district prediction intervals.'}
              {f.indicator === 'cases' && 'Case counts are not population-adjusted rates.'}
            </p>
          </>
        )}
      </details>
    </section>
  );
}
export function MapProvenance({
  filters: f,
  available,
  count,
}: {
  filters: Filters;
  available: number;
  count: number;
}) {
  const context = f.indicator === 'boundaries' || !f.visible,
    info = indicatorInfo(f.indicator);
  return (
    <details id="asean-map-provenance" className="asean-map-provenance">
      <summary>
        <span className="asean-status-dot" />
        Data provenance{' '}
        <span>
          {f.area === 'papua' ? 'Papua study ADM2' : 'Natural Earth ADM0'} · {f.year} · EPSG:4326
        </span>
      </summary>
      <dl>
        <dt>Active geographic dataset</dt>
        <dd>
          {f.area === 'papua'
            ? 'geoBoundaries IDN ADM2 study subset · BPS / WFP / OCHA ROAP · vintage 2020 · CC BY 3.0 IGO'
            : 'Natural Earth 1:10m country context · ca3b7150 · public domain'}
        </dd>
        <dt>Indicator / period / availability</dt>
        <dd>
          {context
            ? 'Administrative context · no thematic observations displayed'
            : `${info.title} · ${info.unit} · ${f.year} annual · ${f.area === 'papua' ? `${available}/${count} study records with values` : 'national observations not connected'}`}
        </dd>
        <dt>Retrieval / source version</dt>
        <dd>
          {f.area === 'papua'
            ? 'Geometry retrieved 7 October 2026; study extraction October 2026 · MALARIASCOPE-AMMM2026-v1; underlying reports not independently audited'
            : 'Retrieved 20 October 2026 · static local boundaries; no live surveillance feed'}
        </dd>
        <dt>Reference system & limitations</dt>
        <dd>
          WGS84 longitude/latitude (EPSG:4326). Generalized geographic boundaries are not a current
          legal determination. Study source redistribution license is unspecified; no national
          totals or validated prospective forecasts are inferred.
        </dd>
      </dl>
      <a
        href={
          f.area === 'papua'
            ? '/data/verified/geometry-metadata.json'
            : '/data/geography/asean-metadata.json'
        }
      >
        Boundary source and checksum
      </a>
      {' · '}
      <a href="/data/verified/manifest.json">Study source manifest</a>
    </details>
  );
}
