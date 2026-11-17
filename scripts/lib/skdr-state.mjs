import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { atomicJson } from './sync-malaria.mjs';
import { validateSkdrCatalog } from '../../src/indonesia/skdr-catalog.ts';

// Fail closed: a stale lock requires operator inspection, never a timed takeover
// that could remove a lock belonging to a slow but still running publisher.
export async function withPublicationLock(root, operation) {
  await mkdir(root, { recursive: true });
  const lock = join(root, '.publication-lock');
  try {
    await mkdir(lock);
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
    throw Object.assign(
      Error(`publication-locked: ${lock}; proses lain atau lock sisa perlu diperiksa.`),
      { code: 'SKDR_LOCKED' },
    );
  }
  try {
    await writeFile(
      join(lock, 'owner.json'),
      JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }),
    );
    return await operation();
  } finally {
    await rm(lock, { recursive: true, force: true });
  }
}
async function optionalJson(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}
export async function recordSyncAttempt(root, attempt) {
  const file = join(root, 'sync-manifest.json');
  const previous = await optionalJson(file);
  const rawCatalog = await optionalJson(join(root, 'skdr', 'catalog.json'));
  const catalog = rawCatalog ? validateSkdrCatalog(rawCatalog) : null;
  const active = catalog?.entries.find((e) => e.id === catalog.latest);
  const success =
    attempt.source === 'skdr' && ['published', 'revised', 'unchanged'].includes(attempt.status);
  const published = attempt.source === 'skdr' && ['published', 'revised'].includes(attempt.status);
  const previousSuccess =
    previous?.lastSuccessAt ||
    previous?.attempts?.find(
      (a) => a.source === 'skdr' && ['published', 'revised', 'unchanged'].includes(a.status),
    )?.attemptedAt ||
    null;
  const manifest = {
    schemaVersion: 2,
    attemptedAt: attempt.attemptedAt,
    lastAttemptedAt: attempt.attemptedAt,
    lastSuccessAt: success ? attempt.completedAt || attempt.attemptedAt : previousSuccess,
    lastPublishedAt: published
      ? attempt.stages?.find((s) => s.stage === 'published')?.at ||
        attempt.completedAt ||
        attempt.attemptedAt
      : previous?.lastPublishedAt || null,
    active: active ? { edition: active.id, version: active.version, path: active.path } : null,
    // A server-side write proves publication only; the browser reports its own
    // validated, loaded asset identity separately, without claiming deployment.
    publicationState:
      attempt.source !== 'skdr'
        ? previous?.publicationState || 'unavailable'
        : published
          ? 'published'
          : success
            ? 'unchanged'
            : active
              ? 'retained'
              : 'unavailable',
    attempts: [
      ...(Array.isArray(previous?.attempts)
        ? previous.attempts.filter(
            (a) =>
              a.source !== attempt.source ||
              (attempt.source === 'sismal' && a.reportingYear !== attempt.reportingYear),
          )
        : []),
      attempt,
    ],
  };
  await atomicJson(file, manifest);
  return manifest;
}
