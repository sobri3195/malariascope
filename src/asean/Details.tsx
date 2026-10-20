import { NavLink } from 'react-router-dom';
import type { Row } from '../analytics';
import {
  countries,
  scopedRows,
  valueFor,
  formatValue,
  indicatorInfo,
  exportRecords,
  type CountryCode,
  type Filters,
} from './engine';
export function RegionDetails({
  country,
  rows,
  filters: f,
  onPapua,
}: {
  country: CountryCode | null;
  rows: Row[];
  filters: Filters;
  onPapua: () => void;
}) {
  const name = countries.find((c) => c.code === country)?.name;
  const row = scopedRows(rows, f).find((r) => r.district === f.district);
  const indicator = indicatorInfo(f.indicator);
  const context = f.indicator === 'boundaries' || !f.visible;
  const trend =
    f.area === 'papua' && f.district && (!f.countries.length || f.countries.includes('IDN'))
      ? rows.filter((r) => r.district === f.district).sort((a, b) => a.year - b.year)
      : [];
  return (
    <aside className="asean-detail" aria-label="Region detail panel">
      <span className="asean-eyebrow">GEOGRAPHIC CONTEXT</span>
      <h2>
        {f.area === 'papua'
          ? f.district || 'Papua study districts'
          : name || 'ASEAN regional context'}
      </h2>
      <p>
        {f.area === 'papua'
          ? 'Indonesia › Papua study area › ADM2 regency/city'
          : name
            ? `ASEAN › ${name} › Country (ADM0)`
            : '11 member states · local country outlines'}
      </p>
      <p>
        <strong>{f.year}</strong> · {indicator.title}
      </p>
      <div className="asean-detail-value" data-testid="region-value">
        {context
          ? f.area === 'papua'
            ? 'ADM2 study'
            : 'ADM0'
          : formatValue(row ? valueFor(row, f.indicator) : null)}
        <small>
          {context
            ? 'Geographic context · no thematic values'
            : `${indicator.unit} · ${indicator.kind}`}
        </small>
      </div>
      {!row && (
        <p>
          {f.area === 'papua'
            ? 'Select a study district to inspect its value. National totals are not inferred from the study.'
            : 'National surveillance observations are not connected. A country outline does not establish epidemiological coverage.'}
        </p>
      )}
      <dl>
        <dt>Deaths / testing / positivity</dt>
        <dd>Unavailable · no connected source</dd>
        <dt>Source & version</dt>
        <dd>
          {f.area === 'papua'
            ? context
              ? 'geoBoundaries · BPS / WFP / OCHA · CC BY 3.0 IGO'
              : 'Supplied study extraction · MALARIASCOPE-AMMM2026-v1'
            : 'Natural Earth · ca3b7150 · public domain'}
        </dd>
        <dt>Freshness</dt>
        <dd>
          {f.area === 'papua'
            ? 'Static annual research package, 2020–2025; not a live feed'
            : 'Static country geometry retrieved 20 October 2026'}
        </dd>
        <dt>Method & limitations</dt>
        <dd>
          {f.indicator === 'incidence'
            ? 'Cases / population at risk × 1,000 when both inputs exist. The supplied 2025 study ratio is retained when a denominator is unavailable.'
            : f.indicator === 'prediction'
              ? 'Saved 2025 retrospective hindcast; not a prospective forecast. No invented confidence intervals.'
              : 'Values from the supplied district-year extract; no geographic or temporal imputation.'}
        </dd>
      </dl>
      {country === 'IDN' && f.area !== 'papua' && (
        <button onClick={onPapua}>Explore available Papua ADM2 data</button>
      )}
      {f.area !== 'papua' && (
        <p>
          ADM1 data are not connected. The available subnational coverage is nine Papua study ADM2
          polygons, not all Indonesian districts.
        </p>
      )}
      {row && !context && (
        <dl aria-label="Available district observations">
          <dt>Reported cases</dt>
          <dd>{formatValue(row.cases)} cases · observed extraction</dd>
          <dt>Incidence</dt>
          <dd>{formatValue(valueFor(row, 'incidence'))} per 1,000 at risk</dd>
          <dt>Rainfall / temperature / humidity</dt>
          <dd>
            {formatValue(row.rainfall ?? null)} mm/year · {formatValue(row.temperature ?? null)} °C
            · {formatValue(row.humidity ?? null)} %
          </dd>
        </dl>
      )}
      {!context && trend.length > 0 && (
        <section aria-label="District historical trend">
          <h3>Annual district trend</h3>
          <div
            className="asean-trend"
            role="img"
            aria-label={trend
              .map((r) => `${r.year}: ${formatValue(valueFor(r, f.indicator))}`)
              .join('; ')}
          >
            {trend.map((r) => {
              const v = valueFor(r, f.indicator),
                values = trend
                  .map((t) => valueFor(t, f.indicator))
                  .filter((n): n is number => n !== null);
              return (
                <div key={r.year}>
                  <span>{r.year}</span>
                  {v === null ? (
                    <span aria-label="No observation">—</span>
                  ) : (
                    <meter
                      min="0"
                      max={Math.max(1, ...values)}
                      value={v}
                      aria-label={`${r.year} ${formatValue(v)}`}
                    />
                  )}
                  <span>{formatValue(v)}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}
      <NavLink to="/provenance">Inspect existing source ledger</NavLink>
    </aside>
  );
}
export function Comparison({
  filters: f,
  rows,
  version,
  years,
  patch,
}: {
  filters: Filters;
  rows: Row[];
  version: string;
  years: number[];
  patch: (next: Partial<Filters>) => void;
}) {
  const current = exportRecords(rows, f, version),
    previous = exportRecords(rows, { ...f, year: f.compareYear }, version);
  return (
    <section className="asean-comparison" aria-label="Regional comparison">
      <div className="asean-section-heading">
        <h2>{f.area === 'papua' ? 'Study district comparison' : 'Country comparison'}</h2>
        <label>
          Compare with year
          <select
            aria-label="Compare with year"
            value={f.compareYear}
            onChange={(e) => patch({ compareYear: +e.target.value })}
          >
            {!years.includes(f.compareYear) && (
              <option value={f.compareYear}>{f.compareYear} · unavailable</option>
            )}
            {years.map((y) => (
              <option key={y}>{y}</option>
            ))}
          </select>
        </label>
      </div>
      <p>
        Aligned annual periods and source version. Missing values are blank in exports and
        unavailable here. Countries are never ranked from incomplete study records.
      </p>
      <div className="asean-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Geography</th>
              <th>
                {f.year} · {indicatorInfo(f.indicator).unit}
              </th>
              <th>{f.compareYear}</th>
              <th>Change</th>
              <th>Evidence type</th>
            </tr>
          </thead>
          <tbody>
            {current.map((r) => {
              const prior =
                previous.find((p) => p.country_code === r.country_code && p.district === r.district)
                  ?.value ?? null;
              return (
                <tr key={r.country_code + r.district}>
                  <th scope="row">{r.district || r.country}</th>
                  <td>{formatValue(r.value)}</td>
                  <td>{formatValue(prior)}</td>
                  <td>
                    {formatValue(
                      r.value !== null && prior !== null && f.year === f.compareYear + 1
                        ? r.value - prior
                        : null,
                    )}
                  </td>
                  <td>{r.classification}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!current.length && <p>No matching records. Clear the country or district filter.</p>}
      <p className="asean-muted">
        Changes require adjacent annual periods. Cohort differs in 2025 (nine districts) versus
        earlier years (eight); compare matched districts. Study source license was not specified by
        its supplier; review rights before redistribution.
      </p>
    </section>
  );
}
