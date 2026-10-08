import type { Dataset } from './store';
import type { Row } from './analytics';
export const analyticalDemoId = 'synthetic-analytics-base';
export const isAnalyticalDemo = (id: string) => id.startsWith('synthetic-analytics-');
export const demoModels = [
  'Persistence',
  'Ridge Regression — no climate',
  'Ridge Regression',
  'Random Forest',
  'Gradient Boosting',
] as const;
/** Artificial annual values for interface testing; named regions are public geographic context only. */
export function makeAnalyticalRows(registry: {
  districts: { canonicalName: string; code: string }[];
}) {
  const rows: Row[] = [];
  registry.districts.forEach((d, i) => {
    for (let t = 0; t < 6; t++)
      rows.push({
        district: d.canonicalName,
        classification: 'SYNTHETIC',
        district_code: d.code,
        year: 2020 + t,
        cases: Math.round(500 * (i + 1) ** 2 * (1 + 0.2 * t + 0.02 * i * t)),
        population: 40000 + i * 20000 + t * 1500,
        rainfall: 1800 + i * 110 + t * 85 + (t % 2 ? 120 : -60),
        temperature: Number((25 + i * 0.35 + t * 0.1).toFixed(2)),
        humidity: Number((65 + i * 2 + t * 1.1).toFixed(2)),
      });
  });
  return {
    version: 'synthetic-analytics-v1',
    classification: 'SYNTHETIC — NOT OBSERVED DATA',
    source:
      'Deterministic synthetic interface demo. Real public district names and geometry provide context only.',
    observations: rows,
    outputs: demoModels.map((model, index) => ({
      model,
      rows: rows
        .filter((r) => r.year > 2020)
        .map((r) => {
          const previous = rows.find((p) => p.district === r.district && p.year === r.year - 1)!;
          return {
            ...r,
            model,
            prediction: Math.round(
              previous.cases * (1 + [0, 0.08, 0.1, 0.14, 0.16][index]) + index * 45,
            ),
          };
        }),
    })),
    limitations: [
      'All case, population and climate values are artificial.',
      'Model outputs are illustrative formulas, not trained or validated models.',
      'Do not combine with supplied research outcomes, benchmarks or spatial statistics.',
    ],
  };
}
export async function loadAnalyticalDemo(): Promise<Dataset[]> {
  const [response, metadata] = await Promise.all([
    fetch('/data/demo/analytical-workspace.json'),
    fetch('/data/demo/analytical-workspace-metadata.json'),
  ]);
  if (!response.ok || !metadata.ok) throw Error('Connected synthetic demo unavailable.');
  const [raw, m] = await Promise.all([response.text(), metadata.json()]);
  const hash = Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw))),
  )
    .map((n) => n.toString(16).padStart(2, '0'))
    .join('');
  if (hash !== m.sha256) throw Error('Synthetic demo checksum mismatch.');
  const data = JSON.parse(raw);
  if (
    data.classification !== 'SYNTHETIC — NOT OBSERVED DATA' ||
    data.observations.length !== 54 ||
    data.outputs.length !== 5 ||
    data.outputs.some((o: any) => !demoModels.includes(o.model) || o.rows.length !== 45)
  )
    throw Error('Synthetic demo schema mismatch.');
  const shared = {
    source: data.source,
    checksum: hash,
    created: new Date().toISOString(),
    classification: 'SYNTHETIC' as const,
  };
  return [
    {
      ...shared,
      id: analyticalDemoId,
      name: 'SYNTHETIC DEMO — analytical observations',
      rows: data.observations,
    },
    ...data.outputs.map((o: any, i: number) => ({
      ...shared,
      id: `synthetic-analytics-model-${i}`,
      name: `SYNTHETIC DEMO — ${o.model} illustrative output`,
      rows: o.rows,
    })),
  ];
}
