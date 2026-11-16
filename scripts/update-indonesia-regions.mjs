// Reproduce the pinned transcription. Changing the commit/hash is a separate reviewed data update.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const path = new URL('../src/indonesia/regions.json', import.meta.url);
const original = JSON.parse(await readFile(path, 'utf8'));
const commit = 'c2eff0881e3c75b8822f8c84ea9d23affc11aadb';
const files = {
  2025: 'db/wilayah.sql',
  2022: 'db/archive/wilayah_2023.sql',
  2020: 'db/archive/wilayah_2020.sql',
};
const result = {};
for (const [version, file] of Object.entries(files)) {
  // curl honors the managed HTTPS proxy; keep TLS and checksum verification enabled.
  const bytes = execFileSync(
    'curl',
    [
      '--fail',
      '--silent',
      '--show-error',
      '--location',
      '--max-time',
      '60',
      `https://raw.githubusercontent.com/cahyadsn/wilayah/${commit}/${file}`,
    ],
    { maxBuffer: 8 * 1024 * 1024 },
  );
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (sha256 !== original[version].sha256) throw Error(`Checksum mismatch: ${file}`);
  const regions = [{ code: 'ID', name: 'Indonesia' }];
  for (const match of bytes.toString('utf8').matchAll(/\('([0-9.]+)'\s*,\s*'([^']+)'/g))
    if (/^\d{2}(\.\d{2})?$/.test(match[1])) regions.push({ code: match[1], name: match[2] });
  if (
    new Set(regions.map((r) => r.code)).size !== regions.length ||
    regions.length !== original[version].regions.length
  )
    throw Error(`Duplicate/count mismatch: ${file}`);
  result[version] = { sha256, regions };
}
await writeFile(path, JSON.stringify(result, null, 2) + '\n');
console.log(
  'Pinned Kemendagri transcription reproduced; hashes and row counts matched. Run Prettier before reviewing the diff.',
);
