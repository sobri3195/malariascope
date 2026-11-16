import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { loadCatalog, sha } from './malaria/catalog.mjs';
import { validateSkdr } from '../src/indonesia/skdr.ts';
import { validateSismal } from '../src/indonesia/sismal.ts';
const root = fileURLToPath(new URL('../public/data/indonesia/', import.meta.url));
const catalog = await loadCatalog(root);
if (!Object.keys(catalog.sources).length) throw Error('Manifest belum tersedia.');
for (const source of Object.values(catalog.sources))
  for (const v of source.versions) {
    const bytes = await readFile(join(root, v.path.replace('/data/indonesia/', '')));
    if (sha(bytes) !== v.dataSha256) throw Error('Checksum versi berubah: ' + v.id);
    const s = JSON.parse(bytes.toString('utf8'));
    const errors =
      source.kind === 'skdr'
        ? validateSkdr(s, !v.bootstrap)
        : source.kind === 'sismal'
          ? validateSismal(s, source.year)
          : [];
    if (
      s.id !== v.publicationId ||
      s.sourceUrl !== v.sourceUrl ||
      (source.kind === 'skdr' && s.rows[0]?.year !== v.year) ||
      errors.length
    )
      throw Error(v.id + ': ' + errors.join(' '));
  }
console.log('Validated immutable malaria catalog:', Object.keys(catalog.sources).join(', '));
