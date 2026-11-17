export type SkdrCatalog = {
  schemaVersion: 1;
  latest: string | null;
  entries: {
    id: string;
    version: string | null;
    path: string;
    complete: boolean;
    publishedAt: string;
  }[];
};
export function validateSkdrCatalog(value: unknown): SkdrCatalog {
  const c = value as SkdrCatalog;
  if (
    !c ||
    c.schemaVersion !== 1 ||
    !Array.isArray(c.entries) ||
    !c.entries.length ||
    c.entries.some(
      (e) =>
        !e ||
        !/^20\d{2}-m(?:[1-9]|[1-4]\d|5[0-3])$/.test(e.id) ||
        typeof e.complete !== 'boolean' ||
        !/^\d{4}-\d{2}-\d{2}$/.test(e.publishedAt) ||
        (e.version !== null && !/^[a-f0-9]{64}$/.test(e.version)) ||
        !new RegExp(`^/data/indonesia/skdr/(?:versions/)?${e.id}(?:-[a-f0-9]{64})?\\.json$`).test(
          e.path,
        ),
    ) ||
    new Set(c.entries.map((e) => e.id)).size !== c.entries.length ||
    (c.latest !== null && !c.entries.some((e) => e.id === c.latest && e.complete))
  )
    throw Error('Katalog versi SKDR tidak sah.');
  return c;
}
