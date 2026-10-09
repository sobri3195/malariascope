import { performance } from 'node:perf_hooks';
import { validate, evaluate } from '../src/analytics.ts';
import { forecastMetrics } from '../src/forecasting.ts';
const rows = Array.from({ length: 100000 }, (_, i) => ({
  district: `SYN-${i}`,
  year: 2025,
  cases: 100 + (i % 100),
  population: 1000,
}));
const measurements = [];
for (const [name, fn] of [
  ['schema import', () => validate(rows)],
  [
    'non-triggering cases rule',
    () =>
      evaluate(rows, [
        {
          id: 'benchmark',
          metric: 'cases',
          operator: '>',
          value: 10000,
          enabled: true,
          severity: 'INFO',
        },
      ]),
  ],
  [
    'paired error aggregation',
    () =>
      forecastMetrics(
        rows.map((r, i) => ({
          key: String(i),
          district: r.district,
          year: r.year,
          model: 'Persistence',
          observed: r.cases,
          predicted: r.cases + 1,
          residual: 1,
          absoluteError: 1,
          references: [],
        })),
      ),
  ],
]) {
  const start = performance.now();
  const result = fn();
  const elapsed = performance.now() - start;
  measurements.push({
    name,
    records: rows.length,
    milliseconds: Math.round(elapsed),
    rssMB: Math.round(process.memoryUsage().rss / 1048576),
  });
  if (name === 'schema import' && result.rows.length !== 100000)
    throw Error('Import dropped records');
  if (elapsed > 30000) throw Error(`${name} exceeds 30-second smoke budget`);
}
console.log(
  JSON.stringify(
    {
      classification: 'SYNTHETIC BENCHMARK — NOT OBSERVED DATA',
      scope: 'Three pure-engine paths; does not establish GIS, triggering-alert or whole-app scale',
      measurements,
    },
    null,
    2,
  ),
);
