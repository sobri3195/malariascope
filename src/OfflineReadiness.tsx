import { useState } from 'react';
export default function OfflineReadiness() {
  const [inventory, setInventory] = useState<
      { cache: string; assets: number; publicFiles: number }[]
    >([]),
    [status, setStatus] = useState('Not inspected');
  async function inspect() {
    try {
      if (!('caches' in window)) throw Error('Cache Storage unavailable');
      const names = (await caches.keys()).filter((n) => n.startsWith('malariascope-mobile-'));
      const rows = await Promise.all(
        names.map(async (cache) => {
          const requests = await (await caches.open(cache)).keys();
          return {
            cache,
            assets: requests.filter((r) => new URL(r.url).pathname.startsWith('/assets/')).length,
            publicFiles: requests.filter((r) => new URL(r.url).pathname.startsWith('/data/'))
              .length,
          };
        }),
      );
      setInventory(rows);
      setStatus(
        rows.length
          ? 'Cached files inspected. Only cached modules work offline; observation freshness is not established by caching.'
          : 'No mobile offline cache. Open /mobile online and visit required modules.',
      );
    } catch (e) {
      setStatus(String(e));
    }
  }
  return (
    <section className="panel" aria-label="Mobile offline readiness">
      <h2>Mobile offline readiness</h2>
      <button className="button" onClick={() => void inspect()}>
        Inspect offline cache
      </button>
      <button
        className="button"
        onClick={() => {
          if (confirm('Clear mobile public-asset caches? Reconnect before using mobile offline.'))
            void caches
              .keys()
              .then((names) =>
                Promise.all(
                  names
                    .filter((n) => n.startsWith('malariascope-mobile-'))
                    .map((n) => caches.delete(n)),
                ),
              )
              .then(() => inspect())
              .catch((e) => setStatus(String(e)));
        }}
      >
        Clear mobile cache
      </button>
      <p role="status">{status}</p>
      {inventory.map((i) => (
        <p key={i.cache}>
          {i.cache}: {i.assets} module assets · {i.publicFiles} public data files
        </p>
      ))}
      <a href="/mobile">Open mobile workspace to cache required modules →</a>
      <p>
        Uploaded records are not added to public cache. Back them up separately. Watch remains a
        browser demonstration; device-native synchronization needs an actual device integration.
      </p>
    </section>
  );
}
