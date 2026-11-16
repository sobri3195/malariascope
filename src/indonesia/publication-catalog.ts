import { validTimestamp, validDate } from '../data-time.ts';
export type SourceKind = 'skdr' | 'sismal' | 'regional';
export type CheckStatus =
  'bootstrap' | 'updated' | 'unchanged' | 'failed' | 'review-required' | 'empty';
export type PublishedVersion = {
  id: string;
  publicationId: string;
  year: number;
  path: string;
  sourceUrl: string;
  sourceSha256: string | null;
  dataSha256: string;
  semanticSha256: string;
  createdAt: string;
  publishedAt: string | null;
  weekThrough: number | null;
  coverage: { national: number; province: number; district: number; available: number };
  bootstrap?: boolean;
};
export type PublicationSource = {
  kind: SourceKind;
  year: number;
  active: string | null;
  status: CheckStatus;
  lastCheckedAt: string | null;
  lastSuccessAt: string | null;
  retryAt?: string | null;
  message: string;
  versions: PublishedVersion[];
};
export type PublicationCatalog = {
  schema: 'malariascope-publications-v1';
  checkedAt: string | null;
  sources: Record<string, PublicationSource>;
};
export function validateCatalog(value: unknown): asserts value is PublicationCatalog {
  const c = value as PublicationCatalog;
  if (
    !c ||
    c.schema !== 'malariascope-publications-v1' ||
    !c.sources ||
    typeof c.sources !== 'object' ||
    Array.isArray(c.sources) ||
    (c.checkedAt !== null && !validTimestamp(c.checkedAt))
  )
    throw Error('Manifest publikasi tidak sah.');
  for (const [key, s] of Object.entries(c.sources)) {
    if (
      !s ||
      !['skdr', 'sismal', 'regional'].includes(s.kind) ||
      !Number.isInteger(s.year) ||
      (s.kind === 'regional'
        ? !new RegExp('^regional:[a-z0-9-]+:' + s.year + '$').test(key)
        : key !== `${s.kind}:${s.year}`) ||
      !Array.isArray(s.versions) ||
      !['bootstrap', 'updated', 'unchanged', 'failed', 'review-required', 'empty'].includes(
        s.status,
      ) ||
      typeof s.message !== 'string' ||
      (s.lastCheckedAt !== null && !validTimestamp(s.lastCheckedAt)) ||
      (s.lastSuccessAt !== null && !validTimestamp(s.lastSuccessAt)) ||
      (s.retryAt !== undefined && s.retryAt !== null && !validTimestamp(s.retryAt))
    )
      throw Error('Metadata sumber manifest tidak sah.');
    const ids = new Set<string>();
    for (const v of s.versions) {
      if (
        !v ||
        typeof v.id !== 'string' ||
        !/^[a-z0-9-]+$/.test(v.id) ||
        ids.has(v.id) ||
        typeof v.publicationId !== 'string' ||
        (s.kind === 'skdr'
          ? !/^20\d{2}-m(?:[1-9]|[1-4]\d|5[0-3])$/.test(v.publicationId)
          : s.kind === 'sismal'
            ? v.publicationId !== `sismal-${s.year}`
            : !/^[a-z0-9-]+$/.test(v.publicationId)) ||
        !v.id.startsWith(v.publicationId + '-') ||
        (v.publishedAt !== null && !validDate(v.publishedAt)) ||
        (v.weekThrough !== null &&
          (!Number.isInteger(v.weekThrough) || v.weekThrough < 1 || v.weekThrough > 53)) ||
        v.year !== s.year ||
        !/^\/data\/indonesia\/[a-zA-Z0-9/_.-]+\.json$/.test(v.path) ||
        v.path.includes('..') ||
        !v.path.startsWith(`/data/indonesia/versions/${s.kind}/`) ||
        !/^https:\/\//.test(v.sourceUrl) ||
        new URL(v.sourceUrl).username !== '' ||
        new URL(v.sourceUrl).password !== '' ||
        !/^[a-f0-9]{64}$/.test(v.dataSha256) ||
        !/^[a-f0-9]{64}$/.test(v.semanticSha256) ||
        (v.sourceSha256 !== null && !/^[a-f0-9]{64}$/.test(v.sourceSha256)) ||
        !validTimestamp(v.createdAt) ||
        !v.coverage ||
        ['national', 'province', 'district', 'available'].some(
          (k) =>
            !Number.isSafeInteger(v.coverage[k as keyof typeof v.coverage]) ||
            v.coverage[k as keyof typeof v.coverage] < 0,
        )
      )
        throw Error('Versi/path/checksum dalam manifest tidak sah.');
      ids.add(v.id);
    }
    if (s.active !== null && !ids.has(s.active))
      throw Error('Manifest aktif menunjuk versi yang tidak tersedia.');
  }
}
export function resolvePublication(
  c: PublicationCatalog,
  kind: SourceKind,
  year: number | undefined,
  requested = 'latest',
) {
  const sources = Object.values(c.sources).filter(
    (s) => s.kind === kind && (year === undefined || s.year === year),
  );
  if (requested === 'latest') {
    const candidates = sources.flatMap((source) => {
      const version = source.versions.find((v) => v.id === source.active);
      return version ? [{ source, version }] : [];
    });
    return (
      candidates.sort(
        (a, b) =>
          b.version.publicationId.localeCompare(a.version.publicationId, undefined, {
            numeric: true,
          }) || b.version.createdAt.localeCompare(a.version.createdAt),
      )[0] ?? null
    );
  }
  for (const source of sources) {
    const exact = source.versions.find((v) => v.id === requested);
    if (exact) return { source, version: exact };
    const matches = source.versions.filter((v) => v.publicationId === requested);
    if (matches.length) return { source, version: matches.at(-1)! };
  }
  return null;
}
export function catalogYears(c: PublicationCatalog | null) {
  return c
    ? [...new Set(Object.values(c.sources).map((s) => s.year))].sort((a, b) => a - b)
    : [2025, 2026];
}
