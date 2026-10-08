import { useEffect, useMemo, useState } from 'react';
import Papa from 'papaparse';
import { useStore } from './store';
import { validateGeometry } from './geometry';
import { gisRows } from './scientific-sources';
import { fieldReadiness, type ReadinessStatus } from './data-readiness';
export default function DataReadiness() {
  const { state, research, rows: observed, model, year } = useStore();
  const [publicStatus, setPublicStatus] = useState<{
    surveillance: ReadinessStatus;
    models: ReadinessStatus;
    spatial: ReadinessStatus;
    summary: ReadinessStatus;
  }>({
    surveillance: 'NOT CONNECTED',
    models: 'NOT CONNECTED',
    spatial: 'NOT CONNECTED',
    summary: 'NOT CONNECTED',
  });
  const rows = useMemo(
    () => gisRows(observed, state.scientificSources || [], model).filter((r) => r.year === year),
    [observed, state.scientificSources, model, year],
  );
  useEffect(() => {
    const controller = new AbortController();
    void Promise.allSettled(
      [
        'district-malaria.csv',
        'model-performance.json',
        'spatial-analysis.json',
        'research-summary.json',
      ].map(async (path) => {
        const r = await fetch('/data/' + path, { signal: controller.signal });
        if (!r.ok) throw Error(path);
        if (path.endsWith('.csv')) {
          const parsed = Papa.parse(await r.text(), { header: true, skipEmptyLines: 'greedy' });
          return parsed.errors.length
            ? 'INVALID'
            : parsed.data.length
              ? 'PARTIAL'
              : 'NOT CONNECTED';
        }
        const data = await r.json();
        if (path === 'model-performance.json')
          return Array.isArray(data) && data.some((m) => typeof m.mae === 'number')
            ? 'PARTIAL'
            : 'NOT CONNECTED';
        return data && Object.keys(data).length ? 'SUMMARY ONLY' : 'NOT CONNECTED';
      }),
    ).then((results) => {
      if (controller.signal.aborted) return;
      const status = results.map((r) =>
        r.status === 'fulfilled' ? (r.value as ReadinessStatus) : 'NOT CONNECTED',
      );
      setPublicStatus({
        surveillance: status[0],
        models: status[1],
        spatial: status[2],
        summary: status[3],
      });
    });
    return () => controller.abort();
  }, []);
  let geometry: ReadinessStatus = 'NOT CONNECTED';
  if (state.geometry) {
    try {
      validateGeometry(state.geometry);
      geometry = 'CONNECTED';
    } catch {
      geometry = 'INVALID';
    }
  }
  const surveillance = fieldReadiness(rows, ['cases']);
  const items: [string, ReadinessStatus, string][] = [
    [
      'Malaria observations',
      surveillance === 'NOT CONNECTED' ? publicStatus.summary : surveillance,
      'Supplied summary is not district observations.',
    ],
    [
      'District surveillance records',
      state.researchMode === 'BUILTIN' && surveillance === 'CONNECTED'
        ? 'VERIFIED RESEARCH EXTRACTION'
        : surveillance,
      'District surveillance records not connected.',
    ],
    [
      'Population',
      fieldReadiness(rows, ['population']),
      'Positive population required for incidence.',
    ],
    [
      'Climate observations',
      fieldReadiness(rows, ['rainfall', 'temperature', 'humidity']),
      'Annual source records; missing variables remain unavailable.',
    ],
    ['District geometry', geometry, 'Country context is excluded from analytical joins.'],
    [
      'Model predictions',
      fieldReadiness(
        rows.filter((r) => r.model === model),
        ['prediction'],
      ),
      model + '; training/validation metadata remain with separate outputs.',
    ],
    [
      'Model performance',
      research ? 'SUPPLIED STUDY OUTPUT' : publicStatus.models,
      'Supplied metrics only; missing metrics are not zero.',
    ],
    [
      'Spatial results',
      research ? 'SUPPLIED STUDY OUTPUT' : publicStatus.spatial,
      'Global Moran result; no significant local-hotspot output supplied.',
    ],
    [
      'Public facilities',
      state.facilitySnapshot?.facilities.length ? 'PARTIAL' : 'NOT CONNECTED',
      'Optional snapshot; coverage and availability are not verified.',
    ],
  ];
  return (
    <details className="data-readiness">
      <summary>DATA READINESS · {year}</summary>
      <div className="readiness-grid">
        {items.map(([name, status, reason]) => (
          <div key={name}>
            <strong>{name}</strong>
            <span
              className={'readiness-status status-' + status.toLowerCase().replaceAll(' ', '-')}
            >
              {status}
            </span>
            <small>
              {status === 'NOT CONNECTED'
                ? reason
                : name === 'District surveillance records'
                  ? 'Loaded local observations; schema validation is not scientific verification.'
                  : reason}
            </small>
          </div>
        ))}
      </div>
      <p>
        {research
          ? 'Checksummed study package connected; legacy header-only import template remains separate.'
          : 'Public surveillance CSV: ' + publicStatus.surveillance + '.'}{' '}
        Status reflects loaded data availability, not independent scientific verification. GIS
        supplements remain separate from observed records.
      </p>
    </details>
  );
}
