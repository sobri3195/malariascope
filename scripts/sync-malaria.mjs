import { mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createDownloader } from './malaria/http.mjs';
import { syncMalaria, configuredRegional } from './malaria/pipeline.mjs';
import { validateRegionalConfig } from './malaria/regional.mjs';
const args = process.argv.slice(2);
let year,
  dryRun = false;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--dry-run') dryRun = true;
  else if (args[i] === '--year' && /^20\d{2}$/.test(args[i + 1] || '')) year = +args[++i];
  else throw Error('Usage: npm run data:sync:malaria -- [--year 2026] [--dry-run]');
}
const repo = fileURLToPath(new URL('../', import.meta.url));
const root = join(repo, 'public/data/indonesia');
const regional = await configuredRegional(repo);
regional.forEach(validateRegionalConfig);
const hosts = [
  'surveilans.kemkes.go.id',
  'malaria.kemkes.go.id',
  ...regional.map((s) => new URL(s.url).hostname),
];
const lock = join(root, '.sync-lock');
let locked = false;
try {
  if (!dryRun) {
    await mkdir(lock);
    locked = true;
  }
  const result = await syncMalaria({
    root,
    year,
    dryRun,
    regional,
    download: createDownloader({ hosts }),
  });
  console.log(JSON.stringify({ ...result, catalog: undefined }, null, 2));
  if (result.attempts.some((a) => ['failed', 'review-required'].includes(a.status)))
    process.exitCode = 1;
} finally {
  if (locked) await rm(lock, { recursive: true, force: true });
}
