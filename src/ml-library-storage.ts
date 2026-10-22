/** Preserve unreadable local ML evidence until an explicit recovery action. */
export function readMLLibrary<T>(
  key: string,
  validate: (value: unknown) => asserts value is T,
  storage: Pick<Storage, 'getItem'>,
): { items: T[]; original: string | null; issue: string } {
  let raw: string | null = null;
  try {
    raw = storage.getItem(key);
    if (raw === null) return { items: [], original: null, issue: '' };
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) throw Error('Expected a model-evidence array');
    value.forEach(validate);
    return { items: value, original: null, issue: '' };
  } catch {
    return {
      items: [],
      original: raw,
      issue:
        raw === null
          ? 'Local model storage is unavailable. Import cannot be persisted until storage access is restored.'
          : 'Saved model evidence could not be read safely. Original values are preserved; export them before clearing unreadable storage.',
    };
  }
}
