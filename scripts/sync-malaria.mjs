import { validateAuditTargets } from '../src/indonesia/skdr.ts';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, rm, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { atomicJson, syncSismalYear } from './lib/sync-malaria.mjs';
import { convertSkdrMarkdown, convertOfficialSkdrCsv } from '../src/indonesia/skdr-conversion.ts';
import {
  discoverBulletin,
  discoverLatestBulletin,
  indexUrl,
  verifyPdfRows,
  verifyPdfMetadata,
  publishSnapshot,
} from './lib/skdr-publication.mjs';
import { extractPdfSnapshot, extractPdfMetadata } from './lib/skdr-pdf.mjs';
const run = promisify(execFile);
const args = process.argv.slice(2);
const valued = [
  '--year',
  '--bulletin',
  '--skdr-markdown',
  '--pdf',
  '--csv',
  '--metadata',
  '--output',
];
const flags = ['--dry-run', '--sismal-only'];
const options = {};
for (let i = 0; i < args.length; i++) {
  const key = args[i];
  if (flags.includes(key)) options[key] = true;
  else if (valued.includes(key) && args[i + 1] && !args[i + 1].startsWith('--'))
    options[key] = args[++i];
  else throw Error(`Argumen tidak sah: ${key}`);
}
const year = Number(options['--year'] || 2026);
let bulletin = Number(options['--bulletin'] || 45);
if (
  !Number.isInteger(year) ||
  year < 2000 ||
  year > 2099 ||
  !Number.isInteger(bulletin) ||
  bulletin < 1 ||
  bulletin > 53
)
  throw Error('Tahun/nomor buletin tidak sah.');
if (options['--csv'] && !options['--metadata'])
  throw Error('--csv memerlukan --metadata dari sumber resmi.');
if (options['--pdf'] && !options['--metadata'] && !options['--skdr-markdown'])
  throw Error(
    'Impor PDF lokal memerlukan URL/metadata resmi melalui --metadata atau --skdr-markdown.',
  );
const root = options['--output']
  ? resolve(options['--output'])
  : fileURLToPath(new URL('../public/data/indonesia/', import.meta.url));
const now = new Date().toISOString();
async function download(url) {
  const { stdout } = await run(
    'curl',
    [
      '--fail-with-body',
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
const attempts = [];
let directory;
if (options['--sismal-only']) {
  if (options['--dry-run'])
    throw Error('Dry-run tersedia untuk publikasi SKDR; SISMAL tidak dijalankan.');
  for (const y of year === 2026 ? [2026, 2025] : [year])
    attempts.push(await syncSismalYear({ year: y, root, download, now }));
} else
  try {
    let meta = options['--metadata']
      ? JSON.parse(await readFile(resolve(options['--metadata']), 'utf8'))
      : null;
    const legacy = options['--skdr-markdown']
      ? convertSkdrMarkdown(await readFile(resolve(options['--skdr-markdown']), 'utf8'))
      : null;
    let url = meta?.sourceUrl || legacy?.sourceUrl;
    if (!url) {
      const html = (await download(indexUrl)).toString('utf8');
      if (options['--bulletin']) url = discoverBulletin(html, year, bulletin);
      else {
        const latest = discoverLatestBulletin(html, year);
        bulletin = latest.bulletin;
        url = latest.url;
      }
    } else if (!options['--bulletin'])
      bulletin = meta?.bulletin || Number(legacy.id.split('-m')[1]);
    if (new URL(url).hostname !== 'surveilans.kemkes.go.id' || new URL(url).protocol !== 'https:')
      throw Error('URL PDF resmi harus HTTPS surveilans.kemkes.go.id.');
    const bytes = options['--pdf']
      ? await readFile(resolve(options['--pdf']))
      : await download(url);
    if (!bytes.subarray(0, 5).equals(Buffer.from('%PDF-')))
      throw Error('Respons sumber bukan PDF.');
    directory = await mkdtemp(join(tmpdir(), 'malaria-sync-'));
    const pdf = join(directory, 'source.pdf'),
      txt = join(directory, 'source.txt');
    await writeFile(pdf, bytes);
    await run('pdftotext', ['-layout', pdf, txt]);
    const pages = Object.fromEntries(
      (await readFile(txt, 'utf8')).split('\f').map((text, i) => [i + 1, text]),
    );
    if (!meta && !legacy)
      meta = extractPdfMetadata(pages, { year, bulletin, sourceUrl: url, retrievedAt: now });
    if (meta) meta = { ...meta, retrievedAt: now };
    const snapshot = legacy
      ? { ...legacy, retrievedAt: now }
      : options['--csv']
        ? convertOfficialSkdrCsv(await readFile(resolve(options['--csv']), 'utf8'), meta)
        : extractPdfSnapshot(pages, meta);
    if (snapshot.id !== `${year}-m${bulletin}` || snapshot.sourceUrl !== url)
      throw Error('Identitas edisi/URL tidak sesuai permintaan.');
    verifyPdfRows(snapshot, pages);
    verifyPdfMetadata(snapshot, pages);
    const auditErrors = validateAuditTargets(snapshot);
    if (auditErrors.length) throw Error(auditErrors.join(' '));
    attempts.push({
      source: 'skdr',
      attemptedAt: now,
      ...(await publishSnapshot({
        snapshot,
        pdf: bytes,
        root: join(root, 'skdr'),
        dryRun: !!options['--dry-run'],
      })),
    });
  } catch (e) {
    attempts.push({
      source: 'skdr',
      status: 'failed',
      attemptedAt: now,
      error: String(e),
      retained: 'Katalog dan versi valid terakhir tidak diubah.',
    });
  } finally {
    if (directory) await rm(directory, { recursive: true, force: true });
  }
const manifest = { attemptedAt: now, attempts };
if (!options['--dry-run']) await atomicJson(join(root, 'sync-manifest.json'), manifest);
console.log(JSON.stringify(manifest, null, 2));
if (attempts.some((a) => !['saved', 'published', 'revised', 'unchanged'].includes(a.status)))
  process.exitCode = 1;
