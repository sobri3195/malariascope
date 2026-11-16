export type LocalStoragePort = Pick<Storage, 'getItem' | 'setItem'>;
export type RepositoryState<T> = { value: T; raw: string | null; error: string };
export function readRepository<T>(
  storage: LocalStoragePort,
  key: string,
  parse: (value: unknown) => T,
  empty: () => T,
): RepositoryState<T> {
  let raw: string | null = null;
  try {
    raw = storage.getItem(key);
    return { value: raw === null ? empty() : parse(JSON.parse(raw)), raw, error: '' };
  } catch {
    return {
      value: empty(),
      raw,
      error: 'Data tersimpan tidak dapat dibaca atau tidak sah. Data asli dipertahankan.',
    };
  }
}
export function writeRepository<T>(
  storage: LocalStoragePort,
  key: string,
  expected: string | null,
  value: T,
  parse: (value: unknown) => T,
): RepositoryState<T> {
  const checked = parse(value);
  const raw = JSON.stringify(checked);
  if (storage.getItem(key) !== expected)
    throw Error('Data berubah di tab lain. Muat ulang sebelum menyimpan.');
  storage.setItem(key, raw);
  return { value: checked, raw, error: '' };
}
export function restartRepository<T>(
  storage: LocalStoragePort,
  key: string,
  expected: string | null,
  value: T,
  parse: (value: unknown) => T,
) {
  const checked = parse(value);
  const current = storage.getItem(key);
  if (current !== expected) throw Error('Data berubah. Muat ulang sebelum memulihkan penyimpanan.');
  if (current !== null) storage.setItem(`${key}.recovery.${crypto.randomUUID()}`, current);
  return writeRepository(storage, key, current, checked, parse);
}
