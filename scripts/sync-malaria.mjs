import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, mkdir, rm, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { atomicJson, syncSismalYear, pdfUrl } from './lib/sync-malaria.mjs';
import { convertSkdrMarkdown } from '../src/indonesia/skdr-conversion.ts';
const run = promisify(execFile);
const args = process.argv.slice(2);
const option = (name) => {
  const i = args.indexOf(name);
  return i < 0 ? undefined : args[i + 1];
};
const year = Number(option('--year') || 2026);
if (
  ![2025, 2026].includes(year) ||
  args.some((a, i) => a.startsWith('--') && !['--year', '--skdr-markdown'].includes(a))
)
  throw Error('Usage: npm run data:sync:malaria -- --year 2026 [--skdr-markdown path.md]');
const root = fileURLToPath(new URL('../public/data/indonesia/', import.meta.url));
const now = new Date().toISOString();
async function download(url) {
  const { stdout } = await run(
    'curl',
    [
      '--fail',
      '--silent',
      '--show-error',
      '--location',
      '--max-time',
      '40',
      '--proto',
      '=https',
      '--proto-redir',
      '=https',
      url,
    ],
    { encoding: 'buffer', maxBuffer: 32 * 1024 * 1024 },
  );
  return stdout;
}
await mkdir(root, { recursive: true });
const attempts = [];
// One request per year; query province is not trusted as response coverage.
for (const y of year === 2026 ? [2026, 2025] : [year])
  attempts.push(await syncSismalYear({ year: y, root, download, now }));
const markdown = option('--skdr-markdown');
let directory;
try {
  const snapshot = markdown ? convertSkdrMarkdown(await readFile(resolve(markdown), 'utf8')) : null;
  const targetPdf = snapshot?.sourceUrl || pdfUrl;
  if (new URL(targetPdf).hostname !== 'surveilans.kemkes.go.id')
    throw Error('PDF buletin harus dari surveilans.kemkes.go.id.');
  const bytes = await download(targetPdf);
  const pdfSha256 = createHash('sha256').update(bytes).digest('hex');
  directory = await mkdtemp(join(tmpdir(), 'malaria-sync-'));
  const pdf = join(directory, 'source.pdf');
  await writeFile(pdf, bytes);
  if (!markdown)
    attempts.push({
      source: 'skdr',
      url: pdfUrl,
      status: 'awaiting-csv',
      pdfSha256,
      attemptedAt: now,
    });
  else {
    const input = await readFile(resolve(markdown), 'utf8');
    const texts = {};
    for (const page of [36, 45]) {
      const output = join(directory, `page-${page}.txt`);
      await run('pdftotext', ['-f', String(page), '-l', String(page), '-layout', pdf, output]);
      texts[page] = await readFile(output, 'utf8');
    }
    const norm = (s) => s.toLocaleUpperCase('id').replace(/[^A-Z0-9]/g, '');
    const notMatched = snapshot.rows.filter(
      (r) =>
        !texts[r.page]
          .split(/\r?\n/)
          .some(
            (line) =>
              norm(line).includes(norm(r.originalLabel)) &&
              new RegExp(
                `(?:^|[^0-9])${r.value.toLocaleString('id-ID').replaceAll('.', '[.,]?')}(?:[^0-9]|$)`,
              ).test(line),
          ),
    );
    if (notMatched.length)
      throw Error(
        `Pencocokan baris PDF belum lulus: ${notMatched.map((r) => r.regionCode).join(', ')}. Periksa tata letak/OCR; jangan menandai sumber sudah diperiksa.`,
      );
    if (snapshot.sourceUrl !== targetPdf)
      throw Error('URL lampiran berbeda dari PDF yang diperiksa.');
    const published = {
      ...snapshot,
      fetchedAt: now,
      pdfVerification: { method: 'pdf-text-lines', sha256: pdfSha256, pages: [36, 45] },
      attachmentSha256: createHash('sha256').update(input).digest('hex'),
    };
    const target = join(root, 'skdr', `${snapshot.id}.json`);
    try {
      const prior = await readFile(target);
      const sha = createHash('sha256').update(prior).digest('hex');
      await atomicJson(
        join(root, 'skdr', 'archive', `${snapshot.id}-${sha}.json`),
        JSON.parse(prior.toString('utf8')),
      );
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
    await atomicJson(target, published);
    attempts.push({
      source: 'skdr',
      status: 'saved',
      url: pdfUrl,
      rows: 39,
      pdfSha256,
      attemptedAt: now,
    });
  }
} catch (e) {
  attempts.push({
    source: 'skdr',
    url: pdfUrl,
    status: 'failed',
    error: String(e),
    attemptedAt: now,
  });
} finally {
  if (directory) await rm(directory, { recursive: true, force: true });
}
const manifest = { attemptedAt: now, attempts };
await atomicJson(join(root, 'sync-manifest.json'), manifest);
console.log(JSON.stringify(manifest, null, 2));
if (attempts.some((a) => a.status !== 'saved')) process.exitCode = 1;
