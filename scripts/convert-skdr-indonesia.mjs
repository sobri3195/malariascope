import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { convertSkdrMarkdown } from '../src/indonesia/skdr-conversion.ts';
import { validateSkdr } from '../src/indonesia/skdr.ts';
const [input, output] = process.argv.slice(2);
if (input === '--check') {
  const s = JSON.parse(
    await readFile(new URL('../public/data/indonesia/skdr/2026-m44.json', import.meta.url), 'utf8'),
  );
  const errors = validateSkdr(s);
  if (errors.length) throw Error(errors.join('\n'));
  console.log(`Kontrak sah: ${s.rows.length} baris; status bukti ${s.evidence}.`);
  const incomplete = validateSkdr(s, true);
  if (incomplete.length) console.log(`Belum lengkap: ${incomplete.join(' ')}`);
} else {
  if (!input || !output)
    throw Error(
      'Usage: node --experimental-strip-types scripts/convert-skdr-indonesia.mjs input.md output.json | --check',
    );
  const bytes = await readFile(input);
  const s = convertSkdrMarkdown(bytes.toString('utf8'));
  const result = { ...s, attachmentSha256: createHash('sha256').update(bytes).digest('hex') };
  await writeFile(output, JSON.stringify(result, null, 2) + '\n');
  console.log(
    `Validasi lulus; ${s.rows.length} baris. Tinjau diff, label asli, URL dan halaman sebelum menerima snapshot.`,
  );
}
