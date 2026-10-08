import { writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
let seed = 3602026;
const random = () => {
  seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
  return seed / 4294967296;
};
const lines = ['record_id,district,year,cases,population,rainfall_mm,temperature_c,classification'];
for (let i = 0; i < 100000; i++)
  lines.push(
    [
      `SYN-${String(i + 1).padStart(6, '0')}`,
      `Synthetic District ${String((i % 9) + 1).padStart(2, '0')}`,
      2020 + Math.floor(random() * 6),
      Math.floor(random() * 21),
      1000 + Math.floor(random() * 9000),
      (1000 + random() * 3000).toFixed(2),
      (22 + random() * 10).toFixed(2),
      'SYNTHETIC_NOT_OBSERVED',
    ].join(','),
  );
const csv = lines.join('\n') + '\n';
await writeFile('public/data/demo/synthetic-100000.csv', csv);
await writeFile(
  'public/data/demo/metadata.json',
  JSON.stringify(
    {
      name: 'Synthetic demonstration records',
      version: 'synthetic-demo-v1',
      records: 100000,
      seed: 3602026,
      classification: 'SYNTHETIC — NOT OBSERVED DATA',
      unit: 'Artificial demonstration record; NOT a verified district-year surveillance observation',
      source: 'Deterministic local generator scripts/generate-synthetic-demo.mjs',
      period: '2020–2025 artificial labels',
      districts: 'Nine fictional districts; no real geographic match',
      sha256: createHash('sha256').update(csv).digest('hex'),
      limitations: [
        'No scientific validity',
        'Not observed surveillance, forecasts, climate measurements or readiness evidence',
        'Never merged into verified research datasets',
        'Repeated fictional district-year labels are intentional record-level demo data',
      ],
    },
    null,
    2,
  ) + '\n',
);
console.log('Generated exactly 100,000 explicitly synthetic demo records.');
