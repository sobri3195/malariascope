import type { ResearchPackage } from '../research-data/research.ts';
import { correlation } from '../analytics.ts';
import {
  benchmarkReferences,
  modelKeys,
  reportedAssociations,
  scopes,
  referenceCitation,
  referenceStatus,
  referenceVersion,
  indicatorDefinitions,
  type Metric,
  type ScopeId,
  type StudyModel,
} from './contract.ts';

export const finite = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;
export const positive = (value: unknown) => {
  const n = finite(value);
  return n !== null && n > 0 ? n : null;
};
export function scopeRows(p: ResearchPackage, scope: ScopeId) {
  const raw = scope === 'panel' ? p.balanced : scope === 'snapshot' ? p.spatial : [];
  const counts = new Map<string, number>();
  for (const row of raw) {
    const key = row.district + ':' + row.year;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return raw
    .filter((r) => counts.get(r.district + ':' + r.year) === 1)
    .map((r) => {
      const snapshot = p.spatial.find((s) => s.district === r.district && s.year === r.year);
      const climate = p.climate.find((c) => c.district === r.district && c.year === r.year);
      const cases = finite(r.cases),
        compatibleSnapshot =
          scope === 'snapshot' || (cases !== null && finite(snapshot?.cases) === cases),
        population = compatibleSnapshot ? positive(snapshot?.at_risk_population) : null;
      return {
        district: String(r.district),
        year: Number(r.year),
        cases,
        population,
        observedApi: compatibleSnapshot ? finite(snapshot?.observed_api) : null,
        recalculatedApi: cases !== null && population !== null ? (cases / population) * 1000 : null,
        rainfall: finite(climate?.rainfall_mm),
        temperature: finite(climate?.mean_temperature_c),
        humidity: finite(climate?.humidity_pct),
        source: scopes.find((s) => s.id === scope)!.source,
        denominatorConflict: !!snapshot && !compatibleSnapshot,
        populationSource: compatibleSnapshot && snapshot ? 'surveillance-2025-all-nine.csv' : null,
        climateSource: climate ? 'climate-annual-2020-2025.csv' : null,
        classification: 'SUPPLIED OBSERVATION EXTRACTION',
        denominator:
          population === null
            ? 'Unavailable for this district-year'
            : 'Source-defined 2025 population at risk; not preceding-year population',
      };
    });
}
export type Observation = ReturnType<typeof scopeRows>[number];
export function scopeSummary(p: ResearchPackage, scope: ScopeId, year: number, district: string) {
  const all = scopeRows(p, scope),
    names = [...new Set(all.map((r) => r.district))].sort();
  const selected = all.filter(
    (r) => r.year === year && (district === 'All districts' || r.district === district),
  );
  const expected = district === 'All districts' ? names.length : names.includes(district) ? 1 : 0;
  const valid = selected.filter((r) => r.cases !== null),
    denominators = selected.filter((r) => r.population !== null);
  return {
    selected,
    names,
    records: all.length,
    periods: [...new Set(all.map((r) => r.year))].sort(),
    expected,
    available: valid.length,
    cases: valid.length ? valid.reduce((sum, r) => sum + r.cases!, 0) : null,
    coverage: expected ? (valid.length / expected) * 100 : null,
    denominators: denominators.length,
    partial: expected > valid.length,
    annual: [...new Set(all.map((r) => r.year))].sort().map((y) => {
      const current = all.filter(
        (r) => r.year === y && (district === 'All districts' || r.district === district),
      );
      return {
        year: y,
        records: current.length,
        cases:
          current.length && current.every((r) => r.cases !== null)
            ? current.reduce((sum, r) => sum + r.cases!, 0)
            : null,
      };
    }),
  };
}
export function rankBenchmarks(
  p: ResearchPackage,
  source: 'brief' | 'artifact',
  split: 'validation' | 'test',
  metric: Metric,
) {
  const rows =
    source === 'brief'
      ? benchmarkReferences.map((r) => ({
          model: r.model,
          mae: r[split].mae as number | null,
          rmse: r[split].rmse as number | null,
          r2: r[split].r2 as number | null,
        }))
      : Object.keys(modelKeys).map((model) => {
          const r = p.performance.find(
            (r) => r.model === model && r.year === (split === 'test' ? 2025 : 2024),
          );
          return { model, mae: finite(r?.mae), rmse: finite(r?.rmse), r2: finite(r?.r2) };
        });
  const sorted = [...rows].sort((a, b) => {
    const x = a[metric],
      y = b[metric];
    return x === null ? (y === null ? 0 : 1) : y === null ? -1 : metric === 'r2' ? y - x : x - y;
  });
  return sorted.map((r) => ({
    ...r,
    rank:
      r[metric] === null
        ? null
        : 1 +
          rows.filter(
            (other) =>
              other[metric] !== null &&
              (metric === 'r2' ? other[metric]! > r[metric]! : other[metric]! < r[metric]!),
          ).length,
  }));
}
export function diagnostics(
  p: ResearchPackage,
  scope: ScopeId,
  year: number,
  district: string,
  model: StudyModel,
) {
  const rows = scopeSummary(p, scope, year, district).selected.map((r) => {
    const prediction = p.predictions.find(
      (v) => v.district === r.district && v.target_year === year,
    );
    const predicted = finite(prediction?.[modelKeys[model]]);
    const signed = predicted !== null && r.cases !== null ? predicted - r.cases : null;
    const intensity =
      year === 2025 && model === 'Random Forest'
        ? p.intensity.find((i) => i.district === r.district)
        : null;
    return {
      ...r,
      predicted,
      signed,
      absolute: signed === null ? null : Math.abs(signed),
      relativeError:
        signed !== null && r.cases !== null && r.cases > 0 ? (signed / r.cases) * 100 : null,
      priorPopulation: positive(intensity?.prior_population),
      projectedIntensity: finite(intensity?.projected_per_1000),
      suppliedCategory: typeof intensity?.category === 'string' ? intensity.category : null,
    };
  });
  const matched = rows.filter((r) => r.predicted !== null && r.cases !== null);
  const absoluteTotal = matched.reduce((sum, r) => sum + r.absolute!, 0);
  const observed = matched.length ? matched.reduce((sum, r) => sum + r.cases!, 0) : null;
  const predicted = matched.length ? matched.reduce((sum, r) => sum + r.predicted!, 0) : null;
  return {
    rows: rows.map((r) => ({
      ...r,
      errorShare:
        r.absolute !== null && absoluteTotal > 0 ? (r.absolute / absoluteTotal) * 100 : null,
    })),
    matched: matched.length,
    missing: rows.filter((r) => r.predicted === null).length,
    observed,
    predicted,
    shortfall: observed !== null && predicted !== null ? observed - predicted : null,
    mae: matched.length ? absoluteTotal / matched.length : null,
    absoluteTotal: matched.length ? absoluteTotal : null,
  };
}
function ranks(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return values.map((v) => (sorted.indexOf(v) + sorted.lastIndexOf(v)) / 2 + 1);
}
export function spearman(pairs: [number, number][]) {
  const complete = pairs.filter(([x, y]) => finite(x) !== null && finite(y) !== null);
  if (complete.length < 3) return { rho: null, n: complete.length };
  const x = ranks(complete.map((p) => p[0])),
    y = ranks(complete.map((p) => p[1]));
  return { rho: correlation(x.map((v, i) => [v, y[i]])), n: complete.length };
}
export function climateAssociations(p: ResearchPackage, district: string, year: number | null) {
  const rows = scopeRows(p, 'panel').filter(
    (r) =>
      (district === 'All districts' || r.district === district) &&
      (year === null || r.year === year),
  );
  return (['rainfall', 'temperature', 'humidity'] as const).map((field) => ({
    variable: field,
    ...spearman(
      rows.flatMap((r) =>
        r[field] !== null && r.cases !== null ? [[r[field]!, r.cases] as [number, number]] : [],
      ),
    ),
    reference: reportedAssociations[field],
  }));
}
export function referenceDifferences(p: ResearchPackage) {
  return benchmarkReferences.flatMap((r) =>
    (['validation', 'test'] as const).flatMap((split) => {
      const supplied = p.performance.find(
        (v) => v.model === r.model && v.year === (split === 'test' ? 2025 : 2024),
      );
      return (['mae', 'rmse', 'r2'] as const).flatMap((metric) => {
        const original = finite(supplied?.[metric]),
          reference = r[split][metric];
        return original !== null &&
          reference !== null &&
          Math.abs(original - reference) > (metric === 'r2' ? 0.0005 : 0.051)
          ? [
              {
                model: r.model,
                split,
                metric,
                original,
                reference,
                status: 'UNRESOLVED — source values retained',
              },
            ]
          : [];
      });
    }),
  );
}
export function cohortExport(p: ResearchPackage, scope: ScopeId, year: number, district: string) {
  const summary = scopeSummary(p, scope, year, district);
  return {
    schemaVersion: 1,
    scope: scopes.find((s) => s.id === scope),
    year,
    district,
    sourceVersion: p.manifest.version,
    sourceFiles: p.manifest.files,
    publicationDate: null,
    originalRetrievalDate: null,
    dateLimit:
      'Original source publication/retrieval date is not invented when absent from supplied metadata',
    processingHistory:
      'Use only selected cohort rows; climate joins by exact district/year; join snapshot API/denominators to panel rows only when same-year recorded episode counts agree; no imputation; duplicate observation keys excluded',
    validationStatus: p.manifest.verification,
    indicatorDefinitions,
    referenceVersion,
    referenceStatus,
    referenceCitation,
    observations: summary.selected,
    coverage: {
      expected: summary.expected,
      present: summary.available,
      denominatorCount: summary.denominators,
    },
    rowsInWholeCohort: scopeRows(p, scope).length,
  };
}
