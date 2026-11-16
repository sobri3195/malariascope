import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
export const catalogFile = new URL('../../public/data/indonesia/manifest.json', import.meta.url);
// All fixture changes include a matching manifest checksum. Production assets stay untouched.
export async function servePublication(page, kind, snapshot) {
  const catalog = JSON.parse(await readFile(catalogFile, 'utf8'));
  const entry = catalog.sources[`${kind}:${snapshot.reportingYear || snapshot.rows[0].year}`];
  const body = JSON.stringify(snapshot);
  for (const v of entry.versions.filter((v) => v.publicationId === snapshot.id)) {
    v.dataSha256 = createHash('sha256').update(body).digest('hex');
    await page.route('**' + v.path, (route) =>
      route.fulfill({ contentType: 'application/json', body }),
    );
  }
  await page.route('**/data/indonesia/manifest.json', (route) => route.fulfill({ json: catalog }));
  return catalog;
}
