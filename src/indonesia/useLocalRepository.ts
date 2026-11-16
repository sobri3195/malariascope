import { useEffect, useState } from 'react';
import { readRepository, writeRepository, restartRepository } from './local-repository';
export function useLocalRepository<T>(key: string, parse: (value: unknown) => T, empty: () => T) {
  const [state, setState] = useState(() => {
    try {
      return readRepository(window.localStorage, key, parse, empty);
    } catch {
      return { value: empty(), raw: null, error: 'Penyimpanan peramban tidak tersedia.' };
    }
  });
  useEffect(() => {
    const listener = (event: StorageEvent) => {
      if (event.key === key || event.key === null)
        setState((s) => ({
          ...s,
          error: 'Data berubah di tab lain. Muat ulang sebelum menyimpan.',
        }));
    };
    window.addEventListener('storage', listener);
    return () => window.removeEventListener('storage', listener);
  }, [key]);
  function write(value: T) {
    if (state.error) return false;
    try {
      setState(writeRepository(window.localStorage, key, state.raw, value, parse));
      return true;
    } catch (e) {
      setState((s) => ({
        ...s,
        error: e instanceof Error ? e.message : 'Penyimpanan gagal; data sesi dipertahankan.',
      }));
      return false;
    }
  }
  function reload() {
    try {
      const result = readRepository(window.localStorage, key, parse, empty);
      setState((s) => (result.error ? { ...s, raw: result.raw, error: result.error } : result));
    } catch {
      setState((s) => ({ ...s, error: 'Penyimpanan peramban tidak tersedia.' }));
    }
  }
  function restart() {
    try {
      setState(restartRepository(window.localStorage, key, state.raw, empty(), parse));
      return true;
    } catch (e) {
      setState((s) => ({
        ...s,
        error: e instanceof Error ? e.message : 'Pemulihan gagal; data asli dipertahankan.',
      }));
      return false;
    }
  }
  return { data: state.value, raw: state.raw, error: state.error, write, reload, restart };
}
