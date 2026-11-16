// One-time migration: preserve legacy evidence labels; never reclassify it as fetched official data.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { loadCatalog, stageVersion, publishCatalog } from './malaria/catalog.mjs';
const root = fileURLToPath(new URL('../public/data/indonesia/', import.meta.url));
const catalog = await loadCatalog(root),
  now = new Date().toISOString();
for (const [kind, year, path] of [
  ['skdr', 2026, 'skdr/2026-m44.json'],
  ['sismal', 2025, 'sismal/2025.json'],
  ['sismal', 2026, 'sismal/2026.json'],
]) {
  const snapshot = JSON.parse(await readFile(join(root, path), 'utf8'));
  const result = await stageVersion({ root, catalog, kind, year, snapshot, now, bootstrap: true });
  catalog.sources[`${kind}:${year}`].message = result.message;
}
await publishCatalog(root, catalog);
