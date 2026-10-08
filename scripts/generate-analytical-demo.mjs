import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { makeAnalyticalRows } from '../src/analytical-demo.ts';
const registry = JSON.parse(await readFile('public/data/verified/district-registry.json', 'utf8'));
const raw = JSON.stringify(makeAnalyticalRows(registry), null, 2) + '\n';
await writeFile('public/data/demo/analytical-workspace.json', raw);
await writeFile(
  'public/data/demo/analytical-workspace-metadata.json',
  JSON.stringify(
    {
      version: 'synthetic-analytics-v1',
      classification: 'SYNTHETIC — NOT OBSERVED DATA',
      observations: 54,
      districts: 9,
      period: '2020–2025 artificial annual values',
      modelOutputs: 225,
      sha256: createHash('sha256').update(raw).digest('hex'),
      source: 'scripts/generate-analytical-demo.mjs',
      geometry: 'Existing public geoBoundaries ADM2 polygons, not synthetic locations',
      limitations:
        'All analytical values and model formulas are synthetic; no scientific validation or source verification is claimed.',
    },
    null,
    2,
  ) + '\n',
);
